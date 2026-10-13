---
version: 1
slug: 'listening-stats'
primary_target: 'js/listening-stats.js'
related_targets: ['index.html', 'listening-stats.css', 'js/listening-stats-scene.js']
---

# Listening Stats

- Scope: `index.html#page-stats`, `js/listening-stats.js`, `js/listening-stats-scene.js`, and
  `listening-stats.css`.
- Mode: Operate. The user approved B Scene at
  `.impeccable/mocks/listening-stats-redesign/scene-b.png`; its `scene-b.json` records
  `approved: true`, seed `5d21f129`, and sample-data status.
- Primary job: let a signed-in listener choose a period, understand heard music, find favorites,
  replay tracks, inspect individual sessions, and export the record.
- This B Scene expression supersedes the earlier candidate 6 / seed `c0188367` Stats ledger.
  Social and Admin documentation retain their existing scope and authority.

## Direction Contract

The first body comment in `index.html` records this approved contract:

**THESIS:** Listening becomes a living stage built from the listener's music.

**OWN-WORLD:** Monochrome typography and native controls, artwork colors, spatial covers, precise motion.

**STORY:** Choose a period, feel its scale, explore activity, replay favorites and inspect history.

**FIRST VIEWPORT:** Oversize listening time beside an artwork fan, flowing into an integrated activity curve.

**FORM:** Immersive listening canvas, seed `5d21f129`; approved B Scene at
`.impeccable/mocks/listening-stats-redesign/scene-b.png`.

## Shipped Expression

Header and pill period/date controls lead into an open 44%/56% stage: giant heard-minute count and
comparison on the left, up to three actual top-track covers in a spatial fan with a thin elliptical
orbit on the right. Streams, artists, and active days support the headline; track/album/streak
counts form a quiet detail line. Covers are capped at 260px wide; the caption has a 14px top
margin on desktop and mobile to clear rotated artwork, names the most-played track, and offers replay.
The smooth colored SVG activity curve spans the scene's lower edge and switches Minutes/Streams.

Below, the 58%/42% analysis split places On repeat rankings on the left and rotation/hour panels
in the right rail. Tracks/Artists/Albums retains a semantic table. Full-width listening history
continues below with 30 sessions per page and explicit replay and pagination controls. Week is the
default; Day, Month, Year, and Lifetime preserve their aggregation and date navigation rules.
Export downloads JSON for the selected period.

`getVibrantColorFromImage` extracts colors from the actual fan covers, caches by image URL, and
resets colors on each render. Foreground and theme mixes provide fallbacks if canvas extraction is
unavailable. Extracted colors inform ambience, comparison, chart, rotation, and hour bars; neutral
theme tokens own text and controls. Names, percentages, chart details, and accessible labels retain
meaning beyond color. Generated mockup artwork is not a production asset.

The Stats container, capped at 1320px, controls reflow. At 900px analysis stacks and its rail becomes
two columns; at 560px the stage and rail become vertical, controls wrap, panels tighten, and
secondary ranking/history time metadata hides. The chart's ResizeObserver rebuilds its geometry
when crossing 560px: a 1000×240 desktop or 400×240 compact viewBox, displayed at 180px/210px high.
Pointer/tap/keyboard selection exposes a tooltip, selected dot, and polite live detail; arrows,
Home, and End navigate chart points. Identity, dates, counts, focus, and actions remain available.

Motion includes a finite 850ms count-up, staggered cover/row entrances, curve/donut/hour reveals,
mouse-only cover tilt, and hover/focus/press feedback. The soft 10s atmosphere loop runs while the
scene is in view; loading and refresh loops represent their active state. Quiet background updates
suppress count-up and entrances. Reduced motion disables scoped CSS motion, skips count-up and
tilt, and preserves static cover rotations.

All-stats and Year/Lifetime locks affect every account, including administrators, and restrict
reads/exports while collection continues. Empty, loading, retryable-error, and locked states use
explanatory copy. A stream qualifies after 30 seconds of heard audio, with pauses and seeks excluded;
collection starts with new sessions instead of reconstructing earlier device history. Backend policy
and the existing app shell, queue, and Now Playing stay outside this visual redesign boundary.

## Quality Bar and Evidence

The binding visual criteria are recorded in
`.impeccable/mocks/listening-stats-redesign/quality-bar.md`: open number/artwork stage, actual covers
and extracted atmosphere, integrated smooth curve, denser rankings plus rail, operable controls,
responsive geometry, and reduced-motion equivalent.

Current scene capture paths:

- Desktop stage: `.impeccable/screenshots/listening-stats-scene-desktop-caption-final.jpg`.
- Desktop ledgers: `.impeccable/screenshots/listening-stats-scene-desktop-ledgers.jpg`.
- Mobile caption clearance: `.impeccable/screenshots/listening-stats-scene-mobile-caption.jpg`.
- Mobile scene: `.impeccable/screenshots/listening-stats-scene-mobile.jpg`.
- Mobile ledgers: `.impeccable/screenshots/listening-stats-scene-mobile-ledgers.jpg`.

These local preview captures use demonstration sessions and real imported cover art; their values
are verification data, not production metrics or design tokens. Source and scoped CSS establish the
implemented details. The captures may be refreshed after final fixes; older neutral-ledger and
light-theme captures do not prove B Scene's final appearance.
