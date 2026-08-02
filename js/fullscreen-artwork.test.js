import { beforeEach, describe, expect, test, vi } from 'vitest';
import { visualizerSettings } from './storage.js';

vi.mock('./profile.js', () => ({ loadProfile: vi.fn(), openEditProfile: vi.fn() }));

import { UIRenderer } from './ui.js';

describe('fullscreen animated artwork', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="fullscreen-artwork-card">
                <img id="fullscreen-cover-image" class="cd" src="/old.jpg" alt="Album Cover" />
                <div id="cd-ring"></div>
            </div>`;
        visualizerSettings.setCdAlbumCoverEnabled(true);
    });

    test('uses the static fallback while paused and the MP4 while playing', async () => {
        const activeElement = document.createElement('audio');
        let paused = true;
        Object.defineProperty(activeElement, 'paused', { configurable: true, get: () => paused });
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
        expect(document.getElementById('fullscreen-cover-image')).toMatchObject({ tagName: 'IMG' });
        expect(document.getElementById('fullscreen-cover-image').getAttribute('src')).toBe('/static.jpg');

        paused = false;
        await UIRenderer.prototype.renderFullscreenArtwork.call(renderer, track);
        const video = document.getElementById('fullscreen-cover-image');
        expect(video.tagName).toBe('VIDEO');
        expect(video.classList.contains('cd')).toBe(true);
        expect(video.poster).toContain('/static.jpg');
        expect(renderer.setupHlsVideo).toHaveBeenCalledWith(video, '/animated.mp4', null);
    });
});
