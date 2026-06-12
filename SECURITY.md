# Security Policy

ScamGuard is a scam-detection service; we take the security of the service
and the privacy of its users seriously.

## Reporting a vulnerability

Please report vulnerabilities privately via **GitHub's private vulnerability
reporting**: go to the [Security tab](../../security) of this repository and
click "Report a vulnerability". Do not open a public issue for security
problems.

We aim to acknowledge reports within 72 hours. Please give us a reasonable
window to ship a fix before public disclosure.

## Scope

In scope:
- This backend (API endpoints, quota/credit logic, data handling)
- Ways to deanonymize users or extract per-user browsing activity
- Ways to manipulate verdicts (poisoning community consensus, cache abuse)
- Ways to farm contributor credits beyond intended limits

Out of scope:
- Volumetric denial of service
- Reports that the public default thresholds in this repo are knowable
  (production runs different values)
- Vulnerabilities in third-party services (urlscan.io, Google Safe Browsing,
  RDAP registries, Railway)

## What we promise users

- Only domain names are processed, never full URLs or page content
- No per-user check history is stored server-side
- All user data tied to an anonymous ID is erasable on request
  (`DELETE /api/v1/user`)

A report demonstrating that any of these promises is violated in practice is
the highest-priority class of issue — thank you for finding it.
