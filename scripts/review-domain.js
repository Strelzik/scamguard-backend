// Manual review of community-flagged domains.
//
//   node scripts/review-domain.js list
//   node scripts/review-domain.js confirm <domain>   (pays credits to tenured reporters)
//   node scripts/review-domain.js reject <domain>    (no credits; community signal ignored)
const pool = require('../db');
const { confirmAndPay } = require('../lib/credits');

async function main() {
  const [action, domain] = process.argv.slice(2);

  if (action === 'list') {
    const { rows } = await pool.query(
      `SELECT domain, verdict, details, created_at FROM domain_flags
       WHERE status = 'pending_review' ORDER BY created_at ASC`
    );
    if (rows.length === 0) console.log('No domains pending review.');
    for (const r of rows) {
      console.log(`\n${r.domain} (reported: ${r.verdict}, flagged ${r.created_at.toISOString()})`);
      console.log(JSON.stringify(r.details, null, 2));
    }
  } else if (action === 'confirm' && domain) {
    const credited = await confirmAndPay(domain.toLowerCase());
    if (credited === null) {
      console.log(`${domain}: no pending_review flag found.`);
    } else {
      await pool.query(`DELETE FROM domain_cache WHERE domain = $1`, [domain.toLowerCase()]);
      console.log(`${domain}: confirmed. Awarded 1 premium day to ${credited.length} reporter(s).`);
    }
  } else if (action === 'reject' && domain) {
    const { rowCount } = await pool.query(
      `UPDATE domain_flags SET status = 'rejected', resolved_at = NOW()
       WHERE domain = $1 AND status = 'pending_review'`,
      [domain.toLowerCase()]
    );
    if (rowCount === 0) {
      console.log(`${domain}: no pending_review flag found.`);
    } else {
      await pool.query(`DELETE FROM domain_cache WHERE domain = $1`, [domain.toLowerCase()]);
      console.log(`${domain}: rejected. No credits; community signal ignored for this domain.`);
    }
  } else {
    console.log('Usage: node scripts/review-domain.js list | confirm <domain> | reject <domain>');
  }
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
