# Architecture

This document describes the current Monochrome architecture as a refactor map. It should stay close to source truth and call out implicit contracts that future behavior-preserving work must protect.

## Overview

Monochrome is a Vite app with a large static HTML shell, a mostly JS/TS frontend, Cloudflare Pages Functions, and Capacitor native shells.

- `index.html` contains the main app shell, route page containers, modals, settings UI, audio/video elements, and player controls.
- `styles.css` contains global styles and most UI styling.
- `/js/app.js` is the browser entrypoint and bootstrap coordinator.
- `/js/ui.js` renders most pages and dynamic UI.
- `/js/settings.js` wires the settings screen and settings-related interactions.
- `/functions` contains Cloudflare Pages Functions used for page/data routes.
- `/android`, `/ios`, and `capacitor.config.ts` support native mobile builds.

The current architecture is intentionally practical rather than cleanly layered. Large modules often combine rendering, event wiring, state reads, and side effects. Refactor work should reduce coupling gradually while keeping public behavior stable.

## Audit Snapshot

The 2026-05-24 technical audit observed these current boundaries:

- The active browser auth client is Better Auth, loaded from `https://esm.sh/better-auth/client` through `js/accounts/config.js`.
- PocketBase is the cloud data store for user sync, profiles, public playlists, theme store authorship, and listening parties.
- Appwrite remains present in dependencies, settings UI, Vite env injection, and deployment docs, but no active frontend import of the Appwrite SDK was observed. Treat it as legacy/residual until an explicit migration decision is made.
- Music metadata is primarily resolved through the HiFi/TIDAL stack, while production audio playback resolves stream URLs through Qobuz instances by ISRC for normal audio tracks. Dev mode and videos follow separate paths.
- The player combines queue state, media element switching, Shaka/DASH, HLS video, replay gain, preloading, Media Session, Android foreground service integration, radio/autoplay, and Safari/iOS behavior.
- Deployment currently combines Vite build plugins, Cloudflare Pages Functions, Docker/Nginx static serving, optional Docker PocketBase, and Capacitor native shells.

## Self-Hosted Contract Map

This map captures the current contracts that the self-hosted roadmap must preserve or intentionally migrate.

Track sources:

- External catalog tracks are still the default path. They use `source.kind === "external"`, usually `provider: "tidal"`, keep `track.id` as the playback and route identifier, and resolve normal production audio through TIDAL/HiFi metadata plus Qobuz-by-ISRC stream lookup.
- Browser-local tracks are metadata snapshots for files selected in the browser. They use `source.kind === "browser-local"` and may retain live `File`/`Blob` handles only in the current browser session, so cloud sync cannot make them portable.
- Prototype uploaded tracks use `source.kind === "server-local"`, `track.id === uploadId`, `trackKey === v1:server-local:none:<uploadId>`, and `playback.mode === "remote-url"` with tokenized `/uploads/:id/stream` URLs.
- Future production filesystem library tracks can use `source.kind === "server-library"` once a stable self-hosted backend exists. This is additive and does not migrate the current `server-local` prototype.
- `server-upload` remains accepted by `js/track-model.ts` and tests as a compatibility source kind for earlier planned upload data; new local filesystem uploads should use `server-local` until a later checkpoint migrates the model.
- Podcasts and tracker tracks remain source-aware through `source.kind === "podcast"` and `source.kind === "tracker"` and should continue to bypass normal TIDAL/Qobuz stream assumptions.
- Future dedicated radio and YouTube association flows can use `source.kind === "radio"` and `source.kind === "youtube-video"` when they need persisted playable identities.

Auth and account boundary:

