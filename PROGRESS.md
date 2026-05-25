# Refactor Progress

This is the detailed progress log for multi-session Codex work. Keep it current, concise, and factual.

For future Codex discussions, start with `HANDOFF.md` and `AGENTS.md`. Use this file only when the short handoff does not contain enough detail.

## Current State

- Date: 2026-05-25
- Branch: main
- Last known commit: 6539363
- Current milestone: Local Uploads Serveur prototype
- Risk level: Medium

The repo now has an additive hybrid track identity layer plus a non-production local upload server prototype. Existing `track.id` playback/route behavior is preserved, while persisted tracks can carry source-aware `trackKey` and `source` metadata for external API tracks, browser-local files, podcasts, tracker tracks, and local server uploads.

`HANDOFF.md` is now the recommended first-read summary for future sessions; read `AGENTS.md` next, then consult the larger docs only if more detail is needed.

## Active Milestone

Local Uploads Serveur prototype

Goal:

- Allow a signed-in user to upload audio to a separate local filesystem server, list uploaded tracks in Library > Local Files, play them, and preserve `trackKey`/`source` compatibility.

Success criteria:

- Local upload server stores files and a manifest under `.storage/server-uploads`.
- Upload/list/stream endpoints work for a user-scoped prototype.
- Uploaded tracks use `source.kind === "server-local"` and `track.id === uploadId`.
- Library UI supports minimal upload/list/refresh.
- Player direct-audio path handles uploaded tracks.
- Existing favorites/playlists preserve `trackKey`/`source` for uploaded track objects.

In scope:

- Local server model and filesystem storage.
- Minimal upload/list/stream endpoints.
- Basic filename-derived metadata.
- Minimal Library UI.
- Player/favorites/playlists compatibility via existing paths.
- Documentation updates.

Out of scope:

- Production Cloudflare/R2/PocketBase file storage.
- Rich embedded metadata/artwork extraction.
- Syncing uploaded audio files.
- Public playback/share of uploaded files.
- Download/transcode flows for uploads.
- Formatting churn.

## Last Session Handoff

Changes:

- Added `docs/SELF_HOSTED_CHECKPOINTS.md`, an autonomous checkpoint roadmap for evolving Monochrome into a self-hosted homelab music app.
- Updated `HANDOFF.md` to point future sessions at the checkpoint roadmap when the user asks to continue the self-hosted plan.
- Added `server/uploads/server.mjs`, a separate Node local upload server with health, upload, list, and tokenized stream endpoints.
- Added `dev:uploads` script.
- Added `js/server-uploads.js` client helpers.
- Added `server-local` to `js/track-model.ts` without removing existing `server-upload` compatibility.
- Added a minimal Server uploads panel under Library > Local Files.
- Wired upload/refresh events and direct-audio playback through existing player behavior.
- Adjusted track favorite state updates to pass full track objects where server-local identity matters.
- Skipped waveform API stream lookup for direct-audio/server-local tracks.
- Hid incompatible context menu actions for server-local tracks.
- Added focused `server-local` identity coverage.
- Updated handoff, architecture, milestones, and decisions docs.

Why:

- Give future AI sessions a clear next-step mechanism so they can continue one checkpoint at a time without re-planning from scratch.
- Prototype server uploads without committing to production storage.
- Keep uploaded tracks compatible with the M5a hybrid identity model.
- Reuse existing direct-audio, favorites, and playlist paths instead of adding parallel persistence behavior.

Files touched:

