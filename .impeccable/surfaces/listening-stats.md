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
counts form a quiet detail line. The fan uses `clamp(250px, 28cqi, 330px)` height, with each cover
capped at the smaller of 230px and 72% of fan height. The caption has an 18px top margin on desktop
and mobile to clear rotated artwork, names the most-played track, and offers replay.
The smooth colored SVG activity curve overlaps the scene's lower edge by 12px and switches
Minutes/Streams through a small floating pill. Its heading remains accessible but visually hidden.
Curve bloom and interpolated musical stems respond to stage exploration without adding data.

Below, the 58%/42% analysis split places On repeat rankings on the left and rotation/hour panels
in the right rail. Tracks/Artists/Albums retains a semantic table. Full-width listening history
continues below with 30 sessions per page and explicit replay and pagination controls. Week is the
default; Day, Month, Year, and Lifetime preserve their aggregation and date navigation rules.
Export downloads JSON for the selected period.

`getVibrantColorFromImage` extracts colors from the actual fan covers, caches by image URL, and
resets colors on each render. The cache is bounded to 64 items and reused before paint; extracted
color mixes at 70% with foreground in OKLab. Foreground and theme mixes provide fallbacks if canvas
extraction is unavailable. Actual cover images also supply a blurred light field, at 0.2 opacity
while idle and 0.43 with scene hover/focus. This carries the selected quiet-idle, enhanced-interaction
behavior within the existing B direction. Extracted colors inform ambience, comparison, chart,
rotation, and hour bars; neutral theme tokens own text and controls. Analysis panels use an artwork-tinted card gradient, fine
top-edge highlight, and hover/focus border response. Names, percentages, chart details, and
accessible labels retain meaning beyond color. Generated mockup artwork is not a production asset.

The Stats container, capped at 1320px, controls reflow. At 900px analysis stacks and its rail becomes
two columns; at 560px the stage and rail become vertical, controls wrap, panels tighten, and
secondary ranking/history time metadata hides. The phone fan is 245px high; the curve has a 22px
top gap to clear its units and artwork caption. The chart's ResizeObserver rebuilds its geometry
when crossing 560px: a 1000×160 desktop or 400×240 compact viewBox, displayed at 130px/210px high.
Pointer/tap/keyboard selection exposes a tooltip, selected dot, and polite live detail; arrows,
Home, and End navigate chart points. Identity, dates, counts, focus, and actions remain available.

Entry is a coordinated phrase, replayed on each tab visit. Header and toolbar respond immediately
with cancelable 420ms Web Animations (55ms toolbar delay), independently of the data request.
When data arrives, a 760ms count and lateral number arrival anchor the stage; covers unfold from
a compact inward offset at 640ms with 40ms + 60ms per-cover delay. Artwork light appears over
760ms. The orbit draws from 180–800ms; the curve/area/bloom follows from 160–760ms. Supporting
metrics arrive from 160ms and panels from 240ms. The orbit's animation-end clears the entry class,
leaving no extra transforms or entry delays on later interactions. Returning with retained data
still replays this entry; ordinary period changes interpolate from the painted count over 450ms
and retain their shorter content transition. Quiet updates never replay the entrance.
Finite 380ms first-intersection arrivals for headers and ledger/legend items use a 24ms stagger,
capped at 168ms. Graph/ring/hour reveals pause until their section is in view. Mouse-only tilt
and CSS pointer reflections, cover lift/replay, panel-edge response, and artwork color links give
hover/focus richer feedback. The foreground orbit trace runs its 12s loop only while the artwork is
hovered or the scene holds focus and remains in view. Idle artwork stays still.

The soft 10s atmosphere loop runs while the scene is in view; loading and refresh loops represent
their active state. Document visibility pauses scoped CSS animations, and count-up settles on the
final value when hidden. Quiet background updates suppress count-up, entrances, and intersection
arrivals. Reduced motion disables scoped CSS motion, skips count-up and tilt, cancels chrome and intersection
Web Animations, clears the entry state, and preserves static cover rotations.

All-stats and Year/Lifetime locks affect every account, including administrators, and restrict
reads/exports while collection continues. Empty, loading, retryable-error, and locked states use
explanatory copy. A stream qualifies after 30 seconds of heard audio, with pauses and seeks excluded;
collection starts with new sessions instead of reconstructing earlier device history. Backend policy
and the existing app shell, queue, and Now Playing stay outside this visual redesign boundary.

## Quality Bar and Evidence

The user requested amplification of the existing approved B scene, with quiet idle light and richer
hover/focus animation, then explicitly asked for the curve to integrate into the stage as in B.
No new direction, generated cover assets, or changes to Social/Admin were introduced.

The binding visual criteria are recorded in
`.impeccable/mocks/listening-stats-redesign/quality-bar.md`: open number/artwork stage, actual covers
and extracted atmosphere, integrated smooth curve, denser rankings plus rail, operable controls,
responsive geometry, and reduced-motion equivalent.

Current scene capture paths:

- Entry settled desktop: `.impeccable/screenshots/listening-stats-entry-desktop.jpg`.
- Entry settled mobile: `.impeccable/screenshots/listening-stats-entry-mobile.jpg`.
- Desktop idle stage: `.impeccable/screenshots/listening-stats-magic-desktop.jpg`.
- Desktop hover/focus response: `.impeccable/screenshots/listening-stats-magic-active.jpg`.
- Mobile stack: `.impeccable/screenshots/listening-stats-magic-mobile.jpg`.

These local preview captures use demonstration sessions and two real imported cover artworks in
a disposable PocketBase development database; their values are verification data, not production
metrics or design tokens. Source and scoped CSS establish the implemented details. These images
establish composition and interaction states; source and runtime checks are needed for animation
timing and visibility behavior. Earlier neutral-ledger, scene-caption, and light-theme
captures do not establish this amplified expression.

## Navigation polish

Closer B density: compact cover fan, 1000×160 /130px desktop activity curve (400×240 /210px mobile), musical stems from the same curve. Rounded arc ring keeps a count-only center and cap-aware tiny segments. Sliding selector 280ms, cancelable content/date transition320ms, numeric interpolation450ms from the currently painted value. Existing scene remains dim/inert during navigation; quiet updates neither supersede navigation nor redraw unchanged data. Pointer writes are RAF-batched and palette cache bounded to64.
