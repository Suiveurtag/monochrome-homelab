# Monochrome Self-Hosted Checkpoints

This file is the autonomous roadmap for evolving monochrome.tf toward a Spotify-like self-hosted homelab application.

It is written for future AI sessions. When the user says "continue la prochaine etape", use this file to choose one small checkpoint, complete it, validate it, update the handoff files, and stop.

## Global Goal

Build Monochrome into a stable self-hosted music application with:

- Spotify-like web app experience on a homelab server.
- Compatibility with the existing external music APIs.
- User-uploaded music stored on the server.
- Local filesystem storage.
- Shared customizable metadata visible to all approved users.
- Dedicated uploaded-music tab with search.
- Dedicated playable radio tab.
- YouTube music videos associated with songs.
- Mandatory authentication with admin approval.
- Admin account management.
- Social features: profiles, chat, song and playlist sharing, invitations, listening parties.
- Simple install and update commands for Ubuntu 26.04 servers.
- Maximum stability for future changes.

## How Future AI Sessions Should Use This File

1. Read `HANDOFF.md` and `AGENTS.md` first.
2. Read this file next.
3. Find the first checkpoint that is not marked complete in `PROGRESS.md`, `docs/MILESTONES.md`, or this file if status markers are later added.
4. Do only that checkpoint unless the user explicitly asks for more.
5. Inspect the actual code before editing. This file is a roadmap, not source truth.
6. Preserve existing behavior unless the checkpoint explicitly scopes a behavior change.
7. Keep the change small enough for one commit.
8. Prefer tests before risky extraction or behavior changes.
9. Run the narrowest useful validation first, then broader validation if the change touches shared behavior.
10. Update `PROGRESS.md` before stopping.
11. Update `HANDOFF.md` if the next recommended step or critical project state changes.
12. Update `docs/ARCHITECTURE.md` for actual architecture changes.
13. Update `docs/DECISIONS.md` for durable technical decisions.
14. Update `docs/MILESTONES.md` if milestone status or scope changes.

## Completion Rule

A checkpoint is complete only when:

- Its objective is implemented or documented as intentionally deferred.
- Its listed validations were run, or skipped with a clear reason.
- Known risks and follow-up work are recorded in `PROGRESS.md`.
- The next exact step is clear enough for a new session to continue without guessing.

## Stability Rules

- Do not replace `track.id`; it remains a playback, route, DOM, and API compatibility identifier.
- Use `trackKey` and `source` for source-aware persistence when an object track is available.
- Preserve legacy fallback by `id`.
- Preserve external music provider compatibility, including TIDAL/HiFi metadata lookup and Qobuz-by-ISRC stream resolution.
- Keep `server-local` as the current local upload prototype source until a checkpoint explicitly migrates it.
- Do not remove PocketBase, Better Auth, or Appwrite opportunistically.
- Avoid broad formatting-only churn.
- Keep DOM IDs, classes, data attributes, localStorage keys, IndexedDB stores, custom events, and playback behavior compatible unless a checkpoint explicitly includes a migration.

## Recommended Execution Order

Do checkpoints 1 to 5 first to stabilize the model and self-hosted storage direction. Then do checkpoints 6 to 8 for mandatory access control. Then do checkpoints 9 to 15 for the music surfaces. Then do checkpoints 16 to 20 for social features. Checkpoints 22 to 24 can begin once the backend has a stable shape. Checkpoint 25 should grow alongside feature work, then be hardened near the end. Checkpoint 26 is the final beta stabilization pass.

---

## Checkpoint 1 - Map Current Contracts

Status: Complete

Objective:

Create a concise technical map of current contracts before larger changes: track sources, auth, storage, local uploads, playlists, favorites, social state, and known limits.

Files probably concerned:

- `PROGRESS.md`
- `docs/ARCHITECTURE.md`
- `docs/MILESTONES.md`

Validations:

- Documentation-only change: no runtime validation required.
- Optional: `bun run test:headless -- js/tests/track-model.test.ts js/tests/db.test.js`

Risks:

- Documenting assumptions without checking source truth.
- Making the docs too broad to be useful.

Stop criteria:

- A future session can understand the contracts to preserve without reading the whole repo.
- Completed in `docs/ARCHITECTURE.md` under "Self-Hosted Contract Map".

