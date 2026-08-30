import { beforeEach, describe, expect, test } from 'vitest';
import {
    applyTrackSaveStateToButton,
    buildTrackSaveStateSnapshot,
    getTrackSaveStateFromSnapshot,
} from '../track-save-ui.js';

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
        expect(button.innerHTML).toContain('track-save-symbol--plus');
        expect(button.innerHTML).toContain('track-save-circle--outline');
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
        expect(button.innerHTML).toContain('track-save-symbol--check');
        expect(button.innerHTML).toContain('track-save-circle--filled');
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
});
