# Marketing one-pager: required copy fixes

Reconciliation of `ScamGuard.pdf` against the implemented backend
(reviewed 2026-06-11). Apply these in whatever tool generates the PDF /
landing page so every public claim is true on launch day.

## 1. "Three more confirm it. Within hours the warning is live."

**Problem:** anti-brigading rules (7-day account tenure, reports must span
24+ hours, external validation or manual review before a community-only
verdict asserts "scam") mean a community-only warning takes at least a day
by design — that's the protection against Yelp-style review-bombing of
legitimate businesses.

**Replace with:**
> "The first person to visit a new scam site flags it. Others confirm it.
> Once corroborated and verified, the warning goes live for every ScamGuard
> user worldwide — automatically, with no corporate update cycle."

(Domains that Google Safe Browsing or urlscan.io already flag DO warn within
seconds — it's fine to make speed claims about the automated layer.)

## 2. "1 Premium day per confirmed report"

**Problem:** true, but earned days are capped at 4 per rolling 30 days, and
only externally-verified or human-confirmed scam reports pay out. Without
fine print this becomes the #1 support complaint.

**Add a footnote:**
> "Premium days are awarded for verified scam reports, up to 4 days per
> month. Reports are verified against external threat databases or by human
> review."

## 3. "Reports are weighted by the reporter's trust score… a first-time
reporter carries less weight than someone with 50 verified catches."

**Problem:** present tense; reputation weighting is on the roadmap, not
shipped. What exists today: accounts must be 7+ days old for reports to
count, and verdicts require multi-reporter consensus plus verification.

**Replace with:**
> "Reports only count once an account has history, and a scam verdict
> requires multiple independent reporters plus verification against external
> threat databases — so a handful of fake accounts can't condemn a
> legitimate site or whitewash a scam."

(Reinstate the trust-score language when the reputation system ships.)

## 4. "Every page is checked … the moment you land on it"

**Problem:** free tier has 50 cloud checks/day; a heavy browsing day exceeds
that (cached domains are free, which softens it, but the claim over-promises
for free users).

**Replace with:**
> "Pages are checked against Google Safe Browsing, urlscan.io, and domain
> registration age — instantly for premium, up to 50 cloud checks a day for
> free users, with built-in local protection always on."

## 5. "ScamGuard is open source"

**Resolved:** backend repo made public (github.com/Strelzik/scamguard-backend,
MIT license) on 2026-06-11. Claim is now true for the backend. If the
extension repo is private, either open it too or scope the claim:
"ScamGuard's backend is open source."

## Verified-true claims (no change needed)

- "Only the domain name of the current page is ever sent — not the full URL,
  not your identity, not your browsing history."
- "Community reports are attached to an anonymous ID generated on install."
- "Users can report a site as 'looks legit' — these votes raise the trust score."
- 50 cloud checks/day free; unlimited for premium.
- WHOIS/RDAP domain age checking (shipped server-side 2026-06-11).

## Standing rule for future features

The "personal security dashboard" (premium) must be built inside the
extension using local storage only. The server never stores per-user check
history; building the dashboard server-side would falsify the browsing-
history FAQ answer above.
