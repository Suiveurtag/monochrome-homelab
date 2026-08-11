# Design QA - Track Save and Add to Playlist FloatingPanel

- Source visual truth: `/tmp/codex-clipboard-daa8063c-40e7-4f8e-a413-78b09c825fbf.png`
- Source pixels: 286 x 497
- Implementation target: `http://127.0.0.1:5173/`, `#track-save-floating-panel`
- Implementation screenshot: unavailable
- Intended comparison viewport: 286 x 497 CSS px, device scale factor 1
- State: dark theme, Add to playlist panel open for a track with saved and recent playlist locations
- Density normalization: not applicable because the browser-rendered implementation could not be captured

## Full-view comparison evidence

The source image was opened at its original 286 x 497 resolution. The local Monochrome app is running and serves the new panel, icons, CSS, and event code from port 5173, but the in-app browser runtime failed before a controllable tab could be created (`Importing module "node:process" is not allowed in node_repl`). The implementation therefore has no valid browser-rendered screenshot for a source-versus-implementation comparison.

## Focused region comparison evidence

Blocked for the same browser-runtime reason. The search field, New playlist row, playlist cover crop, saved-location circles, footer spacing, hover-only track buttons, and FloatingPanel morph require rendered evidence and cannot be approved from source code or HTTP responses alone.

## Findings

- [P1] Browser-rendered fidelity and interaction testing remain blocked.
    - Location: `#track-save-floating-panel`, track rows, queue rows, cards, now-playing bar, fullscreen player, album pages, and artist pages.
    - Evidence: the source visual is available and the production build succeeds, but no implementation screenshot or browser console capture is available.
    - Impact: layout, text wrapping, cover cropping, hover persistence, animation geometry, pointer behavior, and responsive placement cannot be visually approved.
    - Fix: capture the panel in a working in-app browser at the same viewport and state, test left click, right click, search, playlist toggles, New playlist, outside click, and Escape, then compare the source and implementation together.

## Required fidelity surfaces

- Fonts and typography: implementation uses the existing Monochrome font stack with source-aligned compact weights and sizes; browser comparison is blocked.
- Spacing and layout rhythm: implementation mirrors the reference hierarchy and 40 px cover rows, with a full-width mobile surface and compact footer; pixel comparison is blocked.
- Colors and visual tokens: panel uses opaque `#171717` and `#303030` surfaces, inactive buttons use `#a8a8a8`, and saved states use the current track `--highlight`; rendered contrast verification is blocked.
- Image quality and asset fidelity: the user-supplied liked and unliked SVG path data is integrated directly, and playlist artwork uses real playlist covers with the app icon fallback; rendered crop verification is blocked.
- Copy and content: Add to playlist, Find a playlist, New playlist, Saved in, Recent playlists, and Cancel match the requested flow; truncation verification is blocked.

## Primary interactions tested

- Four focused unit tests pass for the supplied plus/check artwork, favorite state, playlist-only saved state, accessible pressed state, and tooltip behavior.
- The production Vite/PWA build passes with the new module and both SVG assets packaged.
- The running development server returns the new panel markup, icons, CSS, and event code over HTTP.
- Prettier, targeted ESLint, HTMLHint, and `git diff --check` pass for the changed implementation. Existing unrelated warnings in `js/ui.js` remain unchanged.
- Browser click, right-click, search, focus restoration, and console checks are blocked because the in-app browser runtime did not initialize.

## Comparison history

- Initial pass: blocked before the first implementation capture; no visual pass is claimed from source inspection.

## Final result

final result: blocked
