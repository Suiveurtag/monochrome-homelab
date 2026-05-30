# Refactor Milestones

This file defines the behavior-preserving refactor path. Keep milestones small enough that a future Codex session can complete or hand off one milestone cleanly.

## Refactor Goal

Improve maintainability and session-to-session continuity without changing app behavior. The project currently has several very large modules with mixed responsibilities; the refactor should create clearer boundaries while preserving routes, DOM contracts, storage, playback, downloads, auth/sync, PWA, and mobile behavior.

## Milestone Template

Each milestone should define:

- Goal.
- Scope.
- Non-goals.
- Files or subsystems likely touched.
- Behavior contracts preserved.
- Required tests/checks.
- Completion checklist.
- Handoff notes in `PROGRESS.md`.

## Milestone Backlog

### M0 - Documentation Baseline

Status: Complete

Goal:

- Add internal documentation for Codex continuity.

Scope:

- Create `AGENTS.md`, `PROGRESS.md`, `docs/ARCHITECTURE.md`, `docs/MILESTONES.md`, and `docs/DECISIONS.md`.

Non-goals:

- No app code changes.
- No formatting churn.

Required checks:

- Review docs for consistency.
- Confirm `git diff` only includes documentation files.

Completion checklist:

- Docs exist and link together conceptually.
- `PROGRESS.md` has the next exact step.
- M0 entry is marked complete.

### M1 - Safety Net Inventory

Status: Active

Goal:

- Identify the behavior contracts that need tests before major extractions.

Scope:

- Inventory current test coverage and gaps for routing, storage, auth sync, player, downloads, settings, search, sidebar, deploy/functions, and key UI behavior.
- Add a short test strategy section to `PROGRESS.md` or this file.

Non-goals:

- No broad refactor yet.
- No behavior changes.

Required checks:

- Run existing tests if environment allows.
- Record failing or skipped checks with reasons.

### M2 - Bootstrap And Routing Boundary

Status: Planned

Goal:

- Make app startup and routing easier to reason about without changing route behavior.

Scope:

- Focus on `js/app.js` and `js/router.js`.
- Preserve startup order, route paths, provider-prefixed route handling, and navigation behavior.

Non-goals:

- No UI page rendering rewrite.
- No route redesign.

Required checks:

- Route-focused tests or manual route smoke checklist.
- Existing tests, lint, and build as feasible.

### M3 - Storage Contracts

Status: Planned

Goal:

- Lock down local and cloud persistence contracts before broader extractions.

Scope:

- Focus on `js/db.js`, `js/storage.js`, `js/accounts/pocketbase.js`, and import/export or sync call sites.
- Preserve IndexedDB database name/version/stores/key paths, localStorage keys/defaults/formats, PocketBase collection names, legacy `firebase_id` mapping, minified item shapes, and sync events.

Non-goals:

- No storage migrations.
- No cloud schema redesign.

Required checks:

- IndexedDB contract tests.
- Storage manager tests for high-risk keys.
- Manual sync import/export smoke checklist.

### M4 - Auth And PocketBase Boundary

Status: Planned

Goal:

- Clarify account/auth/sync responsibilities while preserving current Better Auth and PocketBase behavior.

Scope:

- Focus on `js/accounts/auth.js`, `js/accounts/config.js`, `js/accounts/pocketbase.js`, account/profile UI call sites, and related docs/config.
- Treat Appwrite as legacy/residual unless a separate migration decision changes that status.
- Preserve sign-in/sign-out UI, session checks, `$id` normalization, PocketBase sync merge, profile editing, public playlists, and cloud clear behavior.

Non-goals:

- No account provider redesign.
- No PocketBase schema migration.
- No Appwrite removal unless separately scoped.

Required checks:

- Auth/session tests where practical.
- Manual smoke checklist for sign-in UI, profile load/edit, cloud sync, public playlists, and sign-out.

### M5 - Search And API Boundary

Status: Planned

Goal:

- Make search and music API flows easier to reason about without changing provider behavior.

Scope:

