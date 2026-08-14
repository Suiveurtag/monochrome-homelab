# Spicy Lyrics integration

The exact upstream spring solver is preserved in
`js/vendor/spicy-lyrics/Spring.js`. The complete upstream lyrics animator is
preserved in `js/vendor/spicy-lyrics/upstream/LyricsAnimator.ts`; only its
Spicetify store/module imports are redirected to the small Monochrome boundary
in `AnimatorCompat.js`. The upstream lyrics styles are preserved verbatim in
`js/vendor/spicy-lyrics/upstream/main.css` and
`js/vendor/spicy-lyrics/upstream/Mixed.css`. The upstream TanStack lyrics
virtualizer source is preserved in
`js/vendor/spicy-lyrics/upstream/LyricsVirtualizer.ts`, with only its logger and
lifecycle imports replaced by Monochrome compatibility boundaries. The lyrics
runtime and dynamic background integration in `js/spicy-lyrics-renderer.js` are adapted from
[Spicy Lyrics](https://github.com/spikerko/spicy-lyrics) by Spikerko, revision
`cc45160facbebbe6c872a8796d339c0602d58928`.

Spicy Lyrics is licensed under the GNU Affero General Public License v3.0. A
copy is included at `licenses/Spicy-Lyrics-AGPL-3.0.txt`; the corresponding
upstream source is available at
<https://github.com/spikerko/spicy-lyrics/tree/cc45160facbebbe6c872a8796d339c0602d58928>.

Monochrome-specific changes replace Spicetify APIs with the native Monochrome
audio element, preserve local TTML as the lyrics source, and mount the renderer
inside Monochrome's side panel and fullscreen player. The unmodified upstream
lyrics CSS runs in an isolated shadow tree so Monochrome's global element rules
cannot alter Spicy Lyrics' word grouping or generated separators.

The Monochrome adapter also exposes a shared dynamic-background host. When a
lyrics renderer is mounted inside `[data-spicy-background-host]`, it reuses the
single `SpicyDynamicBackground` controller owned by that host instead of
creating or disposing a second Kawarp canvas. This lets the unchanged renderer
and its real artwork-driven Kawarp background span the complete Now Playing
panel while keeping ownership and cleanup in Monochrome code.

The shared controller mirrors upstream motion state by running Kawarp at full
speed during playback, slowing it to `0.1` while paused, and holding a still
frame for reduced motion. Monochrome's existing audio analyser supplies the
optional beat-speed and scale modulation; it does not replace or redraw the
Kawarp background.
