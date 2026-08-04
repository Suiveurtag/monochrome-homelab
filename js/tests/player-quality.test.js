import { describe, expect, it } from 'vitest';
import {
    getAvailableQualityOptions,
    getNextLowerQuality,
    resolvePlaybackQuality,
    suggestPlaybackQuality,
} from '../player-quality.js';

const lossyTrack = { audioQuality: 'HIGH', mediaMetadata: { tags: ['AAC'] } };
const cdTrack = { audioQuality: 'LOSSLESS', mediaMetadata: { tags: ['LOSSLESS'] } };
const hiResTrack = { audioQuality: 'HI_RES_LOSSLESS', mediaMetadata: { tags: ['HI_RES_LOSSLESS'] } };

describe('player quality profiles', () => {
    it('does not offer lossless choices when the track metadata is lossy', () => {
        expect(getAvailableQualityOptions(lossyTrack).map((option) => option.id)).toEqual([
            'LOWEST',
            'LOW',
            'NORMAL',
            'HIGH',
        ]);
    });

    it('offers CD lossless without inventing Hi-Res availability', () => {
        expect(getAvailableQualityOptions(cdTrack).map((option) => option.id)).toContain('LOSSLESS');
        expect(getAvailableQualityOptions(cdTrack).map((option) => option.id)).not.toContain('HI_RES_LOSSLESS');
    });

    it('selects a conservative profile for data saver and 2G connections', () => {
        expect(suggestPlaybackQuality({ saveData: true, downlink: 10 }, hiResTrack)).toBe('LOWEST');
        expect(suggestPlaybackQuality({ effectiveType: '2g' }, hiResTrack)).toBe('LOWEST');
    });

    it('selects Hi-Res only on a fast connection and a compatible track', () => {
        expect(suggestPlaybackQuality({ downlink: 12, effectiveType: '4g' }, hiResTrack)).toBe('HI_RES_LOSSLESS');
        expect(suggestPlaybackQuality({ downlink: 12, effectiveType: '4g' }, lossyTrack)).toBe('HIGH');
    });

    it('steps down through every usable tier and skips unavailable lossless tiers', () => {
        expect(getNextLowerQuality('HI_RES_LOSSLESS', hiResTrack)).toBe('LOSSLESS');
        expect(getNextLowerQuality('LOSSLESS', cdTrack)).toBe('HIGH');
        expect(resolvePlaybackQuality('HI_RES_LOSSLESS', lossyTrack, [], { downlink: 10 })).toBe('HIGH');
    });
});