- Better Auth is the browser session authority through `js/accounts/auth.js` and `js/accounts/config.js`.
- `authManager` normalizes Better Auth users to expose legacy `$id`; existing sync, profile, listening-party, and upload code depend on that shape.
- `js/auth-gate.js` defines the client-side mandatory-auth boundary for self-hosted deployments. When `window.__MONOCHROME_AUTH_REQUIRED__ === true`, signed-out app routes redirect to `/account`, while auth/reset routes remain accessible.
- `js/auth-gate.js` also exports `shouldUseSelfHostedServices()` as the frontend migration boundary for self-hosted-only services. Today it is intentionally equivalent to mandatory self-hosted auth, so default/public deployments keep PocketBase-backed profile/social behavior and do not opportunistically call the local self-hosted backend.
- `vite-plugin-auth-gate.js` injects `window.__MONOCHROME_AUTH_REQUIRED__` only when `MONOCHROME_AUTH_REQUIRED` is explicitly present in the Vite environment, so the public/default app remains unchanged unless configured.
- `server/selfhosted/accounts.mjs` defines self-hosted account approval states: `pending`, `approved`, `rejected`, and `disabled`. The first account, or `MONOCHROME_BOOTSTRAP_ADMIN_USER_ID` when configured, is bootstrapped as an approved admin; later accounts default to pending while approval is required.
- The self-hosted backend exposes `/api/accounts/me`, `/api/admin/accounts`, and `/api/admin/accounts/:userId` for account state checks and admin account updates. `js/selfhosted-admin.js` is the browser client for this boundary and renders the Account page admin panel only for approved admin accounts.
- A localhost-only dev session exists behind `monochrome-dev-auth` and the account-page test button. It is a development fallback, not a production auth model.
- PocketBase remains the cloud profile/sync/public playlist boundary. User records live in `DB_users`, keyed by legacy `firebase_id` values that currently receive Better Auth user ids.
- Appwrite remains legacy/residual configuration and settings surface only. It is not an active frontend auth or sync boundary and should not be removed without a dedicated migration decision.

Storage boundary:

- IndexedDB `MonochromeDB` is currently version `12`; store names, key paths, indexes, and persisted shapes are compatibility contracts.
- Legacy stores such as `favorites_tracks`, `history_tracks`, and `user_playlists` remain authoritative for existing data and sync compatibility.
- Hybrid stores `track_catalog`, `track_metadata_overrides`, and `favorites_track_refs` add source-aware identity without replacing legacy stores.
- `localStorage` keys owned by `js/storage.js` and direct call sites remain compatibility contracts, especially API instances, playback settings, auth overrides, sidebar state, search history, and PWA settings.

Local upload boundary:

- `server/uploads/server.mjs` is a separate Node prototype server, not a Cloudflare Pages Function or final production storage layer.
- Upload/list/search endpoints require `x-monochrome-user-id`; stream endpoints use per-track tokens because media elements cannot send custom auth headers.
- New uploads are stored through `server/storage/filesystem-library.mjs` under a structured local filesystem layout: sharded audio blobs in `audio/`, JSON track metadata in `metadata/tracks/`, per-user indexes in `indexes/users/`, token lookup indexes in `indexes/streams/`, plus reserved `artwork/` and `tmp/` directories.
- Uploaded music search is exposed through `/uploads/search` and currently performs a bounded per-user scan over structured metadata plus legacy manifest fallback data. It normalizes case, accents, underscores, and hyphens across title, artist, album, original filename, and available tags.
- New structured uploads run server-side TagLib extraction before metadata JSON is written. Embedded title, artist, album, year, duration, and genre are used as upload defaults when available, and embedded artwork is stored under `artwork/` and served through tokenized `/uploads/:id/artwork` URLs when TagLib exposes picture data.
- Structured uploaded tracks can be edited through `/uploads/:id/metadata` by a signed-in user whose upload index contains that track. Edited server metadata is written back to the track metadata JSON and takes precedence over filename-derived and embedded defaults for title, artist, album, year, artwork URL, and tags.
- The storage root remains configurable through `MONOCHROME_UPLOAD_STORAGE`. The previous `.storage/server-uploads/<hashed-user-id>/manifest.json` prototype shape is still readable as a legacy fallback, but new writes use the structured layout.
- Default metadata is still filename-derived on upload: title, unknown artist, unknown duration, default artwork. Rich metadata extraction, artwork file storage, metadata edit history, and moderation remain future work.

