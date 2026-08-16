import { describe, expect, test } from 'vitest';
import { mergeServerTrackWithLocalMetadata } from './local-music-api.js';

describe('local music server metadata merge', () => {
    test('keeps the current server Canvas when cached local metadata predates it', () => {
        const canvas = '/api/files/music_tracks/track-1/canvas.mp4';
        const serverTrack = {
            id: 'track-1',
            serverAudioUrl: '/api/files/audio.flac',
            serverCoverUrl: '/api/files/cover.jpg',
            serverCanvasUrl: canvas,
            videoCoverUrl: canvas,
            artist: { id: 'artist-1', name: 'Artist' },
            album: { id: 'album-1', title: 'Album', videoCoverUrl: canvas },
        };
        const staleLocalTrack = {
            id: 'track-1',
            title: 'Locally edited title',
            videoCoverUrl: null,
            album: { id: 'album-1', title: 'Album', videoCoverUrl: null },
        };

        const merged = mergeServerTrackWithLocalMetadata(serverTrack, staleLocalTrack);

        expect(merged.title).toBe('Locally edited title');
        expect(merged.serverCanvasUrl).toBe(canvas);
        expect(merged.videoCoverUrl).toBe(canvas);
        expect(merged.album.videoCoverUrl).toBe(canvas);
    });

    test('keeps a server Canvas removal authoritative over stale cached metadata', () => {
        const staleCanvas = '/api/files/old-canvas.mp4';
        const merged = mergeServerTrackWithLocalMetadata(
            {
                id: 'track-1',
                serverCanvasUrl: null,
                videoCoverUrl: null,
                album: { id: 'album-1', videoCoverUrl: null },
            },
            {
                id: 'track-1',
                videoCoverUrl: staleCanvas,
                album: { id: 'album-1', videoCoverUrl: staleCanvas },
            }
        );

        expect(merged.videoCoverUrl).toBeNull();
        expect(merged.album.videoCoverUrl).toBeNull();
    });
});
