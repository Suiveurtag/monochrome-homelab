# Monochrome Handoff

Future Codex discussions should read these first:

1. `HANDOFF.md`
2. `AGENTS.md`
3. `docs/SELF_HOSTED_CHECKPOINTS.md` when the user asks to continue the self-hosted roadmap

Only read `PROGRESS.md`, `docs/ARCHITECTURE.md`, `docs/MILESTONES.md`, or `docs/DECISIONS.md` if something needed for the task is missing here.

## Current State

- Branch: `main`
- Project: Vite music web app with Cloudflare Pages Functions and Capacitor shells.
- Current risk level: Medium.
- The repo is in a behavior-preserving refactor sequence.
- `track.id` remains the playback/route compatibility identifier.
- Source-aware persistence now uses additive `trackKey` + `source` fields.

## Last Completed Milestone

Self-Hosted Checkpoint 4 - Define The Minimal Self-Hosted Backend is complete.

It added `server/selfhosted/server.mjs` plus `server/selfhosted/config.mjs` as a separate minimal self-hosted backend skeleton. The server loads env/config, prepares data directories, exposes `/health`, and reserves auth endpoint space with placeholder responses. The previous server library client, source-model, contract-map, and Local Uploads Serveur checkpoints remain complete and committed.

## Core Musique Hybride Changes

- Added `js/track-model.ts`.
- Added helpers: `getTrackKey`, `withTrackIdentity`, `minifyHybridTrack`, `applyTrackOverrides`, `isSameTrack`.
- Exported helpers: `TRACK_SOURCE_KINDS`, `isTrackSourceKind`, `normalizeTrackSourceRef`.
- Bumped IndexedDB `MonochromeDB` to version `12`.
- Added stores: `track_catalog`, `track_metadata_overrides`, `favorites_track_refs`.
- Preserved existing stores: `favorites_tracks`, `history_tracks`, `user_playlists`, and others.
- Track favorites now write source-aware refs plus snapshots while legacy favorites remain readable.
- Playlists now preserve `trackKey`/`source` and dedupe/remove by `trackKey` when available, falling back to legacy `id`.
- PocketBase track minification preserves `trackKey`/`source`.
- API tracks are annotated as external/TIDAL.
- Browser-local metadata is annotated as `browser-local`.
- Future self-hosted filesystem library tracks can use `server-library`.
- Future radio and YouTube association identities can use `radio` and `youtube-video`.

## Local Uploads Serveur Changes

- Added `server/uploads/server.mjs`, a separate Node dev server for local filesystem uploads.
- Added `npm run dev:uploads` / `bun run dev:uploads` script entry.
- Added `npm run dev:selfhost` / `bun run dev:selfhost` script entry for the minimal self-hosted backend.
- Added `js/server-uploads.js` for client list/upload calls.
- Added `js/server-library.js` as the app-facing self-hosted library client.
- Added source kind `server-local` while preserving existing `server-upload` compatibility.
- Server upload tracks use `track.id === uploadId`, `source.kind === "server-local"`, and `trackKey` generated through the hybrid model on the client.
- Library > Local Files now has a minimal Server uploads panel with upload, refresh, count, and track list.
- Player integration uses existing direct-audio handling via `audioUrl`/`remoteUrl`.
- Favorites/playlists use existing object-track paths and preserve `trackKey`/`source`.
- Files are stored under `.storage/server-uploads` by hashed user id; this is local prototype storage, not Cloudflare Pages production storage.

## Decisions Not To Break

- Preserve app behavior unless a milestone explicitly scopes a behavior change.
- Do not replace `track.id`; keep it usable by player, routes, DOM datasets, and API calls.
- Use `trackKey` for persisted source-aware identity when an object track is available.
- Keep legacy fallback by `id` for existing favorites, playlists, history, UI surfaces, and sync data.
- Do not rename IndexedDB stores or PocketBase JSON fields without a migration plan.
- Better Auth is the active browser auth boundary.
- PocketBase is the active cloud sync/profile/public playlist boundary.
- Appwrite is legacy/residual; do not remove it opportunistically.
- Preserve TIDAL/HiFi metadata lookup plus Qobuz-by-ISRC stream resolution.
- Treat `server-local` as the local upload prototype source; do not confuse it with production R2/PocketBase storage.
- Avoid broad formatting churn.

