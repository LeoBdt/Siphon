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
| **Accounts** | Invitations rather than accounts made on someone's behalf — named, reusable for several people, and greeting the invitee by name. Permissions default from a group and are overridable per person, with storage quotas and a maximum file size. Optional two-factor authentication, an audit log, and lockout after repeated failed sign-ins. |
| **Per-member scope** | A confined member works in a folder of their own and sees only their own queue and history; an administrator can widen the view and read each account's usage. |
| **Built-in playback** | Persistent audio bar with a remembered volume, plus a video player with fullscreen. |
| **History** | Persisted in SQLite, with search, filters, retry and delete. |
| **Maintenance** | Disk usage, one-click `yt-dlp` update, and cleanup of the temporary files an interrupted download leaves behind. |
| **Bilingual** | English and French, switchable at runtime; translations are type-checked, so a missing string fails the build rather than the UI. |

## Stack

- **Front end** — Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui on Base UI, Motion, dnd-kit, TanStack Query
- **Back end** — Fastify 5 in TypeScript, driving `yt-dlp` as a subprocess; WebSocket; SQLite through `node:sqlite` (no native dependency)
- **Monorepo** — pnpm workspaces: `apps/web`, `apps/api`, `packages/shared`

## Deployment

The images bundle Node, `ffmpeg` and `yt-dlp`. A Caddy proxy fronts both
services and is the only one to publish a port, so the browser talks to a single
origin: nothing about the host is baked into the images, and CORS never comes
into play.

**Every command below is run from the directory holding `docker-compose.yml`.**
Compose reads that file from the current directory, and the default data path is
relative to it.

```bash
mkdir -p /opt/siphon && cd /opt/siphon
curl -O https://raw.githubusercontent.com/LeoBdt/Siphon/main/docker-compose.yml
mkdir -p data && sudo chown -R 1000:1000 data   # Linux only; skip on macOS
docker compose up -d
```

Siphon is then on `http://<host>:8080`. The compose file is self-contained: all
three images carry what they need, so there is nothing else to download and
nothing to build. Images are published for `linux/amd64` and `linux/arm64`, so
an Apple Silicon Mac or an ARM server pulls the same way an x86 one does.

The first person to open it creates the administrator account. There is no
default password to change, and no window during which one exists.

### Settings

Put these in a `.env` file next to `docker-compose.yml`. They are read when the
containers start, so changing one needs `docker compose up -d`, never a rebuild.

| Variable | Purpose | Default |
|---|---|---|
| `SIPHON_PORT` | Port published on the host | `8080` |
| `SIPHON_BIND` | Address to bind to — `127.0.0.1` keeps it off the network | `0.0.0.0` |
| `DATA_DIR` | Where downloads and the database live | `./data` |
| `MAX_CONCURRENT_DOWNLOADS` | Initial concurrency; the Settings page overrides it from then on | `2` |

Leave `DATA_DIR` out unless you want the library somewhere else — on a larger
disk, typically. Point it at a path you have created and given to uid 1000, and
keep it **on a single filesystem**: the scratch space for downloads in progress
sits beside the library so a finished file is moved with a rename instead of
being copied.

### Day to day

```bash
docker compose ps                           # what is running
docker compose logs -f api                  # follow a service
docker compose down                         # stop (data is untouched)
docker compose pull && docker compose up -d # update
```

### Locked out

There is no password reset by email — Siphon sends no mail and knows no address.
Proof of ownership is access to the machine it runs on:

```bash
docker compose exec api node --import tsx   apps/api/src/scripts/reset-password.ts            # list the accounts
docker compose exec api node --import tsx   apps/api/src/scripts/reset-password.ts <username> # print a new password
```

It signs every session on that account out, and clears any lockout. Change the
password from Settings › Profile once you are back in.

`docker compose down` removes the containers, not your files: the library and
the database live in `DATA_DIR` on the host. Only `down -v` destroys volumes,
and it is never needed here.

### Building from source

For development, or to run an unreleased change:

```bash
sudo mkdir -p /opt/siphon && sudo chown "$USER:$USER" /opt/siphon
git clone https://github.com/LeoBdt/Siphon.git /opt/siphon
cd /opt/siphon
mkdir -p data && sudo chown -R 1000:1000 data
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Building is opt-in through that second file: `docker-compose.yml` alone only
ever pulls, so a deployment that downloaded nothing else cannot be told to build
a source tree it does not have.

## Security

Every file operation is confined to a root directory — a member's own folder if
they are scoped to one, the library root otherwise. Absolute paths, `..`
traversal and symlink escapes are rejected, and that behaviour is covered by
tests.

Passwords are hashed with scrypt and never written to the database, the logs or
an API response in their original form. Sessions live in the database and are
revoked on sign-out, on suspension, and when an account locks itself after
repeated failures. Requests that change state carry a CSRF token. Members see
only their own downloads, enforced on the server rather than filtered in the
browser.

**Siphon does not terminate TLS.** Over plain HTTP, passwords and session
cookies are readable on the network — a LAN included. Put it behind a reverse
proxy that terminates TLS, or reach it over a VPN such as Tailscale or
WireGuard.

Passkeys are not supported yet; they require a domain and a secure context.

## Running from source

Useful only for development — a deployment should use the images above.

**Requirements:** Node.js 20+, pnpm (`corepack enable`), `yt-dlp`, and `ffmpeg`
(needed to merge video with audio, and to extract audio). Both binaries can stay
on your `PATH` or be pointed at explicitly.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

The app is on http://localhost:3000, the API on http://localhost:3001.
`pnpm dev:web` and `pnpm dev:api` start the services separately.

`apps/api/.env` configures the API directly — `PORT`, `ROOT_DIR`, `YTDLP_PATH`,
`FFMPEG_PATH`, `WEB_ORIGIN` and `MAX_CONCURRENT_DOWNLOADS`. See
`.env.example` for the current list and defaults. It is not used by the Docker
deployment, which is configured through the table above.

```bash
pnpm typecheck   # all three packages
pnpm test        # API unit tests (node:test)
pnpm lint
pnpm build
```

## API

Everything under `/api` requires a session except the sign-in endpoints and the
health probe, and that includes the WebSocket and the file-streaming route.
Failed requests answer with `{ code, error }`, where `code` is a stable
identifier and `error` is an English fallback — the interface renders the
message in the active language.

| Area | Routes |
|---|---|
| Downloads | `/api/downloads` (list, create), `/api/downloads/:id` (read, delete, `/retry`, `/cancel`, `/file`), `/api/downloads/info?url=` |
| Files | `/api/files` (list, move, delete), `/api/files/folder`, `/api/files/stream?path=`, `/api/files/download?path=` |
| Accounts | `/api/auth/*` (state, setup, login, logout, profile, invitations, TOTP), `/api/admin/users`, `/api/admin/groups`, `/api/admin/invites`, `/api/admin/audit` |
| System | `/api/settings`, `/api/system/disk`, `/api/system/ytdlp` (read, `/update`), `/api/system/cleanup` |
| Live | `WS /ws` — job updates, scoped to what the connection is allowed to see |

## Intended use

Siphon is a personal tool for archiving and offline playback. Downloading
content may be restricted by a platform's terms of service and by copyright law
where you live — making sure your use is lawful is on you. The project does not
encourage or facilitate redistributing protected works.

## License

[MIT](LICENSE)
