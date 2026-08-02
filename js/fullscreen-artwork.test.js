import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { visualizerSettings } from './storage.js';

vi.mock('./profile.js', () => ({ loadProfile: vi.fn(), openEditProfile: vi.fn() }));
vi.mock('./vibrant-color.js', () => ({ getVibrantColorFromImage: vi.fn(() => '#663399') }));

import { UIRenderer } from './ui.js';

describe('fullscreen animated artwork', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="fullscreen-cover-overlay">
                <div id="fullscreen-artwork-card">
                    <img id="fullscreen-cover-image" class="cd" src="/old.jpg" alt="Album Cover" />
                    <div id="cd-ring"></div>
                </div>
            </div>`;
        visualizerSettings.setCdAlbumCoverEnabled(true);
    });

    afterEach(() => vi.unstubAllGlobals());

    test('keeps the MP4 cover animated in fullscreen while playback is paused', async () => {
        const activeElement = document.createElement('audio');
        Object.defineProperty(activeElement, 'paused', { configurable: true, get: () => true });
        const renderer = {
            api: { getCoverUrl: (source) => source },
            player: { activeElement },
            setupHlsVideo: vi.fn(async (video, source) => {
                video.src = source;
            }),
            applyFullscreenCdState: () => UIRenderer.prototype.applyFullscreenCdState.call({}),
        };
        const track = { album: { cover: '/animated.mp4', coverFallback: '/static.jpg' } };

        await UIRenderer.prototype.renderFullscreenArtwork.call(renderer, track);
        const video = document.getElementById('fullscreen-cover-image');
        expect(video.tagName).toBe('VIDEO');
        expect(document.getElementById('fullscreen-cover-overlay').style.getPropertyValue('--fullscreen-artwork-image')).toContain(
            '/static.jpg'
        );
        expect(video.classList.contains('cd')).toBe(true);
        expect(video.poster).toContain('/static.jpg');
        expect(renderer.setupHlsVideo).toHaveBeenCalledWith(video, '/animated.mp4', null);
    });

    test('keeps a GIF cover animated in fullscreen while playback is paused', async () => {
        const activeElement = document.createElement('audio');
        Object.defineProperty(activeElement, 'paused', { configurable: true, get: () => true });
        const renderer = {
            api: { getCoverUrl: (source) => source },
            player: { activeElement },
            setupHlsVideo: vi.fn(),
            applyFullscreenCdState: () => UIRenderer.prototype.applyFullscreenCdState.call({}),
        };
        const track = { album: { cover: '/animated.gif', coverFallback: '/static.jpg' } };

        await UIRenderer.prototype.renderFullscreenArtwork.call(renderer, track);
        const image = document.getElementById('fullscreen-cover-image');
        expect(image.tagName).toBe('IMG');
        expect(image.getAttribute('src')).toBe('/animated.gif');
        expect(renderer.setupHlsVideo).not.toHaveBeenCalled();
    });

    test('extracts theme colors from a data URL without altering it', async () => {
        let loadedSource = '';
        vi.stubGlobal(
            'Image',
            class {
                set src(value) {
                    loadedSource = value;
                    queueMicrotask(() => this.onload());
                }
            }
        );
        const renderer = {
            vibrantColorRequestId: 0,
            vibrantColorCache: new Map(),
            setVibrantColor: vi.fn(),
            resetVibrantColor: vi.fn(),
        };
        const dataUrl = 'data:image/png;base64,AAAA';

        await UIRenderer.prototype.extractAndApplyColor.call(renderer, dataUrl);

        expect(loadedSource).toBe(dataUrl);
        expect(renderer.setVibrantColor).toHaveBeenCalledWith('#663399');
        expect(renderer.resetVibrantColor).not.toHaveBeenCalled();
    });
});
