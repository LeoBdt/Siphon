<div align="center">

<img src="assets/logo.svg" alt="Siphon" width="72" height="72">

# Siphon

**A self-hosted media downloader built on `yt-dlp`.**
Pick your quality, watch progress live, keep an organised library.

[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-black.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-black.svg)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/docker-compose-black.svg)](#deployment)

</div>

---

## Overview

Siphon is a web interface for `yt-dlp`, meant to run on your own machine or
server. Paste a URL, choose a quality, and follow the download as it happens.
Files land in a library you can browse, organise and play from the app.

It is not a hosted service: nothing leaves your machine, and hosting it is up to
you.

## Features

| | |
|---|---|
| **Downloads** | Video with sound (up to 4K/60 fps) or audio only — M4A and Opus extracted losslessly from the original track, MP3 when you need it — with optional resolution and frame-rate caps. |
| **Playlists and channels** | Every entry becomes its own tracked job under a parent, and you choose which titles to fetch before starting. |
| **Live progress** | Progress, speed and ETA pushed over WebSocket, including the current phase (video, audio, merge, convert). |
| **Library** | A sandboxed file explorer: breadcrumbs, create and rename, drag and drop, context menu, download a file or a whole folder as a ZIP. |
| **Built-in playback** | Persistent audio bar with a remembered volume, plus a video player with fullscreen. |
| **History** | Persisted in SQLite, with search, filters, retry and delete. |
| **Maintenance** | Disk usage, one-click `yt-dlp` update, and cleanup of the temporary files an interrupted download leaves behind. |
| **Bilingual** | English and French, switchable at runtime; translations are type-checked, so a missing string fails the build rather than the UI. |

## Stack

- **Front end** — Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui on Base UI, Motion, dnd-kit, TanStack Query
- **Back end** — Fastify 5 in TypeScript, driving `yt-dlp` as a subprocess; WebSocket; SQLite through `node:sqlite` (no native dependency)
- **Monorepo** — pnpm workspaces: `apps/web`, `apps/api`, `packages/shared`

## Requirements

- **Node.js 20 or newer**
- **pnpm** — `corepack enable && corepack prepare pnpm@latest --activate`
- **yt-dlp** — `winget install yt-dlp.yt-dlp`, `brew install yt-dlp` or `pip install yt-dlp`
- **ffmpeg** — required to merge video and audio streams, and to extract audio

Both binaries can stay on your `PATH` or be pointed at explicitly in
`apps/api/.env`.

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

- App: http://localhost:3000
- API health: http://localhost:3001/health

`pnpm dev:web` and `pnpm dev:api` start the services separately.

## Configuration

Everything lives in `apps/api/.env` (see `.env.example`).

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API listening port | `3001` |
| `ROOT_DIR` | Library root. Every file operation is confined below it. | `./data/library` |
| `YTDLP_PATH` | `yt-dlp` binary | `yt-dlp` |
| `FFMPEG_PATH` | `ffmpeg` binary | `ffmpeg` |
| `MAX_CONCURRENT_DOWNLOADS` | Simultaneous downloads. **Initial value only** — once changed from the Settings page it is persisted in the database and wins on later boots. | `2` |
| `WEB_ORIGIN` | Allowed CORS origin | `http://localhost:3000` |

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/downloads/info?url=` | Probe a URL (title, thumbnail, playlist entries) |
| `GET` | `/api/downloads` | List jobs |
| `GET` | `/api/downloads/:id` | One job |
| `POST` | `/api/downloads` | Create a job `{ url, preset, destPath, advanced?, playlistItems? }` |
| `POST` | `/api/downloads/:id/retry` \| `/cancel` | Retry, cancel |
| `DELETE` | `/api/downloads/:id` | Delete a job and its children |
| `GET` | `/api/files?path=` | List a folder |
| `POST` | `/api/files/folder` | Create a folder |
| `PATCH` | `/api/files` | Move or rename |
| `DELETE` | `/api/files?path=` | Delete |
| `GET` | `/api/files/stream?path=` | Stream a file (Range requests) |
| `GET` | `/api/files/download?path=` | Download a file, or a folder as a ZIP |
| `GET` `PUT` | `/api/settings` | Read and update settings |
| `GET` | `/api/system/disk` | Disk usage of the library volume |
| `GET` | `/api/system/ytdlp` | Installed `yt-dlp` version |
| `POST` | `/api/system/ytdlp/update` | Update `yt-dlp` |
| `POST` | `/api/system/cleanup` | Sweep temporary files (refused while downloads run) |
| `WS` | `/ws` | Live job updates |

Failed requests answer with `{ code, error }`, where `code` is a stable
identifier and `error` is an English fallback — the UI renders the message in
the active language.

## Deployment

The images bundle Node, `ffmpeg` and `yt-dlp`. A Caddy proxy fronts both
services and is the only one to publish a port, so the browser talks to a single
origin: nothing about the host is baked into the images, and CORS never comes
into play.

**Every command below is run from the repository root** — the directory holding
`docker-compose.yml`. Compose reads that file from the current directory, and
the default data path is relative to it.

The images are published to GitHub's registry, so a deployment is a pull rather
than a multi-minute compile on the target machine:

```bash
mkdir -p /opt/siphon && cd /opt/siphon
curl -O https://raw.githubusercontent.com/LeoBdt/Siphon/main/docker-compose.yml
mkdir -p data && sudo chown -R 1000:1000 data   # Linux only; skip on macOS
docker compose up -d
```

The compose file is self-contained: all three images carry what they need, so
there is nothing else to download and nothing to build. Do **not** pass
`--build` here — without the source tree there is nothing to build from.

To build from source instead — for development, or to run an unreleased
change — clone the repository and add `--build`:

```bash
# Clone wherever you keep third-party applications; /opt is the usual place.
sudo mkdir -p /opt/siphon && sudo chown "$USER:$USER" /opt/siphon
git clone https://github.com/LeoBdt/Siphon.git /opt/siphon
cd /opt/siphon

# Optional settings, read at startup (see the table below).
echo "SIPHON_PORT=8080" > .env

# The containers run as uid 1000 and must be able to write here.
mkdir -p data && sudo chown -R 1000:1000 data

docker compose up -d --build
```

The app is then on `http://<host>:8080`.

### Settings

Put these in a `.env` file next to `docker-compose.yml`. They are read when the
containers start, so changing one needs `docker compose up -d`, never a rebuild.

| Variable | Purpose | Default |
|---|---|---|
| `SIPHON_PORT` | Port published on the host | `8080` |
| `SIPHON_BIND` | Address to bind to — `127.0.0.1` keeps it off the network | `0.0.0.0` |
| `DATA_DIR` | Where downloads and the database live | `./data` |
| `MAX_CONCURRENT_DOWNLOADS` | Initial concurrency; the Settings page overrides it | `2` |

Leave `DATA_DIR` out unless you want the library somewhere else — on a larger
disk, typically. Point it at a path you have created and given to uid 1000, and
keep it **on a single filesystem**: the scratch space for downloads in progress
sits beside the library so a finished file is moved with a rename instead of
being copied.

### Day to day

```bash
cd /opt/siphon
docker compose ps                           # what is running
docker compose logs -f api                  # follow a service
docker compose down                         # stop (data is untouched)
docker compose pull && docker compose up -d # update (published images)
```

`docker compose down` removes the containers, not your files: the library and
the database live in `DATA_DIR` on the host. Only `down -v` destroys volumes,
and it is never needed here.

For a public deployment, point your own TLS-terminating proxy at `SIPHON_PORT`
— and read the next section first.

## Security

Every file operation is confined to `ROOT_DIR`: absolute paths, `..` traversal
and symlink escapes are rejected, and that behaviour is covered by tests.

**There is no authentication yet.** Do not expose Siphon publicly as it stands —
it runs processes and reaches the file system. Keep it on a private network, or
put protection in front of it at the proxy.

## Development

```bash
pnpm typecheck   # all three packages
pnpm test        # API unit tests (node:test)
pnpm lint
pnpm build
```

## Intended use

Siphon is a personal tool for archiving and offline playback. Downloading
content may be restricted by a platform's terms of service and by copyright law
where you live — making sure your use is lawful is on you. The project does not
encourage or facilitate redistributing protected works.

## License

[MIT](LICENSE)
