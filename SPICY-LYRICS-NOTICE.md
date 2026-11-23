# Spicy Lyrics integration

Monochrome embeds the rendering engine from [Spicy Lyrics 6.5.10](https://github.com/Spikerko/spicy-lyrics/releases/tag/6.5.10),
commit `1c02f47cd64ed8c34bb76dd8ff00755db9d1d66f`. Spicy Lyrics is by Spikerko
and contributors, under the GNU Affero General Public License v3.0. A copy of
the license is included at `licenses/Spicy-Lyrics-AGPL-3.0.txt`.

The upstream animator, virtualizer, lyrics styles, syllable and romanization
helpers are under `js/vendor/spicy-lyrics/upstream`. Monochrome creates one
animation state per surface and maps its TTML, LRC and plain lyrics to the
upstream renderer. Now Playing and fullscreen each own their Kawarp 1.3.1
background and use the playback clock, artwork, audio analyser and queue from
Monochrome. The standalone lyrics panel and supported browser floating windows
use the same renderer.

The Advanced mode for unsynced lyrics uses the Basic loudness fallback because
Spotify's vocal-activity metadata is unavailable to Monochrome. Japanese
romanization uses the Kuromoji dictionary. Japanese kana can still be
romanized while that dictionary is unavailable.

[Corresponding upstream source](https://github.com/Spikerko/spicy-lyrics/tree/1c02f47cd64ed8c34bb76dd8ff00755db9d1d66f)