Favorites and playlists:

- Favorites write both legacy `favorites_tracks` snapshots and source-aware `favorites_track_refs` when object tracks expose `trackKey`.
- Favorite reads must keep legacy id fallback because many UI paths still pass only an id string.
- Playlists preserve object tracks with `trackKey`/`source` when available, dedupe/remove by `trackKey`, and fall back to legacy `id`.
- PocketBase sync may carry uploaded-track metadata snapshots and local stream URLs, but it does not sync uploaded audio files.

Social state:

- Profiles, public playlists, and theme store authorship currently use PocketBase-backed flows.
- Self-hosted public profiles now have a JSON-backed fallback under the self-hosted data directory. `/api/profiles/me` lets approved users read/update their profile, and `/api/profiles/:username` lets approved users view other approved users' public profile data.
- `js/selfhosted-profiles.js` is the frontend client for the self-hosted profile endpoints. The existing `js/profile.js` page keeps PocketBase as the primary profile source and falls back to self-hosted profiles only when `shouldUseSelfHostedServices()` is true and PocketBase data is unavailable.
- Self-hosted invitations are JSON-backed account-scoped contact records. Accepted invitations are the current contact boundary for chat and joining self-hosted listening parties.
- Self-hosted 1:1 chat is JSON-backed and requires approved accounts plus an accepted contact relationship.
- Listening parties keep the existing PocketBase-backed flow for default/public app behavior. When mandatory self-hosted auth is enabled, `js/listening-party.js` uses the self-hosted backend instead: approved hosts create JSON-backed rooms, accepted contacts can join, host playback updates are polled by guests, and direct-audio uploaded/radio tracks keep their stream URLs for playback.
- There is no self-hosted notification store or realtime push infrastructure yet.

Known limits:

- The self-hosted backend is a minimal Node server, not yet a complete production deployment bundle. The local upload prototype still runs as a separate server and has not been merged into the self-hosted backend.
- Uploaded audio storage is local and non-portable across users or devices unless the same server and tokenized stream URL remain available.
- Full lint still has broader pre-existing `js/app.js` debt outside the upload work.
- Localhost development can show expected remote auth/API CORS failures and existing Shaka warnings unrelated to upload storage.

## Runtime Startup Flow

At runtime:

1. `index.html` loads `/styles.css` and `/js/app.js`.
2. `app.js` waits for `DOMContentLoaded`.
3. Settings initialization waits on `modernSettings`.
4. Persistent storage is requested best-effort through the browser storage API.
5. Dev-only globals are attached to `window.monochrome`.
6. Analytics, theme store, commit metadata, HiFi client, music API, player, casting, UI renderer, settings, events, router, PWA update flow, and other interactions are initialized.
7. The router maps the current path to page rendering methods on the UI renderer.

This startup sequence is behavior-sensitive. When extracting it, preserve ordering unless a test or explicit investigation proves the order is irrelevant.

## Frontend Subsystems

Routing:

- `js/router.js` maps paths to UI renderer methods.
- Supports routes such as `home`, `search`, `album`, `artist`, `playlist`, `userplaylist`, `folder`, `mix`, `track`, `library`, `recent`, `unreleased`, `podcasts`, `settings`, account/profile pages, and static pages.
- Provider-prefixed IDs such as `/track/t/:id`, `/album/t/:id`, `/artist/t/:id`, and `/playlist/t/:id` are compatibility contracts.
- Several modules outside the router still parse `window.location.pathname` directly. Route refactors must account for those call sites, not only `js/router.js`.

UI rendering:

- `js/ui.js` owns most page rendering, list/card rendering, fullscreen cover UI, dynamic color behavior, visualizer UI, and many page-specific interactions.
- It relies heavily on DOM IDs/classes from `index.html`.
- The main static DOM anchors include page containers, sidebar navigation, header search/account controls, modals, side panel, fullscreen cover, player bar, and settings controls.

