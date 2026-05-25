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
