import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
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
    expect(panel.getAnimations()).toHaveLength(0);
    expect(document.activeElement.value).toBe('smart');
    const real = panel.querySelector('[value="real"]');
    await page.getByText('Real Random', { exact: true }).click();
    expect(real.checked).toBe(true);
    expect(panel.hidden).toBe(false);
    expect(getShuffleMode()).toBe('real');
    expect(player.shuffledQueue.slice(0, 2)).toEqual(tracks.slice(0, 2));
    expect(player.saveQueueState).toHaveBeenCalled();
    real.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.all(panel.getAnimations().map((animation) => animation.finished.catch(() => {})));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
});

test('reopening during dismissal continues from the visible frame', async () => {
    document.body.innerHTML = '<button id="shuffle">Shuffle</button>';
    const trigger = document.getElementById('shuffle');
    setupShuffleModePicker({ shuffleActive: false }, trigger);
    const panel = document.getElementById('shuffle-mode-picker');
    const rightClick = () => trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    rightClick();
    const [opening] = panel.getAnimations();
    expect(opening.effect.getTiming().duration).toBe(380);
    expect(opening.effect.getKeyframes()[0].clipPath).toContain('999px');
    await opening.finished;
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const [exit] = panel.getAnimations();
    exit.pause();
    exit.currentTime = 70;
    const opacity = Number(getComputedStyle(panel).opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);

    rightClick();
    const [reopen] = panel.getAnimations();
    expect(Number(reopen.effect.getKeyframes()[0].opacity)).toBeCloseTo(opacity);
    await reopen.finished;
    expect(panel.hidden).toBe(false);
    expect(panel.inert).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
});
