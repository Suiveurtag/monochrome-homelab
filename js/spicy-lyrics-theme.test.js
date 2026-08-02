import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    applySpicyLyricsShadowTheme,
    applySpicyLyricsSurface,
    getSpicyLyricsArtworkUrl,
} from './spicy-lyrics-theme.js';

describe('Spicy lyrics theme', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="side-panel"><div id="side-panel-content"></div></div>
            <div id="fullscreen-cover-overlay"><div id="fullscreen-lyrics-content"></div></div>
        `;
    });

    test('uses the static fallback artwork for the reactive background', () => {
        const api = { getCoverUrl: vi.fn((source, size) => `/cover/${size}${source}`) };
        const track = { album: { cover: '/animated.mp4', coverFallback: '/still.jpg' } };

        expect(getSpicyLyricsArtworkUrl(track, api)).toBe('/cover/1280/still.jpg');
        expect(api.getCoverUrl).toHaveBeenCalledWith('/still.jpg', '1280');
    });

    test('decorates both lyrics surfaces with their artwork', () => {
        const track = { album: { cover: '/cover.jpg' } };
        const api = { getCoverUrl: (source) => source };
        const sideContent = document.getElementById('side-panel-content');
        const fullscreenContent = document.getElementById('fullscreen-lyrics-content');

        const side = applySpicyLyricsSurface(sideContent, track, api);
        const fullscreen = applySpicyLyricsSurface(fullscreenContent, track, api);

        expect(side.classList.contains('spicy-lyrics-active')).toBe(true);
        expect(side.dataset.spicyLyricsView).toBe('side');
        expect(side.style.getPropertyValue('--spicy-lyrics-artwork')).toContain('/cover.jpg');
        expect(fullscreen.dataset.spicyLyricsView).toBe('fullscreen');
    });

    test('injects the word animation theme into the lyrics shadow root', () => {
        const host = document.createElement('div');
        host.attachShadow({ mode: 'open' });
        const container = document.getElementById('fullscreen-lyrics-content');

        applySpicyLyricsShadowTheme(host, container);

        const style = host.shadowRoot.getElementById('monochrome-spicy-lyrics-theme');
        expect(host.dataset.spicyLyricsView).toBe('fullscreen');
        expect(host.getAttribute('highlight-color')).toBe('#ffffff');
        expect(style.textContent).toContain('.lyrics-syllable span.char.highlight');
        expect(style.textContent).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
    });
});
