const express = require('express');

const router = express.Router();

// GET /api/v1/config — remote configuration for the extension.
// Chrome Web Store reviews take days, so anything tunable lives here
// instead of being baked into the extension. All values are overridable
// via env vars on the deployment without a code change.
//
// cloud_checks_enabled is the kill switch: set EXT_CLOUD_ENABLED=false in
// the deployment to push every client to local-heuristics-only mode (e.g.
// during an upstream outage or a cost incident).
router.get('/', (req, res) => {
  res.json({
    cloud_checks_enabled: process.env.EXT_CLOUD_ENABLED !== 'false',
    min_extension_version: process.env.EXT_MIN_VERSION || '1.1.0',
    // Local cache duration the extension should use, minutes
    client_cache_minutes: parseInt(process.env.EXT_CLIENT_CACHE_MINUTES, 10) || 30,
    // Scoring thresholds for the extension's local verdict bands
    score_thresholds: {
      safe: parseInt(process.env.EXT_SCORE_SAFE, 10) || 75,
      warning: parseInt(process.env.EXT_SCORE_WARNING, 10) || 40,
    },
    message: process.env.EXT_USER_MESSAGE || null, // optional notice shown in the popup
  });
});

module.exports = router;
