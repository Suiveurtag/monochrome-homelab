import { describe, expect, test } from 'vitest';
import { applyTrackOverrides, getTrackKey, isSameTrack, minifyHybridTrack, withTrackIdentity } from '../track-model.ts';

describe('track-model', () => {
    test('creates stable keys for TIDAL numeric ids', () => {
        expect(getTrackKey({ id: 123, title: 'Track' })).toBe('v1:external:tidal:123');
        expect(getTrackKey({ id: '123', title: 'Track' })).toBe('v1:external:tidal:123');
    });

    test('normalizes provider-prefixed TIDAL ids to the same identity', () => {
        const plain = withTrackIdentity({ id: '123', title: 'Track' });
        const prefixed = withTrackIdentity({ id: 't:123', title: 'Track' });

        expect(prefixed.trackKey).toBe(plain.trackKey);
        expect(isSameTrack(plain, prefixed)).toBe(true);
    });

    test('keeps server uploads distinct from external tracks with the same id', () => {
        const external = withTrackIdentity({ id: 'abc', title: 'Track' });
        const upload = withTrackIdentity({
            id: 'abc',
            title: 'Track',
            source: { kind: 'server-upload', sourceId: 'abc' },
        });

        expect(upload.trackKey).toBe('v1:server-upload:none:abc');
        expect(upload.trackKey).not.toBe(external.trackKey);
    });

    test('marks browser local files as local without making them server uploads', () => {
        const local = withTrackIdentity({ id: 'local-song.flac-1', title: 'Local', isLocal: true });

        expect(local.source).toEqual({ kind: 'browser-local', sourceId: 'local-song.flac-1' });
        expect(local.trackKey).toBe('v1:browser-local:none:local-song.flac-1');
    });

    test('applies overrides without mutating the source snapshot', () => {
        const track = withTrackIdentity({
            id: 123,
            title: 'Original',
            album: { title: 'Album', cover: 'cover-id' },
        });

        const overridden = applyTrackOverrides(track, {
            trackKey: track.trackKey,
            fields: { title: 'Override', album: { title: 'New Album' } },
            updatedAt: 99,
        });

        expect(overridden.title).toBe('Override');
        expect(overridden.album?.title).toBe('New Album');
        expect(overridden.album?.cover).toBe('cover-id');
        expect(track.title).toBe('Original');
        expect(track.album?.title).toBe('Album');
    });

    test('minifies tracks with identity and playback metadata', () => {
        const track = minifyHybridTrack({
            id: 'podcast_1',
            title: 'Episode',
            isPodcast: true,
            enclosureUrl: 'https://example.test/audio.mp3',
            enclosureType: 'audio/mpeg',
        });

        expect(track.trackKey).toBe('v1:podcast:none:podcast_1');
        expect(track.playback).toEqual({
            mode: 'podcast',
            url: 'https://example.test/audio.mp3',
            mimeType: 'audio/mpeg',
        });
    });
});