Application wiring:

- `js/app.js` combines bootstrapping, many event listeners, modal logic, routing setup, local media folder scanning, PWA update UI, and feature initialization.

Settings:

- `js/settings.js` wires the settings UI and reads/writes many setting managers from `js/storage.js`.
- Settings are broad: appearance, audio, downloads, integrations, instances, system, keyboard shortcuts, content blocking, visualizer, and equalizer behavior.

Playback:

- `js/player.js` owns playback state, queue, media elements, quality handling, gapless/adaptive behavior, radio/autoplay, and Media Session integration.
- It coordinates with `js/audio-context.js`, `js/events.js`, `js/ui.js`, storage managers, and API modules.
- Playback chooses among local files, podcasts, tracker audio, normal audio streams, and videos. It switches between the main audio element and `#video-player`.
- Shaka handles DASH/MPD playback, HLS.js handles HLS video when needed, and Media Session state is also bridged to the Capacitor Android foreground audio service.

Sidebar and panels:

- Sidebar structure lives in `index.html`; collapse and section visibility/order are persisted by `sidebarSettings` and `sidebarSectionSettings` in `js/storage.js`.
- Pinned sidebar items are stored in IndexedDB `pinned_items` and rendered by `UIRenderer.renderPinnedItems()`.
- Queue and lyrics use `js/side-panel.js`; side panel width is persisted in `localStorage` under `side-panel-width`.

Persistence:

- `js/storage.js` provides localStorage-backed managers for app settings and UI preferences.
- `js/db.js` provides IndexedDB-backed favorites, history, playlists, folders, pinned items, and settings.
- `js/db.js` also dispatches behavior-significant events such as `favorites-changed`, `playlist-tracks-changed`, and `sync-playlist-change`.

API and media:

