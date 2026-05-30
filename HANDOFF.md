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

Self-Hosted Checkpoint 14 - Add A Dedicated Radio Tab is complete.

It added Library > Radio plus `js/selfhosted-radios.js`: approved signed-in users can list enabled self-hosted radios, filter them locally, add new station entries through `/api/radios`, refresh the list, and play stations as hybrid tracks with `source.kind === "radio"` through the existing direct-audio player path. Checkpoint 13 added the JSON-backed self-hosted radio API, Checkpoint 12 embedded upload metadata extraction, Checkpoint 11 shared metadata editing, Checkpoint 10 server-side upload search, Checkpoint 9 dedicated Uploaded Music tab, Checkpoint 8 admin account management, Checkpoint 7 account approval, Checkpoint 6 browser mandatory auth, Checkpoint 5 structured upload storage, and the previous minimal backend skeleton, server library client, source-model, contract-map, and Local Uploads Serveur checkpoints remain complete.

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
- Added `server/storage/filesystem-library.mjs`, the structured filesystem storage layer used by the upload server.
- Added `npm run dev:uploads` / `bun run dev:uploads` script entry.
- Added `npm run dev:selfhost` / `bun run dev:selfhost` script entry for the minimal self-hosted backend.
- Added `js/server-uploads.js` for client list/upload calls.
- Added `js/server-library.js` as the app-facing self-hosted library client.
- Added source kind `server-local` while preserving existing `server-upload` compatibility.
- Server upload tracks use `track.id === uploadId`, `source.kind === "server-local"`, and `trackKey` generated through the hybrid model on the client.
- Library > Uploaded Music now has the server uploads UI with upload, refresh, count, server-side search for non-empty queries, and track list.
- Non-empty Uploaded Music search queries now call server-side upload search through `js/server-library.js` and `/uploads/search`.
- Uploaded Music track menus now include metadata editing for `server-local` tracks.
- Structured uploaded-track metadata can be edited server-side for title, artist, album, year, artwork URL, and tags.
- New structured uploads extract embedded title, artist, album, year, duration, genre, and artwork when available.
- Extracted artwork is exposed through tokenized `/uploads/:id/artwork` URLs.
- Self-hosted radios now have a backend model with create/list/admin update endpoints.
- Library > Radio now has list, refresh, add-station, search/filter, and playback through the existing track-list/player flow.
- Library > Local Files remains the browser folder/File System Access surface.
- Player integration uses existing direct-audio handling via `audioUrl`/`remoteUrl`.
- Favorites/playlists use existing object-track paths and preserve `trackKey`/`source`.
- Upload storage root defaults to `.storage/server-uploads`; this is local prototype storage, not Cloudflare Pages production storage.
- New server-local uploads use structured storage under `.storage/server-uploads` by default: `audio/`, `metadata/tracks/`, `indexes/users/`, `indexes/streams/`, `artwork/`, and `tmp/`.
- Legacy `.storage/server-uploads/<hashed-user-id>/manifest.json` uploads remain listable and streamable as a fallback, but new writes do not use that shape.

## Decisions Not To Break

