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

Self-Hosted Checkpoint 22 - Add Ubuntu 26.04 Install Commands is complete.

It added `scripts/install-ubuntu.sh`, `docs/SELF_HOSTING.md`, systemd/Nginx deployment conventions, and `MONOCHROME_UPLOAD_SERVER_URL` build injection for reverse-proxied upload calls. Checkpoint 21 added `shouldUseSelfHostedServices()` as the frontend boundary for self-hosted-only service fallbacks. Checkpoint 20 added self-hosted listening parties. Checkpoint 19 added minimal 1:1 chat. Checkpoint 18 added contact invitations. Checkpoint 17 added internal song/playlist sharing. Checkpoints 16 through 5 and the previous minimal backend skeleton, server library client, source-model, contract-map, and Local Uploads Serveur checkpoints remain complete.

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
- Server-local uploaded-track metadata can now include a shared YouTube clip association: `youtubeVideoId`, `youtubeClipUrl`, and `youtubeClip`.
- External catalog tracks can store local browser YouTube clip associations through `js/youtube-clips.js`, keyed by source-aware `trackKey`.
- Associated YouTube clips appear in Track info and on the Track page as embeds plus external YouTube links; they do not replace audio playback.
- Self-hosted approved users now have JSON-backed public profiles with username, display name, avatar URL, banner URL, bio/about, website, simple stats, public playlist JSON, privacy flags, and timestamps.
- Existing profile routes/UI keep PocketBase as the primary profile source and fall back to self-hosted profiles only when mandatory self-hosted auth is enabled.
- Approved users can now create stable internal `/share/:id` links for tracks and playlists.
- Shared music links store canonical app hrefs when portable plus minified track/playlist snapshots for display and playback fallback.
- Approved self-hosted users can now send, list, accept, and reject contact invitations; pending and accepted invitations block duplicate requests.
- Profile pages expose a `Connect` action for other self-hosted users, and Account shows incoming/outgoing invitation state with accept/reject controls.
- Accepted contacts can exchange persistent 1:1 text messages through Account > Messages; message list/send endpoints are approved-user only and require an accepted invitation relationship.
- Approved self-hosted users can host listening parties from the existing Parties page. Accepted contacts can join by `/party/:id`, receive host playback updates through polling, chat in the party, and request songs. PocketBase remains the default party backend unless `MONOCHROME_AUTH_REQUIRED=true`.
- `js/auth-gate.js` exposes `shouldUseSelfHostedServices()` as the migration boundary for self-hosted-only frontend services; public/default deployments should not opportunistically call the self-hosted backend.
- `scripts/install-ubuntu.sh` now provides the first Ubuntu 26.04 install path: apt dependencies, `/opt/monochrome`, `/etc/monochrome/monochrome.env`, `/var/lib/monochrome`, frontend build, `monochrome-selfhost.service`, `monochrome-uploads.service`, and Nginx static/proxy setup.
- `docs/SELF_HOSTING.md` documents the install command, paths, service operations, config edits, and reverse proxy/TLS expectations.
- `vite-plugin-auth-gate.js` injects `MONOCHROME_UPLOAD_SERVER_URL` when configured, so installed browser clients can call uploads through the public reverse-proxy origin instead of `localhost:8789`.
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
- `js/youtube-clips.js`: YouTube clip URL/ID normalization plus local external-track clip association lookup/storage.
- `js/selfhosted-profiles.js`: app-facing self-hosted profile client for current-profile get/update and public profile lookup.
- `js/selfhosted-shares.js`: app-facing self-hosted internal sharing client for share creation and lookup.
- `js/selfhosted-invitations.js`: app-facing self-hosted invitation client and Account page invitations panel renderer.
- `js/selfhosted-chat.js`: app-facing self-hosted message client and Account page chat panel renderer.
- `js/profile.js`: existing profile page/editor; now falls back to self-hosted profiles when PocketBase has no profile data.
- `server/uploads/server.mjs`: non-production local filesystem upload server, including `/uploads/search`, `/uploads/:id/metadata`, and `/uploads/:id/artwork`.
- `server/storage/audio-metadata.mjs`: server-side TagLib extraction for uploaded audio defaults and embedded artwork.
- `server/storage/filesystem-library.mjs`: safe structured local filesystem storage for server-local upload blobs, metadata, user indexes, stream-token indexes, bounded per-user search, and shared metadata updates.
- `server/selfhosted/server.mjs`: minimal self-hosted backend skeleton.
- `server/selfhosted/config.mjs`: self-hosted env/config and data directory setup.
- `server/selfhosted/accounts.mjs`: self-hosted account approval store and state helpers.
- `server/selfhosted/profiles.mjs`: self-hosted JSON public profile store for approved users.
- `server/selfhosted/shares.mjs`: self-hosted JSON internal share store for approved users.
- `server/selfhosted/invitations.mjs`: self-hosted JSON contact invitation store for approved users.
- `server/selfhosted/messages.mjs`: self-hosted JSON 1:1 message store gated by accepted contacts.
- `server/selfhosted/parties.mjs`: self-hosted JSON listening-party store for rooms, members, chat messages, requests, and host playback state.
- `server/selfhosted/radios.mjs`: self-hosted JSON radio store and validation helpers.
- `scripts/install-ubuntu.sh`: Ubuntu 26.04 installer for the first homelab deployment path.
- `docs/SELF_HOSTING.md`: self-hosted install, service, config, and reverse proxy guide.
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
- External API track YouTube clip associations are local to the current browser and are not synced/shared yet.
- YouTube embeds depend on YouTube availability, embed permissions, and browser/network policy; Monochrome only stores and displays the association.
- Self-hosted profile fallback preserves PocketBase precedence when both stores have a profile for the same username.
- Self-hosted avatar/banner fields are URL-only; no self-hosted image upload or proxy exists yet.
- Internal shares require approved self-hosted accounts to create/read; signed-out public sharing is not implemented.
- Server-local uploaded-track shares depend on the originating server/tokenized stream URL remaining valid.
- Playlist shares are snapshots and do not live-update when the original playlist changes.
- Invitation rows currently display durable user ids rather than rich profile display names; richer contact display can be added with a profile lookup layer.
- Invitations are polled/rendered on Account page load/refresh only; realtime notifications are intentionally out of scope.
- Rejected invitations can be recreated later, while pending and accepted relationships block duplicates.
- Chat rows currently display durable user ids rather than profile display names.
- Chat has manual refresh/contact selection only; realtime push, notifications, typing indicators, unread counts, and pagination UI are out of scope.
- Message records are plaintext JSON in the self-hosted data directory; end-to-end encryption is not implemented.
- Self-hosted listening parties use polling rather than realtime subscriptions, so sync is intentionally coarse compared with the PocketBase path.
- Self-hosted party joins are limited to accepted contacts of the host; shareable public party links are not implemented.
- Self-hosted party messages and requests are plaintext JSON in the self-hosted data directory.
- The Ubuntu installer has syntax/lint/build validation but has not been smoke-tested in a real Ubuntu 26.04 VM/container in this session.
- The installer writes an Nginx default port-80 site and only documents TLS/reverse-proxy hardening.
- Update, backup, restore, and migration commands are still future checkpoints.

