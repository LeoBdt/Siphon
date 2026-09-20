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

The Docker images bundle Node, `ffmpeg` and `yt-dlp`. A Caddy proxy fronts both
services, so the browser only ever talks to one origin — nothing about the host
is baked into the images, and CORS never comes into play.

```bash
mkdir -p data && sudo chown -R 1000:1000 data   # containers run as uid 1000
docker compose up -d --build
```

The app is then on `http://<host>:8080`.

| Variable | Purpose | Default |
|---|---|---|
| `SIPHON_PORT` | Port published on the host | `8080` |
| `SIPHON_BIND` | Address to bind to, e.g. `127.0.0.1` to keep it local | `0.0.0.0` |
| `DATA_DIR` | Where downloads and the database live | `./data` |

Put them in a `.env` file next to `docker-compose.yml`. Downloads, the scratch
space and the SQLite database all land under `DATA_DIR`, on the host, so they
outlive the containers and back up like ordinary files. Keep that directory on
a single filesystem: the scratch space sits beside the library precisely so a
finished download is moved with a rename rather than copied.

For a public deployment, point your own TLS-terminating proxy at
`SIPHON_PORT` — and read the next section first.

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
