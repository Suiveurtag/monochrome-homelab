# Refactor Progress

This is the living handoff file for multi-session Codex work. Keep it current, concise, and factual.

## Current State

- Date: 2026-05-24
- Branch: main
- Last known commit: 874a9e6
- Current milestone: M1 - Safety Net Inventory
- Risk level: Medium

The repo is prepared for a behavior-preserving multi-day refactor. A documentation-only audit pass has mapped current auth, PocketBase, Appwrite legacy surface, music API, player, storage, routing, sidebar, UI, and deployment boundaries. No application behavior has intentionally changed.

## Active Milestone

M1 - Safety Net Inventory

Goal:

- Identify behavior contracts that need tests or manual smoke coverage before major extractions.

Success criteria:

- Current tests and gaps are inventoried for routing, storage, auth sync, player, downloads, settings, search, sidebar, deploy/functions, and key UI behavior.
- Existing tests are run if the environment allows.
- Failing or skipped checks are recorded with reasons.
- No app code behavior is changed.

In scope:

- Test and risk inventory.
- Documentation updates for the test strategy.

Out of scope:

- Source code refactors.
- Formatting churn.
- Dependency changes.
- Behavior changes.

## Last Session Handoff

Changes:

- Documented the technical audit findings across architecture, milestones, decisions, and progress.
- Recorded Better Auth as the active browser auth boundary, PocketBase as the current cloud sync/profile/public playlist boundary, and Appwrite as legacy/residual until an explicit decision changes that.
- Reordered the recommended refactor milestones around observed risk: safety inventory, bootstrap/routing, storage contracts, auth/PocketBase, search/API, player, UI/sidebar/pages, then deploy/functions/downloads.

Why:

- Future sessions need source-grounded audit context before starting behavior-preserving extractions.
- The account/cloud/music/player/storage surfaces are tightly coupled and should be refactored only after their contracts are inventoried and tested.

Files touched:

- `PROGRESS.md`
- `docs/ARCHITECTURE.md`
- `docs/MILESTONES.md`
- `docs/DECISIONS.md`

Verification:

- `git diff -- docs/ARCHITECTURE.md docs/MILESTONES.md docs/DECISIONS.md PROGRESS.md` produced no output because these docs are currently untracked.
- `git status --short --branch` showed only `AGENTS.md`, `PROGRESS.md`, and `docs/` as untracked.
- No app tests were run because no app code was changed.

Known risks:

- Audit findings are based on static source inspection and should be validated with M1 tests/smokes before source refactors.
- Appwrite remains present in docs/UI/config but is not the observed active frontend auth client; avoid opportunistic removal.
- Normal production audio stream resolution depends on Qobuz-by-ISRC after TIDAL metadata lookup; playback and download refactors must preserve this observed behavior.
- PocketBase sync uses legacy `firebase_id` and JSON-shaped fields; shape changes need an explicit migration plan.

## Next Exact Step

Inventory existing test coverage and gaps for M1: routing, storage/IndexedDB/localStorage, auth sync/PocketBase, player/playback, search/API, sidebar/side-panel, downloads/settings, deploy/functions, and key UI behavior. Record which checks can run locally before any source refactor starts.

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

## Milestone History

Append completed milestones here.

| Milestone | Date | Summary | Verification |
| --- | --- | --- | --- |
| M0 - Documentation baseline | 2026-05-24 | Internal docs added for Codex continuity. | Documentation-only status check passed. |
