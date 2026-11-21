# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner and a small circle of friends running one self-hosted Monochrome instance on a homelab. Everyone is both a listener and a community member: they import/stream a shared FLAC library, and see what the other members are playing in real time. Technical, design-literate audience that uses messengers (WhatsApp/Discord) daily.

## Product Purpose

Monochrome is a self-hosted music streaming web app (PocketBase + Go SpotiFLAC importer fork of monochrome.tf). This fork adds a social layer on top of the shared library: **Social**, the living musical community of an instance (24-hour notes, what members are playing right now, recent listening, reactions, polls, taste matches, community charts), with direct messages as a secondary drawer. Success = the instance feels like a private club for the members' music life, not a generic chat bolted onto a player.

## Positioning

The only music player where the library, the player, and the social graph are the same self-hosted surface: you share the exact track/album/artist from the shared library, with a croppable audio snippet, inside the app you are already listening in.

## Operating Context

- Dev: `./monochrome dev` (Docker PocketBase :8090 + importer :8787, Vite :5173 with HMR). Prod: docker compose, nginx :3000.
- Auth: PocketBase email/password only (OAuth intentionally disabled in self-hosted mode).
- Small user counts (a handful to tens of members) — client-side aggregation over `getFullList` is acceptable.
- UI is design-reviewed via the impeccable hook after edits; lint via `bun run lint`.

## Capabilities and Constraints

- Social (rebuilt 2026-11-21, `js/community/*`, `community.css`, `pb_hooks/social*.{pb.js,cjs}`): every Social read goes through `/api/monochrome/social/*`, which filters per viewer. New server-only collections: `social_settings` (visibility private|friends|instance, empty = not chosen = private; `ghost_until`), `social_notes` (24h), `social_reactions` (one emoji per person per moment), `social_polls` + `social_poll_votes` (unique per poll/user). `listening_sessions.social_hidden` marks Ghost Mode plays forever. `social_presence` is owner-only; the server pushes per-viewer realtime messages on the `monochrome_social` topic (presence patches; other changes trigger a refetch) with a 60s polling safety net.
- Presence: 90s active window, heartbeat every 30s while playing, immediate updates on track change/play/pause/seek. Private or ghost members store no presence at all.
- Reused collections: `social_profiles` (now mirrored server-side from `DB_users`), `social_follows` (mutual follow = friend), `social_blocks`, `social_conversations` (created only by the server, after a friendship check), `social_messages`, `social_reads`. `social_posts`/likes/comments/pins/mutes are no longer used by the UI; their data is kept.
- Vanilla JS (no framework), one `index.html` + hand-written CSS (`styles.css`, `player-refined.css`, `now-playing-panel.css`), Vite build with PurgeCSS (fragile safelist — do not remove).
- Icons: `<use svg="!lucide/x.svg" size="n">` in index.html (build-time transform); in JS-rendered markup use `import ICON from '!lucide/x.svg?svg&icon'` (function `(size, attrs) => svg string`).
- Theming: CSS custom properties per theme (`monochrome` default, dark, ocean, purple, …). All social UI must use tokens (`--card`, `--border`, `--muted-foreground`, `--highlight-rgb`, …) so every theme works.
- Confirmed decisions (updated 2026-11-21): Social is one scroll-first page, never a feed tab: notes row on top, "Listening now" (listeners grouped into rooms by shared track, album or artist), then "Recently" (sessions, polls, shared plays, new members and friends) with taste matches, the weekly community chart and people in a side rail (inline on narrow screens). Listening is shared only after an explicit choice; community charts only include members sharing with everyone and need at least two contributors and three repeated tracks. Messaging requires a mutual friendship (or replying to someone who wrote first). Listening Parties are not part of Social yet. Demo/seed content on the dev PocketBase is allowed for design verification (the debug fake users).
- No calls feature — mute and messaging features must not introduce call UI.
