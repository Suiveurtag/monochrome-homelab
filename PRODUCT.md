# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner and a small circle of friends running one self-hosted Monochrome instance on a homelab. Everyone is both a listener and a community member: they import/stream a shared FLAC library, and see what the other members are playing in real time. Technical, design-literate audience that uses messengers (WhatsApp/Discord) daily.

## Product Purpose

Monochrome is a self-hosted music streaming web app (PocketBase + Go SpotiFLAC importer fork of monochrome.tf). This fork adds a social layer on top of the shared library: presence ("what everyone is listening to"), direct messages with music sharing, group chats, a follower graph, an instance-wide feed of posts, and listening parties. Success = the instance feels like a private club for the members' music life, not a generic chat bolted onto a player.

## Positioning

The only music player where the library, the player, and the social graph are the same self-hosted surface: you share the exact track/album/artist from the shared library, with a croppable audio snippet, inside the app you are already listening in.

## Operating Context

- Dev: `./monochrome dev` (Docker PocketBase :8090 + importer :8787, Vite :5173 with HMR). Prod: docker compose, nginx :3000.
- Auth: PocketBase email/password only (OAuth intentionally disabled in self-hosted mode).
- Small user counts (a handful to tens of members) — client-side aggregation over `getFullList` is acceptable.
- UI is design-reviewed via the impeccable hook after edits; lint via `bun run lint`.

## Capabilities and Constraints

- Social data lives in PocketBase collections: `social_profiles`, `social_presence`, `social_messages` (sender/recipient DMs, JSON `payload` for shared items, `read` flag). Realtime via PocketBase subscriptions with 15s polling fallback.
- Presence: 90s active window, heartbeat every 30s, progress every 15s.
- Vanilla JS (no framework), one `index.html` + hand-written CSS (`styles.css`, `player-refined.css`, `now-playing-panel.css`), Vite build with PurgeCSS (fragile safelist — do not remove).
- Icons: `<use svg="!lucide/x.svg" size="n">` in index.html (build-time transform); in JS-rendered markup use `import ICON from '!lucide/x.svg?svg&icon'` (function `(size, attrs) => svg string`).
- Theming: CSS custom properties per theme (`monochrome` default, dark, ocean, purple, …). All social UI must use tokens (`--card`, `--border`, `--muted-foreground`, `--highlight-rgb`, …) so every theme works.
- Confirmed decisions (updated 2026-08-25): feed lives as a tab inside the Social page; messaging, sharing, and group creation require a mutual friendship (both people follow each other); the feed has a followed-people stream first and a non-duplicating instance stream below; reposting is not part of the product; demo/seed content on the dev PocketBase is allowed for design verification.
- No calls feature — mute and messaging features must not introduce call UI.
