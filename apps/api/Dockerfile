# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# API image: Fastify + yt-dlp + ffmpeg. Runs the TypeScript source via tsx so
# the workspace `@app/shared` package (raw TS) resolves without a bundler.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim

# Set by BuildKit for the image being built — amd64 or arm64 here.
ARG TARGETARCH

# ffmpeg (media merge/extract) + yt-dlp standalone linux binary (no python dep).
#
# The asset has to match the architecture: yt-dlp_linux is x86-64 only, and on
# an arm64 image it fails with "rosetta error: failed to open elf" — which reads
# like a Docker problem and is really a binary for the wrong machine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && case "$TARGETARCH" in \
       amd64) YTDLP_ASSET=yt-dlp_linux ;; \
       arm64) YTDLP_ASSET=yt-dlp_linux_aarch64 ;; \
       *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
     esac \
  && curl -fL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}" \
       -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  # yt-dlp belongs to the runtime user so it can update itself: `yt-dlp -U`
  # rewrites this very binary, which root ownership made impossible. Done in
  # the same layer as the download — a chown in a later layer would store the
  # whole 40 MB file a second time.
  && chown node:node /usr/local/bin/yt-dlp \
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
#
# Only /data is chowned. Recursing over /app as well rewrote every installed
# file, and since a changed file is stored again in full, that duplicated ~20 MB
# of node_modules into this layer for nothing: the app only ever reads /app.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3001

# No curl in the final image on purpose; Node 24 has fetch built in.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Call the installed binary directly rather than going through pnpm. Corepack
# only installs a shim at build time and fetches pnpm itself on first use, so
# running it here downloaded a tarball from npm on every container start — slow,
# and it made booting depend on the registry being reachable.
CMD ["apps/api/node_modules/.bin/tsx", "apps/api/src/server.ts"]
