import { describe, expect, test, vi } from 'vitest';
import {
    SELFHOST_TRACKS_COLLECTION,
    createTrackFormData,
    importRemoteSelfHostedTrack,
    listSelfHostedTracks,
    mapPocketBaseTrack,
    pocketBaseFileUrl,
    updateSelfHostedTrack,
} from './selfhost-server-api.js';

describe('selfhost-server-api helpers', () => {
    test('maps a PocketBase track record into the local Monochrome track shape', () => {
        const pb = {
            files: {
                getURL: vi.fn((_record, filename) => `http://monochrome.local/api/files/${filename}`),
            },
        };
        const record = {
            id: 'abc123',
            title: 'Song',
            artist: 'Artist',
            album: 'Album',
            album_artist: 'Album Artist',
            duration: 123,
            track_number: 7,
            release_date: '2026-06-24',
            explicit: true,
            lyrics: '[00:01.00] Local lyrics',
            audio: 'song.flac',
            cover: 'cover.jpg',
            created: '2026-06-24 10:00:00Z',
            updated: '2026-06-24 10:01:00Z',
        };

        const track = mapPocketBaseTrack(record, pb);

        expect(track).toMatchObject({
            id: 'abc123',
            isLocal: true,
            isSelfHosted: true,
            title: 'Song',
            duration: 123,
            trackNumber: 7,
            explicit: true,
            lyrics: '[00:01.00] Local lyrics',
            artist: { name: 'Artist' },
            album: {
                title: 'Album',
                releaseDate: '2026-06-24',
                artist: { name: 'Album Artist' },
                cover: 'http://monochrome.local/api/files/cover.jpg',
            },
            serverAudioUrl: 'http://monochrome.local/api/files/song.flac',
        });
    });

    test('builds multipart upload data with owner, metadata and audio file', () => {
        const file = new File(['audio'], 'song.flac', { type: 'audio/flac' });
        const track = {
            title: 'Song',
            duration: 10,
            artist: { name: 'Artist' },
            album: { title: 'Album', artist: { name: 'Album Artist' }, releaseDate: '2026-01-02', cover: 'blob:cover' },
            trackNumber: 2,
            explicit: false,
        };

        const formData = createTrackFormData(track, file, 'user123');

        expect(formData.get('owner')).toBe('user123');
        expect(formData.get('title')).toBe('Song');
        expect(formData.get('artist')).toBe('Artist');
        expect(formData.get('album')).toBe('Album');
        expect(formData.get('album_artist')).toBe('Album Artist');
        expect(formData.get('release_date')).toBe('2026-01-02');
        expect(formData.get('track_number')).toBe('2');
        expect(formData.get('duration')).toBe('10');
        expect(formData.get('explicit')).toBe('false');
        expect(formData.get('audio')).toBe(file);
    });

    test('updates editable metadata and an optional cover without replacing audio', async () => {
        const update = vi.fn().mockResolvedValue({
            id: 'track1',
            title: 'New title',
            artist: 'New artist',
            album: 'New album',
            album_artist: 'New artist',
            track_number: 4,
            duration: 180,
            cover: 'new-cover.webp',
            audio: 'song.flac',
        });
        const client = {
            authStore: { isValid: true },
            collection: vi.fn(() => ({ update })),
            files: { getURL: vi.fn((_record, filename) => `/files/${filename}`) },
        };
        const cover = new File(['cover'], 'cover.webp', { type: 'image/webp' });

        const result = await updateSelfHostedTrack(
            'track1',
            {
                title: 'New title',
                artist: { name: 'New artist' },
                album: { title: 'New album', artist: { name: 'New artist' }, releaseDate: '2026-06-27' },
                trackNumber: 4,
                duration: 180,
                explicit: true,
                lyrics: '[00:01.00] Local lyrics',
            },
            cover,
            client
        );

        const [, formData] = update.mock.calls[0];
        expect(client.collection).toHaveBeenCalledWith(SELFHOST_TRACKS_COLLECTION);
        expect(formData.get('title')).toBe('New title');
        expect(formData.get('artist')).toBe('New artist');
        expect(formData.get('album')).toBe('New album');
        expect(formData.get('release_date')).toBe('2026-06-27');
        expect(formData.get('explicit')).toBe('true');
        expect(formData.get('lyrics')).toBe('[00:01.00] Local lyrics');
        expect(formData.get('cover')).toBe(cover);
        expect(formData.has('audio')).toBe(false);
        expect(result).toMatchObject({ id: 'track1', title: 'New title', serverAudioUrl: '/files/song.flac' });
    });

    test('supports both PocketBase getURL and getUrl client versions', () => {
        const record = { audio: 'song.flac' };
        const modern = { files: { getURL: vi.fn(() => 'modern-url') } };
        const legacy = { files: { getUrl: vi.fn(() => 'legacy-url') } };

        expect(pocketBaseFileUrl(modern, record, 'song.flac')).toBe('modern-url');
        expect(pocketBaseFileUrl(legacy, record, 'song.flac')).toBe('legacy-url');
    });

    test('fetches server tracks with bearer auth and maps returned items', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                items: [
                    { id: 'server1', title: 'Server Song', artist: 'Artist', album: 'Album', audio: 'server.flac' },
                ],
            }),
        });
        const client = {
            authStore: { isValid: true, token: 'token123' },
            files: { getURL: vi.fn((_record, filename) => `/api/files/${filename}`) },
        };

        const tracks = await listSelfHostedTracks(client, fetchMock);

        expect(fetchMock).toHaveBeenCalledWith('/api/collections/music_tracks/records?perPage=500', {
            headers: { Authorization: 'Bearer ' + 'token123' },
        });
        expect(tracks).toHaveLength(1);
        expect(tracks[0]).toMatchObject({
            id: 'server1',
            title: 'Server Song',
            serverAudioUrl: '/api/files/server.flac',
        });
    });

    test('exposes the private per-user tracks collection name', () => {
        expect(SELFHOST_TRACKS_COLLECTION).toBe('music_tracks');
    });

    test('posts direct FLAC URL imports to the self-host importer and maps the record', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                record: {
                    id: 'imported1',
                    title: 'Imported',
                    artist: 'Artist',
                    album: 'Album',
                    audio: 'imported.flac',
                },
            }),
        });
        const client = {
            authStore: { isValid: true, token: 'token123' },
            files: { getURL: vi.fn((_record, filename) => `/api/files/${filename}`) },
        };

        const track = await importRemoteSelfHostedTrack(
            { url: 'https://example.test/import.flac', title: 'Imported', artist: 'Artist' },
            client,
            fetchMock
        );

        expect(fetchMock).toHaveBeenCalledWith('/api/selfhost/import-url', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + 'token123',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: 'https://example.test/import.flac', title: 'Imported', artist: 'Artist' }),
        });
        expect(track).toMatchObject({ id: 'imported1', title: 'Imported', serverAudioUrl: '/api/files/imported.flac' });
    });

    test('rejects remote imports when the user is not signed in', async () => {
        await expect(
            importRemoteSelfHostedTrack({ url: 'https://example.test/import.flac' }, { authStore: {} })
        ).rejects.toThrow('signed in');
    });
});
