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
    PORT=3001 \
    ROOT_DIR=/data/library \
    # Scratch space for downloads in progress. Deliberately a sibling of the
    # library and inside the same volume: the finished file is then moved with
    # a rename instead of a full copy.
    TMP_DIR=/data/tmp \
    DB_PATH=/data/app.db \
    YTDLP_PATH=yt-dlp \
    FFMPEG_PATH=ffmpeg \
    MAX_CONCURRENT_DOWNLOADS=2

# The `node` user ships with the base image at uid/gid 1000. The bind-mounted
# data directory on the host must be owned by that uid — see docker-compose.yml.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3001

# No curl in the final image on purpose; Node 24 has fetch built in.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@app/api", "exec", "tsx", "src/server.ts"]
