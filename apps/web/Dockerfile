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

# Public URL the browser uses to reach the API (reverse-proxy host in prod).
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @app/web build

# --- Runtime -------------------------------------------------------------
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone output already contains a minimal node_modules.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
