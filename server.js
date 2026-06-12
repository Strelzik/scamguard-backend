const express = require('express');
const { rateLimit } = require('express-rate-limit');
const userMiddleware = require('./middleware/user');
const { rateLimitMiddleware } = require('./middleware/rateLimit');
const reportsRouter = require('./routes/reports');
const checkRouter = require('./routes/check');
const userRouter = require('./routes/user');
const configRouter = require('./routes/config');

const app = express();

// Railway terminates TLS at its proxy; trust exactly one hop so req.ip is
// the real client IP from X-Forwarded-For, not spoofable beyond that.
app.set('trust proxy', 1);

app.use(express.json({ limit: '16kb' }));

// Per-IP limits. The per-UUID daily cap is trivially bypassed by minting
// UUIDs, so IP limits are the real backstop for upstream API quota, DB
// write floods, and credit farming. Generous enough for legit use: a real
// user browsing all day stays well under these.
const { envInt } = require('./lib/config');
const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envInt('IP_LIMIT_PER_15MIN', 300), // all /api traffic
  standardHeaders: true,
  legacyHeaders: false,
});
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: envInt('IP_REPORT_POSTS_PER_HOUR', 20), // report submissions are rarer and abuse-sensitive
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST',
});

// Health check (no UUID required) — used by Railway
app.get('/health', (req, res) => res.json({ ok: true }));

// All /api/v1 routes require a valid X-User-UUID and get quota state
// attached. Versioned so response shapes can evolve without breaking
// installed extensions stuck on older releases mid-store-review.
app.use('/api/v1', ipLimiter, userMiddleware, rateLimitMiddleware);

app.use('/api/v1/reports', reportLimiter, reportsRouter);
app.use('/api/v1/check', checkRouter);
app.use('/api/v1/user', userRouter);
app.use('/api/v1/config', configRouter);

app.use((err, req, res, next) => {
  // Privacy: log the error only — never req.headers or req.query, which
  // would pair a user's UUID with the domain they were visiting. The same
  // rule applies if request logging (morgan etc.) is ever added.
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Sweep expired cache rows hourly so the table doesn't grow forever
const pool = require('./db');
setInterval(() => {
  pool.query(`DELETE FROM domain_cache WHERE expires_at < NOW()`)
    .catch((err) => console.error('Cache sweep failed:', err));
}, 60 * 60 * 1000).unref();

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ScamGuard backend listening on :${port}`));
