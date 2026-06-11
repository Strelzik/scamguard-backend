const pool = require('../db');

// Strict UUID v4: version nibble must be 4, variant nibble 8/9/a/b
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Reads X-User-UUID, upserts the user row, attaches req.user.
// This is input validation, not authentication: any client can mint a UUID.
async function userMiddleware(req, res, next) {
  const raw = req.get('X-User-UUID');
  if (!raw || !UUID_V4.test(raw)) {
    return res.status(400).json({ error: 'Missing or invalid X-User-UUID header (UUID v4 required)' });
  }
  const uuid = raw.toLowerCase();

  try {
    // Single round trip: insert if new, return the row either way
    const { rows } = await pool.query(
      `INSERT INTO users (uuid) VALUES ($1)
       ON CONFLICT (uuid) DO UPDATE SET uuid = EXCLUDED.uuid
       RETURNING uuid, created_at, tier, premium_days_remaining,
                 daily_checks_used, daily_checks_reset_at, premium_day_consumed_on`,
      [uuid]
    );
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = userMiddleware;