- Preserve app behavior unless a milestone explicitly scopes a behavior change.
- Do not replace `track.id`; keep it usable by player, routes, DOM datasets, and API calls.
- Use `trackKey` for persisted source-aware identity when an object track is available.
- Keep legacy fallback by `id` for existing favorites, playlists, history, UI surfaces, and sync data.
- Do not rename IndexedDB stores or PocketBase JSON fields without a migration plan.
- Better Auth is the active browser auth boundary.
- Mandatory self-hosted auth is opt-in through `MONOCHROME_AUTH_REQUIRED=true`; default/public app behavior remains ungated unless configured.
- Self-hosted account approval is server-side JSON state under the self-hosted data directory; the Account page admin panel now uses approved admin account headers, while `MONOCHROME_ADMIN_SECRET` remains a bootstrap/API fallback.
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
- `js/selfhosted-admin.js`: app-facing self-hosted account/admin client and Account page admin panel renderer.
- `js/selfhosted-radios.js`: app-facing self-hosted radio client and radio-to-hybrid-track normalizer.
- `server/uploads/server.mjs`: non-production local filesystem upload server, including `/uploads/search`, `/uploads/:id/metadata`, and `/uploads/:id/artwork`.
- `server/storage/audio-metadata.mjs`: server-side TagLib extraction for uploaded audio defaults and embedded artwork.
- `server/storage/filesystem-library.mjs`: safe structured local filesystem storage for server-local upload blobs, metadata, user indexes, stream-token indexes, bounded per-user search, and shared metadata updates.
- `server/selfhosted/server.mjs`: minimal self-hosted backend skeleton.
- `server/selfhosted/config.mjs`: self-hosted env/config and data directory setup.
- `server/selfhosted/accounts.mjs`: self-hosted account approval store and state helpers.
- `server/selfhosted/radios.mjs`: self-hosted JSON radio store and validation helpers.
- `PROGRESS.md`: detailed verification and latest handoff notes.
- `js/auth-gate.js`: client-side mandatory auth route guard helpers.

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
- Structured upload storage does not yet include deletion, quotas, backup/restore, full legacy migration, a dedicated full-text index, edit history/moderation, or rich metadata/artwork extraction.
- Mandatory auth is currently a client-side route boundary; account approval is enforced by the self-hosted `/api/accounts/me` endpoint, and admin account management relies on server-side `/api/admin/accounts` authorization.
- The admin panel is intentionally basic; it does not include invitations, moderation tools, audit history, or richer profile/social account state yet.

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
- `node --check server/storage/filesystem-library.mjs server/uploads/server.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` passed.
- `node --test server/storage/filesystem-library.test.mjs` passed: 3 tests.
- HTTP upload search smoke passed: temp upload server uploaded two WAVs and `/uploads/search?q=jazz&limit=5` returned the matching track.
- `node --test server/storage/filesystem-library.test.mjs` passed: 4 tests after shared metadata coverage.
- HTTP upload metadata smoke passed: temp upload server uploaded a WAV, patched metadata, and found the updated track by tag search.
- `node --test server/storage/filesystem-library.test.mjs` passed: 5 tests after embedded upload metadata extraction coverage.
- HTTP upload metadata extraction smoke passed: temp upload server uploaded a tagged WAV and returned/search-matched extracted metadata.
- `node --test server/selfhosted/radios.test.mjs` passed: 2 tests. Expected 403/400 errors were logged during rejection coverage.
- Playwright radio tab smoke passed: mocked self-hosted radio API rendered Library > Radio, filtered a station by genre, and clicking it loaded a `source.kind === "radio"` track into the player with the expected stream URL. Localhost also logged expected remote auth/API CORS noise and the existing Shaka warning.
- `node --check js/selfhosted-radios.js js/ui.js js/app.js` passed.
- `npm exec -- eslint js/selfhosted-radios.js` passed.
- `node --test server/selfhosted/accounts.test.mjs` passed after adding radio endpoints.
- Direct upload server smoke passed after structured storage extraction: health, upload, list, HEAD stream, and range stream.
- `npm.cmd run build` passed with existing chunk/dynamic-import warnings.
- `npm.cmd exec -- eslint server/storage/filesystem-library.mjs server/uploads/server.mjs` is blocked by the existing ESLint TypeScript project config excluding `server/**/*.mjs`.
- `node --check js/auth-gate.js js/accounts/auth.js js/app.js vite-plugin-auth-gate.js` passed.
- `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/auth-gate.test.js` passed: 3 tests.
- `npm.cmd exec -- eslint js/auth-gate.js js/accounts/auth.js vite-plugin-auth-gate.js` passed.
- Browser smoke with `MONOCHROME_AUTH_REQUIRED=true` passed: `/search/test` redirected to `/account`, localhost `Use Test Session` signed in, and `/search/test` rendered afterward.
- `npm.cmd run build` passed with existing chunk/dynamic-import warnings.
- `node --check server/selfhosted/accounts.mjs server/selfhosted/accounts.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` passed.
- `node --test server/selfhosted/accounts.test.mjs` passed: 2 tests.
- `npm.cmd run build` passed with existing chunk/dynamic-import warnings.
- Direct server smoke passed: health, upload, list, and HEAD stream.
- Playwright UI smoke passed: Library > Local Files shows Server uploads signed-out state, upload/list works with a test user, and clicking an uploaded WAV loads an audio `/stream` URL with `source.kind === "server-local"`.
- Broader ESLint on `js/app.js/js/ui.js/js/events.js` still fails on pre-existing `app.js` errors and warnings unrelated to this milestone.

## Next Recommended Milestone

If the user asks to continue the self-hosted roadmap, read `docs/SELF_HOSTED_CHECKPOINTS.md` and complete Checkpoint 15 - Associate YouTube Clips With Songs.

For extra runtime confidence before YouTube association work, manually smoke uploaded music and radio surfaces:

- Start `bun run dev` or `npm run dev`.
- In another shell start `bun run dev:uploads` or `npm run dev:uploads`.
- Sign in, open Library > Uploaded Music, upload a tagged real audio file, verify extracted metadata/artwork when available, edit its metadata from the row menu, search for edited title/tag, play it, like/unlike it, add/remove it from a playlist, reload, and verify it still lists, searches, and plays.
- Recheck normal API playback after the upload smoke.
- Use an approved self-hosted user to add a station from Library > Radio, verify filtering, play it, switch to another station if available, then switch back to normal API playback.
- As admin, disable the station through `/api/admin/radios/:id` and verify it no longer appears in Library > Radio after refresh.

## Resume Instruction

When resuming, first read `HANDOFF.md` and `AGENTS.md`.

Then inspect only the code directly relevant to the requested task. Use the larger docs only when this file does not answer a needed question.
