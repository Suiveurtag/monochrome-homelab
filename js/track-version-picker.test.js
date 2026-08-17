import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setupTrackVersionPicker } from './track-version-picker.js';

vi.mock('./downloads.js', () => ({ showNotification: vi.fn() }));

const rect = { left: 240, top: 700, right: 296, bottom: 756, width: 56, height: 56 };

beforeEach(() => {
    document.body.innerHTML = `
        <footer class="now-playing-bar">
            <div class="track-info">
                <button id="version-switch-button" hidden></button>
                <button class="now-playing-cover-button"></button>
            </div>
        </footer>
        <div id="track-version-popover" hidden></div>`;
    vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
            matches: query.includes('prefers-reduced-motion'),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }))
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.id === 'track-version-popover') {
            return { left: 224, top: 300, right: 632, bottom: 650, width: 408, height: 350 };
        }
        return rect;
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('track version player picker', () => {
    test('reveals linked versions, marks the active one, and switches in place', async () => {
        const original = {
            id: 'original',
            title: 'Afterglow',
            artist: { name: 'Artist' },
            album: { title: 'Album', cover: '/original.jpg' },
            versionGroupId: 'versions:original',
            alternativeVersionIds: ['instrumental'],
            versionLabel: 'Original',
            themeColor: '#a855f7',
        };
        const instrumental = {
            id: 'instrumental',
            title: 'Afterglow (Instrumental)',
            artist: { name: 'Artist' },
            album: { title: 'Instrumentals', cover: '/instrumental.jpg' },
            versionGroupId: 'versions:original',
            alternativeVersionIds: ['original'],
            versionLabel: 'Instrumental',
            themeColor: '#22c55e',
        };
        const player = { currentTrack: original, switchTrackVersion: vi.fn().mockResolvedValue(true) };
        const api = {
            getAPI: () => ({ getTracks: vi.fn().mockResolvedValue([original, instrumental]) }),
            getCoverUrl: (cover) => cover,
        };

        setupTrackVersionPicker(player, api);
        const trigger = document.getElementById('version-switch-button');
        await vi.waitFor(() => expect(trigger.hidden).toBe(false));
        expect(trigger.getAttribute('aria-label')).toContain('Afterglow');

        trigger.click();
        const panel = document.getElementById('track-version-popover');
        expect(panel.hidden).toBe(false);
        expect(panel.querySelectorAll('.track-version-option')).toHaveLength(2);
        expect(panel.querySelector('.track-version-option.is-active')?.dataset.versionId).toBe('original');
        expect(panel.style.left).toBe('224px');
        expect(panel.style.getPropertyValue('--track-version-disc-size')).toBe('56px');
        expect(panel.style.getPropertyValue('--track-version-list-inset')).toBe('8px');

        panel.querySelector('[data-version-id="instrumental"]').click();
        await vi.waitFor(() => expect(player.switchTrackVersion.mock.calls).toEqual([[instrumental]]));
        expect(panel.hidden).toBe(true);
        expect(trigger.querySelector('img').getAttribute('src')).toBe('/instrumental.jpg');
    });
});