Out of scope:

- Runtime changes.
- Server implementation.

## Checkpoint 2 - Stabilize The Music Source Model

Status: Complete

Objective:

Define source types clearly: external API, browser-local, prototype `server-local`, future filesystem server, radio, and YouTube video association. Consolidate helpers around `trackKey` and `source`.

Files probably concerned:

- `js/track-model.ts`
- `js/tests/track-model.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`

Validations:

- `bun run test:headless -- js/tests/track-model.test.ts`
- `bun x eslint js/track-model.ts`

Risks:

- Breaking playlist, favorite, history, route, or player compatibility if identity behavior changes.

Stop criteria:

- Future source kinds can be represented without destructive migration.
- `track.id` remains usable everywhere it is currently expected.
- Completed by adding additive `server-library`, `radio`, and `youtube-video` source kinds plus exported source normalization helpers in `js/track-model.ts`.

Out of scope:

- New UI.
- Production upload server.
- Backend persistence changes.

## Checkpoint 3 - Prepare A Server Library Client Layer

Status: Complete

Objective:

Isolate client calls for the future server library: list, search, upload, metadata update, stream URL, artwork URL.

Files probably concerned:

- `js/server-uploads.js`
- Possible new `js/server-library.js`
- `js/api.js`
- Focused tests if practical.

Validations:

- `bun x eslint js/server-uploads.js js/server-library.js`
- `node --check js/server-uploads.js js/server-library.js`

Risks:

- Mixing the current local upload prototype with the future production storage contract.

Stop criteria:

- The frontend has a stable, narrow client API even if it still talks to the prototype server.
- Completed by adding `js/server-library.js` and routing existing upload UI calls through it.

Out of scope:

- Production database or storage implementation.

## Checkpoint 4 - Define The Minimal Self-Hosted Backend

Status: Complete

Objective:

Create the minimal Ubuntu/homelab server skeleton: HTTP API, config loading, filesystem paths, health endpoint, and auth boundary placeholders. Do not replace Cloudflare Pages behavior yet.

Files probably concerned:

- New or existing `server/` modules.
- `server/uploads/server.mjs`
- `package.json`
- `.env.example`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`

Validations:

- `node --check server/**/*.mjs` or the closest PowerShell equivalent.
- `bun run build`

Risks:

- Overbuilding the backend before contracts are clear.
- Creating two conflicting server entrypoints.

Stop criteria:

- A local server starts, exposes `/health`, loads config, and does not break the frontend build.
- Completed with `server/selfhosted/server.mjs`, `server/selfhosted/config.mjs`, `.env.example`, and the `dev:selfhost` script.

Out of scope:

- Final upload storage.
- Social features.
- Admin dashboard.

## Checkpoint 5 - Make Filesystem Storage Production-Ready

Status: Complete

Objective:

Move from the prototype `.storage/server-uploads` shape toward structured local filesystem storage for audio blobs, artwork, metadata, indexes, and configurable data directories.

Files probably concerned:

- `server/uploads/server.mjs`
- New `server/storage/` modules.
- `.env.example`
- `docs/ARCHITECTURE.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`

Validations:

- Server storage tests if added.
- `node --check server/**/*.mjs`
- Manual smoke: upload, list, stream.

Risks:

- Unsafe path handling.
- Filename collisions.
- Windows/Linux path differences.
- Accidental deletion or overwrite.

Stop criteria:

- Uploaded files are stored under safe deterministic paths, listable, streamable, and ready for future metadata indexing.
- Completed by adding `server/storage/filesystem-library.mjs`, sharded audio blob paths, JSON track metadata, user indexes, stream token indexes, legacy manifest fallback, and focused storage tests.

Out of scope:

- Rich metadata extraction.
- Full migration tooling.

## Checkpoint 6 - Make Authentication Mandatory

Status: Complete

Objective:

Require authentication for the self-hosted app while keeping dev/test fallbacks explicit and localhost-only.

Files probably concerned:

- `js/accounts/*`
- `js/app.js`
- `js/ui.js`
- `index.html`
- Server auth endpoints.
- `docs/ARCHITECTURE.md`

Validations:

- Targeted auth tests if available.
- `bun run build`
- Manual smoke: signed-out, signed-in, localhost dev fallback.

Risks:

- Locking users out during development.
- Breaking public routes unintentionally.

Stop criteria:

- Signed-out users see a clear auth boundary.
- Signed-in users can use the app normally.
- Completed by adding `js/auth-gate.js`, injecting `MONOCHROME_AUTH_REQUIRED` into the browser config, waiting for auth initialization before initial routing, redirecting signed-out protected routes to `/account`, and preserving localhost-only `Use Test Session`.

Out of scope:

- Admin approval workflow.
- Full account management UI.

## Checkpoint 7 - Add Admin Approval For Accounts

Status: Complete

Objective:

Add account states such as pending, approved, rejected, and disabled. Block unapproved accounts from app features.

Files probably concerned:

- Backend auth/account modules.
- `js/accounts/*`
- Account UI.
- `docs/DECISIONS.md`
- `docs/ARCHITECTURE.md`

Validations:

- Targeted auth/account tests.
- Manual smoke: pending blocked, approved allowed, disabled blocked.

Risks:

- No bootstrap admin.
- Inconsistent server/client enforcement.

Stop criteria:

- A first admin can be bootstrapped.
- New users require approval before use.
- Completed by adding `server/selfhosted/accounts.mjs`, self-hosted `/api/accounts/me` and `/api/admin/accounts` endpoints, first-user/configured bootstrap admin behavior, pending-by-default new accounts, and account approval tests.

Out of scope:

- Full admin dashboard.

## Checkpoint 8 - Add Admin Account Management

Status: Complete

Objective:

Add an admin UI to list users, approve accounts, disable accounts, and manage roles.

Files probably concerned:

- `index.html`
- `styles.css`
- `js/ui.js`
- `js/events.js`
- Admin client module.
- Server admin account endpoints.

Validations:

- `bun run build`
- Targeted lint where possible.
- Manual smoke: admin vs non-admin behavior.

Risks:

- Relying only on hidden UI instead of server authorization.

Stop criteria:

- Admin can manage accounts in the app.
- Non-admin users cannot access or call admin actions.
- Completed by adding `js/selfhosted-admin.js`, the Account page admin panel, self-hosted server URL injection, targeted styles, and non-admin server authorization coverage.

Out of scope:

- Social moderation tools.

## Checkpoint 9 - Add A Dedicated Uploaded Music Tab

Status: Complete

Objective:

Turn the minimal Library > Local Files upload panel into a dedicated uploaded-music tab with list, search entry point, play, like, and playlist actions.

Files probably concerned:

- `index.html`
- `styles.css`
- `js/ui.js`
- `js/events.js`
- `js/app.js`
- `js/server-uploads.js` or `js/server-library.js`

Validations:

- `bun run build`
- Manual or Playwright smoke: upload, search entry, play, favorite, playlist, reload.

Risks:

- Breaking existing Library surfaces or DOM selectors.

Stop criteria:

- Uploaded music has a dedicated usable tab without regressing Local Files behavior.
- Completed by adding a Library > Uploaded Music tab with upload, refresh, local search/filtering, track list playback, inline like state, and existing track menu/playlist actions.

Out of scope:

- Advanced shared metadata editing.

## Checkpoint 10 - Add Server-Side Search For Uploads

Status: Complete

Objective:

Implement search over uploaded server music by title, artist, album, and tags when available.

Files probably concerned:

- Server library/search modules.
- `js/server-library.js`
- Uploaded music UI.
- Search tests.

Validations:

- Server search tests if added.
- Manual smoke with several uploads.

Risks:

- Slow search if indexing is naive.
- Inconsistent search normalization.

Stop criteria:

- A query returns coherent, bounded results from uploaded music.
- Completed by adding filesystem-backed uploaded-track search, `/uploads/search`, frontend search client helpers, and Uploaded Music UI wiring that uses server-side search for non-empty queries.

Out of scope:

- Global search across all source types.

## Checkpoint 11 - Add Shared Custom Metadata

Status: Complete

Objective:

Allow approved users or admins, depending on decision, to edit server metadata visible to all users: title, artist, album, year, artwork, tags, and future YouTube association fields.

Files probably concerned:

- `js/track-model.ts`
- Server metadata store.
- `js/ui.js`
- `js/events.js`
- `styles.css`
- Metadata tests.
- `docs/DECISIONS.md`

Validations:

- Metadata server/client tests if added.
- `bun run build`
- Manual smoke: edit metadata, reload, verify another user sees it.

Risks:

- Conflicts between external API metadata, IndexedDB overrides, and server-global metadata.

Stop criteria:

- Server metadata is shared and has clear precedence rules.
- Completed by adding structured-upload metadata updates, `/uploads/:id/metadata`, frontend update helpers, an Uploaded Music context-menu metadata editor, server metadata precedence documentation, and storage/HTTP coverage.

Out of scope:

- Metadata edit history or moderation queue.

## Checkpoint 12 - Extract Basic Audio Metadata On Upload

Status: Complete

Objective:

Extract title, artist, album, duration, and artwork when available during upload.

Files probably concerned:

- Server upload pipeline.
- Metadata parser dependency if chosen.
- Fixture tests.
- `docs/ARCHITECTURE.md`

Validations:

- Tests with small audio fixtures.
- Manual smoke with common formats such as MP3, FLAC, and M4A if supported.

Risks:

- Format support differences.
- Large embedded artwork.
- Native dependency issues.

Stop criteria:

- Uploads get useful default metadata that users can correct.
- Completed by adding server-side TagLib extraction for upload defaults, tokenized extracted artwork serving when artwork is available, storage fixture tests for tagged WAV metadata, and HTTP upload extraction smoke coverage.

Out of scope:

- Audio fingerprinting.
- Automatic external metadata matching.

## Checkpoint 13 - Add A Radio Backend Model

Status: Complete

Objective:

Add a server model for radios: name, stream URL, genre, country, artwork, enabled status, and creator.

Files probably concerned:

- Server radio API/store.
- `js/track-model.ts` if radio is represented as a playable source.
- `docs/ARCHITECTURE.md`

Validations:

- Radio API tests if added.
- `node --check server/**/*.mjs`

Risks:

- Browser playback compatibility for stream formats.
- Unsafe or invalid stream URLs.

Stop criteria:

- Radios can be created, listed, validated, enabled, and disabled server-side.
- Completed by adding a JSON-backed self-hosted radio store, approved-user create/list endpoints, admin list/update endpoints, URL validation, and focused radio API tests.

Out of scope:

- Full radio UI.
- ICY/live metadata.

## Checkpoint 14 - Add A Dedicated Radio Tab

Status: Complete

Objective:

Add a dedicated playable radio tab with list, search/filter, play, and playback state.

Files probably concerned:

- `index.html`
- `styles.css`
- `js/ui.js`
- `js/events.js`
- `js/player.js`
- Radio client API module.

Validations:

- `bun run build`
- Manual smoke: open tab, play radio, switch radio, return to normal music playback.

Risks:

- Player assumptions about finite tracks and duration.
- Mobile/Safari stream behavior.

Stop criteria:

- At least one supported radio stream plays without breaking normal playback.
- Completed by adding Library > Radio, `js/selfhosted-radios.js`, approved-user radio list/create helpers, local radio filtering, radio track normalization with `source.kind === "radio"`, and playback through existing direct-audio player handling.

Out of scope:

- Radio recording.
- Live station metadata display.

## Checkpoint 15 - Associate YouTube Clips With Songs

Status: Complete

Objective:

Allow a YouTube video URL or ID to be associated with uploaded or external songs and displayed from the song UI.

Files probably concerned:

- Server metadata store.
- `js/ui.js`
- `js/events.js`
- `js/player.js` or a dedicated video module.
- `styles.css`

Validations:

- `bun run build`
- Manual smoke: associate clip, reload, open or play clip.

Risks:

- YouTube embed restrictions.
- Autoplay and mobile behavior.
- Confusion between audio playback and video playback.

Stop criteria:

- Associated clips are visible and usable without disrupting audio playback.
- Completed by adding shared YouTube clip metadata for `server-local` uploaded tracks, local per-track clip associations for external tracks, context-menu editing, track-info embeds, and a Track page YouTube Clip section.

Out of scope:

- Downloading or proxying YouTube video.

## Checkpoint 16 - Add Public User Profiles

Status: Complete

Objective:

Add user profiles with display name, avatar, bio, simple stats, and public playlists.

Files probably concerned:

- `js/accounts/pocketbase.js`
- Backend users/profiles modules.
- `js/ui.js`
- Profile routes/UI.
- `styles.css`

Validations:

- Profile tests if added.
- Manual smoke: view own profile and another user's profile.

Risks:

- Conflict between PocketBase profile data and self-hosted profile fallback data.

Stop criteria:

- Approved users have public profiles visible to other approved users.
- Completed by adding a JSON-backed self-hosted profile store, approved-user profile endpoints, frontend self-hosted profile client, and PocketBase-compatible profile page fallback.

Out of scope:

- Chat.
- Invitations.
- Notifications.

## Checkpoint 17 - Add Song And Playlist Sharing

Status: Complete

Objective:

Allow users to share songs and playlists internally or through stable internal links.

Files probably concerned:

- Backend sharing API.
- `js/db.js`
- `js/accounts/pocketbase.js`
- `js/ui.js`
- `js/events.js`

Validations:

- Sharing tests if added.
- Manual smoke: share uploaded track, external track, and playlist.

Risks:

- Uploaded tracks may not be available to every user unless server permissions are clear.
- External tracks and uploads have different portability guarantees.

Stop criteria:

- A user can receive and open a shared song or playlist.
- Completed by adding a self-hosted share store/API, internal share links under `/share/:id`, a frontend share client, context-menu share creation, and a shared music page that can open or play shared snapshots.

Out of scope:

- Real-time chat.

## Checkpoint 18 - Add Social Invitations

Status: Complete

Objective:

Add friend/contact invitations so users can control who they share and chat with.

Files probably concerned:

- Backend social API/store.
- Profile UI.
- Notifications or pending request UI.
- `styles.css`

Validations:

- Invitation tests if added.
- Manual smoke: send, accept, reject, prevent duplicates.

Risks:

- Inconsistent invitation states between users.

Stop criteria:

- Users can send, accept, reject, and view invitations.
- Completed by adding a self-hosted invitation store/API, a profile Connect action, an Account page invitations panel, and endpoint tests for send/list/accept/reject/duplicate prevention.

Out of scope:

- Groups.
- Chat rooms.

## Checkpoint 19 - Add Minimal Chat

Status: Complete

Objective:

Add persistent 1:1 text chat between accepted contacts.

Files probably concerned:

- Backend messages API/store.
- Chat UI.
- `js/events.js`
- `styles.css`

Validations:

- Message tests if added.
- Manual smoke with two accounts.

Risks:

- Message privacy bugs.
- Pagination issues.
- Polling too frequently.

Stop criteria:

- Two accepted contacts can exchange persistent messages.
- Completed by adding approved-user `/api/messages` list/send endpoints, a JSON-backed message store, accepted-contact authorization from invitations, Account page contact chat UI, and endpoint tests for accepted and blocked conversations.

Out of scope:

- Attachments.
- End-to-end encryption.
- Group chat.

## Checkpoint 20 - Add Self-Hosted Listening Parties

Status: Complete

Objective:

Connect or refactor listening parties to the self-hosted server: room, participants, current track, position, play/pause, and host controls.

Files probably concerned:

- `js/player.js`
- `js/events.js`
- Existing listening party modules if present.
- Backend realtime or polling modules.

Validations:

- Manual multi-session smoke: host starts, guest joins, track changes sync, play/pause sync.

Risks:

- Player desync.
- Queue conflicts.
- Mobile/Safari playback restrictions.

Stop criteria:

- A simple party works with external tracks and accessible uploads.
- Completed by adding JSON-backed `/api/parties` endpoints for room creation, joining, host playback updates, messages, requests, heartbeat, leave/end flows, accepted-contact join/read authorization, focused endpoint tests, and a self-hosted mode in `js/listening-party.js` that uses conservative polling while preserving the existing PocketBase party path by default.

Out of scope:

- Voice chat.
- Advanced moderation.
- Sub-second perfect sync.

## Checkpoint 21 - Clarify Migration From Existing Services

Status: Complete

Objective:

Document and implement the boundary between Better Auth, PocketBase, Appwrite legacy pieces, and the new self-hosted backend. Avoid accidental removals.

Files probably concerned:

- `js/accounts/*`
- `js/api.js`
- Backend auth/profile/library modules.
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`

Validations:

- `bun run test:headless`
- `bun run build`
- Manual smoke: auth, playlists, favorites, uploads.

Risks:

- Double source of truth.
- Breaking sync or public playlist compatibility.

Stop criteria:

- The service boundary is documented and enforced in code where needed.
- Completed by adding `shouldUseSelfHostedServices()` as the frontend boundary for self-hosted-only fallback services, gating profile fallback/mirroring/invitations/view-profile behavior behind mandatory self-hosted auth, and documenting the migration contract.

Out of scope:

- Removing Appwrite, PocketBase, or Better Auth unless explicitly scoped.

## Checkpoint 22 - Add Ubuntu 26.04 Install Commands

Objective:

Create simple server install commands for Ubuntu 26.04: dependencies, config, data directory, build, service setup, and optional reverse proxy notes.

Files probably concerned:

- `scripts/install-ubuntu.sh`
- `docs/SELF_HOSTING.md`
- `.env.example`
- `package.json` if script entries are needed.

Validations:

- Shell syntax check if available.
- ShellCheck if available.
- Manual test on Ubuntu 26.04 VM/container if possible.

Risks:

- Ubuntu 26.04 package details may vary by environment.
- Installer may be too destructive if paths are not explicit.

Stop criteria:

- An admin can install the server with a small documented command sequence.

Out of scope:

- Docker or Kubernetes unless separately requested.

## Checkpoint 23 - Add Simple Server Update Commands

Objective:

Create an update path: backup, pull or deploy new release, install dependencies, build, migrate, restart service.

Files probably concerned:

- `scripts/update-server.sh`
- `docs/SELF_HOSTING.md`
- Backend migration scripts.

Validations:

- Shell syntax check if available.
- Manual update test on an installed instance.

Risks:

- Data loss if update runs migrations without backup.
- Service downtime if restart fails.

Stop criteria:

- A standard update can be run with one documented command and records what it changed.

Out of scope:

- Silent auto-update.

## Checkpoint 24 - Add Backup And Restore

Objective:

Add backup and restore commands for uploads, metadata, users, social data, playlists, and config.

Files probably concerned:

- `scripts/backup-server.sh`
- `scripts/restore-server.sh`
- `docs/SELF_HOSTING.md`
- Backend data layout docs.

Validations:

- Create backup.
- Restore into a fresh data directory.
- Verify login, upload list, playback, profiles, and playlists.

Risks:

- Incomplete backup.
- Destructive restore behavior.

Stop criteria:

- A self-hosted instance can be restored from an archive.

Out of scope:

- Automatic cloud backups.

## Checkpoint 25 - Harden Tests And Non-Regression Coverage

Objective:

Add targeted coverage for critical contracts: track identity, uploads, metadata, auth approval, radio, sharing, and server data layout.

Files probably concerned:

- `js/tests/*`
- Server tests.
- Test config.
- `docs/ARCHITECTURE.md`

Validations:

- `bun run test:headless`
- `bun run build`

Risks:

- Fragile DOM-heavy tests.
- Broad test failures unrelated to current work.

Stop criteria:

- Critical self-hosted behavior has fast focused tests.

Out of scope:

- Rewriting the entire test framework.

## Checkpoint 26 - Stabilize For Homelab Beta

Objective:

Do a final stabilization pass before daily homelab use: network failures, empty states, permissions, logs, CORS, missing files, mobile behavior, backups, update flow.

Files probably concerned:

- All recently touched modules.
- `docs/SELF_HOSTING.md`
- `HANDOFF.md`
- `PROGRESS.md`

Validations:

- `bun run test:headless`
- `bun run lint`
- `bun run build`
- Manual full smoke: auth, admin approval, upload, search, playback, radio, metadata, YouTube clips, sharing, chat, listening party, backup, restore, update.

Risks:

- Late cross-feature regressions.
- Existing lint/test debt may obscure new issues.

Stop criteria:

- The app is usable as a stable self-hosted beta with clear backup and update procedures.

Out of scope:

- Major redesign.
- New feature families not listed in the global goal.