- `js/api.js`, `js/music-api.js`, and `js/HiFi.ts` handle provider access, API instance selection, caching, stream preparation, manifests, and media data shaping.
- `js/container-classes.ts` defines track/album/playback-related classes used by the API layer.
- `js/track-model.ts` defines the additive hybrid track identity contract. `track.id` remains the playback/route compatibility identifier, while `trackKey` and `source` identify persisted tracks across external APIs, browser-local files, podcasts, tracker tracks, and future server uploads.
- `js/server-library.js` is the frontend boundary for self-hosted library operations: list, search, upload, metadata update placeholder, stream URL, and artwork URL helpers. It currently delegates to the local upload prototype.
- `js/server-uploads.js` is the browser client for the local upload prototype. It requires the current Better Auth user id, calls the local upload server, and normalizes returned tracks through `withTrackIdentity`.
- Library > Uploaded Music is the dedicated UI surface for server-local uploads. It lists uploaded tracks through `js/server-library.js`, sends non-empty search queries to server-side upload search, provides upload/refresh/search controls, offers context-menu metadata editing for server-local tracks, and reuses the standard track-list rendering so play, favorite, and playlist actions follow existing track behavior. Library > Local Files remains reserved for browser-selected folders.
- `js/selfhosted-radios.js` is the browser client for self-hosted radios. It calls the self-hosted backend with the normalized Better Auth user id headers and normalizes enabled radio entries into hybrid tracks with `source.kind === "radio"` and direct stream URLs.
- Library > Radio lists self-hosted radio stations, filters them locally, lets approved users add new station entries through `/api/radios`, and reuses the standard track-list click path so radio playback goes through the existing direct-audio player behavior.
- `js/youtube-clips.js` normalizes YouTube clip URLs/IDs and resolves associated clips for song UI. `server-local` uploaded tracks persist shared clip associations through the existing `/uploads/:id/metadata` path as `youtubeVideoId`, `youtubeClipUrl`, and `youtubeClip`; external tracks currently use a browser-local `localStorage` map keyed by source-aware `trackKey`.
- Associated YouTube clips are displayed as embeds and external YouTube links in Track info and on the Track page. They do not replace or interrupt the existing audio playback path.
- `js/selfhosted-admin.js` is the browser client and renderer for self-hosted account approval/admin operations. It calls the self-hosted backend with the normalized Better Auth user id headers and treats the backend as the authorization authority.
- `js/selfhosted-profiles.js` calls the self-hosted profile API with the same Better Auth user headers. It is used as a compatibility fallback by `js/profile.js` so existing `/user/@:username` profile routes can render self-hosted profile data without replacing PocketBase-backed profiles.
- `js/selfhosted-shares.js` calls the self-hosted share API with the same Better Auth user headers. The track context menu can create stable internal `/share/:id` links for tracks and playlists, and `js/router.js` routes those links to `UIRenderer.renderSharePage()`.
- `/share/:id` loads a stored share snapshot, shows a shared music page, and can open the canonical app route when one is portable or play the shared snapshot directly for server-local uploads and playlist snapshots.
- `js/selfhosted-invitations.js` calls the self-hosted invitations API with the same Better Auth user headers. The profile page can send a contact invitation with the Connect button, and the Account page invitations panel lists incoming/outgoing invitations and lets recipients accept or reject pending requests.
- `server/selfhosted/parties.mjs` is the JSON-backed self-hosted listening-party store. It persists rooms, members, chat messages, song requests, and host playback state under the self-hosted data directory. Party endpoints require approved accounts; non-host joins and reads require an accepted invitation/contact relationship with the host; playback mutations are host-only.
- `js/listening-party.js` keeps PocketBase listening parties as the default path, but switches to `/api/parties` when `MONOCHROME_AUTH_REQUIRED=true`. The first self-hosted implementation uses conservative polling rather than websockets/realtime push.
- `MusicAPI` is the app-facing facade. It currently routes most calls to `LosslessAPI`/TIDAL and podcast calls to `PodcastsAPI`.
- `LosslessAPI.fetchWithRetry()` tries native `HiFiClient` routes for non-streaming requests, falls back to configured HiFi API instances, and uses configured streaming/Qobuz instances where appropriate.
- `LosslessAPI.getStreamUrl()` resolves normal production audio through Qobuz by TIDAL ISRC. If no ISRC or Qobuz stream is available, playback reports a missing audio source.

Downloads and metadata:

- `js/downloads.js`, `js/download-utils.ts`, `js/metadata*.js`, `js/ffmpeg*`, `js/hls-downloader.js`, and `js/dash-downloader.ts` support downloads, transcoding/post-processing, and metadata embedding.

Other feature areas:

- `js/lyrics.js`: lyrics lookup, sync, panel, and fullscreen rendering.
- `js/visualizer.js` and `js/visualizers/`: visualizer orchestration and presets.
- `js/accounts/`: auth and sync integrations.
- `js/listening-party.js`: listening party UI and behavior.
- `js/*scrobbler*`, `js/lastfm.js`, `js/listenbrainz.js`, `js/librefm.js`, `js/maloja.js`: listening tracking and scrobbling integrations.
- `js/themeStore.js`: community theme handling.

## Persistence Contracts

IndexedDB:

- Database name: `MonochromeDB`.
- Current version observed: `12`.
- Stores include `favorites_tracks`, `favorites_videos`, `favorites_albums`, `favorites_artists`, `favorites_playlists`, `favorites_mixes`, `history_tracks`, `user_playlists`, `user_folders`, `settings`, and `pinned_items`.
- Hybrid music stores include `track_catalog`, `track_metadata_overrides`, and `favorites_track_refs`.
- Key paths are part of the contract: most favorites use `id`, favorite playlists use `uuid`, history uses `timestamp`, user playlists/folders use `id`, and pinned items use `id`.
- Hybrid track snapshots use `trackKey`; favorites track refs also use `trackKey`.
- Store names, key paths, indexes, and persisted item shapes must be preserved unless a milestone includes an explicit migration plan.
- Playlist lazy migrations in `getPlaylists()` update `numberOfTracks` and image collage metadata during reads, so read paths can write.

