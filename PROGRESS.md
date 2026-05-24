# Refactor Progress

This is the living handoff file for multi-session Codex work. Keep it current, concise, and factual.

## Current State

- Date: 2026-05-24
- Branch: main
- Last known commit: 874a9e6
- Current milestone: M5a - Core Musique Hybride
- Risk level: Medium

The repo now has an additive hybrid track identity layer. Existing `track.id` playback/route behavior is preserved, while persisted tracks can carry source-aware `trackKey` and `source` metadata for external API tracks, browser-local files, podcasts, tracker tracks, future server uploads, favorites, playlists, sync, and future metadata overrides.

## Active Milestone

M5a - Core Musique Hybride

Goal:

- Create a stable source-aware track identity and snapshot persistence boundary without replacing `track.id`.

Success criteria:

- Hybrid track helpers exist and are covered by focused tests.
- IndexedDB v12 adds `track_catalog`, `track_metadata_overrides`, and `favorites_track_refs`.
- Favorites, playlists, export/import, and PocketBase minification preserve `trackKey` and `source`.
- Existing playback identifiers remain compatible.

In scope:

- Source-aware track identity.
- Additive DB stores.
- Legacy-compatible favorites/playlists.
- Documentation updates.

Out of scope:

- Server upload implementation.
- Metadata override UI.
- Route redesign.
- Provider strategy changes.
- Formatting churn.

## Last Session Handoff

Changes:

- Added `js/track-model.ts` with `trackKey`, `source`, hybrid track minification, override application, and source-aware comparison helpers.
- Added IndexedDB v12 stores: `track_catalog`, `track_metadata_overrides`, and `favorites_track_refs`.
- Updated track favorites, history, playlists, export/import, PocketBase sync minification, API track preparation, local metadata reads, and high-value like/remove call sites to preserve or use hybrid track identity.
- Added focused tests for hybrid track identity and DB persistence behavior.
- Documented the new hybrid music core boundary.

Why:

- Future external/local/server-upload tracks need a stable persisted identity without breaking route/player compatibility.
- Favorites and playlists need to support multiple sources with overlapping legacy `id` values.

Files touched:

- `js/track-model.ts`
- `js/tests/track-model.test.ts`
- `js/tests/db.test.js`
- `js/db.js`
- `js/accounts/pocketbase.js`
- `js/api.js`
- `js/metadata.js`
- `js/app.js`
- `js/ui.js`
- `js/events.js`
- `js/ui-interactions.js`
- `js/commandPalette.js`
- `js/settings.js`
- `PROGRESS.md`
- `docs/ARCHITECTURE.md`
- `docs/MILESTONES.md`
- `docs/DECISIONS.md`

Verification:

- `node --check js/db.js` passed.
- `node --check js/accounts/pocketbase.js` passed.
- `node --check js/api.js` passed.
- `node --check js/metadata.js` passed.
- `node --check js/app.js` passed.
- `node --check js/events.js` passed.
- `node --check js/ui-interactions.js` passed.
- `node --check js/ui.js` passed.
- `node --check js/commandPalette.js` passed.
- `git diff --check` passed with only line-ending normalization warnings.
- `bun run test -- js/tests/track-model.test.ts js/tests/db.test.js` could not run because `bun` is not installed in this environment.
- `npm.cmd run test -- js/tests/track-model.test.ts js/tests/db.test.js` could not run because local dependencies are not installed (`vitest` not found).

Known risks:

- Focused tests were added but not executed here because dependencies are unavailable.
- Many UI surfaces still pass only legacy `id` into `isFavorite`; this is intentionally supported as fallback but less precise for non-TIDAL sources.
- Browser-local tracks still cannot serialize live `File` handles into cloud sync; local snapshots are metadata-only.
- Normal production audio stream resolution still depends on Qobuz-by-ISRC after TIDAL metadata lookup and must remain protected.

## Next Exact Step

Install project dependencies or run in an environment with them available, then execute `bun run test -- js/tests/track-model.test.ts js/tests/db.test.js` followed by `bun run test`, `bun run lint`, and `bun run build`. If tests pass, manually smoke API playback, liking/unliking, playlist add/remove, public playlists, and browser-local playback.

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

## Milestone History

Append completed milestones here.

| Milestone | Date | Summary | Verification |
| --- | --- | --- | --- |
| M0 - Documentation baseline | 2026-05-24 | Internal docs added for Codex continuity. | Documentation-only status check passed. |
| M5a - Core Musique Hybride | 2026-05-24 | Added additive source-aware track identity and persistence boundary. | JS syntax checks passed; test execution blocked by missing dependencies. |
