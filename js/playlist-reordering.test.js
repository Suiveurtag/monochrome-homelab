import { afterEach, expect, test, vi } from 'vitest';
import { bindPlaylistReordering } from './playlist-reordering.js';
import { createKeyboardShortcuts } from './keyboard-shortcuts.js';

afterEach(() => {
    document.body.replaceChildren();
});

function fixture(options = {}) {
    const container = document.createElement('div');
    container.innerHTML =
        '<div class="track-list-header">Title</div>' +
        ['a', 'b', 'c'].map((id) => `<div class="track-item" data-track-id="${id}" tabindex="0">${id}</div>`).join('');
    document.body.append(container);
    const tracks = ['a', 'b', 'c'].map((id) => ({ id }));
    const save = vi.fn(async (order, revision) => ({ tracks: order, collaboration: { revision: revision + 1 } }));
    const onError = vi.fn();
    bindPlaylistReordering(container, { tracks, revision: 7, save, onError, ...options });
    return {
        container,
        tracks,
        save,
        onError,
        order: () => [...container.querySelectorAll('.track-item')].map((row) => row.dataset.trackId),
        move: (id, key = 'ArrowUp', modifiers = { altKey: true, shiftKey: true }) => {
            const row = container.querySelector(`[data-track-id="${id}"]`);
            row.focus();
            row.dispatchEvent(new KeyboardEvent('keydown', { key, ...modifiers, bubbles: true, cancelable: true }));
        },
    };
}

test('keyboard reorder sends the displayed revision, then uses the acknowledged revision', async () => {
    const f = fixture();
    f.move('b');
    await vi.waitFor(() => expect(f.container.hasAttribute('aria-busy')).toBe(false));
    expect(f.save.mock.calls[0][1]).toBe(7);
    expect(f.order()).toEqual(['b', 'a', 'c']);
    expect(f.tracks.map((track) => track.id)).toEqual(f.order());
    expect(document.activeElement.dataset.trackId).toBe('b');
    f.move('c');
    await vi.waitFor(() => expect(f.container.hasAttribute('aria-busy')).toBe(false));
    expect(f.save.mock.calls[1][1]).toBe(8);
    expect(f.order()).toEqual(['b', 'c', 'a']);
});

test('rejected stale reorder restores the DOM and leaves confirmed data untouched', async () => {
    const conflict = new Error('Someone updated this playlist.');
    const save = vi.fn(async () => {
        throw conflict;
    });
    const f = fixture({ save });
    f.move('b');
    await vi.waitFor(() => expect(f.onError).toHaveBeenCalledWith(conflict));
    expect(f.order()).toEqual(['a', 'b', 'c']);
    expect(f.tracks.map((track) => track.id)).toEqual(['a', 'b', 'c']);
    expect(document.activeElement.dataset.trackId).toBe('b');
});

test('pending saves exclude a second move and do not mutate confirmed tracks', async () => {
    let acknowledge;
    const save = vi.fn(
        () =>
            new Promise((resolve) => {
                acknowledge = resolve;
            })
    );
    const f = fixture({ save });
    f.move('b');
    f.move('c');
    expect(save).toHaveBeenCalledTimes(1);
    expect(f.tracks.map((track) => track.id)).toEqual(['a', 'b', 'c']);
    acknowledge({ tracks: save.mock.calls[0][0], collaboration: { revision: 8 } });
    await vi.waitFor(() => expect(f.container.hasAttribute('aria-busy')).toBe(false));
    expect(f.order()).toEqual(['b', 'a', 'c']);
});

test('canceled drag restores the original order without persisting it', () => {
    const f = fixture();
    const row = f.container.querySelector('[data-track-id="a"]');
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
    f.container.append(row);
    row.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    expect(f.order()).toEqual(['a', 'b', 'c']);
    expect(f.save).not.toHaveBeenCalled();
});

test('reordering follows customized shortcuts and ignores the replaced binding', async () => {
    const values = new Map();
    const registry = createKeyboardShortcuts(
        { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) },
        () => {}
    );
    expect(registry.setShortcut('moveTrackUp', { key: 'u', ctrl: true, shift: true, alt: false }).ok).toBe(true);
    const f = fixture({ registry });
    f.move('b');
    expect(f.save).not.toHaveBeenCalled();
    f.move('b', 'u', { ctrlKey: true, shiftKey: true });
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    expect(f.order()).toEqual(['b', 'a', 'c']);
});