- Focus on `js/music-api.js`, `js/api.js`, `js/HiFi.ts`, provider-prefixed IDs, TIDAL/HiFi fallback, Qobuz-by-ISRC stream resolution, and search normalization.
- Preserve current TIDAL metadata behavior, Qobuz stream lookup behavior, configured instance failover, dev mode, caching, and error/fallback semantics.

Non-goals:

- No new provider strategy.
- No quality policy changes.

Required checks:

- API/search tests where practical.
- Manual smoke checklist for search, album, artist, playlist, track pages, and stream URL resolution.

### M5a - Core Musique Hybride

Status: Complete

Goal:

- Add a stable, source-aware track identity layer for external API tracks, browser-local tracks, podcasts, tracker tracks, future server uploads, favorites, playlists, sync, and future metadata overrides.

Scope:

- Add `trackKey` and `source` as an additive persistence identity while preserving `track.id` for routes and playback.
- Add IndexedDB v12 stores for track snapshots, metadata overrides, and source-aware favorite refs.
- Preserve legacy favorites/playlists/history stores and fallback behavior.

Non-goals:

- No server upload implementation.
- No metadata override editing UI.
- No route redesign or player provider strategy change.

Required checks:

- Focused tests for `track-model` and `db` when dependencies are installed.
- Existing test/lint/build checks as feasible.

### Local Uploads Serveur Prototype

Status: Complete

Goal:

- Add a minimal non-production server upload path that stores audio files locally and exposes them as hybrid tracks.

Scope:

- Separate Node dev upload server with filesystem storage under `.storage/server-uploads`.
- `server-local` track source compatible with `trackKey`/`source`.
- Minimal Library > Local Files upload/list UI.
- Direct-audio player compatibility plus existing favorites/playlists object-track paths.

Non-goals:

- No production Cloudflare/R2/PocketBase file storage.
- No rich metadata/artwork extraction.
- No uploaded audio sync or public sharing.
- No download/transcode integration for uploaded files.

Required checks:

- Focused `track-model` and DB tests.
- Local upload server smoke for health/upload/list/stream.
- Build.
- Manual or Playwright smoke for Library upload/list/playback.

### Self-Hosted Checkpoint 1 - Map Current Contracts

Status: Complete

Goal:

- Create a concise contract map for the self-hosted roadmap before larger backend and source-model changes.

Scope:

- Document current track sources, auth/account boundaries, storage boundaries, local uploads, favorites/playlists, social state, and known limits.

Non-goals:

- No runtime changes.
- No new server implementation.

Required checks:

- Documentation-only review.

### Self-Hosted Checkpoint 2 - Stabilize The Music Source Model

Status: Complete

Goal:

- Define source types clearly for current and planned self-hosted music surfaces while preserving `track.id` compatibility.

Scope:

- Add additive `server-library`, `radio`, and `youtube-video` source kinds.
- Export source-kind and normalization helpers for future server clients.
- Add focused tests for the expanded source model.

Non-goals:

- No playlist, favorite, route, or player migration.
- No new UI or backend persistence behavior.

Required checks:

- Focused `track-model` tests.
- Targeted ESLint for `js/track-model.ts`.

### Self-Hosted Checkpoint 3 - Prepare A Server Library Client Layer

Status: Complete

Goal:

- Isolate frontend calls for the future self-hosted server library behind a stable client layer.

Scope:

- Add `js/server-library.js` with list, search, upload, metadata update placeholder, stream URL, and artwork URL helpers.
- Route current Library upload/list UI through the server library client while preserving local upload prototype behavior.

Non-goals:

- No production database or storage implementation.
- No server-side search endpoint.
- No metadata editing UI.

Required checks:

- Syntax checks for touched frontend modules.
- Targeted ESLint for `js/server-library.js` and `js/server-uploads.js`.
- Production build.

### Self-Hosted Checkpoint 4 - Define The Minimal Self-Hosted Backend

Status: Complete

Goal:

- Create the minimal homelab backend skeleton without replacing Cloudflare Pages or the local upload prototype.

Scope:

- Add a self-hosted Node server entrypoint with config loading, filesystem data paths, `/health`, and auth placeholder responses.
- Add `.env.example` entries and `dev:selfhost`.

Non-goals:

- No final upload storage.
- No account approval implementation.
- No social/admin/library backend endpoints beyond placeholders.

Required checks:

- Syntax checks for server modules.
- Manual smoke of `/health`.
- Production build.

### Self-Hosted Checkpoint 5 - Make Filesystem Storage Production-Ready

Status: Complete

Goal:

- Move the local upload prototype from per-user manifest storage toward a structured filesystem layout for production self-hosted audio storage.

Scope:

- Add a server storage module that owns safe local paths, sharded audio blobs, JSON track metadata, user indexes, stream token indexes, reserved artwork/tmp directories, and legacy manifest read fallback.
- Keep upload/list/stream response contracts compatible for existing frontend code.

Non-goals:

- No rich metadata extraction.
- No deletion/migration tooling.
- No unified production backend route replacement.

Required checks:

- Syntax checks for server modules.
- Node storage tests.
- Manual upload/list/stream smoke.
- Production build.

### Self-Hosted Checkpoint 6 - Make Authentication Mandatory

Status: Complete

Goal:

- Require authentication for configured self-hosted browser sessions while preserving public/default app behavior and explicit localhost development fallback.

Scope:

- Add a small client auth-gate helper with tests.
- Inject `MONOCHROME_AUTH_REQUIRED` into the app as `window.__MONOCHROME_AUTH_REQUIRED__` when explicitly configured.
- Wait for the auth manager before initial routing and redirect signed-out app routes to `/account` when auth is required.

Non-goals:

- No admin approval workflow.
- No server-side session enforcement beyond existing placeholders.
- No redesign of account UI or auth providers.

Required checks:

- Focused auth-gate tests.
- Targeted syntax/lint checks.
- Production build.
- Manual/browser smoke for signed-out redirect and localhost test session.

### Self-Hosted Checkpoint 7 - Add Admin Approval For Accounts

Status: Complete

Goal:

- Add self-hosted account approval states and backend enforcement so new accounts require approval before use.

Scope:

- Add a JSON account store with `pending`, `approved`, `rejected`, and `disabled` states.
- Bootstrap the first account, or configured bootstrap admin user id, as an approved admin.
- Add self-hosted account/admin endpoints for current-account checks, account listing, and approval state updates.

Non-goals:

- No full admin dashboard.
- No profile/social migration.
- No replacement of Better Auth or PocketBase browser/session boundaries.

Required checks:

- Server account tests.
- Syntax checks for touched server modules.
- Production build.

### Self-Hosted Checkpoint 8 - Add Admin Account Management

Status: Complete

Goal:

- Add an in-app self-hosted admin account management surface for approved admins.

Scope:

- Add a frontend admin account client for `/api/accounts/me`, `/api/admin/accounts`, and account status/role updates.
- Add an Account page panel that lists accounts for approved admins and supports approving, rejecting, disabling, and role changes.
- Keep non-admin users out of admin account calls in the UI while relying on server authorization as the enforcement boundary.

Non-goals:

- No social moderation tools.
- No replacement of Better Auth or PocketBase browser/session boundaries.
- No profile/social migration.

Required checks:

- Server account tests.
- Targeted syntax/lint checks.
- Production build.

### Self-Hosted Checkpoint 9 - Add A Dedicated Uploaded Music Tab

Status: Complete

Goal:

- Give server-uploaded music its own Library tab instead of nesting it under browser Local Files.

Scope:

- Add a Library > Uploaded Music tab with upload, refresh, count, search/filtering, and a track list.
- Reuse existing track-list rendering so uploaded tracks keep play, inline like, and track menu/playlist behavior.
- Preserve the browser Local Files tab and folder-selection behavior.

Non-goals:

- No advanced shared metadata editing.
- No server-side uploaded-music search index yet.
- No production storage migration.

Required checks:

- Syntax checks for touched frontend modules.
- Targeted lint where feasible.
- Production build.
- Browser smoke for upload/list/search and track actions.

### Self-Hosted Checkpoint 10 - Add Server-Side Search For Uploads

Status: Complete

Goal:

- Search uploaded server music on the upload server instead of filtering only after loading the full browser list.

Scope:

