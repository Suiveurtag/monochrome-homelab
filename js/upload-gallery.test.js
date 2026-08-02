import { describe, expect, test } from 'vitest';
import { groupTracksByUploadDay, patchTrackMetadata, uploadDayLabel } from './upload-gallery.js';

describe('upload gallery helpers', () => {
    test('sorts newest first and groups tracks by local calendar day', () => {
        const groups = groupTracksByUploadDay([
            { id: 'old', uploadedAt: new Date(2026, 6, 10, 18).getTime() },
            { id: 'new', uploadedAt: new Date(2026, 6, 12, 8).getTime() },
            { id: 'same', uploadedAt: new Date(2026, 6, 12, 7).getTime() },
        ]);
        expect(groups.map((group) => group.tracks.map((track) => track.id))).toEqual([['new', 'same'], ['old']]);
    });

    test('uses friendly labels for today and yesterday', () => {
        const now = new Date(2026, 6, 12, 12);
        expect(uploadDayLabel('2026-07-12', now)).toBe('Today');
        expect(uploadDayLabel('2026-07-11', now)).toBe('Yesterday');
    });

    test('only changes explicitly supplied shared metadata', () => {
        const original = {
            title: 'Keep me',
            artist: { name: 'Old' },
            album: { title: 'Album', releaseDate: '2020-01-01' },
        };
        const changed = patchTrackMetadata(original, { artist: 'New' });
        expect(changed.title).toBe('Keep me');
        expect(changed.artist.name).toBe('New');
        expect(changed.album.title).toBe('Album');
        expect(changed.album.releaseDate).toBe('2020-01-01');
    });
});
