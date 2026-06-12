const pool = require('../db');
const { externalValidation } = require('./scanner');

const { envInt } = require('./config');

// All thresholds are env-overridable; production values differ from these
// public defaults (see lib/config.js).
// A scam verdict needs the reporter plus this many tenured corroborators
const CORROBORATION_THRESHOLD = envInt('CREDIT_CORROBORATION_THRESHOLD', 3);
// Reports from accounts younger than this don't count toward corroboration
// or credits — sockpuppet farms have to age accounts to matter.
const TENURE_DAYS = envInt('CREDIT_TENURE_DAYS', 7);
// Agreeing reports must span at least this long; a burst of agreement in a
// short window looks like brigading, not organic discovery.
const MIN_REPORT_SPREAD_HOURS = envInt('CREDIT_MIN_SPREAD_HOURS', 24);
// Earned premium days are capped per rolling 30 days so "report everything"
// is never a winning strategy.
const MAX_CREDITS_PER_30_DAYS = envInt('CREDIT_MAX_PER_30_DAYS', 4);

// Stats over *tenured* reporters who agree on (domain, verdict).
async function corroborationStats(client, domain, verdict) {
  const { rows } = await client.query(
    `SELECT COUNT(DISTINCT r.user_uuid)::int AS agreeing,
            EXTRACT(EPOCH FROM (MAX(r.timestamp) - MIN(r.timestamp))) / 3600 AS spread_hours
     FROM reports r
     JOIN users u ON u.uuid = r.user_uuid
     WHERE r.domain = $1 AND r.verdict = $2
       AND u.created_at <= NOW() - ($3 || ' days')::interval`,
    [domain, verdict, String(TENURE_DAYS)]
  );
  return { agreeing: rows[0].agreeing, spreadHours: Number(rows[0].spread_hours) || 0 };
}

// Pay 1 premium day to every tenured agreeing reporter for this domain who
// hasn't been credited for it and hasn't hit their 30-day cap. Idempotent.
async function payCredits(client, domain, verdict) {
  const inserted = await client.query(
    `INSERT INTO contributor_credits (user_uuid, domain)
     SELECT DISTINCT r.user_uuid, r.domain
     FROM reports r
     JOIN users u ON u.uuid = r.user_uuid
     WHERE r.domain = $1 AND r.verdict = $2
       AND u.created_at <= NOW() - ($3 || ' days')::interval
       AND (SELECT COUNT(*) FROM contributor_credits c
            WHERE c.user_uuid = r.user_uuid
              AND c.awarded_at > NOW() - interval '30 days') < $4
     ON CONFLICT (user_uuid, domain) DO NOTHING
     RETURNING user_uuid`,
    [domain, verdict, String(TENURE_DAYS), MAX_CREDITS_PER_30_DAYS]
  );
  const credited = inserted.rows.map((r) => r.user_uuid);
  if (credited.length > 0) {
    await client.query(
      `UPDATE users SET premium_days_remaining = premium_days_remaining + 1
       WHERE uuid = ANY($1::uuid[])`,
      [credited]
    );
  }
  return credited;
}

// Called after each report insert/update. Flow:
//   1. Only 'scam' reports can earn credits. ('safe' agreement on popular
//      legit domains would be an infinite farming loop.)
//   2. Corroboration must come from tenured accounts and span >= 24h.
//   3. First time the threshold is hit, validate the claim against external
//      sources (Safe Browsing / urlscan). Confirmed -> pay credits and mark
//      the domain confirmed. Not confirmed -> queue for manual review; no
//      credits until a human confirms via scripts/review-domain.js.
async function awardContributorCredits(domain, verdict) {
  if (verdict !== 'scam') return [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { agreeing, spreadHours } = await corroborationStats(client, domain, verdict);
    if (agreeing < CORROBORATION_THRESHOLD + 1 || spreadHours < MIN_REPORT_SPREAD_HOURS) {
      await client.query('COMMIT');
      return [];
    }

    // Lock/inspect any existing flag so concurrent reports don't double-validate
    const { rows: flags } = await client.query(
      `SELECT status FROM domain_flags WHERE domain = $1 FOR UPDATE`,
      [domain]
    );
    const existing = flags[0];

    if (existing && existing.status === 'rejected') {
      await client.query('COMMIT');
      return []; // judged bad-faith; ignore further corroboration
    }
    if (existing && existing.status === 'pending_review') {
      await client.query('COMMIT');
      return []; // awaiting human review; nothing to do yet
    }

    if (!existing) {
      // First threshold crossing: validate against external sources
      const validation = await externalValidation(domain);
      const status = validation.flagged ? 'confirmed' : 'pending_review';
      await client.query(
        `INSERT INTO domain_flags (domain, verdict, status, details, resolved_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'confirmed' THEN NOW() END)
         ON CONFLICT (domain) DO NOTHING`,
        [domain, verdict, status, { agreeing, spreadHours, validation }]
      );
      if (!validation.flagged) {
        await client.query('COMMIT');
        console.log(`[credits] ${domain}: corroborated but not externally validated — queued for review`);
        return [];
      }
      // Newly confirmed: drop any cached verdict computed before the flag existed
      await client.query(`DELETE FROM domain_cache WHERE domain = $1`, [domain]);
    }

    // Flag is 'confirmed' (just now, or previously — covers late corroborators)
    const credited = await payCredits(client, domain, verdict);
    await client.query('COMMIT');
    return credited;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Used by scripts/review-domain.js after a human confirms a pending flag.
async function confirmAndPay(domain) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE domain_flags SET status = 'confirmed', resolved_at = NOW()
       WHERE domain = $1 AND status = 'pending_review' RETURNING verdict`,
      [domain]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const credited = await payCredits(client, domain, rows[0].verdict);
    await client.query('COMMIT');
    return credited;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  awardContributorCredits,
  confirmAndPay,
  CORROBORATION_THRESHOLD,
  TENURE_DAYS,
  MIN_REPORT_SPREAD_HOURS,
  MAX_CREDITS_PER_30_DAYS,
};
