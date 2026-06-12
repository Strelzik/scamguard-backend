const pool = require('../db');

const { envInt } = require('../lib/config');

const FREE_DAILY_CAP = envInt('FREE_DAILY_CAP', 50);

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Returns true if the user is effectively premium: paid subscription, or
// earned premium days remaining. Consumes one earned day on the first
// request of each UTC day for non-subscribers.
async function resolveEffectivePremium(user) {
  if (user.tier === 'premium') return true;
  if (user.premium_days_remaining <= 0) return false;

  const todayUtc = startOfTodayUtc().toISOString().slice(0, 10);
  const consumedOn = user.premium_day_consumed_on
    ? new Date(user.premium_day_consumed_on).toISOString().slice(0, 10)
    : null;

  if (consumedOn !== todayUtc) {
    // Atomic guard: only one concurrent request can consume today's day
    const { rowCount } = await pool.query(
      `UPDATE users
       SET premium_days_remaining = premium_days_remaining - 1,
           premium_day_consumed_on = $2
       WHERE uuid = $1
         AND premium_days_remaining > 0
         AND (premium_day_consumed_on IS DISTINCT FROM $2)`,
      [user.uuid, todayUtc]
    );
    if (rowCount > 0) {
      user.premium_days_remaining -= 1;
      user.premium_day_consumed_on = todayUtc;
      return true;
    }
    // Lost a race or days hit 0; re-read the truth
    const { rows } = await pool.query(
      `SELECT premium_days_remaining, premium_day_consumed_on FROM users WHERE uuid = $1`,
      [user.uuid]
    );
    Object.assign(user, rows[0]);
    const refreshed = user.premium_day_consumed_on
      ? new Date(user.premium_day_consumed_on).toISOString().slice(0, 10)
      : null;
    return refreshed === todayUtc;
  }
  return true; // already consumed a day for today — premium until midnight UTC
}

// Resets the daily counter at midnight UTC, computes quota state, and
// attaches req.quota. Does NOT consume a check; endpoints that perform a
// cloud check call consumeCheck() after deciding to do the expensive work.
async function rateLimitMiddleware(req, res, next) {
  try {
    const user = req.user;
    const midnight = startOfTodayUtc();

    if (new Date(user.daily_checks_reset_at) < midnight) {
      await pool.query(
        `UPDATE users SET daily_checks_used = 0, daily_checks_reset_at = NOW()
         WHERE uuid = $1 AND daily_checks_reset_at < $2`,
        [user.uuid, midnight]
      );
      user.daily_checks_used = 0;
    }

    const isPremium = await resolveEffectivePremium(user);
    const remaining = isPremium
      ? null // unlimited
      : Math.max(0, FREE_DAILY_CAP - user.daily_checks_used);

    req.quota = {
      effectivePremium: isPremium,
      cap: isPremium ? null : FREE_DAILY_CAP,
      remaining,
      canUseCloud: isPremium || remaining > 0,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// Increment the counter after a cloud check is actually performed.
// Cache hits are free and should not call this.
async function consumeCheck(user) {
  await pool.query(
    `UPDATE users SET daily_checks_used = daily_checks_used + 1 WHERE uuid = $1`,
    [user.uuid]
  );
  user.daily_checks_used += 1;
}

module.exports = { rateLimitMiddleware, consumeCheck, FREE_DAILY_CAP };
