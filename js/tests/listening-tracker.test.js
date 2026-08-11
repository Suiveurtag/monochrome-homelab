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
});
