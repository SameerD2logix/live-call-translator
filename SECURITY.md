# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. Include the steps to reproduce and the impact you expect.
You'll get a reply within 7 days.

Please don't access other people's accounts or data, don't run tests that degrade the service, and never include
real recordings, transcripts or personal data in a report.

## Scope

- `apps/web`: accounts, voice consent and cloning, glossary, call tickets
- `apps/gateway`: WebSocket translation sessions and the internal voice API
- `packages/protocol`: the shared message contract

The design, controls and known gaps are documented in `docs/security-review.md`.
