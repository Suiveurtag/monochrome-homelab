import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    applyTrackSaveStateToButton,
    buildTrackSaveStateSnapshot,
    getTrackSaveStateFromSnapshot,
} from '../track-save-ui.js';
import { likeBurstSettings } from '../storage.js';

describe('track save button', () => {
    let button;

    beforeEach(() => {
        document.body.innerHTML = '';
        button = document.createElement('button');
        button.className = 'track-save-btn';
        document.body.appendChild(button);
    });

    test('uses the supplied plus-circle artwork when the track is not saved', () => {
        applyTrackSaveStateToButton(button, {
            isFavorite: false,
            isSaved: false,
            playlistIds: [],
        });

        expect(button.classList.contains('active')).toBe(false);
        expect(button.getAttribute('aria-pressed')).toBe('false');
        const icon = button.querySelector('.track-save-icon');
        expect(icon.classList.contains('is-saved')).toBe(false);
        expect(icon.querySelector('.track-save-plus').getAttribute('d')).toBe('M8 5.1L8 10.9M5.1 8L10.9 8');
        expect(button.title).toContain('Add to Liked Songs');
    });

    test('uses the supplied check-circle artwork when saved in a playlist', () => {
        applyTrackSaveStateToButton(button, {
            isFavorite: false,
            isSaved: true,
            playlistIds: ['playlist-1'],
        });

        expect(button.classList.contains('active')).toBe(true);
        expect(button.dataset.playlistCount).toBe('1');
        expect(button.getAttribute('aria-pressed')).toBe('false');
        const icon = button.querySelector('.track-save-icon');
        expect(icon.classList.contains('is-saved')).toBe(true);
        expect(icon.querySelector('.track-save-check').getAttribute('d')).toBe('M4.75 8.25L7.05 10.5L11.3 5.75');
        expect(button.title).toContain('Saved in a playlist');
    });

    test('exposes favorite state and its playlist-on-click affordance independently from saved state', () => {
        applyTrackSaveStateToButton(button, {
            isFavorite: true,
            isSaved: true,
            playlistIds: [],
        });

        expect(button.dataset.isFavorite).toBe('true');
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(button.title).toContain('Add to playlist');
        expect(button.title).toContain('Right-click to remove');
    });

    test('keeps one icon across state changes so the ring can fill and the check draw in', () => {
        const state = { isFavorite: false, isSaved: false, playlistIds: [] };
        applyTrackSaveStateToButton(button, state);
        const icon = button.querySelector('.track-save-icon');

        applyTrackSaveStateToButton(button, { ...state, isFavorite: true, isSaved: true }, { animate: true });

        expect(button.querySelector('.track-save-icon')).toBe(icon);
        expect(icon.classList.contains('is-saved')).toBe(true);
        expect(icon.classList.contains('track-save-icon--instant')).toBe(false);
    });

    test('marks a track saved when it exists only in a playlist', () => {
        const snapshot = buildTrackSaveStateSnapshot(
            [],
            [],
            [{ id: 'playlist-1', tracks: [{ id: 'track-1', type: 'track' }] }]
        );

        expect(getTrackSaveStateFromSnapshot(snapshot, 'track', 'track-1')).toEqual({
            isFavorite: false,
            isSaved: true,
            playlistIds: ['playlist-1'],
        });
    });

    test('the like effect setting picks which burst plays around the button', () => {
        vi.useFakeTimers();
        try {
            const unsaved = { isFavorite: false, isSaved: false, playlistIds: [] };
            const saved = { isFavorite: true, isSaved: true, playlistIds: [] };
            applyTrackSaveStateToButton(button, unsaved);
            // jsdom reports zero rects; fake them so the overlays spawn. The SVG variants measure
            // the icon, the legacy ones measure the whole button.
            const icon = button.querySelector('.track-save-icon');
            vi.spyOn(icon, 'getBoundingClientRect').mockReturnValue({ width: 22, height: 22, left: 10, top: 10 });
            vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ width: 30, height: 30, left: 6, top: 6 });
            const like = () => {
                button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                applyTrackSaveStateToButton(button, saved, { animate: true });
            };
            const unlike = () => applyTrackSaveStateToButton(button, unsaved);
            const settle = () => vi.advanceTimersByTime(1000);

            like();
            expect(document.querySelector('.track-save-burst-ring')).toBeTruthy();
            expect(document.querySelectorAll('.track-save-burst-dot').length).toBe(8);
            settle();
            expect(document.querySelector('.track-save-burst')).toBeNull();

            likeBurstSettings.setEffect('dots');
            unlike();
            like();
            expect(document.querySelector('.track-save-burst-ring')).toBeNull();
            expect(document.querySelectorAll('.track-save-burst-dot').length).toBe(6);
            settle();

            likeBurstSettings.setEffect('spectrum');
            unlike();
            like();
            expect(document.querySelector('.track-save-spectrum')).toBeTruthy();
            settle();

            likeBurstSettings.setEffect('confetti');
            unlike();
            like();
            expect(document.querySelectorAll('.track-save-burst-spark').length).toBe(14);
            expect(document.querySelector('.track-save-confetti-layer')).toBeNull();
            settle();

            likeBurstSettings.setEffect('shockwave');
            unlike();
            like();
            expect(document.querySelector('.track-save-shockwave')).toBeTruthy();
            settle();
            expect(document.querySelector('.track-save-shockwave')).toBeNull();

            likeBurstSettings.setEffect('none');
            unlike();
            like();
            expect(
                document.querySelector('.track-save-burst, .track-save-spectrum, .track-save-confetti-layer, .track-save-shockwave')
            ).toBeNull();
        } finally {
            vi.useRealTimers();
            localStorage.removeItem(likeBurstSettings.STORAGE_KEY);
        }
    });
});
