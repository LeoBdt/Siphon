# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# API image: Fastify + yt-dlp + ffmpeg. Runs the TypeScript source via tsx so
# the workspace `@app/shared` package (raw TS) resolves without a bundler.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim

# ffmpeg (media merge/extract) + yt-dlp standalone linux binary (no python dep).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
       -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# Install only the API subtree (+ its workspace deps) from the lockfile.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter @app/api...

ENV NODE_ENV=production \
    PORT=3002 \
    ROOT_DIR=/data/library \
    DB_PATH=/data/app.db \
    YTDLP_PATH=yt-dlp \
    FFMPEG_PATH=ffmpeg \
    MAX_CONCURRENT_DOWNLOADS=2

EXPOSE 3002
VOLUME ["/data"]

CMD ["pnpm", "--filter", "@app/api", "exec", "tsx", "src/server.ts"]
