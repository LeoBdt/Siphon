# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Web image: Next.js standalone build. The API base URL is baked at build time
# (client-side fetches go straight to the API), so pass it as a build arg.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS builder

RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter @app/web...

# Left empty on purpose: the deployment fronts both services with a proxy, so
# the browser calls the API on its own origin and nothing about the host is
# baked into the image. Set it only when running the web app on a different
# origin than the API.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @app/web build

# --- Runtime -------------------------------------------------------------
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone output already contains a minimal node_modules.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