- Add filesystem-backed search over uploaded track title, artist, album, original filename, and tags.
- Add a bounded `/uploads/search` endpoint to the local upload prototype server.
- Route the Uploaded Music search field through the server library client search API.

Non-goals:

- No global search across external catalog, browser-local files, and uploaded tracks.
- No full-text index or production database search yet.
- No metadata editing UI.

Required checks:

- Syntax checks for touched server/frontend modules.
- Storage search tests.
- HTTP upload search smoke.
- Targeted frontend helper lint.

### Self-Hosted Checkpoint 11 - Add Shared Custom Metadata

Status: Complete

Goal:

- Let uploaded tracks use editable server-stored metadata instead of only filename-derived defaults.

Scope:

- Add structured storage metadata updates for title, artist, album, year, artwork URL, and tags.
- Add a bounded upload-server metadata update endpoint.
- Add frontend update helpers and an Uploaded Music context-menu metadata editor.
- Document server metadata precedence and edit permissions for the current prototype.

Non-goals:

- No metadata edit history or moderation queue.
- No broad cross-user library sharing model.
- No automatic embedded tag extraction.

Required checks:

- Syntax checks for touched server/frontend modules.
- Storage metadata tests.
- HTTP metadata update smoke.
- Targeted frontend lint.
- Production build.

### Self-Hosted Checkpoint 12 - Extract Basic Audio Metadata On Upload

Status: Complete

Goal:

- Use embedded audio tags as better default metadata for newly uploaded server-local tracks.

Scope:

- Add server-side TagLib metadata extraction during upload.
- Use embedded title, artist, album, year, duration, and genre tags when available.
- Store extracted artwork under the structured artwork directory and serve it through a tokenized artwork endpoint when available.
- Preserve manual shared server metadata as the later precedence layer.

Non-goals:

- No audio fingerprinting.
- No automatic external catalog matching.
- No overwrite of existing manually edited uploaded-track metadata.

Required checks:

- Syntax checks for touched server modules.
- Storage tests with a small generated tagged audio fixture.
- HTTP upload extraction smoke.
- Production build.

### Self-Hosted Checkpoint 13 - Add A Radio Backend Model

Status: Complete

Goal:

- Add a server-side model and API for playable radio entries before building the radio UI.

Scope:

- Add a JSON-backed radio store under the self-hosted data directory.
- Support radio fields for name, stream URL, genre, country, artwork URL, enabled status, creator, and timestamps.
- Add approved-user create/list endpoints and admin list/update endpoints.
- Validate stream and artwork URLs before persistence.

Non-goals:

- No dedicated radio UI.
- No ICY/live metadata.
- No radio recording.

Required checks:

- Syntax checks for touched self-hosted server modules.
- Radio API tests.
- Existing account tests.
- Production build.

### Self-Hosted Checkpoint 14 - Add A Dedicated Radio Tab

Status: Complete

Goal:

- Add a dedicated playable Library radio surface backed by the self-hosted radio API.

Scope:

- Add Library > Radio as its own tab.
- Add `js/selfhosted-radios.js` as the browser radio client and normalizer.
- List approved enabled radios, filter them locally, create new radio entries, and refresh the list.
- Represent radio entries as hybrid tracks with `source.kind === "radio"` and direct stream playback URLs.
- Reuse existing track-list click handling and player direct-audio behavior for playback.

Non-goals:

- No radio recording.
- No ICY/live station metadata.
- No admin radio management UI beyond the existing backend endpoints.

Required checks:

- Syntax checks for touched frontend modules.
- Targeted lint for the new radio client.
- Radio API tests.
- Playwright smoke for open tab, filter, and load a radio track into the player.
- Production build.

### Self-Hosted Checkpoint 15 - Associate YouTube Clips With Songs

Status: Complete

Goal:

- Allow a YouTube video URL or ID to be associated with a song and surfaced without changing audio playback.

Scope:

- Store shared YouTube clip metadata for `server-local` uploaded tracks through the existing uploaded metadata update path.
- Store local browser YouTube clip associations for external tracks by source-aware `trackKey`.
- Add a track context-menu action for editing the YouTube clip association.
- Display associated clips in Track info and on the Track page through a YouTube embed and external link.