## Critical Files

- `js/track-model.ts`: hybrid track identity contract.
- `js/db.js`: IndexedDB schema, favorites, history, playlists, export/import.
- `js/accounts/pocketbase.js`: cloud sync and public playlist shapes.
- `js/api.js`, `js/music-api.js`, `js/HiFi.ts`: external music metadata and stream flow.
- `js/player.js`: playback, queue, media elements, quality, Media Session.
- `js/ui.js`, `js/events.js`, `js/ui-interactions.js`, `js/app.js`: main UI wiring and track actions.
- `js/metadata.js`: browser-local metadata shape.
- `js/server-uploads.js`: local upload server client.
- `js/server-library.js`: app-facing server library client wrapper over the prototype upload client.
- `server/uploads/server.mjs`: non-production local filesystem upload server.
- `server/selfhosted/server.mjs`: minimal self-hosted backend skeleton.
- `server/selfhosted/config.mjs`: self-hosted env/config and data directory setup.
- `PROGRESS.md`: detailed verification and latest handoff notes.

## Known Risks

- Many UI paths still pass only legacy `id` into favorite checks; this is supported but less precise for non-TIDAL sources.
- Browser-local tracks cannot sync live `File` handles; snapshots are metadata-only.
- Full test and lint suites still have broader failures unrelated to the hybrid helper follow-up.
- Localhost can show expected CORS failures for remote auth/API endpoints.
- Existing Shaka warning for `streaming.jumpLargeGaps` can appear during local startup.
- Playback/download refactors must not disturb Qobuz-by-ISRC stream resolution.
- Local upload auth is a prototype boundary: list/upload require the Better Auth user id header from the signed-in app, while stream URLs use per-track tokens so the audio element can load them without custom headers.
- On localhost, a visible `Use Test Session` button is available on the account page when no real account is signed in; it creates a dev-only fake user so uploads can be tested without Better Auth access.
- Server upload metadata is basic: filename-derived title, unknown artist, unknown duration, no embedded artwork/tag extraction yet.
- Uploaded audio file sync is out of scope; PocketBase playlist/favorite sync may contain metadata snapshots and local stream URLs that are not portable.

## Validation Commands

Preferred:

- `bun run test:headless -- js/tests/track-model.test.ts js/tests/db.test.js` or npm equivalent when Bun is unavailable.
- `bun x eslint js/track-model.ts js/server-uploads.js` or npm equivalent when Bun is unavailable.
- `bun run build` or `npm run build` when Bun is unavailable.
- `bun run test:headless`
- `bun run lint`

Last known results:

- `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/track-model.test.ts js/tests/db.test.js` passed: 16 tests.
- `npm.cmd exec -- eslint js/track-model.ts js/server-uploads.js` passed.
- `node --check server/uploads/server.mjs js/server-uploads.js js/app.js js/ui.js js/events.js` passed.
- `npm.cmd run build` passed with existing chunk/dynamic-import warnings.
- Direct server smoke passed: health, upload, list, and HEAD stream.
- Playwright UI smoke passed: Library > Local Files shows Server uploads signed-out state, upload/list works with a test user, and clicking an uploaded WAV loads an audio `/stream` URL with `source.kind === "server-local"`.
- Broader ESLint on `js/app.js/js/ui.js/js/events.js` still fails on pre-existing `app.js` errors and warnings unrelated to this milestone.

## Next Recommended Milestone

If the user asks to continue the self-hosted roadmap, read `docs/SELF_HOSTED_CHECKPOINTS.md` and complete Checkpoint 5 - Make Filesystem Storage Production-Ready.

For extra runtime confidence before deeper upload work, manually smoke local uploads in the running app with real auth and audio:

- Start `bun run dev` or `npm run dev`.
- In another shell start `bun run dev:uploads` or `npm run dev:uploads`.
- Sign in, open Library > Local Files, upload a real audio file, play it, like/unlike it, add/remove it from a playlist, reload, and verify it still lists and plays.
- Recheck normal API playback after the upload smoke.

After that, decide whether to harden local upload metadata or move the storage backend toward production-ready R2/PocketBase files.

## Resume Instruction

When resuming, first read `HANDOFF.md` and `AGENTS.md`.

Then inspect only the code directly relevant to the requested task. Use the larger docs only when this file does not answer a needed question.
