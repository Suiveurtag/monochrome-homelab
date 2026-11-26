import { describe, expect, test } from 'vitest';
import { createBloomPlaybackClock } from './spicy-lyrics-clock.js';

function mediaClock(overrides = {}) {
    return {
        currentTime: 12,
        duration: 60,
        playbackRate: 1,
        readyState: HTMLMediaElement.HAVE_ENOUGH_DATA,
        paused: false,
        ended: false,
        seeking: false,
        ...overrides,
    };
}

describe('Bloom playback clock', () => {
    test('advances every display frame between the audio samples observed at 144 Hz', () => {
        const clock = createBloomPlaybackClock();
        const media = mediaClock();
        const displayInterval = 1000 / 144;
        const audioInterval = (2048 / 48000) * 1000;
        let previous = clock.read(media, 0);

        for (let frame = 1; frame < 144; frame += 1) {
            const now = frame * displayInterval;
            media.currentTime = 12 + Math.floor(now / audioInterval) * (audioInterval / 1000);
            const position = clock.read(media, now);
            expect(position - previous).toBeGreaterThan(6);
            expect(position - previous).toBeLessThan(8);
            previous = position;
        }
    });

    test('uses the actual position on pause, buffering, seek and clock reset', () => {
        const clock = createBloomPlaybackClock();
        const media = mediaClock();
        clock.read(media, 0);
        expect(clock.read(media, 14)).toBeGreaterThan(12000);
        media.paused = true;
        expect(clock.read(media, 28)).toBe(12000);
        media.paused = false;
        media.readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
        expect(clock.read(media, 250)).toBe(12000);
        media.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
        expect(clock.read(media, 300)).toBe(12000);
        media.currentTime = 31;
        media.seeking = true;
        expect(clock.read(media, 314)).toBe(31000);
        media.seeking = false;
        expect(clock.read(media, 328)).toBe(31000);
        media.playbackRate = 1.5;
        clock.reset();
        expect(clock.read(media, 342)).toBe(31000);
        expect(clock.read(media, 356)).toBe(31021);
    });

    test('stays at the measured time after an audio clock has stopped advancing', () => {
        const clock = createBloomPlaybackClock();
        const media = mediaClock();
        clock.read(media, 0);
        expect(clock.read(media, 500)).toBe(12000);
        expect(clock.read(media, 507)).toBe(12000);
        media.currentTime = 12.5;
        expect(clock.read(media, 514)).toBe(12500);
        expect(clock.read(media, 521)).toBe(12507);
    });
});
