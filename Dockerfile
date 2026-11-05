# One image builds both apps; docker-compose.prod.yml picks the target.
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS web
# next build loads server modules, so it needs syntactically valid settings. These are build-only
# placeholders (not kept in the image); the real values come from the runtime environment.
RUN APP_ORIGIN=https://build.invalid DATABASE_URL=postgres://build:build@127.0.0.1:1/build \
    BETTER_AUTH_SECRET=build-placeholder-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    GATEWAY_TICKET_SECRET=build-placeholder-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    INTERNAL_API_SECRET=build-placeholder-cccccccccccccccccccccccccccccccc \
    GATEWAY_PUBLIC_URL=wss://build.invalid GATEWAY_INTERNAL_URL=https://build.invalid \
    RESEND_API_KEY=build-placeholder EMAIL_FROM=build@build.invalid \
    pnpm --filter @lct/web build
ENV NODE_ENV=production
USER node
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]

FROM deps AS gateway
RUN pnpm --filter @lct/gateway build
ENV NODE_ENV=production
USER node
EXPOSE 8787
CMD ["node", "apps/gateway/dist/index.js"]
