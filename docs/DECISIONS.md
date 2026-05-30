# Decisions

This is a lightweight architecture decision record for the Monochrome refactor. Record durable decisions here when future sessions should preserve or understand them.

## Decision Format

Use this format for new entries:

```md
## YYYY-MM-DD - Title

Status: Proposed | Accepted | Superseded

Context:

- What problem or constraint forced this decision?

Decision:

- What did we choose?

Consequences:

- What tradeoffs or follow-up constraints does this create?

Affected areas:

- Files, modules, or milestones affected.
```

## 2026-05-24 - Internal Refactor Docs Use English

Status: Accepted

Context:

- Existing public repository docs are written in English.
- Future Codex sessions need consistent internal documentation.

Decision:

- New internal refactor docs are written in English.

Consequences:

- User conversation may still happen in French, but persistent repo documentation should stay in English unless this decision is superseded.

Affected areas:

- `AGENTS.md`
- `PROGRESS.md`
- `docs/ARCHITECTURE.md`
- `docs/MILESTONES.md`
- `docs/DECISIONS.md`

## 2026-05-24 - Refactor Is Behavior-Preserving By Default

Status: Accepted

Context:

- The project is preparing for a large multi-day refactor.
- The current app has many implicit contracts across DOM, storage, routes, events, playback, downloads, PWA, and mobile shells.

Decision:

- Refactor milestones preserve behavior unless a milestone explicitly declares a behavior change and its migration/validation plan.

Consequences:

- Prefer small extractions and tests over broad rewrites.
- Treat route paths, DOM selectors, storage keys, IndexedDB schema, event names, and media behavior as compatibility contracts.

Affected areas:

- All refactor milestones.

## 2026-05-24 - Avoid Broad Formatting Churn During Refactor

Status: Accepted

Context:

- Large files such as `js/ui.js`, `js/settings.js`, `js/app.js`, and `js/events.js` already have high review risk.
- Formatting-only diffs can obscure behavior changes.

Decision:

- Do not run broad formatting commands during behavior-preserving refactor milestones unless the milestone is explicitly about formatting.

Consequences:

- Edits should be targeted.
- Existing style should be followed locally.
- `bun run format` should be used deliberately, not as a default cleanup step.

Affected areas:

- All source files touched by refactor work.

## 2026-05-24 - Better Auth And PocketBase Are Current Account Boundaries

Status: Accepted

Context:

- The audit found `js/accounts/config.js` creating the active browser auth client with Better Auth from `https://esm.sh/better-auth/client`.
- The audit found `js/accounts/pocketbase.js` storing sync data, profiles, public playlists, theme author records, and listening-party data in PocketBase.
- Appwrite remains present in dependencies, settings UI, Vite env injection, Docker docs, and localStorage override keys, but no active frontend import of the Appwrite SDK was observed.

Decision:

- Treat Better Auth as the active browser authentication system.
- Treat PocketBase as the current cloud data/sync/profile/public playlist boundary.
- Treat Appwrite as legacy/residual documentation and configuration surface until a separate migration or removal decision is accepted.

Consequences:

- Auth refactors must preserve Better Auth session behavior, user normalization to `$id`, and existing sign-in/sign-out UI.
- Sync refactors must preserve PocketBase collection names, the legacy `firebase_id` mapping, JSON field shapes, public playlist publishing, and profile behavior.
- Do not remove Appwrite-related UI/docs/config opportunistically during behavior-preserving refactors.

Affected areas:

- `js/accounts/config.js`
- `js/accounts/auth.js`
- `js/accounts/pocketbase.js`
- `js/profile.js`
- `js/themeStore.js`
- `js/listening-party.js`
- `vite-plugin-auth-gate.js`
- `docs/MILESTONES.md`
- `docs/ARCHITECTURE.md`

## 2026-05-24 - Hybrid Track Identity Is Additive

Status: Accepted

Context:

- Tracks can come from external APIs, browser-local files, podcasts, tracker pages, and future server uploads.
- Existing playback, routes, DOM data attributes, and API calls depend heavily on `track.id`.

Decision:

- Keep `track.id` as the compatibility/playback identifier.
- Add `track.trackKey` plus `track.source` for source-aware persistence, favorites, playlists, sync, and future metadata overrides.
- Store source-aware track snapshots in additive IndexedDB stores rather than replacing existing stores.

Consequences:

- New persistence code should compare tracks by `trackKey` when available and fall back to legacy `id`.
- Existing stores and PocketBase JSON fields remain compatible and must not be renamed without a separate migration plan.
- Metadata overrides may be stored by `trackKey`, but no editing UI or automatic override behavior is implied yet.