- `HANDOFF.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `server/uploads/server.mjs`
- `js/server-uploads.js`
- `js/track-model.ts`
- `js/tests/track-model.test.ts`
- `js/app.js`
- `js/ui.js`
- `js/events.js`
- `index.html`
- `styles.css`
- `package.json`
- `PROGRESS.md`
- `docs/ARCHITECTURE.md`
- `docs/MILESTONES.md`
- `docs/DECISIONS.md`

Verification:

- Documentation-only checkpoint roadmap added; runtime validation not required for this file.
- `node --check server/uploads/server.mjs js/server-uploads.js js/app.js js/ui.js js/events.js` passed.
- Direct server smoke passed: health, upload, list, and HEAD stream.
- `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/track-model.test.ts js/tests/db.test.js` passed: 16 tests.
- `npm.cmd exec -- eslint js/track-model.ts js/server-uploads.js` passed.
- `npm.cmd run build` passed with existing chunk/dynamic-import warnings.
- Playwright UI smoke passed: signed-out Server uploads state renders, upload/list works with injected test user and ephemeral upload server, clicking an uploaded WAV loads `/stream` with `source.kind === "server-local"`.
- Added localhost-only `Use Test Session` auth fallback so upload testing does not require a real Better Auth login.
- `npm.cmd exec -- eslint js/track-model.ts js/server-uploads.js js/app.js js/ui.js js/events.js` failed on pre-existing `js/app.js` errors (`no-empty`, `no-floating-promises`) and warnings; targeted new/frontend helper lint passed.

Known risks:

- Local Vite startup succeeds under Playwright, but localhost reports expected CORS failures for remote auth/API endpoints and an existing Shaka config warning for `streaming.jumpLargeGaps`.
- Full lint still fails on broader existing `js/app.js` debt outside this milestone.
- Many UI surfaces still pass only legacy `id` into `isFavorite`; this is intentionally supported as fallback but less precise for non-TIDAL sources.
- Browser-local tracks still cannot serialize live `File` handles into cloud sync; local snapshots are metadata-only.
- Server-local uploaded audio files do not sync; cloud favorites/playlists may only carry metadata snapshots and local stream URLs.
- The local upload server auth boundary is prototype-only. Upload/list require the signed-in user id header, while stream URLs use per-track tokens for audio element compatibility.
- Server-local metadata is basic: filename title, unknown artist, unknown duration, no embedded artwork.
- Normal production audio stream resolution still depends on Qobuz-by-ISRC after TIDAL metadata lookup and must remain protected.

## Next Exact Step

For future sessions, read `HANDOFF.md` and `AGENTS.md` first.

If the user asks to continue the self-hosted roadmap, read `docs/SELF_HOSTED_CHECKPOINTS.md` and complete the next small checkpoint only.

If the user asks to continue the current local upload prototype, manually smoke real local uploads with real auth: run the app dev server plus `npm run dev:uploads`/`bun run dev:uploads`, upload a real audio file from Library > Local Files, play it, like/unlike it, add/remove it from a playlist, reload, and verify normal API playback still works.

## Open Questions / Blockers

- None currently.

## Behavior Contracts To Recheck

When refactoring, recheck these areas before closing a milestone:

- Public routes and provider route aliases.
- DOM IDs/classes/data attributes referenced from JavaScript and CSS.
- `localStorage` keys and serialized value formats.
- IndexedDB name, version, stores, indexes, and persisted object shapes.
- PocketBase collection names, legacy `firebase_id` mapping, and JSON field shapes.
- Custom browser events used for cross-module coordination.
- Audio/video playback, queue, quality, Media Session, and Safari/iOS behavior.
- Search result normalization, TIDAL/HiFi fallback, Qobuz-by-ISRC stream resolution, and provider-prefixed IDs.
- Sidebar collapse/order/visibility, pinned items, queue/lyrics side panel, and search history behavior.
- Downloads, metadata writing, lyrics, visualizers, scrobbling, accounts, sync, and listening parties.
- PWA update flow and Capacitor mobile compatibility.
- Cloudflare bot metadata routes, SPA fallback behavior, Docker/Nginx static serving, and Vite plugin behavior.

## Verification Log

Append new entries here.

| Date | Command | Result | Notes |
| --- | --- | --- | --- |
| 2026-05-24 | `git status --short --branch` | Pass | Only new documentation files are untracked. |
| 2026-05-24 | `git diff --stat --cached` | Pass | No staged changes; no source behavior changes staged. |
| 2026-05-24 | `git diff -- docs/ARCHITECTURE.md docs/MILESTONES.md docs/DECISIONS.md PROGRESS.md` | Pass | No output because the documentation files are untracked. |
| 2026-05-24 | `git status --short --branch` | Pass | Only `AGENTS.md`, `PROGRESS.md`, and `docs/` are untracked; no source files changed. |
| 2026-05-24 | `bun run test -- js/tests/track-model.test.ts js/tests/db.test.js` | Skipped | `bun` is not installed in this environment. |
| 2026-05-24 | `npm.cmd run test -- js/tests/track-model.test.ts js/tests/db.test.js` | Skipped | Local dependencies are not installed; `vitest` was not found. |
| 2026-05-24 | `node --check js/db.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/accounts/pocketbase.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/api.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/metadata.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/app.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/events.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/ui-interactions.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/ui.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/commandPalette.js` | Pass | Syntax check only. |
| 2026-05-24 | `git diff --check` | Pass | Only line-ending normalization warnings. |
| 2026-05-24 | `bun install` | Pass | Installed local dependencies from Bun lockfiles. |
| 2026-05-24 | `bun x playwright install chromium` | Pass | Installed Playwright Chromium/headless shell for browser tests. |
| 2026-05-24 | `bun run test:headless -- js/tests/track-model.test.ts js/tests/db.test.js` | Pass | 2 files, 15 tests passed. |
| 2026-05-24 | `bun x eslint js/track-model.ts` | Pass | Hybrid helper lint issues fixed. |
| 2026-05-24 | `bun run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk warnings. |
| 2026-05-24 | `bun run test:headless` | Fail | Broader suite failures remain in `player.test.js` mock and API download tests; not specific to `track-model.ts` follow-up. |
| 2026-05-24 | `bun run lint` | Fail | Broad existing lint debt remains; `js/track-model.ts` now passes targeted ESLint. |
| 2026-05-25 | Documentation-only handoff update | Pass | Added `HANDOFF.md`; no functional code changed. |
| 2026-05-25 | `node --check server/uploads/server.mjs js/server-uploads.js js/app.js js/ui.js js/events.js` | Pass | Syntax checks for local upload server and touched frontend modules. |
| 2026-05-25 | Direct local upload server smoke | Pass | Health, upload, list, and HEAD stream succeeded with an ephemeral storage directory. |
| 2026-05-25 | `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/track-model.test.ts js/tests/db.test.js` | Pass | 2 files, 16 tests passed. |
| 2026-05-25 | `npm.cmd exec -- eslint js/track-model.ts js/server-uploads.js` | Pass | Targeted lint for hybrid model and upload client. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-25 | Playwright local upload UI smoke | Pass | Server uploads panel rendered, upload/list worked with injected test auth, and an uploaded WAV loaded as `/stream` in the player. |
| 2026-05-25 | `npm.cmd exec -- eslint js/track-model.ts js/server-uploads.js js/app.js js/ui.js js/events.js` | Fail | Broader touched-file lint still hits pre-existing `js/app.js` errors and warnings. |
| 2026-05-25 | Self-hosted checkpoint roadmap documentation | Pass | Added `docs/SELF_HOSTED_CHECKPOINTS.md`; runtime validation not required. |
| 2026-05-25 | Local uploads closeout validation | Pass | Re-ran `node --check` on upload/frontend modules, focused Vitest DB/track-model tests, targeted ESLint for track model/upload client, and production build before commit. |

## Milestone History

Append completed milestones here.

| Milestone | Date | Summary | Verification |
| --- | --- | --- | --- |
| M0 - Documentation baseline | 2026-05-24 | Internal docs added for Codex continuity. | Documentation-only status check passed. |
| M5a - Core Musique Hybride | 2026-05-24 | Added additive source-aware track identity and persistence boundary. | JS syntax checks passed; test execution blocked by missing dependencies. |
| Local Uploads Serveur prototype | 2026-05-25 | Added local filesystem upload server, `server-local` tracks, minimal Library UI, direct playback, and favorites/playlists compatibility. | Focused tests, build, syntax checks, direct server smoke, and Playwright UI/player smoke passed. |
