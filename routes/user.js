const express = require('express');
const pool = require('../db');
const { FREE_DAILY_CAP } = require('../middleware/rateLimit');

const router = express.Router();

// GET /api/user/status
router.get('/status', (req, res) => {
  const user = req.user;
  const q = req.quota;
  res.json({
    uuid: user.uuid,
    tier: user.tier,
    effective_tier: q.effectivePremium ? 'premium' : 'free',
    premium_days_remaining: user.premium_days_remaining,
    daily_checks_used: user.daily_checks_used,
    daily_checks_cap: q.effectivePremium ? null : FREE_DAILY_CAP,
    daily_checks_remaining: q.remaining, // null = unlimited
    can_use_cloud: q.canUseCloud,
    resets_at: 'midnight UTC',
  });
});

// DELETE /api/user — erase everything tied to this UUID (GDPR-style
// deletion). The UUID itself is the only credential, so possession of it is
// authorization. The extension should wipe its stored UUID afterwards and
// generate a fresh one if the user keeps using it.
router.delete('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM contributor_credits WHERE user_uuid = $1`, [req.user.uuid]);
    await client.query(`DELETE FROM reports WHERE user_uuid = $1`, [req.user.uuid]);
    await client.query(`DELETE FROM users WHERE uuid = $1`, [req.user.uuid]);
    await client.query('COMMIT');
    res.json({ deleted: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;

