const pool = require('../db');

const CACHE_TTL_HOURS = parseInt(process.env.DOMAIN_CACHE_TTL_HOURS || '24', 10);
const UPSTREAM_TIMEOUT_MS = 8000;

// ---- Upstream checks (all run server-side; API keys never reach the extension) ----

async function checkGoogleSafeBrowsing(domain) {
  const key = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!key) return { skipped: true };
  try {
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'scamguard', clientVersion: '1.0.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: `http://${domain}/` }, { url: `https://${domain}/` }],
          },
        }),
      }
    );
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    const matches = data.matches || [];
    return { flagged: matches.length > 0, threats: matches.map((m) => m.threatType) };
  } catch (err) {
    return { error: err.message };
  }
}

async function checkUrlscan(domain) {
  const key = process.env.URLSCAN_API_KEY;
  if (!key) return { skipped: true };
  try {
    // Search for existing scans first — fast and doesn't consume scan quota
    const res = await fetch(
      `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(domain)}&size=5`,
      { headers: { 'API-Key': key }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }
    );
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    const results = data.results || [];
    const malicious = results.filter((r) => r.verdicts && r.verdicts.overall && r.verdicts.overall.malicious);
    return {
      flagged: malicious.length > 0,
      scansFound: results.length,
      maliciousScans: malicious.length,
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Domain registration age via RDAP (the modern WHOIS protocol — free, no
// API key). rdap.org bootstraps to the right registry. A domain registered
// days ago asking for money is one of the strongest scam signals there is.
async function checkDomainAge(domain) {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (res.status === 404) return { found: false };
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    const reg = (data.events || []).find((e) => e.eventAction === 'registration');
    if (!reg || !reg.eventDate) return { found: true, registered: null };
    const ageDays = Math.floor((Date.now() - new Date(reg.eventDate)) / 86400000);
    return { found: true, registered: reg.eventDate, age_days: ageDays };
  } catch (err) {
    return { error: err.name === 'TimeoutError' ? 'timeout' : err.message };
  }
}

// Note: there is deliberately no server-side HTTPS probe. Fetching
// attacker-supplied domains from the server is an SSRF primitive (their DNS
// can point at internal addresses, or at victims we'd be knocking on). The
// extension already knows whether the page loaded over HTTPS and applies
// that signal locally.

const SUSPICIOUS_KEYWORDS = [
  'login', 'verify', 'secure', 'account', 'update', 'wallet',
  'support', 'billing', 'signin', 'banking', 'password', 'official',
];
const SUSPICIOUS_TLDS = ['zip', 'mov', 'xyz', 'top', 'gq', 'tk', 'ml', 'cf', 'work', 'click', 'loan'];

// Pure-server heuristics on the domain name itself. Page-content analysis
// stays in the extension, which has the live DOM.
function domainHeuristics(domain) {
  const signals = [];
  const labels = domain.toLowerCase().split('.');
  const tld = labels[labels.length - 1];
  const name = labels.slice(0, -1).join('.');

  if (SUSPICIOUS_TLDS.includes(tld)) signals.push(`suspicious_tld:.${tld}`);
  if (labels.length >= 4) signals.push('deeply_nested_subdomains');
  if (name.length > 30) signals.push('unusually_long_domain');
  if ((name.match(/-/g) || []).length >= 3) signals.push('many_hyphens');
  if (/\d{4,}/.test(name)) signals.push('long_digit_run');
  if (/^xn--/.test(labels[0])) signals.push('punycode_label');

  const keywordHits = SUSPICIOUS_KEYWORDS.filter((k) => name.includes(k));
  if (keywordHits.length >= 2) signals.push(`phishing_keywords:${keywordHits.join(',')}`);

  return { signals, score: signals.length };
}

// ---- Community signal from our own reports table ----

// Bar for community-driven signal. Only reports from accounts older than
// COMMUNITY_TENURE_DAYS count; scam consensus additionally requires
// COMMUNITY_SCAM_MIN_VOTES tenured reporters, COMMUNITY_SCAM_MIN_RATIO
// agreement, and reports spread over 24+ hours (bursts look like brigading).
const { envInt } = require('./config');
const COMMUNITY_TENURE_DAYS = envInt('COMMUNITY_TENURE_DAYS', 7);
const COMMUNITY_SCAM_MIN_VOTES = envInt('COMMUNITY_SCAM_MIN_VOTES', 5);
const COMMUNITY_SCAM_MIN_RATIO = (() => {
  const v = parseFloat(process.env.COMMUNITY_SCAM_MIN_RATIO);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
})();
const COMMUNITY_MIN_SPREAD_HOURS = envInt('COMMUNITY_MIN_SPREAD_HOURS', 24);

async function communityVerdict(domain) {
  const [{ rows: votes }, { rows: flags }] = await Promise.all([
    pool.query(
      `SELECT r.verdict,
              COUNT(DISTINCT r.user_uuid)::int AS votes,
              EXTRACT(EPOCH FROM (MAX(r.timestamp) - MIN(r.timestamp))) / 3600 AS spread_hours
       FROM reports r
       JOIN users u ON u.uuid = r.user_uuid
       WHERE r.domain = $1
         AND u.created_at <= NOW() - ($2 || ' days')::interval
       GROUP BY r.verdict ORDER BY votes DESC`,
      [domain, String(COMMUNITY_TENURE_DAYS)]
    ),
    pool.query(`SELECT status, verdict FROM domain_flags WHERE domain = $1`, [domain]),
  ]);

  const flag = flags[0] || null;
  const total = votes.reduce((s, v) => s + v.votes, 0);
  const scamRow = votes.find((v) => v.verdict === 'scam');

  // 'rejected' = a human judged the reporting bad-faith; ignore the crowd here
  const scamConsensus =
    !!scamRow &&
    (!flag || flag.status !== 'rejected') &&
    scamRow.votes >= COMMUNITY_SCAM_MIN_VOTES &&
    scamRow.votes / total >= COMMUNITY_SCAM_MIN_RATIO &&
    Number(scamRow.spread_hours) >= COMMUNITY_MIN_SPREAD_HOURS;

  return {
    votes: votes.map(({ verdict, votes }) => ({ verdict, votes })),
    scam_consensus: scamConsensus,
    flag_status: flag ? flag.status : null,
  };
}

// External sources only (no community input) — used to validate community
// scam claims without the circularity of community confirming community.
async function externalValidation(domain) {
  const [safeBrowsing, urlscan] = await Promise.all([
    checkGoogleSafeBrowsing(domain),
    checkUrlscan(domain),
  ]);
  return { flagged: !!(safeBrowsing.flagged || urlscan.flagged), safeBrowsing, urlscan };
}

// ---- Aggregate ----

// Community signal alone can never output 'scam'. External sources can.
// A community scam consensus yields 'scam' only after the domain_flags
// review pipeline confirmed it (externally validated, or human-reviewed);
// otherwise it caps at 'suspicious'.
function computeVerdict({ safeBrowsing, urlscan, heuristics, community, domainAge }) {
  if (safeBrowsing.flagged) return 'scam';
  if (urlscan.flagged) return 'scam';
  if (community.scam_consensus && community.flag_status === 'confirmed') return 'scam';
  if (community.scam_consensus) return 'suspicious';

  let suspicion = heuristics.score;
  // Brand-new registrations are disproportionately scams; a failed RDAP
  // lookup contributes nothing rather than penalizing odd-but-legit TLDs
  if (typeof domainAge.age_days === 'number') {
    if (domainAge.age_days <= 7) suspicion += 2;
    else if (domainAge.age_days <= 30) suspicion += 1;
  }
  const susRow = community.votes.find((v) => v.verdict === 'suspicious');
  if (susRow && susRow.votes >= 2) suspicion += 1;

  if (suspicion >= 3) return 'suspicious';
  return 'safe';
}

// Full cloud check with cache. Returns { result, cached }.
async function checkDomain(domain) {
  const { rows } = await pool.query(
    `SELECT result FROM domain_cache WHERE domain = $1 AND expires_at > NOW()`,
    [domain]
  );
  if (rows.length > 0) return { result: rows[0].result, cached: true };

  const [safeBrowsing, urlscan, community, domainAge] = await Promise.all([
    checkGoogleSafeBrowsing(domain),
    checkUrlscan(domain),
    communityVerdict(domain),
    checkDomainAge(domain),
  ]);
  const heuristics = domainHeuristics(domain);

  const verdict = computeVerdict({ safeBrowsing, urlscan, heuristics, community, domainAge });
  const result = {
    domain,
    verdict,
    // Distinguishes "asserted by authoritative sources" from "the community
    // flagged this" so the extension can word its warning accordingly
    community_flagged: community.scam_consensus && verdict !== 'scam',
    checks: { safeBrowsing, urlscan, heuristics, community, domainAge },
    checked_at: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO domain_cache (domain, result, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' hours')::interval)
     ON CONFLICT (domain) DO UPDATE SET result = EXCLUDED.result, expires_at = EXCLUDED.expires_at`,
    [domain, result, String(CACHE_TTL_HOURS)]
  );

  return { result, cached: false };
}

module.exports = { checkDomain, externalValidation };
