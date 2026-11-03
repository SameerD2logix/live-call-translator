# Security review (Phase 5)

Scope: `apps/web` (Next.js + Better Auth + Postgres), `apps/gateway` (Fastify WebSocket gateway),
`packages/protocol`. Reviewed against the **OWASP Top 10:2025** and the project's own security requirements.
Method: code reading with targeted searches (raw HTML injection, string-built SQL, server-side logging,
production config checks), plus tests run offline. A professional penetration test before a public launch is still
recommended.

## Findings fixed in this phase

| # | Finding | OWASP | Severity | Fix |
|---|---|---|---|---|
| 1 | Gateway trusted **every** `X-Forwarded-For` hop, so a client could fake its IP and dodge per-IP rate limits | A02 / A07 | Medium | `TRUSTED_PROXY_HOPS` (exact hop count, e.g. 1 on Render/Railway) replaces `TRUST_PROXY=true` |
| 2 | Gateway had no error handler; framework error replies can include internal messages | A10 | Low | Generic `{ error }` replies for all errors and 404s; 5xx logged as a short summary; unhandled rejections logged, then exit |
| 3 | `INCOMING_VOICE_ID=` (empty, as shipped in the example env) failed validation, so the gateway **wouldn't start** | A10 / A02 | Medium (availability) | Empty env values are treated as unset in both apps; verified by loading the example env |
| 4 | Our own API routes (ticket, glossary, voice delete) had no per-user rate limit (Better Auth only limits its own routes) | A06 | Medium | Postgres fixed-window limiter (atomic upsert, works across serverless instances, fails closed): ticket 20/min, glossary writes 30/min, voice delete 10/h |
| 5 | No way to rotate signing secrets without breaking live sessions | A04 | Low | `TICKET_SECRET_PREVIOUS` / `INTERNAL_API_SECRET_PREVIOUS`: the gateway accepts the old key during a rotation |
| 6 | Security-relevant events weren't logged in a searchable form | A09 | Medium | Web: one-line JSON `type:"security"` events (origin rejected, rate limited, voice check failed, gateway error). Gateway: rejected service tokens and voice-id mismatches logged |
| 7 | HSTS sent `preload` (a long-term commitment for the whole apex domain) by default | A02 | Low | `preload` removed; documented when to add it |
| 8 | CSP allowed `blob:` workers that the app never uses | A02 | Low | `worker-src 'self'` |
| 9 | No way to end other sessions (lost or shared computer) | A07 | Low | "Sign out on all other devices" in Settings |
| 10 | Expired sessions, tokens and rate-limit rows accumulated forever | A04 (data minimisation) | Low | `pnpm --filter @lct/web db:cleanup`, to run daily; checks Better Auth's column types first |

## OWASP Top 10:2025, category by category

**A01 Broken Access Control (now including SSRF).** Every data query is scoped by the session's `user_id`
(`lib/voice/repository.ts`, `lib/glossary/repository.ts`); delete statements match `id AND user_id`. The voice id and
glossary reach the gateway only inside a server-signed ticket, never from browser messages (Zod `strictObject`
rejects extra fields). Internal voice API: 60 s single-use service tokens scoped to one action; delete tokens are
bound to one voice id. WebSocket upgrades check `Origin` against an allow-list. Pages check the session server-side
(`requireUser`); the proxy redirect is only a first filter. SSRF: no server request uses a user-supplied URL
(provider endpoints are constants; the gateway URL comes from env). Open redirects: `?next=` accepts same-site paths only.

**A02 Security Misconfiguration.** Both apps validate configuration at start-up and refuse to run when unsafe: mock
providers, non-HTTPS origins, missing email in production, identical secrets. Headers: per-request nonce CSP,
HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (microphone and display-capture
for this site only), COOP. Gateway: Helmet with `default-src 'none'`, CORS limited to the allow-list, HTTPS
enforced in production, `x-powered-by` off. Residual: run a header scanner (e.g. securityheaders.com) against the
deployed site.

**A03 Software Supply Chain Failures.** Lockfile with `--frozen-lockfile` in CI; `pnpm audit --audit-level high` in
CI; Dependabot for npm and Actions; pnpm 10 blocks dependency install scripts except an allow-list (esbuild).
**Open actions:** pin GitHub Actions to full commit SHAs; pin the Better Auth CLI to an exact version in
`scripts/migrate.mjs` (currently `@better-auth/cli@1`); enable GitHub secret scanning with push protection.

