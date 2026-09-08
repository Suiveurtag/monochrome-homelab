import { afterEach, expect, test, vi } from 'vitest';
import { initializeKeyboardNavigation, installKeyboardShortcuts } from './keyboard-navigation.js';

let cleanup;
let cleanupShortcuts;
afterEach(() => {
    cleanup?.();
    cleanupShortcuts?.();
    document.body.replaceChildren();
});

const key = (target, value, extra = {}) => target.dispatchEvent(new KeyboardEvent('keydown', {
    key: value, bubbles: true, cancelable: true, ...extra,
}));

test('integrated queue rows support arrows and Enter activates their playback button', () => {
    document.body.innerHTML = '<div class="queue-track-list">' + ['First', 'Second'].map((title, index) =>
        `<div class="queue-track-row" data-queue-index="${index}"><button class="queue-track-main"><span class="queue-track-copy"><strong>${title}</strong></span></button></div>`).join('') + '</div>';
    cleanup = initializeKeyboardNavigation();
    const rows = [...document.querySelectorAll('.queue-track-row')];
    const play = vi.fn();
    rows[1].querySelector('button').onclick = play;
    rows[0].focus();
    key(rows[0], 'ArrowDown');
    expect(document.activeElement).toBe(rows[1]);
    expect(rows[1].getAttribute('aria-label')).toBe('Second');
    key(rows[1], 'Enter');
    expect(play).toHaveBeenCalledOnce();
});

test('native dialogs suppress global playback shortcuts and close on Escape', async () => {
    document.body.innerHTML = '<button id="trigger">Open</button><dialog><p tabindex="0">Details</p><button>Done</button></dialog>';
    const trigger = document.getElementById('trigger');
    trigger.focus();
    cleanup = initializeKeyboardNavigation();
    const playPause = vi.fn();
    cleanupShortcuts = installKeyboardShortcuts({ playPause });
    const dialog = document.querySelector('dialog');
    dialog.showModal();
    await vi.waitFor(() => expect(dialog.getAttribute('aria-modal')).toBe('true'));
    const text = dialog.querySelector('p');
    text.focus();
    key(text, ' ');
    expect(playPause).not.toHaveBeenCalled();
    key(text, 'Escape');
    expect(dialog.open).toBe(false);
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});

test('Escape uses the integrated queue close action instead of trapping the user', () => {
    document.body.innerHTML = '<aside role="dialog" aria-modal="true"><button class="queue-back-button">Back</button></aside>';
    const close = vi.fn();
    const button = document.querySelector('button');
    button.onclick = close;
    cleanup = initializeKeyboardNavigation();
    key(button, 'Escape');
    expect(close).toHaveBeenCalledOnce();
});

test('new queue rows gain navigation after dynamic rendering', async () => {
    document.body.innerHTML = '<div class="queue-track-list"></div>';
    cleanup = initializeKeyboardNavigation();
    document.querySelector('div').innerHTML = '<div class="queue-track-row" data-queue-index="1"><button class="queue-track-main">Play</button></div>';
    const row = document.querySelector('.queue-track-row');
    await vi.waitFor(() => expect(row.tabIndex).toBe(0));
    expect(row.dataset.keyboardRow).toBe('true');
});
