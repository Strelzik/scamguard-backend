const express = require('express');
const pool = require('../db');
const { awardContributorCredits } = require('../lib/credits');
const { normalizeDomain } = require('../lib/domains');

const router = express.Router();

const VERDICTS = ['scam', 'safe', 'suspicious'];
const MAX_COMMENT_LENGTH = 1000;

// GET /api/reports?domain=example.com — reports for a domain (or recent reports)
router.get('/', async (req, res, next) => {
  try {
    // comment and user_uuid deliberately omitted from public output:
    // comments are unmoderated free text (kept as evidence for the review
    // queue), and reporter identities stay private.
    let rows;
    if (req.query.domain) {
      const domain = normalizeDomain(req.query.domain);
      if (!domain) return res.status(400).json({ error: 'Invalid domain' });
      ({ rows } = await pool.query(
        `SELECT id, domain, verdict, timestamp
         FROM reports WHERE domain = $1 ORDER BY timestamp DESC LIMIT 100`,
        [domain]
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT id, domain, verdict, timestamp
         FROM reports ORDER BY timestamp DESC LIMIT 100`
      ));
    }
    res.json({ reports: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports — submit or update this user's report for a domain
router.post('/', async (req, res, next) => {
  try {
    const { domain, verdict, comment } = req.body || {};

    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) {
      return res.status(400).json({ error: 'Invalid or missing domain' });
    }
    if (!VERDICTS.includes(verdict)) {
      return res.status(400).json({ error: `verdict must be one of: ${VERDICTS.join(', ')}` });
    }
    if (comment != null && (typeof comment !== 'string' || comment.length > MAX_COMMENT_LENGTH)) {
      return res.status(400).json({ error: `comment must be a string of at most ${MAX_COMMENT_LENGTH} chars` });
    }

    // One report per user per domain; re-reporting overwrites
    const { rows } = await pool.query(
      `INSERT INTO reports (domain, verdict, comment, user_uuid)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_uuid, domain)
       DO UPDATE SET verdict = EXCLUDED.verdict, comment = EXCLUDED.comment, timestamp = NOW()
       RETURNING id, domain, verdict, comment, timestamp`,
      [normalizedDomain, verdict, comment || null, req.user.uuid]
    );

    // Award premium days to all agreeing reporters if corroboration threshold met
    let credited = [];
    try {
      credited = await awardContributorCredits(normalizedDomain, verdict);
    } catch (err) {
      console.error('Credit award failed (report still saved):', err);
    }

    res.status(201).json({
      report: rows[0],
      credit_awarded: credited.includes(req.user.uuid),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
