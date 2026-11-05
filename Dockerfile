# One image builds both apps; docker-compose.prod.yml picks the target.
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS web
RUN pnpm --filter @lct/web build
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@lct/web", "start", "--", "-H", "0.0.0.0", "-p", "3000"]

FROM deps AS gateway
RUN pnpm --filter @lct/gateway build
ENV NODE_ENV=production
USER node
EXPOSE 8787
CMD ["node", "apps/gateway/dist/index.js"]
