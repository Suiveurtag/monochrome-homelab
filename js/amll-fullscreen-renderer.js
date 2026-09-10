import { BackgroundRender, DomLyricPlayer, MeshGradientRenderer } from '@applemusic-like-lyrics/core';
import '@applemusic-like-lyrics/core/style.css';
import { parseTTML } from '@applemusic-like-lyrics/lyric';
import { getArtworkSources } from './artwork-media.js';
import { prepareTtmlForAmll } from './amll-ttml.js';

function resolveCoverUrl(track, api) {
    const album = track?.album || {};
    const sources = getArtworkSources({
        cover: album.cover || track?.cover || track?.image || album.coverId || track?.coverId,
        animatedCover: track?.videoUrl || track?.videoCoverUrl || album.videoCoverUrl || album.animatedCover,
        coverFallback: track?.coverFallback || track?.staticCover || album.coverFallback || album.staticCover,
    });
    const cover = sources.static;
    if (!cover || /^(?:https?:|blob:|data:)/i.test(cover)) return cover;
    return api?.getCoverUrl?.(cover, '1280') || cover;
}

export async function mountAmllLyrics({
    container,
    track,
    audioPlayer,
    lyricsManager,
    ttml,
    signal,
    mode = 'fullscreen',
}) {
    const currentTime = () => Math.max(0, audioPlayer.currentTime * 1000 - (lyricsManager?.timingOffset || 0));
    const lines = parseTTML(prepareTtmlForAmll(ttml)).lines;
    if (!lines.length) throw new Error('AMLL could not parse any synchronized lyric lines');

    const host = document.createElement('div');
    host.className = `amll-lyrics-player amll-${mode}-player`;
    const backgroundLayer = document.createElement('div');
    backgroundLayer.className = `amll-${mode}-background-layer`;
    const shade = document.createElement('div');
    shade.className = `amll-${mode}-shade`;

    const background = BackgroundRender.new(MeshGradientRenderer);
    const lyricPlayer = new DomLyricPlayer();
    const backgroundElement = background.getElement();
    const lyricElement = lyricPlayer.getElement();
    backgroundElement.classList.add('amll-lyrics-background', `amll-${mode}-background`);
    lyricElement.classList.add('amll-lyrics-content', `amll-${mode}-lyrics`);
    backgroundLayer.append(backgroundElement, shade);
    host.append(lyricElement);
    container.replaceChildren(host);
    const overlay = container.closest('#fullscreen-cover-overlay');
    (overlay || host).prepend(backgroundLayer);

    if (document.fonts?.load) {
        try {
            await document.fonts.load('600 1em "Google Sans Flex"');
        } catch {
            // AMLL can fall back to Monochrome's font if the web font is unavailable.
        }
    }
    lyricPlayer.setLyricLines(lines, Math.round(currentTime()));
    lyricPlayer.setCurrentTime(Math.round(currentTime()), true);
    lyricPlayer.update(0);
    background.setHasLyric(true);

    const coverUrl = resolveCoverUrl(track, lyricsManager?.api);
    if (coverUrl) await background.setAlbum(coverUrl);

    let frameId = 0;
    let lastFrameTime = -1;
    let disposed = false;

    const onFrame = (frameTime) => {
        if (disposed) return;
        const delta = lastFrameTime === -1 ? 0 : frameTime - lastFrameTime;
        lastFrameTime = frameTime;
        if (!audioPlayer.paused) lyricPlayer.setCurrentTime(Math.round(currentTime()));
        lyricPlayer.update(delta);
        frameId = requestAnimationFrame(onFrame);
    };
    const onPlay = () => {
        lyricPlayer.resume();
        background.resume();
    };
    const onPause = () => {
        lyricPlayer.pause();
        background.pause();
    };
    const onSeeked = () => lyricPlayer.setCurrentTime(Math.round(currentTime()), true);
    const onLineClick = async (event) => {
        const timestamp = event.line?.getLine?.().startTime;
        if (!Number.isFinite(timestamp)) return;
        audioPlayer.currentTime = timestamp / 1000;
        lyricPlayer.setCurrentTime(timestamp, true);
        try {
            await audioPlayer.play();
        } catch {
            // Playback can remain paused when the browser blocks a user-initiated seek.
        }
    };

    audioPlayer.addEventListener('play', onPlay);
    audioPlayer.addEventListener('pause', onPause);
    audioPlayer.addEventListener('ended', onPause);
    audioPlayer.addEventListener('seeked', onSeeked);
    lyricPlayer.addEventListener('line-click', onLineClick);

    if (audioPlayer.paused) onPause();
    else onPlay();
    frameId = requestAnimationFrame(onFrame);

    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frameId);
        audioPlayer.removeEventListener('play', onPlay);
        audioPlayer.removeEventListener('pause', onPause);
        audioPlayer.removeEventListener('ended', onPause);
        audioPlayer.removeEventListener('seeked', onSeeked);
        lyricPlayer.removeEventListener('line-click', onLineClick);
        signal?.removeEventListener('abort', cleanup);
        lyricPlayer.dispose();
        background.dispose();
        backgroundLayer.remove();
        host.remove();
    };

    signal?.addEventListener('abort', cleanup, { once: true });
    container.lyricsCleanup = cleanup;
    return lyricElement;
}

export function mountAmllFullscreen(options) {
    return mountAmllLyrics({ ...options, mode: 'fullscreen' });
}

export function mountAmllSidePanel(options) {
    return mountAmllLyrics({ ...options, mode: 'side-panel' });
}