Affected areas:

- `js/track-model.ts`
- `js/db.js`
- `js/accounts/pocketbase.js`
- `js/api.js`
- `js/metadata.js`

## 2026-05-25 - Local Upload Prototype Uses Server-Local Source

Status: Accepted

Context:

- The app needs a minimal server upload path before choosing production storage.
- Cloudflare Pages Functions do not provide persistent local filesystem storage.
- The hybrid identity model already supports source-aware persistence without replacing `track.id`.

Decision:

- Add a non-production Node upload server that stores audio files under `.storage/server-uploads`.
- Represent its tracks with `source.kind === "server-local"` and `track.id === uploadId`.
- Keep existing `server-upload` identity compatibility for prior tests/data, but use `server-local` for this local filesystem prototype.
- Require a signed-in app user id for upload/list calls; use per-track stream tokens for audio element playback because media elements cannot send custom auth headers.

Consequences:

- This is a local prototype boundary, not a production Cloudflare/R2 storage design.
- Uploaded audio files are not synced through PocketBase; only metadata snapshots may appear in favorites/playlists.
- Rich metadata extraction, quotas, deletion, public sharing, and production auth hardening remain future work.

Affected areas:

- `server/uploads/server.mjs`
- `js/server-uploads.js`
- `js/track-model.ts`
- `js/app.js`
- `js/ui.js`
- `js/events.js`

## 2026-05-25 - Self-Hosted Source Kinds Are Additive

Status: Accepted

Context:

- The self-hosted roadmap needs stable names for future production filesystem library tracks, radio streams, and YouTube video associations.
- Existing playback, routes, DOM datasets, API calls, favorites, playlists, and sync data still depend on `track.id` and legacy source shapes.

Decision:

- Keep existing source kinds and add future-facing `server-library`, `radio`, and `youtube-video` kinds to the hybrid track model.
- Export `TRACK_SOURCE_KINDS`, `isTrackSourceKind`, and `normalizeTrackSourceRef` so future server clients can share the same source normalization boundary.
- Do not migrate existing `server-local` uploaded tracks or legacy `server-upload` compatibility data in this checkpoint.

Consequences:

- Future self-hosted features can persist identities with `trackKey` before their UI/backend implementation exists.
- Source-kind additions are compatible because track identity remains additive and `track.id` remains the playback/route compatibility identifier.
- Later checkpoints still need to define backend storage, metadata precedence, and UI behavior for `server-library`, `radio`, and `youtube-video`.

Affected areas:

- `js/track-model.ts`
- `js/tests/track-model.test.ts`

## 2026-05-30 - Uploaded Track Metadata Is Server-Shared

Status: Accepted

Context:

- Server-local uploads initially derive title and album defaults from filenames.
- The self-hosted roadmap needs editable metadata that is visible wherever the uploaded track is listed, before richer metadata extraction or moderation exists.
- The local upload prototype is still per-user for list/upload access and does not yet have social sharing or a production permission model.

Decision:

- Store edited uploaded-track metadata in the server filesystem track metadata JSON.
- Treat server metadata as the precedence layer for `server-local` uploaded tracks returned by list, search, stream-adjacent public track responses, and frontend rendering.
- Allow the requesting signed-in user to edit metadata only for uploaded tracks present in their server upload index in the current prototype.
- Keep metadata edit history, moderation, and cross-user sharing permissions out of this checkpoint.

Consequences:

- Metadata edits are shared at the server track record level, not as browser-local IndexedDB overrides.
- Later production sharing/admin work can broaden who may edit or view a server-library track without changing the frontend track shape.
- Legacy manifest uploads remain readable, but shared metadata editing currently applies to structured storage tracks.

Affected areas:

- `server/storage/filesystem-library.mjs`
- `server/uploads/server.mjs`
- `js/server-uploads.js`
- `js/server-library.js`
- `js/events.js`
- `docs/ARCHITECTURE.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`

## 2026-05-25 - Server Library Client Is The Frontend Boundary

Status: Accepted

Context:

- The local upload prototype exposes only upload/list/stream behavior, but the self-hosted roadmap needs a stable frontend API for list, search, upload, metadata updates, stream URLs, and artwork URLs.
- Calling the prototype upload client directly from UI code would make the later production backend migration noisier.

Decision:

- Add `js/server-library.js` as the narrow frontend client for self-hosted library operations.
- Keep `js/server-uploads.js` as the current prototype transport adapter.
- Route existing Library > Local Files upload/list UI through `js/server-library.js` while preserving the visible server uploads UI and behavior.

Consequences:

- Future backend work can replace the implementation behind `server-library` without touching every UI call site.
- Metadata updates are exposed as an explicit placeholder that throws until a backend endpoint exists.
- Search is currently client-side over listed prototype uploads; server-side search remains a later checkpoint.

Affected areas:

- `js/server-library.js`
- `js/server-uploads.js`
- `js/app.js`
- `js/ui.js`
- `docs/ARCHITECTURE.md`

## 2026-05-25 - Self-Hosted Backend Starts As A Separate Skeleton

Status: Accepted

Context:

- The project still serves the app through Vite/Cloudflare Pages/Docker static paths.
- The upload prototype already has a separate local server, but the production self-hosted backend shape is not defined yet.
- The roadmap needs a minimal backend foundation without replacing existing Cloudflare Pages behavior.

Decision:

- Add `server/selfhosted/server.mjs` as a separate minimal Node backend skeleton.
- Add `server/selfhosted/config.mjs` for env/config loading and deterministic data directory paths.
- Expose `/health` and placeholder `/api/auth/*` responses only; do not wire production library, metadata, admin, or social endpoints yet.

Consequences:

- Future backend checkpoints have a single entrypoint for self-hosted server work.
- Existing frontend, Cloudflare Pages Functions, and local upload prototype behavior remain unchanged.
- Auth is explicitly represented as required/approval-required placeholder config until the auth checkpoints implement enforcement.

Affected areas:

- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `.env.example`
- `package.json`
- `docs/ARCHITECTURE.md`

## 2026-05-25 - Server Upload Storage Uses Structured Filesystem Layout

Status: Accepted

Context:

- The prototype upload server originally stored files and `manifest.json` directly under each hashed user directory.
- The self-hosted roadmap needs local filesystem storage that can grow to audio blobs, artwork, metadata, indexes, search, backup, and restore without unsafe filename handling.

Decision:

- Put new uploaded audio blobs under sharded `audio/` paths generated from server upload ids, never from user filenames.
- Store per-track JSON metadata under `metadata/tracks/`, per-user upload ordering under `indexes/users/`, and stream-token lookup records under `indexes/streams/`.
- Keep the legacy per-user `manifest.json` shape readable as a fallback, but write new uploads only to the structured layout.

Consequences:

- Existing upload/list/stream frontend behavior stays compatible while backend storage becomes ready for future metadata indexing and backup tooling.
- User filenames remain metadata only and are not trusted as path segments.
- Full migration, deletion, quotas, artwork extraction, and metadata parsing remain later checkpoints.

Affected areas:

- `server/storage/filesystem-library.mjs`
- `server/uploads/server.mjs`
- `docs/ARCHITECTURE.md`

## 2026-05-25 - Mandatory Auth Is Configured For Self-Hosted Browser Sessions

Status: Accepted

Context:

- The self-hosted roadmap requires authentication before regular app use.
- The public/default app should not become gated unless a deployment explicitly opts in.
- Local development still needs a clear test-only fallback while real Better Auth access is unavailable.

Decision:

- Treat `MONOCHROME_AUTH_REQUIRED=true` as the browser-side opt-in for mandatory auth and inject it as `window.__MONOCHROME_AUTH_REQUIRED__`.
- Redirect signed-out users away from protected app routes to `/account`; keep `/account`, `/login`, `/login.html`, and `/reset-password` accessible.
- Keep `Use Test Session` available only on localhost-style hosts through the existing dev auth storage keys.

Consequences:

- Self-hosted deployments can require sign-in without changing default public behavior.
- This is a client-side boundary until later checkpoints add server-side account approval and admin enforcement.
- Future auth work should build on `js/auth-gate.js` instead of scattering route checks.

Affected areas:

- `js/auth-gate.js`
- `js/accounts/auth.js`
- `js/app.js`
- `vite-plugin-auth-gate.js`
- `docs/ARCHITECTURE.md`

## 2026-05-25 - Self-Hosted Accounts Require Approval

Status: Accepted

Context:

- Mandatory auth alone does not decide who is allowed to use a private self-hosted instance.
- The roadmap needs account states and a bootstrap admin before a full admin dashboard exists.

Decision:

- Store self-hosted account state as JSON under the configured server data directory.
- Use explicit account statuses: `pending`, `approved`, `rejected`, and `disabled`.
- Bootstrap the first seen account as an approved admin unless `MONOCHROME_BOOTSTRAP_ADMIN_USER_ID` is configured, in which case that user id is the bootstrap admin.
- Allow temporary account approval through a configured `MONOCHROME_ADMIN_SECRET` or an already approved admin account until the admin UI checkpoint exists.

Consequences:

- New accounts are blocked by `/api/accounts/me` while approval is required and their status is not `approved`.
- The admin secret is a temporary homelab bootstrap mechanism and must be replaced or hidden behind UI/server authorization in later checkpoints.
- Existing Better Auth/PocketBase browser account behavior is not removed or migrated by this checkpoint.

Affected areas:

- `server/selfhosted/accounts.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `.env.example`
- `docs/ARCHITECTURE.md`

## 2026-05-30 - Self-Hosted Admin UI Uses Server Authorization

Status: Accepted

Context:

- Checkpoint 8 needs in-app account management without weakening the server-side approval boundary.
- Hiding admin UI alone is not sufficient protection for account updates.

Decision:

- Add a browser admin client and Account page panel for approved self-hosted admins.
- Let the UI call `/api/accounts/me` first and only render account management controls when the current account is approved and has the `admin` role.
- Keep `/api/admin/accounts` and `/api/admin/accounts/:userId` authorization enforced by the self-hosted backend through approved admin account headers or the configured bootstrap admin secret.

Consequences:

- Non-admin users see account status but no account management controls.
- Direct non-admin calls to admin endpoints remain rejected by the backend.
- Self-hosted deployments can configure the frontend backend URL with `MONOCHROME_SELF_HOSTED_SERVER_URL` or the local storage override.

Affected areas:

- `js/selfhosted-admin.js`
- `index.html`
- `styles.css`
- `js/accounts/auth.js`
- `js/app.js`
- `server/selfhosted/accounts.test.mjs`
- `vite-plugin-auth-gate.js`
- `.env.example`

## 2026-05-30 - YouTube Clip Associations Are Non-Playback Metadata

Status: Accepted

Context:

- Checkpoint 15 needs YouTube clips associated with songs without destabilizing audio playback, queue behavior, or the existing TIDAL/Qobuz stream path.
- Uploaded tracks already have shared server metadata, while external API tracks do not yet have a self-hosted shared metadata backend.

Decision:

- Treat YouTube clip associations as metadata shown from song UI, not as replacements for the audio player.
- Persist uploaded-track associations in shared server metadata through `/uploads/:id/metadata`.
- Persist external-track associations locally in the browser, keyed by source-aware `trackKey`, until a later checkpoint adds shared metadata for external catalog tracks.

Consequences:

- Server-local upload clips are visible to users who can list that uploaded track from the same server.
- External catalog clips are useful immediately on the current browser but are not synced or shared yet.
- Future shared metadata work can migrate the local clip map into a server-backed external-track metadata store without changing the UI contract.

Affected areas:

- `js/youtube-clips.js`
- `js/events.js`
- `js/ui.js`
- `server/storage/filesystem-library.mjs`
- `server/uploads/server.mjs`

## 2026-05-30 - Self-Hosted Profiles Are A PocketBase-Compatible Fallback

Status: Accepted

Context:

- The app already has mature PocketBase-backed profile routes, editing UI, public playlists, and Last.fm profile sections.
- The self-hosted roadmap needs approved users to have visible profiles even when PocketBase is unavailable or not desired for a homelab deployment.

Decision:

- Keep PocketBase as the primary profile source for existing public behavior.
- Add a JSON-backed self-hosted profile store and approved-user profile API.
- Use self-hosted profiles as a fallback in the existing profile page instead of replacing the current route/UI.

Consequences:

- Existing PocketBase profiles and public playlist behavior remain compatible.
- Self-hosted deployments can view and edit basic profiles through the same `/user/@:username` surface after account approval.
- Later social checkpoints can expand the self-hosted profile store without requiring a route redesign.

Affected areas:

- `server/selfhosted/profiles.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `js/selfhosted-profiles.js`
- `js/profile.js`

## 2026-05-30 - Internal Sharing Uses Server Snapshots Plus Canonical Links

Status: Accepted

Context:

- External catalog tracks have portable route links, but server-local uploaded tracks may only be playable on the originating self-hosted server.
- User playlists may be PocketBase-published, locally stored, or snapshot-only depending on the deployment.

Decision:

- Add self-hosted internal shares as approved-user JSON records with a stable `/share/:id` route.
- Store a canonical app href when one is known and a minified track or playlist snapshot for display/playback fallback.
- Do not make self-hosted shares public to signed-out users in this checkpoint.

Consequences:

- External catalog shares can open their canonical app routes.
- Server-local upload shares can be received as snapshots and played when their stream URL/token remains valid on the same server.
- Playlist shares can render snapshot tracks even when no public playlist publication exists.

Affected areas:

- `server/selfhosted/shares.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `js/selfhosted-shares.js`
- `js/events.js`
- `js/router.js`
- `js/ui.js`
- `index.html`

## 2026-05-30 - Social Invitations Are Account-Scoped Contacts

Status: Accepted

Context:

- Checkpoint 18 needs a contact boundary before chat and direct sharing workflows.
- Self-hosted profiles expose public usernames, but authorization is still based on approved account user ids.

Decision:

- Store invitations by self-hosted account user id, while allowing the UI/API to target profiles by user id or username.
- Require approved self-hosted accounts for listing, sending, accepting, and rejecting invitations.
- Let only the invited recipient accept or reject an invitation.

Consequences:

- Invitation state remains independent from PocketBase contacts or public profile metadata.
- Chat can later use accepted invitation/contact records as its access boundary.
- Display names can improve later, but the durable relationship key is the self-hosted account user id.

Affected areas:

- `server/selfhosted/invitations.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `js/selfhosted-invitations.js`
- `js/profile.js`
- `js/app.js`
- `index.html`

## 2026-05-30 - Minimal Chat Uses Accepted Invitations As Its Access Boundary

Status: Accepted

Context:

- Checkpoint 19 needs persistent 1:1 chat without introducing realtime infrastructure yet.
- Checkpoint 18 already created accepted invitation/contact state keyed by self-hosted account user ids.

Decision:

- Store chat messages as self-hosted JSON records keyed by sender and recipient account user ids.
- Require approved self-hosted accounts and an accepted invitation/contact relationship for both listing and sending messages.
- Render the first chat surface from Account with manual refresh/contact selection instead of automatic polling or push.

Consequences:

- Message privacy depends on the accepted-contact check in the self-hosted backend.
- Later realtime or notification work can reuse the same message records and contact boundary.
- Chat currently displays durable user ids; richer display names can be layered in from profiles later.

Affected areas:

- `server/selfhosted/messages.mjs`
- `server/selfhosted/invitations.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `js/selfhosted-chat.js`
- `js/selfhosted-invitations.js`
- `js/app.js`
- `index.html`
- `styles.css`

## 2026-05-30 - Self-Hosted Listening Parties Use Polling And Accepted Contacts

Status: Accepted

Context:

- The existing listening-party UI is PocketBase-backed and realtime, but the self-hosted backend does not yet have websocket or push infrastructure.
- Checkpoint 18 already defines accepted invitation/contact state for self-hosted social privacy.
- Playback behavior for normal app use must remain unchanged outside configured self-hosted deployments.

Decision:

- Keep PocketBase-backed listening parties as the default/public app path.
- When mandatory self-hosted auth is enabled, route the existing listening-party UI through JSON-backed `/api/parties` endpoints.
- Require approved self-hosted accounts for all party endpoints, accepted-contact state for non-host reads/joins, and host-only authorization for playback mutations.
- Use conservative polling for party state, messages, members, requests, and guest playback sync until a separate realtime decision is made.

Consequences:

- Self-hosted parties are simpler and less realtime than the PocketBase path, but they avoid adding a second infrastructure dependency.
- Hosts remain authoritative for play/pause, current track, position, and queue snapshots.
- Direct-audio uploads and radio tracks must preserve their stream URLs during party guest sync so accessible uploads keep playing.

Affected areas:

- `server/selfhosted/parties.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `server/selfhosted/invitations.mjs`
- `js/listening-party.js`
- `js/ui.js`

## 2026-05-30 - Self-Hosted Services Are Opt-In Behind Mandatory Auth

Status: Accepted

Context:

- Better Auth remains the browser session authority.
- PocketBase remains the default/public sync, profile, public playlist, and listening-party service.
- Appwrite remains legacy/residual configuration, not an active frontend account boundary.
- The self-hosted backend is additive and should not become a second source of truth for public/default deployments.

Decision:

- Use `shouldUseSelfHostedServices()` as the frontend boundary for self-hosted-only service fallbacks.
- Keep that boundary equivalent to mandatory self-hosted auth for now.
- Allow profile fallback, self-hosted profile mirroring, profile contact invitations, and own-profile fallback navigation only when that boundary is enabled.

Consequences:

- Public/default deployments preserve PocketBase-first profile and social behavior and avoid opportunistic calls to a local self-hosted backend.
- Homelab deployments can still use the self-hosted backend when `MONOCHROME_AUTH_REQUIRED=true`.
- A later migration can widen or change `shouldUseSelfHostedServices()` deliberately without editing every call site.

Affected areas:

- `js/auth-gate.js`
- `js/profile.js`
- `js/tests/auth-gate.test.js`
- `docs/ARCHITECTURE.md`
