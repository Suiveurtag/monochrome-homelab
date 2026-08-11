import { describe, expect, test } from 'vitest';
import { MusicDatabase } from './db.js';
import { getTrackThemeColor, normalizeTrackThemeColor } from './track-theme-color.js';

describe('track theme colors', () => {
    test('normalizes valid six-digit hex colors', () => {
        expect(normalizeTrackThemeColor('  #4A90E2 ')).toBe('#4a90e2');
    });

    test('rejects invalid or absent colors so artwork remains the fallback', () => {
        expect(normalizeTrackThemeColor('#fff')).toBe('');
        expect(normalizeTrackThemeColor('blue')).toBe('');
        expect(getTrackThemeColor({})).toBe('');
    });

    test('reads a custom color from a track', () => {
        expect(getTrackThemeColor({ themeColor: '#C084FC' })).toBe('#c084fc');
    });

    test('keeps the color in compact favorites, history, and playlist track copies', () => {
        const compact = new MusicDatabase()._minifyItem('track', {
            id: 'track-1',
            title: 'Song',
            themeColor: '#4a90e2',
        });

        expect(compact.themeColor).toBe('#4a90e2');
    });
});
