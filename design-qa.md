# Design QA - Playback Quality FloatingPanel

- Source visual truth: `/tmp/codex-clipboard-b1aa42da-f6d6-4b9b-83bf-206edbefd588.png`
- Source pixels: 1400 x 1122
- Implementation target: `http://127.0.0.1:5173/`, `#quality-popover`
- Implementation screenshot: unavailable
- Intended viewport: desktop, 1400 x 900 CSS px, device scale factor 1
- State: dark theme, playback-quality panel open, High selected
- Density normalization: not applicable because no browser-rendered implementation capture was available

## Full-view comparison evidence

The reference image was opened at original resolution. The implementation could not be captured in the required in-app browser because its browser runtime failed during initialization before a tab could be created. A source-versus-rendered comparison therefore cannot be made honestly.

## Focused region comparison evidence

Blocked for the same reason. The quality rows, shared selected state, player badge, track-colored edge lighting, and Lossless animation require a browser-rendered capture and interaction state.

## Findings

- [P1] Browser-rendered fidelity remains unverified.
    - Location: playback quality FloatingPanel and player quality badge.
    - Evidence: the source visual is available, but there is no implementation screenshot.
    - Impact: typography, panel placement, clipping, animation timing, and the shared selection transition cannot be visually approved.
    - Fix: capture the local panel in a working browser at the intended viewport, exercise High to Lossless selection, compare the source and implementation together, and correct any P0/P1/P2 mismatch.

## Source-aligned refinements completed

- Rebuilt the card as an opaque 500 px dark panel with a 24 px clipped radius, roomier 74 px rows, restrained border, and the reference's wider spacing rhythm.
- Replaced signal-strength glyphs with four distinct audio-waveform SVGs plus a dedicated Lossless sparkle glyph.
- Localized the selected-row light to its left edge while retaining a fine full-row outline; the shared element still moves, changes color, peaks in intensity, and settles.
- Added a top-left flare and border glint driven by the current track's `--highlight-rgb` value.
- Moved the Lossless magic sparks immediately beside the Lossless title and added the supplied information-circle asset to the footer.
- Made the player badge smaller and softer while preserving a complete rounded outline.
- Added an explicit rounded `clip-path` to both FloatingPanel animation endpoints to prevent a square first frame.
- Removed the badge reveal's clipping mask and vertical offset, restored a true inset-safe border box, and isolated badge hover from the song-title hover state.
- Matched the panel surface to Monochrome's active `--background` token and removed the Manual indicator.
- Cached valid trigger geometry protects entry, exit, and resize animations from detached badge coordinates.
- Extended the shared quality transition with a slower settle curve.
- Restored the badge's original left-to-right clipped reveal and highlight sweep from `875dfea`.
- Moved the FloatingPanel scale origin to its top-left corner so its collapsed geometry lands exactly on the badge instead of drifting right.
- Decoupled the visual play/pause state from the audio fade envelope so keyboard input updates the icon immediately while the sound still fades.

## Primary interactions tested

- Source-level and build validation only; browser interaction testing is blocked.
- The production build completed successfully.
- The player-quality unit suite passed with 5 tests.
- Targeted ESLint for the UI/player files, Stylelint, Prettier, and `git diff --check` passed.
- `js/audio-context.js` still reports the same two pre-existing constant-condition errors and unused-import warning as `HEAD`; the new fade methods add no new lint finding.

## Console errors checked

Blocked because the browser runtime did not initialize.

## Comparison history

- Initial pass: blocked before the first implementation capture; no visual fixes were claimed from code inspection alone.
- Reference-accuracy pass: incorporated the user's rendered feedback, corrected the reported geometry, glow placement, icons, flare, footer, badge, and animation clipping; browser capture remains unavailable.
- Final polish pass: fixed badge-edge clipping, hover propagation, panel background, trigger replacement races, square-corner frames, and transition settling from the user's live visual feedback.
- Animation correction pass: restored the original badge-to-panel morph, spring timing, and reverse close while staging its first frame invisibly to prevent square flashes; quality refreshes now preserve the panel's open-session anchor.
- Regression pass: restored the committed horizontal badge reveal, made play/pause feedback immediate, and corrected the transform-origin mismatch responsible for the right-shifted opening morph.

## Final result

final result: blocked
