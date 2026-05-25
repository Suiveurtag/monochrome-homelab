# Refactor Progress

This is the detailed progress log for multi-session Codex work. Keep it current, concise, and factual.

For future Codex discussions, start with `HANDOFF.md` and `AGENTS.md`. Use this file only when the short handoff does not contain enough detail.

## Current State

- Date: 2026-05-25
- Branch: main
- Last known commit before current checkpoint: 9908f28
- Current milestone: Self-Hosted Checkpoint 6 - Make Authentication Mandatory (next)
- Risk level: Medium

The repo now has an additive hybrid track identity layer plus a non-production local upload server prototype. Existing `track.id` playback/route behavior is preserved, while persisted tracks can carry source-aware `trackKey` and `source` metadata for external API tracks, browser-local files, podcasts, tracker tracks, and local server uploads.

Self-Hosted Checkpoints 1 through 5 are complete: `docs/ARCHITECTURE.md` now contains a concise "Self-Hosted Contract Map"; `js/track-model.ts` has additive future source kinds for `server-library`, `radio`, and `youtube-video` plus exported source normalization helpers; `js/server-library.js` is now the app-facing client boundary for future self-hosted library operations; `server/selfhosted/server.mjs` is the minimal backend skeleton with config loading, data directories, `/health`, and auth placeholders; and `server/storage/filesystem-library.mjs` now owns structured local filesystem storage for server-local uploads.

`HANDOFF.md` is now the recommended first-read summary for future sessions; read `AGENTS.md` next, then consult the larger docs only if more detail is needed.

## Last Completed Self-Hosted Checkpoint

Self-Hosted Checkpoint 5 - Make Filesystem Storage Production-Ready

Goal:

- Move the local upload prototype from flat per-user manifest storage toward structured local filesystem storage for audio blobs, metadata, indexes, artwork, and temp files.

Success criteria:

- New uploaded files are written under safe deterministic sharded audio paths.
- Track metadata and user upload ordering are stored as JSON indexes.
- Stream token lookup no longer requires scanning every manifest for new uploads.
- Existing prototype `manifest.json` uploads remain readable as a legacy fallback.
- Upload/list/stream response contracts remain compatible with the current frontend.

In scope:

- `server/storage/filesystem-library.mjs`
- `server/storage/filesystem-library.test.mjs`
- `server/uploads/server.mjs`
- `docs/ARCHITECTURE.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `docs/DECISIONS.md`
- `HANDOFF.md`
- `PROGRESS.md`

Out of scope:

- Rich audio metadata extraction.
- Artwork extraction/upload endpoints.
- Deletion, quotas, backup/restore, or full legacy migration tooling.
- Replacing the separate local upload prototype with the unified self-hosted backend.

## Last Session Handoff

Changes:

- Added `server/storage/filesystem-library.mjs`, a storage module for server-local uploads with sharded audio blobs, JSON track metadata, per-user indexes, stream token indexes, reserved artwork/tmp directories, and safe path resolution.
- Added `server/storage/filesystem-library.test.mjs` covering structured upload storage and legacy manifest fallback.
- Refactored `server/uploads/server.mjs` so upload/list/stream behavior delegates filesystem layout and token lookup to the storage module while keeping public API responses compatible.
- Updated architecture, milestone, decision, handoff, and checkpoint roadmap docs for Self-Hosted Checkpoint 5.
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

- Make local filesystem upload storage safer and more production-shaped before adding mandatory auth, admin approval, metadata editing, search, backup, or restore.
- Keep user-provided filenames out of filesystem paths and prepare stable on-disk locations for future metadata/artwork/index work.
- Preserve existing frontend upload/list/playback contracts and keep prior prototype manifest data readable.
- Give future AI sessions a clear next-step mechanism so they can continue one checkpoint at a time without re-planning from scratch.
- Prototype server uploads without committing to production storage.
- Keep uploaded tracks compatible with the M5a hybrid identity model.
- Reuse existing direct-audio, favorites, and playlist paths instead of adding parallel persistence behavior.

Files touched:

- `HANDOFF.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `server/storage/filesystem-library.mjs`
- `server/storage/filesystem-library.test.mjs`
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

- `node --check server/storage/filesystem-library.mjs server/uploads/server.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` passed.
- `node --test server/storage/filesystem-library.test.mjs` passed: 2 tests.
- Direct upload server smoke passed with temp storage: health, upload, list, HEAD stream, and range stream.
- `npm.cmd run build` passed with existing chunk/dynamic-import warnings.
- `npm.cmd exec -- eslint server/storage/filesystem-library.mjs server/uploads/server.mjs` was skipped/blocked by the existing ESLint TypeScript project config excluding `server/**/*.mjs`.
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

- The structured storage module keeps legacy manifests readable but does not migrate old files into the new layout.
- Stream token indexes are local JSON files; future auth/deletion/backup checkpoints still need to define lifecycle rules.
- Rich metadata/artwork extraction is still filename-only/default artwork.
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

