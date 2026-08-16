import { describe, expect, test } from 'vitest';
import { hydrateQueuedTracks } from './queue-track-hydration.js';

describe('queue track hydration', () => {
    test('adds newly available Canvas metadata to every restored queue copy', () => {
        const primary = {
            id: 'track-1',
            title: 'Old title',
            album: { title: 'Album', cover: '/cover.jpg', videoCoverUrl: null },
            videoCoverUrl: null,
        };
        const shuffled = structuredClone(primary);
        const latest = {
            id: 'track-1',
            title: 'Current title',
            serverCanvasUrl: '/api/files/canvas.mp4',
            videoCoverUrl: '/api/files/canvas.mp4',
            album: { title: 'Album', cover: '/cover.jpg', videoCoverUrl: '/api/files/canvas.mp4' },
        };

        expect(hydrateQueuedTracks([[primary], [shuffled]], [latest])).toBe(2);
        expect(primary.videoCoverUrl).toBe('/api/files/canvas.mp4');
        expect(primary.album.videoCoverUrl).toBe('/api/files/canvas.mp4');
        expect(shuffled.serverCanvasUrl).toBe('/api/files/canvas.mp4');
        expect(primary.title).toBe('Current title');
    });

    test('preserves nested album fields that are absent from refreshed metadata', () => {
        const queued = {
            id: 'track-1',
            album: { id: 'album-1', title: 'Album', artist: { id: 'artist-1', name: 'Artist' } },
        };

        hydrateQueuedTracks([[queued]], [{ id: 'track-1', album: { videoCoverUrl: '/canvas.mp4' } }]);

        expect(queued.album).toEqual({
            id: 'album-1',
            title: 'Album',
            videoCoverUrl: '/canvas.mp4',
            artist: { id: 'artist-1', name: 'Artist' },
        });
    });
});
