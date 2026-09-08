import { expect, test, vi } from 'vitest';

vi.mock('./accounts/config.js', () => ({ pb: { authStore: { onChange: () => () => {} } } }));
vi.mock('./account-library.js', () => ({ getActiveLibraryScope: async () => 'fixture' }));
vi.mock('./downloads.js', () => ({ showNotification: vi.fn() }));
vi.mock('./db.js', () => ({ db: { getPlaylist: vi.fn(async (id) => ({ id, name: 'My playlist', tracks: [] })), getFavorites: async () => [] } }));
vi.mock('./offline-cache.js', () => ({ offlineCache: {
    scope: () => 'fixture', settings: { autoFavorites: false }, assertScope: () => {},
    cleanup: async () => {}, entries: async () => [], playlists: async () => [],
    status: async () => ({ count: 0, bytes: 0, maxBytes: 1024 ** 2, pinnedBytes: 0 }),
    downloadPlaylist: vi.fn(async () => ({ downloaded: 0, total: 0, failures: [] })),
} }));

import { initializeOfflineUI } from './offline-ui.js';
import { offlineCache } from './offline-cache.js';
import { db } from './db.js';

test('Keep offline downloads the personal playlist opened through the library route', async () => {
    const originalUrl = location.href;
    const persist = navigator.storage.persist ? vi.spyOn(navigator.storage, 'persist').mockResolvedValue(false) : null;
    try {
        history.replaceState(null, '', '/userplaylist/my%20mix');
        document.body.innerHTML = '<section id="settings-tab-downloads"><div class="settings-list"></div></section><button id="download-playlist-btn">Download</button>';
        initializeOfflineUI({ api: {}, player: {} });
        document.getElementById('offline-playlist-btn').click();
        await vi.waitFor(() => expect(offlineCache.downloadPlaylist.mock.calls.length).toBeGreaterThan(0));
        expect(db.getPlaylist.mock.calls[0]).toEqual(['my mix']);
        expect(offlineCache.downloadPlaylist.mock.calls[0][0]).toMatchObject({ id: 'my mix', name: 'My playlist' });
        await vi.waitFor(() => expect(document.querySelector('[data-offline-feedback]').textContent).toContain('0/0 songs available offline'));
    } finally {
        persist?.mockRestore();
        history.replaceState(null, '', originalUrl);
        document.body.replaceChildren();
    }
});
