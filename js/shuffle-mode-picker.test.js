import { afterEach, expect, test, vi } from 'vitest';
import { getShuffleMode } from './recommendation-settings.js';
import { setupShuffleModePicker } from './shuffle-mode-picker.js';

afterEach(() => {
    document.body.innerHTML = '';
    localStorage.removeItem('shuffle-mode');
});

test('defaults to smart and keeps an explicit real mode', () => {
    localStorage.removeItem('shuffle-mode');
    expect(getShuffleMode()).toBe('smart');
    localStorage.setItem('shuffle-mode', 'real');
    expect(getShuffleMode()).toBe('real');
});

test('opens from the keyboard, selects a mode and keeps the played queue intact', async () => {
    document.body.innerHTML = '<button id="shuffle">Shuffle</button>';
    const trigger = document.getElementById('shuffle');
    const tracks = [{ id: 'played' }, { id: 'current' }, { id: 'next' }];
    const player = {
        shuffleActive: true, currentQueueIndex: 1, currentTrack: tracks[1], shuffledQueue: tracks,
        preloadCache: new Map(), preloadNextTracks: vi.fn(), saveQueueState: vi.fn(),
    };
    setupShuffleModePicker(player, trigger);
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    const panel = document.getElementById('shuffle-mode-picker');
    expect(panel.hidden).toBe(false);
    expect(document.activeElement.value).toBe('smart');
    const real = panel.querySelector('[value="real"]');
    real.click();
    await Promise.resolve();
    expect(getShuffleMode()).toBe('real');
    expect(player.shuffledQueue.slice(0, 2)).toEqual(tracks.slice(0, 2));
    expect(player.saveQueueState).toHaveBeenCalled();
    real.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.all(panel.getAnimations().map((animation) => animation.finished.catch(() => {})));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
});
