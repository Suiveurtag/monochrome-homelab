# Listening Stats redesign — composition study

Status: three generated compositions in progress; implementation approval pending.

## Confirmed brief

- Replace the standard Stats presentation with an expressive, living music surface.
- Preserve real period controls, statistics, ranking, history, export, locks and accessibility.
- Use album-cover colors in both atmosphere and charts, as explicitly confirmed by the user.
- Carry the app's login, Now Playing and queue craft into this surface; ArtCraft is a spatial-media reference.
- Add motion to every interactive state and component, with a complete reduced-motion alternative.
- Keep the vanilla JS stack and the surrounding application shell.

## Structural candidates (ordered before committing the assignment)

1. Centered listening constellation: the key listening measure anchors orbital favorites.
2. Timeline explorer: periods occupy a horizontal listening journey with contextual favorites.
3. Favorite shelf: ranked artwork leads, with statistical analysis beneath.
4. Listening atlas: a large activity plot coordinates a smaller artwork/distribution rail.
5. Immersive listening canvas: oversize listening time and spatial artworks share a continuous stage; analysis flows into its lower edge.
6. Sequential listening story: time, music, habits and history unfold as distinct chapters.
7. Comparative music mosaic: favorite entities form a quantity-weighted composition beside time analysis.

Assigned and accepted: candidate 5, surface seed `5d21f129`, Operate mode.
The three comps vary the canvas topology: constellation, split stage, horizontal ribbon.
The user may select, combine, ask for another composition, or delegate the choice.

## Shared visual world

Inherited app theme, readable sans-serif UI, bold oversize numeric silhouette, spatial square artwork,
subtle cover-derived color, generous stage spacing, rounded analysis surfaces and precise controls.
The old Stats one-ink addendum is evidence of the discarded local presentation, not a restriction
on the newly authorized cover-color treatment. Social and Admin boundaries remain intact.

## Motion inventory for implementation

- Stage: orchestrated text/number/artwork arrival, bounded artwork drift, pointer-driven depth and light.
- Values: formatted count-up on deliberate period changes, quiet background refreshes.
- Controls: moving selection indicator, hover/focus/press response, disabled and loading transitions.
- Activity: smooth trace reveal, changing series, animated inspection marker and tooltip.
- Rotation: traced segments and synchronized artwork/legend focus.
- Rankings: cover lift, staggered rows, play feedback and tab transitions.
- Habits: growing hour bars, hover/focus emphasis, readable peak detail.
- History: row entrance, time markers, pagination transitions.
- Empty/locked/error: composed icon/state entry and retry feedback.
- Lifecycle: cancel stale animations, pause expensive effects offscreen and on hidden/inactive pages.
- Access: keyboard parity, visible focus, reduced-motion layout with all content already visible.

## References inspected

- https://getartcraft.com/ — spatial media orbit, large typographic anchor, deliberately sparse framing.
- https://reactbits.dev/components/tilted-card — pointer-responsive artwork perspective.
- https://reactbits.dev/backgrounds/aurora — responsive flowing ambient motion.
- https://reactbits.dev/text-animations/count-up — formatted animated measurements.
- `styles.css` login access-card/dot-field and `now-playing-panel.css` artwork-derived atmosphere.

Comps use explicitly labelled sample data. They do not seed or alter the user's listening history.

Approved: user selected design B (Scene). Implement scene-b.png; native artwork, real data, scoped Stats replacement.