If the user asks to continue the self-hosted roadmap, read `docs/SELF_HOSTED_CHECKPOINTS.md` and complete Checkpoint 6 - Make Authentication Mandatory.

Before implementing Checkpoint 6, inspect `js/accounts/auth.js`, `js/accounts/config.js`, `js/app.js`, `js/ui.js`, account-page DOM in `index.html`, and the self-hosted auth placeholders. Keep the localhost-only `Use Test Session` path explicit and development-only.

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
| 2026-05-25 | Self-Hosted Checkpoint 1 documentation review | Pass | Documentation-only contract map; inspected source references for track identity, upload server/client, DB favorites/playlists, auth, PocketBase, and listening-party boundaries. |
| 2026-05-25 | `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/track-model.test.ts` | Pass | 1 file, 10 tests passed after adding future source-kind coverage. |
| 2026-05-25 | `npm.cmd exec -- eslint js/track-model.ts` | Pass | Targeted lint passed for the expanded source model. |
| 2026-05-25 | `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/track-model.test.ts js/tests/db.test.js` | Pass | 2 files, 19 tests passed on rerun. First combined run hit the existing pinned-items IndexedDB isolation flake, while `db.test.js` passed alone immediately after. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-25 | `node --check js/server-library.js js/app.js js/ui.js` | Pass | Syntax checks passed for the new server library client and touched UI call sites. |
| 2026-05-25 | `npm.cmd exec -- eslint js/server-library.js js/server-uploads.js` | Pass | Targeted lint passed for the server library boundary and upload transport adapter. |
| 2026-05-25 | `npm.cmd exec -- eslint js/server-library.js js/server-uploads.js js/app.js js/ui.js` | Fail | Broader touched-file lint still hits pre-existing `js/app.js` errors and warnings; new server library files passed targeted lint. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings after adding `js/server-library.js`. |
| 2026-05-25 | `node --check server/selfhosted/config.mjs server/selfhosted/server.mjs server/uploads/server.mjs` | Pass | Syntax checks passed for the self-hosted backend skeleton and existing upload server. |
| 2026-05-25 | Self-hosted backend `/health` smoke | Pass | Started `createSelfHostedServer()` on an ephemeral port with temp data dir, fetched `/health`, verified `ok` and service name, then closed the server. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings after adding the self-hosted backend skeleton. |
| 2026-05-25 | `node --check server/storage/filesystem-library.mjs server/uploads/server.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` | Pass | Syntax checks passed after extracting the upload storage module. |
| 2026-05-25 | `node --test server/storage/filesystem-library.test.mjs` | Pass | 2 tests passed for structured upload storage and legacy manifest fallback. |
| 2026-05-25 | Direct upload server smoke | Pass | Health, upload, list, HEAD stream, and range stream passed with an ephemeral structured storage directory. |
| 2026-05-25 | `npm.cmd exec -- eslint server/storage/filesystem-library.mjs server/uploads/server.mjs` | Blocked | Existing ESLint TypeScript project config excludes `server/**/*.mjs`; syntax checks and Node tests covered the changed server modules. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings after structured upload storage extraction. |

## Milestone History

Append completed milestones here.

| Milestone | Date | Summary | Verification |
| --- | --- | --- | --- |
| M0 - Documentation baseline | 2026-05-24 | Internal docs added for Codex continuity. | Documentation-only status check passed. |
| M5a - Core Musique Hybride | 2026-05-24 | Added additive source-aware track identity and persistence boundary. | JS syntax checks passed; test execution blocked by missing dependencies. |
| Local Uploads Serveur prototype | 2026-05-25 | Added local filesystem upload server, `server-local` tracks, minimal Library UI, direct playback, and favorites/playlists compatibility. | Focused tests, build, syntax checks, direct server smoke, and Playwright UI/player smoke passed. |
| Self-Hosted Checkpoint 1 - Map Current Contracts | 2026-05-25 | Added a concise self-hosted contract map to architecture docs. | Documentation review passed; no runtime validation required. |
| Self-Hosted Checkpoint 2 - Stabilize The Music Source Model | 2026-05-25 | Added additive `server-library`, `radio`, and `youtube-video` source kinds plus exported source normalization helpers. | Focused track-model tests and targeted ESLint passed. |
| Self-Hosted Checkpoint 3 - Prepare A Server Library Client Layer | 2026-05-25 | Added `js/server-library.js` and routed existing upload/list UI through it. | Syntax checks, targeted ESLint, and production build passed. |
| Self-Hosted Checkpoint 4 - Define The Minimal Self-Hosted Backend | 2026-05-25 | Added minimal self-hosted backend config, data directories, `/health`, auth placeholders, env example, and dev script. | Server syntax checks, `/health` smoke, and production build passed. |
| Self-Hosted Checkpoint 5 - Make Filesystem Storage Production-Ready | 2026-05-25 | Added structured local filesystem storage for server-local uploads with sharded audio, metadata, user indexes, stream indexes, and legacy manifest fallback. | Server syntax checks, Node storage tests, direct upload/list/stream smoke, and production build passed. |