## Validation Commands

Preferred:

- `bun run test:headless -- js/tests/track-model.test.ts js/tests/db.test.js` or npm equivalent when Bun is unavailable.
- `bun x eslint js/track-model.ts js/server-uploads.js` or npm equivalent when Bun is unavailable.
- `bun run build` or `npm run build` when Bun is unavailable.
- `bun run test:headless`
- `bun run lint`

Last known results:

- `bash -n scripts/install-ubuntu.sh` passed.
- ShellCheck is not installed in this environment, so installer ShellCheck was skipped.
- `node --check vite-plugin-auth-gate.js` passed.
- `npm exec -- eslint vite-plugin-auth-gate.js` passed.
- `git diff --check` passed.
- `npm run build` passed with existing chunk/dynamic-import and large chunk warnings.
- `node --check js/auth-gate.js js/profile.js` passed.
- `npm exec -- vitest run --config=vite.config.ts js/tests/auth-gate.test.js` passed: 4 tests.
- `npm exec -- eslint js/auth-gate.js js/profile.js` passed.
- `git diff --check` passed.
- `npm run build` passed with existing chunk/dynamic-import and large chunk warnings.
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
- `node --check js/youtube-clips.js js/events.js js/ui.js server/storage/filesystem-library.mjs server/uploads/server.mjs` passed.
- `node --test server/storage/filesystem-library.test.mjs` passed: 5 tests, including shared YouTube clip metadata persistence.
- `npm exec -- eslint js/youtube-clips.js js/events.js js/ui.js` passed with 0 errors and 5 pre-existing `js/ui.js` warnings.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check server/selfhosted/profiles.mjs server/selfhosted/profiles.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-profiles.js js/profile.js` passed.
- `node --test server/selfhosted/profiles.test.mjs` passed: 2 tests. Expected 403/409 errors were logged during rejection coverage.
- `node --test server/selfhosted/accounts.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/profiles.test.mjs` passed: 7 tests.
- `npm exec -- eslint js/selfhosted-profiles.js js/profile.js` passed.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check server/selfhosted/shares.mjs server/selfhosted/shares.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-shares.js js/events.js js/ui.js js/router.js` passed.
- `node --test server/selfhosted/shares.test.mjs` passed: 2 tests. Expected 403 errors were logged during rejection coverage.
- `node --test server/selfhosted/accounts.test.mjs server/selfhosted/profiles.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/shares.test.mjs` passed: 9 tests.
- `npm exec -- eslint js/selfhosted-shares.js js/events.js js/ui.js js/router.js` passed with 0 errors and 5 pre-existing `js/ui.js` warnings.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check server/selfhosted/invitations.mjs server/selfhosted/invitations.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-invitations.js js/profile.js js/app.js` passed.
- `node --test server/selfhosted/invitations.test.mjs` passed: 2 tests. Expected 409/403 errors were logged during rejection coverage.
- `node --test server/selfhosted/accounts.test.mjs server/selfhosted/profiles.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/shares.test.mjs server/selfhosted/invitations.test.mjs` passed: 11 tests.
- `npm exec -- eslint js/selfhosted-invitations.js js/profile.js` passed.
- `npm exec -- eslint js/selfhosted-invitations.js js/profile.js js/app.js` failed on pre-existing `js/app.js` lint errors unrelated to Checkpoint 18 (`no-empty`, `no-floating-promises`) plus existing warnings.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check server/selfhosted/messages.mjs server/selfhosted/messages.test.mjs server/selfhosted/invitations.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-chat.js js/selfhosted-invitations.js js/profile.js js/app.js` passed.
- `node --test server/selfhosted/messages.test.mjs server/selfhosted/invitations.test.mjs` passed: 4 tests. Expected 409/403 errors were logged during rejection coverage.
- `node --test server/selfhosted/accounts.test.mjs server/selfhosted/profiles.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/shares.test.mjs server/selfhosted/invitations.test.mjs server/selfhosted/messages.test.mjs server/selfhosted/parties.test.mjs` passed: 15 tests.
- `npm exec -- eslint js/selfhosted-chat.js js/selfhosted-invitations.js js/profile.js` passed.
- `git diff --check` passed.
- `npm run build` passed with existing chunk/dynamic-import and large chunk warnings.
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

