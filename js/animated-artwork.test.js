import { afterEach, describe, expect, test } from 'vitest';
import {
    isSupportedArtworkFile,
    isVideoArtwork,
    renderArtworkElement,
    setArtworkBackground,
} from './animated-artwork.js';

afterEach(() => {
    if (typeof document !== 'undefined') document.body.replaceChildren();
});

describe('animated artwork', () => {
    test('recognizes GIF as image artwork and MP4 URLs or files as video artwork', () => {
        expect(isVideoArtwork('https://example.test/cover.mp4?token=one')).toBe(true);
        expect(isVideoArtwork('data:video/mp4;base64,AAAA')).toBe(true);
        expect(isVideoArtwork('https://example.test/cover.gif')).toBe(false);
        expect(isSupportedArtworkFile(new File(['gif'], 'cover.gif', { type: 'image/gif' }))).toBe(true);
        expect(isSupportedArtworkFile(new File(['mp4'], 'cover.mp4', { type: 'video/mp4' }))).toBe(true);
        expect(isSupportedArtworkFile(new File(['text'], 'notes.txt', { type: 'text/plain' }))).toBe(false);
    });

    test('replaces an image with a silent looping video while preserving its identity and classes', () => {
        const image = document.createElement('img');
        image.id = 'album-cover';
        image.className = 'card-image';
        image.alt = 'Album cover';
        document.body.appendChild(image);

        const video = renderArtworkElement(image, 'https://example.test/cover.mp4');

        expect(video.tagName).toBe('VIDEO');
        expect(video.id).toBe('album-cover');
        expect(video.className).toBe('card-image');
        expect(video.muted).toBe(true);
        expect(video.loop).toBe(true);
        expect(video.playsInline).toBe(true);
        expect(video.getAttribute('aria-label')).toBe('Album cover');
    });

    test('keeps explicitly typed MP4 blob previews as videos', () => {
        const image = document.createElement('img');
        document.body.appendChild(image);

        const video = renderArtworkElement(image, 'blob:https://example.test/cover', { video: true });

        expect(video.tagName).toBe('VIDEO');
        expect(video.dataset.artworkMime).toBe('video/mp4');
    });

    test('supports a poster-backed deferred video for Canvas mounting', () => {
        const image = document.createElement('img');
        document.body.appendChild(image);

        const video = renderArtworkElement(image, '/canvas.mp4', {
            video: true,
            autoplay: false,
            poster: '/cover.jpg',
        });

        expect(video.autoplay).toBe(false);
        expect(video.hasAttribute('autoplay')).toBe(false);
        expect(video.poster).toContain('/cover.jpg');
    });

    test('uses a video element for animated background artwork', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        setArtworkBackground(container, 'https://example.test/banner.mp4');

        const video = container.querySelector('[data-artwork-background-video]');
        expect(video?.tagName).toBe('VIDEO');
        expect(container.style.backgroundImage).toBe('');
        expect(container.classList.contains('has-animated-artwork-background')).toBe(true);

        setArtworkBackground(container, 'https://example.test/banner.gif');
        expect(container.querySelector('video')).toBeNull();
        expect(container.style.backgroundImage).toContain('banner.gif');
    });
});
