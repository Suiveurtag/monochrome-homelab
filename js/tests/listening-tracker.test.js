import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ListeningTracker } from '../listening-tracker.js';

describe('ListeningTracker play counts', () => {
    beforeEach(() => {
        const values = new Map();
        vi.stubGlobal('localStorage', {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: (key) => values.delete(key),
            clear: () => values.clear(),
        });
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    test('records every completed listening session and persists its count', () => {
        const tracker = new ListeningTracker();

        tracker.onTrackStart({ id: 'track-1', duration: 10000 });
        tracker.onTimeUpdate(1, 10);
        tracker.onTimeUpdate(4, 10);
        tracker.onTimeUpdate(7, 10);
        tracker.onTimeUpdate(10, 10);
        tracker.onTrackEnd();
        tracker.forceFlush();

        tracker.onTrackStart({ id: 'track-1', duration: 10000 });
        tracker.onTimeUpdate(1, 10);
        tracker.onTimeUpdate(3, 10);
        tracker.onSkip();
        tracker.forceFlush();

        expect(tracker.getTrackSignal('track-1')).toMatchObject({
            playCount: 2,
            skipCount: 1,
        });
        expect(new ListeningTracker().getTrackSignal('track-1')?.playCount).toBe(2);
    });

    function listen(tracker, seconds, duration) {
        for (let time = 1; time <= seconds; time++) {
            vi.advanceTimersByTime(1000);
            tracker.onTimeUpdate(time, duration);
        }
    }

    const track = { id: 'song', duration: 100, title: 'Song', artists: [{ id: 'artist', name: 'Artist' }],
        genres: ['Ambient'], album: { id: 'album', title: 'Album' } };

    test('records completion, replay, album listening, and one finalization per session', () => {
        const tracker = new ListeningTracker();
        for (let i = 0; i < 2; i++) {
            tracker.onTrackStart(track);
            listen(tracker, 100, 100);
            tracker.onTrackEnd();
            tracker.onSkip();
        }
        expect(tracker.getTrackSignal('song')).toMatchObject({ playCount: 2, completionCount: 2, replayCount: 1, skipCount: 0, totalPlayTime: 200 });
        const profile = tracker.getTasteProfile();
        expect(profile.albums.album).toBeGreaterThan(0);
        expect(profile.artists.artist).toBeGreaterThan(0);
        expect(profile.genres.ambient).toBeGreaterThan(0);
        expect(profile.recent).toHaveLength(2);
    });

    test('separates early and late skips, including a mostly heard short song', () => {
        const tracker = new ListeningTracker();
        tracker.onTrackStart(track);
        listen(tracker, 5, 100);
        tracker.onSkip();
        tracker.onTrackStart(track);
        listen(tracker, 80, 100);
        tracker.onSkip();
        tracker.onTrackStart({ ...track, id: 'short', duration: 20 });
        listen(tracker, 15, 20);
        tracker.onSkip();
        expect(tracker.getTrackSignal('song')).toMatchObject({ earlySkipCount: 1, lateSkipCount: 1, skipCount: 2, completionCount: 0 });
        expect(tracker.getTrackSignal('short')).toMatchObject({ earlySkipCount: 0, lateSkipCount: 1 });
    });

    test('does not count seeks as heard audio, and accepts elapsed background playback', () => {
        const tracker = new ListeningTracker();
        tracker.onTrackStart(track);
        listen(tracker, 4, 100);
        tracker.onSeek(80);
        tracker.onTimeUpdate(80, 100);
        vi.advanceTimersByTime(1000);
        tracker.onTimeUpdate(81, 100);
        vi.advanceTimersByTime(9000);
        tracker.onTimeUpdate(90, 100);
        expect(tracker.getSessionSignals().accumulatedPlayTime).toBe(14);
        tracker.onTimeUpdate(99, 100); // No time elapsed: an unreported discontinuity.
        expect(tracker.getSessionSignals().accumulatedPlayTime).toBe(14);
    });

    test('checkpoints interrupted sessions once without treating reload as an early skip', () => {
        const tracker = new ListeningTracker();
        tracker.onTrackStart(track);
        listen(tracker, 20, 100);
        tracker.forceFlush();
        expect(tracker.getSessionSignals().currentTrackId).toBe('song');
        const recovered = new ListeningTracker();
        expect(recovered.getTrackSignal('song')).toMatchObject({ playCount: 1, totalPlayTime: 20, skipCount: 0 });
        recovered.forceFlush();
        expect(new ListeningTracker().getTrackSignal('song')?.playCount).toBe(1);
    });

    test('isolates accounts and closes the previous account session without a false skip', () => {
        const tracker = new ListeningTracker();
        tracker.setUser('alice');
        tracker.onTrackStart(track);
        listen(tracker, 10, 100);
        tracker.setUser('bob');
        expect(tracker.getTrackSignal('song')).toBeNull();
        expect(tracker.getSessionSignals().currentTrackId).toBeNull();
        tracker.recordSignal('like', { ...track, id: 'bob-song' });
        tracker.setUser('alice');
        expect(tracker.getTrackSignal('song')).toMatchObject({ playCount: 1, skipCount: 0, totalPlayTime: 10 });
        expect(tracker.getTrackSignal('bob-song')).toBeNull();
    });

    test('likes are idempotent and removable while playlist and exact search signals persist', () => {
        const tracker = new ListeningTracker();
        tracker.recordSignal('like', track);
        tracker.recordSignal('like', track);
        expect(tracker.getArtistAffinity('artist')).toBe(2);
        tracker.recordSignal('like', track, { added: false });
        tracker.recordSignal('like', track, { added: false });
        expect(tracker.getArtistAffinity('artist')).toBe(0);
        tracker.recordSignal('playlist-add', track);
        tracker.recordSearch('song', { tracks: { items: [track, { id: 'other', title: 'Unrelated' }] }, artists: [] });
        tracker.recordSearch('song', { tracks: [track] });
        expect(tracker.getTrackSignal('song')).toMatchObject({ likeCount: 0, playlistAddCount: 1, searchCount: 1 });
        expect(tracker.getTrackSignal('other')).toBeNull();
        tracker.recordSearch('artist', { artists: [{ id: 'artist', name: 'Artist' }] });
        expect(tracker.getArtistAffinity('artist')).toBe(1.5);
        expect(tracker.getTrackSignal('artist:artist')).toBeNull();
    });

    test('ignores unsupported favorites and closes audio tracking before podcast playback', () => {
        const tracker = new ListeningTracker();
        tracker.recordSignal('like', track, { type: 'mix' });
        expect(tracker.getTrackSignal('song')).toBeNull();
        tracker.onTrackStart(track);
        listen(tracker, 10, 100);
        tracker.onTrackStart({ id: 'podcast', isPodcast: true });
        listen(tracker, 50, 100);
        expect(tracker.getTrackSignal('song')?.totalPlayTime).toBe(10);
        expect(tracker.getTrackSignal('podcast')).toBeNull();
    });

    test('retains old skip history and recovers invalid stored collection shapes', () => {
        localStorage.setItem('monochrome-listening-data', JSON.stringify({ tracks: { song: { playCount: 2, skipCount: 2, totalPlayTime: 8, avgCompletionRatio: 0.04 } }, artists: null, albums: [], genres: null, recent: null }));
        const tracker = new ListeningTracker();
        tracker.onTrackStart(track);
        listen(tracker, 100, 100);
        tracker.onTrackEnd();
        expect(tracker.getTrackSignal('song')).toMatchObject({ playCount: 3, skipCount: 2, earlySkipCount: 2, completionCount: 1 });
        expect(tracker.getTasteProfile().recent).toHaveLength(1);
    });
});
