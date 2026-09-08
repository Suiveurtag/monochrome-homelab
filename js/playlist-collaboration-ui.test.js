import { afterEach, expect, test, vi } from 'vitest';
import { watchCollaborativePlaylist } from './playlist-collaboration-ui.js';

const originalUrl = window.location.href;
let ui;
afterEach(() => {
    window.removeEventListener('collaborative-playlist-changed', ui?._collaborationListener);
    clearTimeout(ui?._collaborationRefreshTimer);
    history.replaceState(null, '', originalUrl);
    document.body.replaceChildren();
    vi.useRealTimers();
});

test.each(['playlist', 'userplaylist'])(
    'remote edits refresh the active %s route and preserve search and focus',
    async (route) => {
        vi.useFakeTimers();
        history.replaceState(null, '', `/${route}/shared-mix`);
        document.body.innerHTML =
            '<main class="main-content"><section id="page-playlist" class="active"><input id="track-list-search-input" value="piano"></section></main>';
        document.getElementById('track-list-search-input').focus();
        ui = {
            renderPlaylistPage: vi.fn(async () => {
                document.getElementById('page-playlist').innerHTML = '<input id="track-list-search-input">';
            }),
        };
        watchCollaborativePlaylist(ui, 'shared-mix');
        window.dispatchEvent(
            new CustomEvent('collaborative-playlist-changed', { detail: { playlistId: 'shared-mix' } })
        );
        await vi.advanceTimersByTimeAsync(160);
        expect(ui.renderPlaylistPage).toHaveBeenCalledWith('shared-mix', 'user');
        expect(document.getElementById('track-list-search-input').value).toBe('piano');
        expect(document.activeElement.id).toBe('track-list-search-input');
    }
);

test('a pending remote update cannot reopen a playlist after navigation', async () => {
    vi.useFakeTimers();
    history.replaceState(null, '', '/playlist/shared-mix');
    document.body.innerHTML = '<section id="page-playlist" class="active"></section>';
    ui = { renderPlaylistPage: vi.fn() };
    watchCollaborativePlaylist(ui, 'shared-mix');
    window.dispatchEvent(new CustomEvent('collaborative-playlist-changed', { detail: { playlistId: 'shared-mix' } }));
    history.replaceState(null, '', '/playlist/other');
    await vi.advanceTimersByTimeAsync(160);
    expect(ui.renderPlaylistPage).not.toHaveBeenCalled();
});