localStorage:

- `js/storage.js` owns many string and JSON-backed setting keys.
- Other files also read/write selected keys directly, including playback quality, mute state, font choice, sidebar state, and HiFi tokens.
- Treat key names, default values, and serialized formats as compatibility contracts.
- High-risk key groups include API instances, theme/custom theme, scrobbling credentials, playback quality/adaptive quality, queue state, sidebar collapse/order/visibility, search history, playlist sort, local media folder settings, EQ profiles, content blocking, keyboard shortcuts, auth/PocketBase overrides, and PWA update settings.

PocketBase:

- Default cloud data URL observed in frontend sync is `https://data.samidy.xyz`, overrideable through `window.__POCKETBASE_URL__` or `monochrome-pocketbase-url`.
- User data is stored in collection `DB_users` keyed by legacy field `firebase_id`, which currently receives the Better Auth user id.
- Synced JSON fields include `library`, `history`, `user_playlists`, `user_folders`, `favorite_albums`, and profile/privacy fields.
- Public playlists live in `public_playlists` and duplicate title/cover fields for compatibility with older shapes.

Browser and PWA storage:

- The app requests persistent storage.
- Service worker registration and cache cleanup/update behavior are part of user-visible PWA behavior.

## External Boundaries

Music APIs:

- The app uses HiFi/TIDAL-related APIs, configurable HiFi worker instances, configurable Qobuz instances, TIDAL proxy wrapping, and a dev-mode API override.
- API instance selection, failover, dev mode, proxy wrapping, caching, and stream URL shape affect search, playback, downloads, and route previews.
- TIDAL app credentials are embedded in the HiFi client and in several Cloudflare Functions for bot metadata fallbacks.

Accounts and sync:

- Account flows currently rely on Better Auth for browser sessions and PocketBase for persisted user data.
- `authManager` normalizes Better Auth users to expose `$id` for legacy sync code.
- `syncManager` merges local IndexedDB data with cloud PocketBase data on sign-in, writes local merged data back through `db.importData(..., true)`, and dispatches refresh events.
- Appwrite settings and env injection still exist, but Appwrite is not the active auth client observed in source.

Cloudflare Pages Functions:

- `functions/` contains route handlers for metadata and public pages such as tracks, albums, artists, playlists, user playlists, podcasts, unreleased pages, and static route fallbacks.
- Many handlers fetch remote data and fall back to `env.ASSETS.fetch(...)`.
- Bot metadata functions duplicate portions of TIDAL/PocketBase lookup logic and sometimes hardcode default remote URLs.

Deployment:

