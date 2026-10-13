# Listening Stats

Issue #17 adds `/stats` and the Listening stats navigation destination. The former Recent sidebar visibility and ordering preferences are retained.

## What is available

- Day, calendar week (Monday–Sunday), month, year and lifetime, with previous/next periods and a native date picker.
- Heard minutes, streams, distinct tracks/artists/albums, active days and longest streak in the selected period. Previous-period comparisons use calendar boundaries.
- An interactive activity chart (minutes or streams), artist listening-time distribution and hourly listening habits. Chart points support pointer, touch and arrow keys. Appearance animations respect reduced motion and do not replay on background refresh.
- The top 100 tracks, artists and albums, ranked by streams with listening time as tie-breaker; library navigation and track playback.
- History includes each qualified playback session, including repeats, with 30 entries per page. JSON export includes the full selected-period rankings and history.
- Loading, disconnected, signed-out, empty and locked states. Data refreshes after stream sync, every 30 seconds while visible and when the instance policy changes.

## Stream accounting

A music playback session becomes **one stream after at least 30 seconds of actual heard audio**, including if playback has not ended. A seek contributes no time; pauses do not end the session. Playback speed is accounted for: 30 seconds of media at 2× contributes 15 seconds of listening. Restarting/repeating a track creates a new session. Podcasts and videos are excluded.

The existing player events feed `ListeningTracker`, which sends cumulative checkpoints at the threshold, every 15 seconds, on pause and on finalization. Checkpoints have a per-session UUID and UTC-minute listening intervals. A tab identifier prevents a second tab from finalizing another tab's active checkpoint. On reload, the original tab can finish its interrupted checkpoint.

`ListeningOutbox` stores each pending session under its own account/session localStorage key. Separate tabs cannot overwrite one shared queue document. Requests use the current authenticated account, never a supplied user ID. Unsent sessions remain isolated by account and retry on reconnect. Pending sessions expire after 31 days; clearing browser storage also clears unsent data.

The server validates finite timestamps, the elapsed-time ceiling, minute boundaries, cumulative interval consistency, immutable session identity and nondecreasing checkpoints. Qualified status and global track totals update in one PocketBase transaction. Retries, simultaneous requests, stale checkpoints and duplicate finalization do not increment a stream twice. The new totals are used by album tracklist play counters across Monochrome.

Stats include only sessions meeting the threshold, including their full heard duration. Sessions crossing midnight split listening minutes into their matching days/hours; the stream itself belongs to the session's start. Browser timezone transitions preserve historical local hours and daylight-saving calendar boundaries. Co-credited artists each receive the track's full listening time; the artist distribution uses the sum of credited artist seconds as its denominator.

Existing local history and legacy recommendation play counts cannot reliably establish heard duration or precise timestamps. They are **not backfilled** into the new server statistics.

## PocketBase and admin policy

Migration: `pb_migrations/1719202600_listening_stats.js`.

- `listening_sessions`: private raw sessions, user relation with cascade delete, unique `(user, session_id)`, indexed account/start time. All direct record API access is locked.
- `listening_totals`: instance-wide per-track stream totals. Active users can read them; direct writes are locked.
- `app_config.stats_lock_long_term`: locks Year and Lifetime. Existing `feature_stats=false` locks the entire statistics surface.

Endpoints implemented by `pb_hooks/listening.pb.js` and `listening-service.cjs`:

- `POST /api/monochrome/listening/sessions`: requires an active account; continues recording while statistics are locked.
- `GET /api/monochrome/listening/stats`: returns only the authenticated user's period-scoped aggregates and history; `Cache-Control: no-store`. The server checks both locks before reading data. Export uses this same gate.

**Both locks apply to regular administrators too.** An administrator can change policy in Admin → Features, but cannot bypass a lock simply by opening another URL. PocketBase superusers retain database administration access as with every collection. The shorter allowed periods remain available during the Year/Lifetime lock.

For deployment, ship the frontend, migration and complete `pb_hooks` directory together. Restart PocketBase to load the migration/hooks, then serve the new frontend. No importer changes or historical data import are required.

## Validation

```sh
HEADLESS=true bun run test --run js/tests/listening-tracker.test.js js/recommendation-infrastructure.test.js
node --test scripts/test-listening-model.mjs scripts/test-feature-foundations.mjs
PB_TEST_BINARY=/path/to/pocketbase-0.30 node --test scripts/test-listening-stats.mjs
bun run build
```

The PocketBase integration test creates and removes an isolated database. It exercises the threshold, simultaneous retries, duration updates, account isolation, authorization, forged timestamps, stale checkpoints, global totals and both locks (including administrator and export access). Unit coverage includes midnight, calendar rollover, DST, playback speed, seek/pause, recovery and multiple tabs.

UI verification uses isolated development fixtures, not production listening history. Desktop/mobile/light screenshots and interaction evidence are in `.impeccable/screenshots/listening-stats-*`. Design finish review: all five material findings resolved; disposition `ship`.
