# Deploying

Three pieces: **Postgres** (managed), the **web app** (Vercel or any Node host), the **gateway** (a long-running Node
service with WebSockets: Render, Railway or Fly; not serverless). Use one region close to Pakistan and your
providers (e.g. a European region) to keep latency low.

## 0. GitHub repository

- Run `pnpm install` once and commit `pnpm-lock.yaml`: CI installs with `--frozen-lockfile` and fails without it.
- Settings → **Code security**: turn on Dependabot alerts, **Secret scanning** and **Push protection**, and
  **Private vulnerability reporting** (used by `SECURITY.md`).
- Settings → **Rules** (or Branches): protect `main`; require the `ci` check to pass and a pull request to merge.
- Pin the Actions in `.github/workflows/ci.yml` to full commit SHAs (Dependabot keeps them updated).
- Choose a licence before making the repository public (without one, all rights are reserved).

## 1. Postgres

Create a managed database (Neon, Supabase, Render or Railway). Require TLS (`?sslmode=require`, or `verify-full` where
the provider supports it) and turn on automatic backups.

## 2. Secrets

Generate three different values with `openssl rand -base64 48`:

| Secret | Web app | Gateway |
|---|---|---|
| Sessions + 2FA | `BETTER_AUTH_SECRET` | – |
| Call tickets | `GATEWAY_TICKET_SECRET` | `TICKET_SECRET` (same value) |
| Voice API | `INTERNAL_API_SECRET` | `INTERNAL_API_SECRET` (same value) |

Store them in each platform's secret settings, never in Git.

## 3. Gateway (Render or Railway)

- Root: repository root. Build: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @lct/gateway build`
- Start: `node apps/gateway/dist/index.js` · Health check path: `/healthz`
- **One instance** for now: replay caches and session limits are in memory (move them to Redis before scaling out).
- Environment (see `apps/gateway/.env.example`):
  - `NODE_ENV=production`, `TRUSTED_PROXY_HOPS=1` (one platform proxy in front)
  - `ALLOWED_ORIGINS=https://your-web-app-domain`
  - `TICKET_SECRET`, `INTERNAL_API_SECRET`
  - `ELEVENLABS_API_KEY`: create a key restricted to Speech to Text, Text to Speech and Voices; set a usage limit
  - `ANTHROPIC_API_KEY`
  - `INCOMING_VOICE_ID` (optional, a stock voice that sounds good in Urdu)
- Note its public URL, e.g. `https://lct-gateway.onrender.com` (WebSocket: `wss://lct-gateway.onrender.com`).

## 4. Web app (Vercel)

- Import the repository, set **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm.
- Environment (see `apps/web/.env.example`):
  - `APP_ORIGIN=https://your-web-app-domain`
  - `DATABASE_URL`
  - `BETTER_AUTH_SECRET`, `GATEWAY_TICKET_SECRET`, `INTERNAL_API_SECRET`
  - `GATEWAY_PUBLIC_URL=wss://lct-gateway.onrender.com`, `GATEWAY_INTERNAL_URL=https://lct-gateway.onrender.com`
  - `RESEND_API_KEY`, `EMAIL_FROM` (verify your sending domain in Resend first)
- Run migrations once from your machine against the production database:
  `DATABASE_URL=… BETTER_AUTH_SECRET=… (other web env) pnpm --filter @lct/web db:migrate`

## 5. Daily cleanup

Schedule `pnpm --filter @lct/web db:cleanup` once a day (a Render/Railway cron job, or a scheduled GitHub Action with
`DATABASE_URL` as a repository secret). It removes expired sessions, tokens and old rate-limit rows.

## 6. Check the deployment

```bash
# Security headers on the web app (expect CSP, HSTS, X-Frame-Options, Permissions-Policy)
curl -sI https://your-web-app-domain/sign-in | grep -iE "content-security|strict-transport|x-frame|permissions"
# Gateway: health, plain HTTP refused, WebSocket refused from another origin
curl -s https://lct-gateway.onrender.com/healthz
curl -si -H "Origin: https://evil.example" https://lct-gateway.onrender.com/v1/realtime | head -1   # expect 403
# Internal API refuses calls without a service token
curl -si -X DELETE https://lct-gateway.onrender.com/internal/v1/voices/abcdefghij | head -1        # expect 401
```

Then do one full run as a new user: sign up, confirm the email, record a voice, run the cable wizard, make a call.

## Rotating a secret

1. Gateway: set the new value, put the old one in `TICKET_SECRET_PREVIOUS` (or `INTERNAL_API_SECRET_PREVIOUS`), deploy.
2. Web app: set the new value, deploy.
3. A few minutes later, remove the `_PREVIOUS` value from the gateway and deploy again.

Tokens live 60 seconds, so nobody is signed out. Rotating `BETTER_AUTH_SECRET` signs everyone out and invalidates
saved 2FA secrets; only do that after a suspected leak.