Non-goals:

- No YouTube download or proxying.
- No replacement of the existing audio/video player path.
- No shared backend persistence for external API track clip associations yet.

Required checks:

- Syntax checks for touched frontend/server modules.
- Uploaded storage metadata test coverage.
- Targeted frontend lint.
- Production build.

### Self-Hosted Checkpoint 16 - Add Public User Profiles

Status: Complete

Goal:

- Add a self-hosted public profile boundary for approved users while preserving the existing PocketBase profile UI.

Scope:

- Add JSON-backed self-hosted profile storage under the self-hosted data directory.
- Add approved-user profile endpoints for current profile get/update and public profile lookup.
- Add `js/selfhosted-profiles.js` as the browser client for self-hosted profiles.
- Let the existing profile page fall back to self-hosted profiles when PocketBase profile data is unavailable.

Non-goals:

- No chat, invitations, or notifications.
- No PocketBase profile removal.
- No rich social graph or profile moderation.

Required checks:

- Syntax checks for touched frontend/server modules.
- Self-hosted profile endpoint tests.
- Existing account/radio endpoint tests.
- Targeted frontend lint.
- Production build.

### Self-Hosted Checkpoint 17 - Add Song And Playlist Sharing

Status: Complete

Goal:

- Let approved self-hosted users create stable internal links for songs and playlists.

Scope:

- Add JSON-backed self-hosted share storage under the self-hosted data directory.
- Add approved-user share create/read endpoints.
- Add `js/selfhosted-shares.js` as the browser client for internal share creation and lookup.
- Add a `Share internally` context-menu action for tracks and playlists.
- Add `/share/:id` routing and a shared music page that can open canonical links or play shared snapshots.

Non-goals:

- No real-time chat.
- No public unauthenticated sharing.
- No guarantee that server-local uploaded audio is portable outside the originating self-hosted server.

Required checks:

- Syntax checks for touched frontend/server modules.
- Self-hosted share endpoint tests.
- Existing account/profile/radio endpoint tests.
- Targeted frontend lint.
- Production build.

### Self-Hosted Checkpoint 18 - Add Social Invitations

Status: Complete

Goal:

- Let approved self-hosted users send, view, accept, and reject contact invitations.

Scope:

- Add JSON-backed self-hosted invitation storage under the self-hosted data directory.
- Add approved-user invitation list/create/respond endpoints.
- Add `js/selfhosted-invitations.js` as the browser client and Account page panel renderer.
- Add a profile `Connect` action for sending an invitation to another self-hosted profile.

Non-goals:

- No groups.
- No chat rooms.
- No notifications beyond the Account page invitation panel.

Required checks:

- Syntax checks for touched frontend/server modules.
- Self-hosted invitation endpoint tests.
- Existing account/profile/radio/share endpoint tests.
- Targeted frontend lint.
- Production build.

### Self-Hosted Checkpoint 19 - Add Minimal Chat

Status: Complete

Goal:

- Let accepted self-hosted contacts exchange persistent 1:1 text messages.

Scope:

- Add JSON-backed self-hosted message storage under the self-hosted data directory.
- Add approved-user message list/send endpoints.
- Require an accepted invitation/contact relationship before listing or sending messages.
- Add `js/selfhosted-chat.js` as the browser client and Account page chat panel renderer.

Non-goals:

- No attachments.
- No end-to-end encryption.
- No group chat.
- No realtime push or automatic polling loop.

Required checks:

- Syntax checks for touched frontend/server modules.
- Self-hosted message and invitation endpoint tests.
- Existing account/profile/radio/share endpoint tests.
- Targeted frontend lint.
- Production build.

### Self-Hosted Checkpoint 20 - Add Self-Hosted Listening Parties

Status: Complete

Goal:

- Let approved self-hosted users host simple listening parties that accepted contacts can join.

Scope:

- Add JSON-backed self-hosted party storage for rooms, members, messages, requests, and host playback state.
- Add approved-user party endpoints under `/api/parties`.
- Require an accepted invitation/contact relationship before non-host users can read or join a party.
- Keep host playback controls authoritative and use conservative polling for guest sync.
- Switch the existing listening-party UI to the self-hosted backend only when mandatory self-hosted auth is enabled.

