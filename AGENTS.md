# Codex Agent Guide

This file is the first stop for Codex sessions working on Monochrome. The project is preparing for a multi-day, behavior-preserving refactor, so every session should optimize for continuity, small safe changes, and clear handoff notes.

## Project Snapshot

Monochrome is a Vite-powered music web app with a mostly JavaScript/TypeScript frontend, a large static DOM surface, Cloudflare Pages Functions, and Capacitor mobile shells.

- The app entrypoint is `index.html`, which loads `/js/app.js`.
- The main UI and behavior are concentrated in large modules under `js/`, especially `app.js`, `ui.js`, `settings.js`, `events.js`, `player.js`, `storage.js`, and `api.js`.
- Styling is mostly centralized in `styles.css`.
- Server-side route helpers live under `functions/` for Cloudflare Pages Functions.
- Static assets and runtime JSON live under `public/`.
- Android and iOS shells live under `android/` and `ios/`.

## Start Here

Before making changes:

1. Read `PROGRESS.md` for the current milestone, handoff, known risks, and next exact step.
2. Read `docs/MILESTONES.md` for the intended refactor sequence.
3. Read the relevant sections of `docs/ARCHITECTURE.md` before touching a subsystem.
4. Check `docs/DECISIONS.md` for durable decisions that should not be re-litigated casually.
5. Inspect the actual code before editing. The docs are a map, not a replacement for source truth.

## Non-Negotiables

Unless a milestone explicitly says otherwise, preserve existing behavior.

Treat these as compatibility contracts:

- Public routes and route aliases, including provider-prefixed routes like `/track/t/:id`.
- DOM IDs, classes, data attributes, and markup assumptions used by JavaScript and CSS.
- `localStorage` keys and value formats managed by `js/storage.js` and related modules.
- IndexedDB database name, version, stores, indexes, and persisted item shapes in `js/db.js`.
- Custom browser events such as `favorites-changed`, `playlist-tracks-changed`, `library-changed`, `history-changed`, `theme-changed`, and playback/UI events.
- Audio/video playback behavior, queue behavior, Media Session behavior, quality selection, gapless behavior, and iOS/Safari fallbacks.
- Download, metadata, lyrics, visualizer, scrobbling, account sync, and listening party flows.
- PWA/service worker behavior and Capacitor mobile compatibility.

Avoid broad formatting-only churn during refactor work. Use small, reviewable changes that can be tied to a milestone.

## Repo Map

- `index.html`: static app shell, route page containers, modals, settings UI, player bar, and many DOM anchors used by JS.
- `styles.css`: global styling and component/page styles.
- `js/app.js`: bootstraps settings, APIs, player, UI, router, events, analytics, PWA updates, and many DOM interactions.
- `js/ui.js`: page rendering and UI state rendering.
- `js/settings.js`: settings screen wiring and settings-related UI behavior.
- `js/events.js`: player/UI interaction wiring and event handlers.
- `js/player.js`: playback engine, queue, media elements, quality handling, and Media Session integration.
- `js/storage.js`: many localStorage-backed setting managers and persisted UI preferences.
- `js/db.js`: IndexedDB-backed favorites, history, playlists, folders, pinned items, and settings.
- `js/api.js`, `js/music-api.js`, `js/HiFi.ts`: music provider/API layers.
- `js/accounts/`: authentication and sync integration.
- `js/downloads.js`, `js/download-utils.ts`, `js/metadata*.js`, `js/ffmpeg*`: download, post-processing, and metadata pipelines.
- `js/lyrics.js`, `js/visualizer.js`, `js/visualizers/`: lyrics and visualizer subsystems.
- `functions/`: Cloudflare Pages Functions for SSR-ish metadata routes and API-backed public pages.
- `public/`: static manifest, assets, instance/editor data, and copied public files.
- `android/`, `ios/`, `capacitor.config.ts`: Capacitor native shells and app configuration.

## Validation Commands

Use the narrowest useful validation first, then broaden before closing a milestone.

- `bun run test`: Vitest browser/unit test suite.
- `bun run lint`: ESLint, Stylelint, and HTMLHint.
- `bun run build`: production Vite build plus bundle visualizer output.
- `bun run dev`: local development server.

`bun run format` rewrites broadly. Only run it when formatting churn is explicitly intended for the milestone.

## Refactor Workflow

1. Keep each milestone behavior-preserving and small enough to explain in one handoff.
2. Add or strengthen tests around behavior before extracting risky code.
3. Prefer moving code behind existing APIs/selectors/events before changing interfaces.
4. Preserve current names and contracts until a documented decision says otherwise.
5. After each milestone, update the documentation handoff files before ending the session.

## Session Handoff Rules

Every Codex session that changes code or docs must update `PROGRESS.md` with:

- What changed.
- Why it changed.
- Files touched.
- Verification commands and results.
- Known risks or skipped checks.
- The next exact step for the following session.

Update `docs/DECISIONS.md` when a durable technical decision is made. Update `docs/ARCHITECTURE.md` when actual architecture changes. Update `docs/MILESTONES.md` when milestone status or scope changes.
