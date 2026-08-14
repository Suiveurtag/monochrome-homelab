import { describe, expect, test } from 'vitest';
import { MusicDatabase } from './db.js';

describe('Now Playing optional metadata persistence', () => {
    test('keeps track credits in compact playlist, history, and favorite copies', () => {
        const credits = [{ name: 'A Producer', role: 'Producer' }];
        const compact = new MusicDatabase()._minifyItem('track', {
            id: 'track-1',
            title: 'Track',
            credits,
            composer: 'A Writer',
            composers: [{ name: 'Another Writer' }],
        });
        expect(compact.credits).toEqual(credits);
        expect(compact.composer).toBe('A Writer');
        expect(compact.composers).toEqual([{ name: 'Another Writer' }]);
    });

    test('keeps artist listeners, videos, and tour dates in compact copies', () => {
        const relatedVideos = [{ title: 'Live', href: 'https://example.com/live' }];
        const tourDates = [{ date: '2027-06-01', city: 'Paris' }];
        const compact = new MusicDatabase()._minifyItem('artist', {
            id: 'artist-1',
            name: 'Artist',
            biography: 'Biography',
            monthlyListeners: 1234,
            relatedVideos,
            tourDates,
        });
        expect(compact.biography).toBe('Biography');
        expect(compact.monthlyListeners).toBe(1234);
        expect(compact.relatedVideos).toEqual(relatedVideos);
        expect(compact.tourDates).toEqual(tourDates);
    });
});
