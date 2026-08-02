import { describe, expect, test } from 'vitest';
import {
    getArtworkSources,
    isSupportedArtworkFile,
    isSupportedImageArtworkFile,
    isVideoArtwork,
    setArtworkSource,
} from './artwork-media.js';

describe('artwork media', () => {
    test('recognizes MP4 URLs and data URLs without misclassifying images', () => {
        expect(isVideoArtwork('https://cdn.test/cover.MP4?token=1')).toBe(true);
        expect(isVideoArtwork('data:video/mp4;base64,AAAA')).toBe(true);
        expect(isVideoArtwork('https://cdn.test/cover.gif')).toBe(false);
    });

    test('accepts supported animated artwork files', () => {
        expect(isSupportedArtworkFile(new File(['gif'], 'cover.gif', { type: 'image/gif' }))).toBe(true);
        expect(isSupportedArtworkFile(new File(['mp4'], 'cover.mp4', { type: 'video/mp4' }))).toBe(true);
        expect(isSupportedArtworkFile(new File(['text'], 'cover.txt', { type: 'text/plain' }))).toBe(false);
        expect(isSupportedImageArtworkFile(new File(['mp4'], 'cover.mp4', { type: 'video/mp4' }))).toBe(false);
    });

    test('separates animated artwork from the static color source', () => {
        expect(getArtworkSources({ cover: '/cover.mp4', coverFallback: '/cover.jpg' })).toEqual({
            animated: '/cover.mp4',
            static: '/cover.jpg',
        });
        expect(getArtworkSources({ cover: '/cover.jpg' })).toEqual({ animated: '', static: '/cover.jpg' });
        expect(getArtworkSources({ cover: '/cover.jpg', animatedCover: '/cover.mp4' })).toEqual({
            animated: '/cover.mp4',
            static: '/cover.jpg',
        });
    });

    test('replaces an image with a silent looping video while preserving presentation', () => {
        const image = document.createElement('img');
        image.id = 'album-cover';
        image.className = 'card-image';
        document.body.appendChild(image);

        const video = setArtworkSource(image, 'https://cdn.test/cover.mp4');
        expect(video.tagName).toBe('VIDEO');
        expect(video.id).toBe('album-cover');
        expect(video.className).toBe('card-image');
        expect(video.autoplay).toBe(true);
        expect(video.loop).toBe(true);
        expect(video.muted).toBe(true);
        video.remove();
    });
});