**A04 Cryptographic Failures.** TLS everywhere in production (HTTPS/WSS enforced). Passwords: Argon2id (19 MiB, 2
passes). 2FA secrets encrypted by Better Auth with `BETTER_AUTH_SECRET`. Three distinct ≥ 32-character secrets
(sessions, call tickets, service tokens); HS256 pinned on verification so a token can't pick its algorithm. Data
minimisation: no audio, transcripts or recordings stored; consent records hold a statement hash, not text.

**A05 Injection.** SQL: parameterised everywhere (search found no query built from strings). XSS: React escaping;
no `dangerouslySetInnerHTML` or `innerHTML`. Prompt injection: speech, typed corrections and context are wrapped
as data and the translator is told they are never instructions; glossary terms are restricted to a safe character
set. Logs are structured JSON (no log forging).

**A06 Insecure Design.** Abuse and cost limits are part of the design: one live session per user, maximum session
length, daily minutes quota (both directions), per-direction audio rate limits, Fix/Repeat limits, five voice-clone
attempts per day, per-user API limits. Voice-cloning misuse: explicit consent, recordings must read the prompted
sentences, one voice per user, deletion everywhere. Residual: the recording check proves the script was read, not
who read it (see README "Known gaps").

**A07 Authentication Failures.** Better Auth: email verification before the first session, 12–128 character
passwords checked against breach data, optional TOTP 2FA with one-time backup codes, database-backed limits on
sign-in/sign-up/reset/2FA, sessions revoked on password reset, secure cookies in production, sign out other devices.
Residual: Better Auth's sign-up endpoint answers differently for registered emails (the UI hides it; rate limits slow
probing).

**A08 Software or Data Integrity Failures.** Call tickets and service tokens are signed, short-lived and single-use
(replay cache). Audio frames carry a validated channel byte. Residual: replay caches are in memory, so a second gateway
instance needs Redis first; CI action pinning (A03).

**A09 Security Logging and Alerting Failures.** Logged: authentication and ticket failures, origin rejections, rate-limit
hits, rejected service tokens, provider failures, per-segment latency. Never logged: audio, transcripts, translations,
tickets, keys, cookies (pino redaction is a second safety net). **Open action:** create alerts in your log platform:

| Alert when | Where |
|---|---|
| more than 20 `"event":"origin_rejected"` per hour | web logs |
| more than 50 `"event":"rate_limited"` per hour, or one user hitting it repeatedly | web logs |
| any `internal token rejected` | gateway logs |
| more than 5 `session ended by provider failure` in 10 minutes | gateway logs |
| `"event":"voice_check_failed"` several times for one user | web logs |

**A10 Mishandling of Exceptional Conditions.** Fails closed: invalid config stops the process; any ticket/token problem
rejects; the rate limiter refuses when the database is unreachable; deleting a voice keeps our record if the provider
call fails (so it can be retried), and account deletion aborts if the voice can't be deleted. Provider failures end the
session with a clear message instead of hanging. Generic error replies (finding 2). Bounded everything: message sizes,
frame sizes, upload sizes, timeouts on every provider call.

## Original project requirements

| Requirement | Status |
|---|---|
| API keys only on the server | ✅ Only the gateway holds provider keys; the browser gets short-lived tickets |
| Proven auth library, optional 2FA | ✅ Better Auth, TOTP + backup codes |
| HTTPS/WSS only, HSTS | ✅ Enforced in production by both apps |
| Every request checks ownership | ✅ Queries scoped by user; voice and glossary only via signed ticket |
| Voice consent, delete voice and account | ✅ Versioned consent with hash; deletion at the provider first |
| No call audio or transcripts stored | ✅ Memory only; never logged |
| Client consent reminder | ✅ On the call screen |
| Schema validation of all input | ✅ Zod on both sides of every boundary |
| Rate limiting and quotas | ✅ See A06 |
| CSP, secure cookies, CSRF | ✅ Nonce CSP; Better Auth cookies; Origin checks on our routes |
| Never log audio, transcripts or secrets | ✅ Verified by search; pino redaction as backup |
| Dependency scanning | ✅ `pnpm audit` + Dependabot; see A03 open actions |

## Before going public

1. GitHub: secret scanning + push protection on; Actions pinned to commit SHAs; branch protection on `main`.
2. ElevenLabs: a key restricted to Speech-to-Text, Text-to-Speech and Voices only; usage alerts set.
3. Gateway: `TRUSTED_PROXY_HOPS=1` (or your platform's count); a single instance until Redis replaces the in-memory caches.
4. Postgres: managed, TLS required (`sslmode=verify-full` where offered), automatic backups, daily `db:cleanup`.
5. Log alerts from the A09 table.
6. A privacy notice stating what is stored (account, voice id, consent records, glossary) and what isn't (audio, transcripts).
7. An external penetration test or at least an OWASP ZAP baseline scan against the staging site.
