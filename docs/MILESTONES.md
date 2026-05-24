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
