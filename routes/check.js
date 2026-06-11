const express = require('express');
const { checkDomain } = require('../lib/scanner');
const { normalizeDomain } = require('../lib/domains');
const { consumeCheck } = require('../middleware/rateLimit');

const router = express.Router();

// GET /api/check?domain=example.com
// Cap-enforced cloud check. Cache hits don't consume quota. When the user
// is over cap, returns local_fallback: true so the extension uses its own
// page heuristics instead.
router.get('/', async (req, res, next) => {
  try {
    const normalized = normalizeDomain(req.query.domain);
    if (!normalized) {
      return res.status(400).json({ error: 'Invalid or missing domain' });
    }

    const { result, cached } = req.quota.canUseCloud
      ? await checkDomain(normalized)
      : { result: null, cached: false };

    if (result && !cached) {
      await consumeCheck(req.user);
      if (req.quota.remaining !== null) {
        req.quota.remaining = Math.max(0, req.quota.remaining - 1);
      }
    }

    if (!result) {
      return res.status(429).json({
        local_fallback: true,
        error: 'Daily cloud check limit reached',
        checks_remaining: 0,
        resets_at: 'midnight UTC',
      });
    }

    res.json({
      local_fallback: false,
      cached,
      checks_remaining: req.quota.remaining, // null = unlimited (premium)
      result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
