// Tunable anti-abuse thresholds, overridable via environment variables.
// The defaults below are public (this repo is open source); production runs
// different values set in Railway, so an attacker calibrating against the
// repo's numbers trips the real limits. Treat production values as secrets.
function envInt(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

module.exports = { envInt };
