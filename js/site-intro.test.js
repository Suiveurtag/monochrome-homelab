import { describe, expect, it } from 'vitest';
import { INTRO_INACTIVITY_MS, shouldPlaySiteIntro } from './site-intro.js';

describe('site intro inactivity', () => {
    const now = 10_000_000;

    it('plays when no activity has been recorded', () => {
        expect(shouldPlaySiteIntro(0, now)).toBe(true);
    });

    it('does not replay during an active two-hour window', () => {
        expect(shouldPlaySiteIntro(now - INTRO_INACTIVITY_MS + 1, now)).toBe(false);
    });

    it('replays once the inactivity window expires', () => {
        expect(shouldPlaySiteIntro(now - INTRO_INACTIVITY_MS, now)).toBe(true);
    });
});
