const { getDomain } = require('tldts');

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

// Normalizes any hostname to its registrable domain (eTLD+1) via the Public
// Suffix List: login.evil-site.co.uk -> evil-site.co.uk. Everything in the
// system — reports, cache, flags, credits — is keyed on this, so phishing
// kits can't evade community reports or split corroboration by rotating
// subdomains. Returns null for invalid input, raw IPs, or bare TLDs.
function normalizeDomain(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 253) return null;
  const hostname = input.trim().toLowerCase();
  if (!DOMAIN_RE.test(hostname)) return null;
  return getDomain(hostname); // null when there's no registrable domain
}

module.exports = { normalizeDomain };