- `vite.config.ts` defines Vite build, PWA, SVG-use, upload, blob asset, and auth-gate plugins.
- `vite-plugin-auth-gate.js` injects selected env-derived globals and provides preview-server auth gating when enabled.
- It also injects self-hosted and upload server URLs when configured, so a built homelab deployment can point browser clients at the public reverse-proxy origin instead of localhost defaults.
- Docker production builds with Bun and serves `dist/` through Nginx; Docker Compose can optionally run PocketBase via profile.
- `nginx.conf` serves static assets directly and falls back app routes to `index.html`.
- `scripts/install-ubuntu.sh` is the first Ubuntu 26.04 homelab installer. It copies the app to `/opt/monochrome`, writes `/etc/monochrome/monochrome.env`, builds `dist/`, creates `monochrome-selfhost.service` and `monochrome-uploads.service`, stores data under `/var/lib/monochrome`, and writes an Nginx site that serves static files while proxying `/api/`, `/health`, and `/uploads/`.
- `server/selfhosted/server.mjs` is the minimal self-hosted backend skeleton. It loads config/env values, prepares data directories, exposes `/health`, and reserves auth endpoint space with placeholder responses.
- `server/selfhosted/accounts.mjs` is the self-hosted account approval store. It writes JSON account state under the configured self-hosted data directory and is separate from the existing Better Auth/PocketBase browser boundaries.
- `server/selfhosted/radios.mjs` is the self-hosted radio store. It persists JSON radio entries under the self-hosted data directory with name, stream URL, genre, country, artwork URL, enabled status, creator, and timestamps. `/api/radios` lists enabled radios and lets approved users create radios; `/api/admin/radios` lets admins list disabled radios and update radio state/metadata.
- `server/selfhosted/profiles.mjs` is the self-hosted profile store. It persists JSON profile entries under the self-hosted data directory with username, display name, avatar URL, banner URL, about/bio, website, simple stats, public playlists, privacy flags, and timestamps. Profile reads and writes require an approved self-hosted account.
- `server/selfhosted/shares.mjs` is the self-hosted share store. It persists JSON share entries under the self-hosted data directory with a short share id, target type, title, canonical app href when available, minified track or playlist snapshots, creator user id, and timestamps. Share create/read endpoints require an approved self-hosted account.
- `server/selfhosted/invitations.mjs` is the self-hosted contact invitation store. It persists JSON invitation entries under the self-hosted data directory with sender, recipient, status, optional message, timestamps, and response time. Invitation create/list/respond endpoints require an approved self-hosted account; only the recipient can accept or reject an invitation.
- `server/selfhosted/messages.mjs` is the self-hosted 1:1 message store. It persists JSON message entries under the self-hosted data directory with sender, recipient, body, and creation time. Message list/send endpoints require approved accounts and an accepted invitation/contact relationship between the two users.
- `server/uploads/server.mjs` is a separate local Node dev server for the `server-local` upload prototype. It now delegates filesystem layout, atomic blob/metadata writes, per-user indexes, and token stream lookup to `server/storage/filesystem-library.mjs`.
- Frontend code should call `js/server-library.js` for self-hosted library behavior; `js/server-uploads.js` should remain the prototype transport adapter until the production backend replaces it.

Native shells:

- Capacitor config sets app id, app name, web output directory, and icon/splash colors.
- Android includes native audio-related Java code.
- Refactors in web playback or PWA behavior should consider mobile shell impact.

## Behavior Contracts

Preserve these during behavior-preserving refactors:

- Route paths and router fallback behavior.
- DOM selectors used by JavaScript and CSS.
- Browser event names and event detail shapes.
- Settings defaults and persistence formats.
- IndexedDB schema and localStorage keys.
- PocketBase collection names, legacy `firebase_id` mapping, and JSON field shapes.
- Media element setup and audio/video switching behavior.
- Queue, shuffle, repeat, autoplay/radio, and playback quality behavior.
- Search result normalization, TIDAL provider-prefixed IDs, Qobuz-by-ISRC stream resolution, and API fallback behavior.
- Hybrid track identity: keep `id` playable and source-specific persistence under `trackKey` plus `source`.
- Server-local uploads: keep `source.kind === "server-local"` for local filesystem uploads, keep `track.id` equal to the upload id, and route persisted identity through the existing hybrid helpers.
- Download output naming, metadata, lyrics inclusion, archive generation, and cancellation/progress behavior.
- Sidebar collapse/order/visibility, pinned item rendering, queue/lyrics side panel behavior, and search history behavior.
- PWA install/update/cache behavior.
- Cloudflare bot metadata routes and SPA fallback behavior.
- Mobile/iOS/Safari workarounds.

## Known Refactor Hotspots

High-risk large files:

- `js/ui.js`
- `js/settings.js`
- `js/app.js`
- `js/events.js`
- `js/player.js`
- `js/storage.js`
- `js/api.js`
- `js/db.js`
- `js/accounts/pocketbase.js`
- `js/accounts/auth.js`
- Cloudflare Functions under `functions/`

Likely safe direction:

- First add tests around behavior contracts.
- Clarify storage/auth/API contracts before moving code.
- Extract small pure helpers where possible.
- Move feature-specific UI/event wiring behind stable exported functions.
- Keep DOM selectors and public exports stable until a documented decision changes them.
