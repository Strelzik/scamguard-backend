// One-time data import from the old SQLite database into Postgres.
// Usage: node scripts/import-sqlite.js path/to/old.db
// Requires: npm install better-sqlite3 (dev-only, not in deps)
//
// Assumes the old SQLite tables roughly match the new schema. Adjust the
// column mappings below if your old schema differs. Rows for users that
// don't exist yet are created on the fly. Run scripts/migrate.js first.
const Database = require('better-sqlite3');
const pool = require('../db');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error('Usage: node scripts/import-sqlite.js path/to/old.db');
    process.exit(1);
  }
  const sqlite = new Database(dbPath, { readonly: true });

  let users = 0, reports = 0, cache = 0, skipped = 0;

  for (const u of sqlite.prepare('SELECT * FROM users').all()) {
    if (!UUID_V4.test(u.uuid || '')) { skipped++; continue; }
    await pool.query(
      `INSERT INTO users (uuid, created_at, tier, premium_days_remaining, daily_checks_used, daily_checks_reset_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (uuid) DO NOTHING`,
      [u.uuid.toLowerCase(), u.created_at || new Date(), u.tier || 'free',
       u.premium_days_remaining || 0, u.daily_checks_used || 0, u.daily_checks_reset_at || new Date()]
    );
    users++;
  }

  for (const r of sqlite.prepare('SELECT * FROM reports ORDER BY timestamp ASC').all()) {
    if (!UUID_V4.test(r.user_uuid || '')) { skipped++; continue; }
    const uuid = r.user_uuid.toLowerCase();
    await pool.query(`INSERT INTO users (uuid) VALUES ($1) ON CONFLICT (uuid) DO NOTHING`, [uuid]);
    await pool.query(
      `INSERT INTO reports (domain, verdict, comment, timestamp, user_uuid)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_uuid, domain) DO UPDATE SET verdict = EXCLUDED.verdict,
         comment = EXCLUDED.comment, timestamp = EXCLUDED.timestamp`,
      [String(r.domain).toLowerCase(), r.verdict, r.comment || null, r.timestamp || new Date(), uuid]
    );
    reports++;
  }

  // Cache entries are short-lived; only carry over unexpired ones if the table exists
  try {
    for (const c of sqlite.prepare('SELECT * FROM domain_cache').all()) {
      if (new Date(c.expires_at) <= new Date()) continue;
      await pool.query(
        `INSERT INTO domain_cache (domain, result, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (domain) DO NOTHING`,
        [String(c.domain).toLowerCase(), typeof c.result === 'string' ? c.result : JSON.stringify(c.result), c.expires_at]
      );
      cache++;
    }
  } catch (e) {
    console.warn('Skipping domain_cache import:', e.message);
  }

  console.log(`Imported: ${users} users, ${reports} reports, ${cache} cache entries. Skipped ${skipped} rows with invalid UUIDs.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