If the user asks to continue the self-hosted roadmap, read `docs/SELF_HOSTED_CHECKPOINTS.md` and complete Checkpoint 23 - Add Simple Server Update Commands.

Before implementing Checkpoint 23, inspect `scripts/install-ubuntu.sh`, `docs/SELF_HOSTING.md`, `.env.example`, package/build scripts, and the systemd/Nginx paths established in Checkpoint 22. The update command should back up `/etc/monochrome` and `/var/lib/monochrome` before pulling/copying code, installing dependencies, rebuilding, and restarting services.
- Add a YouTube clip URL to an uploaded track from its row menu, refresh Uploaded Music, verify Track info shows the embed/link, and verify the Track page section appears if the associated track is opened there.
- Add a YouTube clip URL to an external catalog track from its row menu, reload the page, and verify the local association still appears in Track info for the same browser.
- With PocketBase unavailable or no PocketBase profile record, use an approved self-hosted user to open View My Profile, edit the profile, reload `/user/@<username>`, and verify another approved user can view it while a pending user cannot.
- Create an internal share for an external track, an uploaded track, and a playlist; open each `/share/:id` as another approved user and verify canonical open/playback behavior.
- Send, accept, reject, and duplicate-test invitations between two approved users from profile pages and the Account invitations panel.
- After accepting an invitation, exchange messages in both directions from Account > Messages and verify they persist after refresh.
- Start a self-hosted party as an approved host, open `/party/:id` as an accepted contact in another browser/session, verify join, host play/pause/track changes, chat, and a song request. Include one external catalog track and one accessible uploaded track.

## Resume Instruction

When resuming, first read `HANDOFF.md` and `AGENTS.md`.

Then inspect only the code directly relevant to the requested task. Use the larger docs only when this file does not answer a needed question.
