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
