# Canvas and Spicy Lyrics Design QA

- Source visual truth: `docs/design-references/now-playing/now-playing-panel-canvas.mp4`
- Focused source frame: `docs/design-references/now-playing/spotify-nowplaying-topwbgvideo.png`
- Implementation URL: `http://127.0.0.1:5173/`
- Implementation screenshot: unavailable because the Codex Desktop browser connection could not be initialized
- Reference viewport: 1920 x 1080 at 1x density; focused panel crop approximately 420 x 860 CSS pixels
- Implementation viewport and density: not captured
- State: Canvas playing at the top of Now Playing, plus scrolled ambient-background states

## Full-view comparison evidence

The source video and focused 465 x 929 reference image were opened and inspected. They show a full-width, sharply rendered Canvas that remains visible through most of the artwork region, then progressively reveals the saturated, darkened dynamic background underneath. The lower sections use lightly tinted, softly blurred surfaces rather than an opaque shade over the video.

A browser-rendered implementation capture could not be produced, so a normalized side-by-side source-to-implementation comparison is unavailable. Build output and source inspection are not substitutes for that evidence.

## Focused-region comparison evidence

The source Canvas/background boundary, card surfaces, and scrolled background states were inspected at a focused panel crop. The implementation side of those regions could not be captured.

## Findings

- [P1] Browser-rendered visual evidence is missing.
    - Location: Now Playing panel Canvas, lyrics card, and scrolled states.
    - Evidence: the source reference is available, but there is no implementation screenshot at the same viewport and state.
    - Impact: crop, mask progression, real video sharpness, compositing, hover appearance, and responsive layout cannot be accepted from static code inspection alone.
    - Fix: capture the running panel with a Canvas-enabled track at 1920 x 1080, compare it beside the reference, then repeat for hover, scrolled, collapsed, expanded lyrics, failed Canvas, non-Canvas, and reduced-motion states.

## Required fidelity surfaces

- Fonts and typography: not visually verified in the implementation capture.
- Spacing and layout rhythm: source geometry inspected; implementation geometry not visually verified.
- Colors and visual tokens: upstream filter, tint, and blur values were ported; rendered color balance not visually verified.
- Image quality and asset fidelity: source crop and masking inspected; implementation sharpness and edge blending not visually verified.
- Copy and content: unchanged by this pass; not visually verified.
- Interaction and accessibility states: behavior is covered by focused tests, but hover, scrolling, responsive widths, and reduced motion lack rendered evidence.

## Comparison history

- Pass 1: replaced the custom Canvas and panel shade gradients with the current upstream Spicy Lyrics layered mask, Kawarp filtering, and 7%/6px surface treatment. No post-fix implementation capture was available.
- Pass 2: confined Canvas playback to Now Playing, changed the default Canvas viewport to a shorter crop that keeps lyrics visible, added a keyboard-accessible click-to-expand state, and removed the background transition reset on pause. Imported Apple word-timed lyrics now use semantic-token gaps so spacing cannot collapse between words. No post-fix implementation capture was available.
- Pass 3: added line-timed Apple lyric tokenization for “Desire Be Desire Go,” a persistent Canvas toggle in the track menu, slower Canvas reveal and Kawarp motion, transient playback recovery, a non-overlapping media/lyrics flow, album navigation from the track title, and an opaque shadow-only collapsed rail. Browser capture is still unavailable, so these states remain behaviorally tested but not visually approved.
- Pass 4: reduced the collapsed lyrics card to its 56px header, removed the lyric renderer and secondary actions from layout and accessibility navigation, and retained a single labeled disclosure control for reopening it.

## Implementation checklist

1. Restore Codex Desktop browser capture.
2. Capture the Canvas top state at the reference viewport with matching content.
3. Build a normalized side-by-side comparison image.
4. Fix any P0-P2 visual differences and recapture.
5. Exercise hover, scrolling, width changes, collapsed panel, expanded/fullscreen lyrics, load failure, no Canvas, track switching, and reduced motion.

final result: blocked