Non-goals:

- No voice chat.
- No advanced moderation.
- No sub-second perfect sync.
- No websocket/realtime infrastructure.
- No replacement of default PocketBase-backed listening parties for public deployments.

Required checks:

- Syntax checks for touched frontend/server modules.
- Self-hosted party endpoint tests.
- Existing self-hosted account/profile/radio/share/invitation/message endpoint tests.
- Targeted frontend lint.
- Production build.

### Self-Hosted Checkpoint 21 - Clarify Migration From Existing Services

Status: Complete

Goal:

- Make the Better Auth, PocketBase, Appwrite legacy, and self-hosted backend boundaries explicit before install/update work.

Scope:

- Document the service ownership model.
- Keep Better Auth as the browser session authority.
- Keep PocketBase as the default/public sync/profile/public playlist/listening-party boundary.
- Treat Appwrite as legacy/residual configuration only.
- Gate self-hosted-only frontend fallbacks behind the mandatory self-hosted auth boundary.

Non-goals:

- No removal of Appwrite, PocketBase, or Better Auth.
- No migration of cloud sync/profile data.
- No production install scripts yet.

Required checks:

- Syntax checks for touched frontend modules.
- Focused auth-gate tests.
- Targeted frontend lint.
- Production build.

### M6 - Player And Media Boundary

Status: Planned

Goal:

- Clarify playback responsibilities without changing media behavior.

Scope:

- Focus on `js/player.js`, `js/audio-context.js`, `js/events.js`, and playback-related UI hooks.
- Preserve queue, shuffle/repeat, quality, Media Session, Safari/iOS, audio/video, radio/autoplay, and persistence behavior.

Non-goals:

- No playback feature changes.
- No quality policy changes.

Required checks:

- Player unit tests.
- Manual playback smoke checklist for browser and, when possible, mobile shell behavior.

### M7 - UI, Sidebar, And Page Rendering Boundary

Status: Planned

Goal:

- Extract page, sidebar, or component rendering responsibilities from `js/ui.js` incrementally.

Scope:

- Start with one low-risk page, sidebar behavior, or repeated rendering helper.
- Preserve generated markup semantics, CSS classes, DOM IDs, click behavior, route results, sidebar collapse/order/visibility, pinned items, queue/lyrics side panel behavior, and search history behavior.

Non-goals:

- No visual redesign.
- No class or selector renames unless compatibility wrappers remain.

Required checks:

- Snapshot-like DOM assertions where useful.
- Manual smoke of affected pages and sidebar/panel behavior.

### M8 - Deploy, Functions, Downloads, And Persistence Boundary

Status: Planned

Goal:

- Improve boundaries around deployment scripts, Cloudflare Functions, downloads, and remaining persistence paths after safer frontend seams exist.

Scope:

- Focus on `functions/`, `vite.config.ts`, custom Vite plugins, Docker/Nginx files, `js/downloads.js`, metadata modules, and download-related persistence/settings.
- Preserve bot metadata pages, SPA fallback behavior, PWA behavior, Docker static serving, downloaded outputs, progress events, archive generation, metadata embedding, lyrics inclusion, API failover, and persisted formats.

Non-goals:

- No deployment platform redesign.
- No IndexedDB/localStorage migration unless explicitly planned.

Required checks:

- Existing function/API/download/storage tests where available.
- Manual download smoke where feasible.
- Manual route preview smoke for bot-facing Function routes where feasible.

## Acceptance Criteria

A milestone is complete only when:

- Behavior is intentionally unchanged.
- `PROGRESS.md` records files touched, verification, risks, and next exact step.
- Relevant architecture or decision docs are updated.
- Tests/checks are run or explicitly skipped with reasons.
- The next milestone scope is still accurate.

## Deferred Work

These should not be smuggled into behavior-preserving refactor milestones:

- Visual redesign.
- Route redesign.
- Storage key/schema migrations.
- New API provider strategy.
- Account system redesign.
- Playback quality policy changes.
- Broad formatting-only rewrites.
