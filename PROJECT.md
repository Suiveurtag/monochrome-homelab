# Monochrome — Homelab Self-Hosted Fork

> Project summary for AI agents / contributors. Read this first before working on the codebase.

## What this is

A **self-hosted homelab fork** of [Monochrome](https://github.com/monochrome-music/monochrome), the free FLAC/Tidal-streaming music web app (see `INSTANCES.md` for the public ecosystem). Upstream uses Appwrite for auth and hifi-api for streaming; this fork replaces that stack with **PocketBase + a Go SpotiFLAC importer** so the owner can run their own music library on their homelab, and adds a large amount of custom UI work.

- **Status:** WORK IN PROGRESS, unstable. `README.md` explicitly says "Do not install this unstable thing for now."
- **Version:** `2.5.1` (package.json)
- **Origin:** `git@github.com:Suiveurtag/monochrome-homelab.git`, branch `main`
- **License:** Apache-2.0

## Tech stack

| Layer                | Technology                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend             | Vanilla JS (no framework), one giant `index.html` (7k lines) + `styles.css` (18k lines). Some modules are TypeScript                                         |
| Build                | Vite 7, Bun as package manager (`bun.lock`, `bun.lockb`)                                                                                                     |
| Backend / DB / Files | PocketBase 0.30 (`ghcr.io/muchobien/pocketbase:0.30.0`), schema in `pb_migrations/`, data in `pb_data/`                                                      |
| Importer service     | Go service wrapping `github.com/afkarxyz/SpotiFLAC` (pinned v7.1.9 / ref `7a3a50e8d5b56fc7335d5822889c499f5e76e39b`) — `services/spotiflac-importer/main.go` |
| Streaming/playback   | hls.js, shaka-player, `@svta/common-media-library`, ffmpeg.wasm for transcodes                                                                               |
| Visuals              | three, ogl, butterchurn (visualizers), WebGL shaders                                                                                                         |
| PWA                  | `vite-plugin-pwa` (runtime caching for images/media, offline)                                                                                                |
| Mobile               | Capacitor 8 (`android/`, `ios/`, `capacitor.config.ts`)                                                                                                      |
| Tests                | Vitest + Playwright browser provider (headless via `HEADLESS=true`)                                                                                          |
| Lint                 | `eslint` (JS), `stylelint` (CSS), `htmlhint` (HTML)                                                                                                          |

## Architecture

```
Browser (Vite dev on :5173 / nginx static on :3000)
  │
  ├─ /api/selfhost/* ──► SpotiFLAC importer (Go, :8787) ──► PocketBase :8090
  ├─ /api, /_/*      ──► PocketBase (auth, records, file storage)
  └─ playback         ──► PocketBase-served audio files (music_tracks collection)
```

- **Auth:** self-hosted mode uses **PocketBase email/password only**. OAuth is explicitly disabled (`js/accounts/config.js:72` throws for OAuth). `js/accounts/auth.js` = auth flow, `js/accounts/pocketbase.js` = `syncManager`.
- **Self-hosted library:** all tracks live in the PocketBase `music_tracks` collection. `mapPocketBaseTrack()` in `js/selfhost-server-api.js` converts a PocketBase record into the app's internal track shape (album/artist ids are `stableId()` hashes of name strings). This file is the bridge between the UI and the self-hosted backend.
- **Importer:** `main.go` (610 lines) handles Spotify URL/likes imports — downloads FLAC, writes records+files into PocketBase, tracks progress via `music_import_jobs` and a `sync.Map` of cancellable jobs.
- **Dev orchestration:** `./monochrome dev` starts only `pocketbase`, `pocketbase-dev-init`, and `selfhost-importer-dev` via Docker Compose, then runs Vite **on the host** (HMR). Vite proxies `/api/selfhost`→8787, `/api` and `/_`→8090. See `DOCKER.md`.
- **Prod:** `docker compose up -d` → `monochrome` (nginx, :3000), `pocketbase`, `selfhost-importer`. `docker-compose.override.yml` is fork-specific and documented in `DOCKER.md`.

## Key files / directories

| Path                                                                      | Purpose                                                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`, `styles.css`, `player-refined.css`, `now-playing-panel.css` | UI markup + all styling (hand-written, no CSS framework)                                            |
| `js/app.js`                                                               | Bootstraps the whole app; wires everything together (3.7k lines)                                    |
| `js/selfhost-server-api.js`                                               | PocketBase ⇄ internal track model bridge + upload/import/update/delete API                          |
| `js/player.js`, `js/player-bar-*.js`, `js/audio-context.js`               | Audio engine, gapless playback, custom player UI                                                    |
| `js/now-playing-panel.js` (+ `-model`, `.test.js`)                        | Custom "Now Playing" fullscreen panel (prototype)                                                   |
| `js/spicy-lyrics-renderer.js`, `spicy-lyrics-ttml.js`                     | Line-synced lyrics renderer (replaces stock lyrics UI)                                              |
| `js/track-versions.js`, `track-version-picker.js`                         | Grouping alternative versions of the same track                                                     |
| `js/upload-gallery.js`, `selfhost-upload-batch.js`                        | Batch file uploads to the self-hosted library                                                       |
| `js/accounts/config.js`, `auth.js`, `pocketbase.js`                       | PocketBase auth/sync                                                                                |
| `js/db.js`, `js/storage.js`                                               | Local IndexedDB + localStorage settings                                                             |
| `js/music-api.js`                                                         | Upstream streaming API layer (hifi/Tidal) — kept from upstream                                      |
| `pb_migrations/*.js`                                                      | PocketBase schema: `music_tracks`, `music_import_jobs`, users, social, track versions, canvas, etc. |
| `services/spotiflac-importer/`                                            | Go importer (`main.go`, `main_test.go`, `dev-watch.sh`)                                             |
| `scripts/selfhost_importer.py`                                            | Python variant of the importer (legacy/testing)                                                     |
| `extension/`                                                              | Browser extension that spoofs Tidal request headers                                                 |
| `docs/design-references/now-playing/`                                     | Reference screenshots/videos used for the Now Playing design                                        |
| `Modelfile`                                                               | An Ollama model export — **not** part of the app                                                    |
| `functions/`                                                              | Leftover upstream Cloudflare Worker-style dirs — mostly legacy, check before relying on them        |

## Custom features (fork work, per git log)

- Gapless playback with adaptive preloading; custom resizable floating player panel; playback fades; quality selector
- **Now Playing panel** prototype (Spotify-style fullscreen view with lyrics + queue + canvas)
- **Spicy Lyrics**: animated line-synced lyrics renderer
- **Track versions**: alternative-version grouping + picker
- **Upload gallery** (self-hosted library management)
- **Easter eggs**: `soggy-easter-egg.*`, `metallic-logo-easter-egg.*`
- Animated/video artwork ("canvas"), track theme colors, metadata editing, local file import (`local-music-api.js`)
- Social features (`social.js`), listening parties (`listening-party.js`), scrobbling (Last.fm, LibreFM, ListenBrainz, Maloja)

## Dev workflow

```bash
bun install
./monochrome dev        # Docker infra (PB:8090, importer:8787) + Vite HMR at :5173
./monochrome down       # stop infra (Vite stays on host, Ctrl+C separately)
./monochrome logs|status

bun run lint            # eslint + stylelint + htmlhint
bun run test            # vitest + playwright (browser, headed)
HEADLESS=true bun run test   # headless
bun run build           # vite build → dist/ (nginx serves this in prod)
```

Dev PocketBase superuser: `admin@example.com` / `changeme` (override via `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD`).

## Gotchas & conventions for AI contributors

- **Do not** assume upstream conventions apply — this fork intentionally diverges (self-hosted auth, custom player/lyrics).
- `js/accounts/config.js` — in self-hosted mode OAuth **must** stay disabled; only email/password.
- **PurgeCSS safelist** in `vite.config.ts` is fragile: it keeps `spicy-lyrics*`, `Lyrics*`, `VirtualLyrics*` classes. Don't remove it (breaks the lyrics web components). Do not re-enable `variables: false` purgecss behavior either.
- `vite.config.ts` **spoofs the navigator userAgent** at runtime (in `js/app.js`) to bypass Google's embedded-browser check — keep that logic intact or audio init may break.
- The `music_tracks` collection uses the legacy `firebase_id`-style naming (see `DOCKER.md`) — don't "fix" it.
- `Modelfile`, `bun.lockb`, `pb_data/`, `dist/` are runtime/generated — don't treat as source.
- UI work is heavily design-reviewed: hooks in `.codex/hooks.json` / `.claude/settings.local.json` run the **impeccable** design-check skill (`/.agents/skills/impeccable/`) after edits. Follow existing design language when touching UI.
- Vite proxies require the Docker infra running (`./monochrome dev`); backend-dependent features won't work from plain `bun run dev`.
- Tests live next to source (`js/*.test.js`) plus `js/tests/`. Use `vitest` browser mode.
