import { offlineCache } from './offline-cache.js';
import { db } from './db.js';
import { pb } from './accounts/config.js';
import { getActiveLibraryScope } from './account-library.js';
import { formatBytes } from './storage-units.js';
import { showNotification } from './downloads.js';
import '../storage-offline.css';

export function initializeOfflineUI({ api, player }) {
    const group = document.createElement('div');
    group.className = 'settings-group offline-settings';
    group.innerHTML = `<div class="setting-item"><div class="info"><span class="label">Offline listening</span>
            <span class="description" data-offline-status role="status">Checking this device’s storage…</span></div></div>
        <div class="setting-item"><div class="info"><label class="label" for="offline-favorites">Cache favorite songs</label>
            <span class="description">Save favorites automatically while online.</span></div>
            <label class="toggle-switch"><input id="offline-favorites" type="checkbox" aria-label="Cache favorite songs"><span class="slider"></span></label></div>
        <div class="setting-item"><div class="info"><label class="label" for="offline-limit">Cache size</label>
            <span class="description">Oldest unused songs are removed first. Downloaded playlists are kept.</span></div>
            <div class="offline-limit"><input id="offline-limit" type="number" min="1" max="1048576" step="1" aria-describedby="offline-limit-unit"><span id="offline-limit-unit">MiB</span><button class="btn-secondary" data-offline-apply>Apply</button></div></div>
        <div class="setting-item"><div class="info"><span class="label">Automatic cache</span><span class="description">Free space without removing downloaded playlists.</span></div>
            <button class="btn-secondary" data-offline-clear>Clear</button></div>
        <div class="offline-playlists" data-offline-playlists aria-label="Downloaded playlists"></div>
        <p class="offline-feedback" data-offline-feedback role="status"></p>`;
    document.querySelector('#settings-tab-downloads .settings-list')?.prepend(group);
    const button = document.createElement('button');
    button.id = 'offline-playlist-btn';
    button.type = 'button';
    button.className = 'btn-secondary';
    button.textContent = 'Keep offline';
    button.title = 'Download this playlist for offline listening';
    document.getElementById('download-playlist-btn')?.insertAdjacentElement('afterend', button);
    const feedback = (message) => {
        group.querySelector('[data-offline-feedback]').textContent = message;
    };
    let available = new Set();
    let refreshTimer;
    let refreshSequence = 0;
    let libraryReady = false;
    let favoriteController = null;
    const refresh = async () => {
        const sequence = ++refreshSequence;
        const scope = offlineCache.scope();
        try {
            const [status, entries, playlists] = await Promise.all([
                offlineCache.status(),
                offlineCache.entries(),
                offlineCache.playlists(),
            ]);
            if (sequence !== refreshSequence || scope !== offlineCache.scope()) return;
            available = new Set(entries.map((entry) => entry.id));
            group.querySelector('[data-offline-status]').textContent =
                `${status.count} songs · ${formatBytes(status.bytes)} of ${formatBytes(status.maxBytes)} · ${formatBytes(status.pinnedBytes)} kept in playlists${status.pinnedBytes > status.maxBytes ? ' — above the new limit' : ''}`;
            group.querySelector('#offline-favorites').checked = status.autoFavorites;
            const limit = group.querySelector('#offline-limit');
            if (document.activeElement !== limit) limit.value = Math.round(status.maxBytes / 1024 ** 2);
            const list = group.querySelector('[data-offline-playlists]');
            const focused = list.contains(document.activeElement) ? document.activeElement : null;
            const focusKey = focused && `${focused.dataset.playlistId}:${focused.dataset.action}`;
            list.replaceChildren();
            for (const playlist of playlists) {
                const count = playlist.tracks.filter((track) => available.has(String(track.id))).length;
                const row = document.createElement('div');
                row.className = 'offline-playlist-row';
                const name = document.createElement('span');
                name.textContent = `${playlist.name} · ${count}/${playlist.tracks.length} songs`;
                row.appendChild(name);
                for (const [label, action] of [
                    ['Play', 'play'],
                    [count === playlist.tracks.length ? 'Update' : 'Resume', 'resume'],
                    ['Remove', 'remove'],
                ]) {
                    const control = document.createElement('button');
                    control.type = 'button';
                    control.className = 'btn-secondary';
                    control.textContent = label;
                    control.dataset.playlistId = playlist.id;
                    control.dataset.action = action;
                    control.setAttribute('aria-label', `${label} ${playlist.name}`);
                    control.disabled =
                        action === 'play'
                            ? count === 0
                            : action === 'resume' && (!navigator.onLine || !!offlineCache.controller);
                    control.onclick = async () => {
                        try {
                            offlineCache.assertScope(scope);
                            if (action === 'remove') {
                                await offlineCache.removePlaylist(playlist.id);
                                feedback(`Removed the offline copy of ${playlist.name}.`);
                            } else if (action === 'resume') {
                                const current = await loadPlaylist(playlist.id, playlist);
                                offlineCache.assertScope(scope);
                                await download(current);
                            } else {
                                const tracks = playlist.tracks.filter((track) => available.has(String(track.id)));
                                await player.setQueue(tracks, 0, false, {
                                    kind: 'playlist',
                                    id: playlist.id,
                                    label: playlist.name,
                                });
                                await player.playTrackFromQueue();
                            }
                        } catch (error) {
                            feedback(error.message);
                        }
                    };
                    row.appendChild(control);
                }
                list.appendChild(row);
            }
            if (focusKey) {
                [...list.querySelectorAll('button')]
                    .find((control) => `${control.dataset.playlistId}:${control.dataset.action}` === focusKey)
                    ?.focus();
            }
            button.textContent = offlineCache.controller ? 'Cancel download' : 'Keep offline';
        } catch (error) {
            if (error.name !== 'AbortError') feedback(`Offline storage is unavailable: ${error.message}`);
        }
    };
    const loadPlaylist = async (id, fallback) => {
        const local = await db.getPlaylist(id);
        if (local) return local;
        try {
            const { playlist, tracks } = await api.getPlaylist(id);
            return { ...playlist, id: playlist.id || id, tracks };
        } catch (error) {
            if (fallback) return fallback;
            throw error;
        }
    };
    const download = async (playlist) => {
        if (!navigator.onLine) {
            feedback('Connect to the internet to download songs. Saved songs are still available.');
            return;
        }
        if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
        const scope = offlineCache.scope();
        const result = await offlineCache.downloadPlaylist(playlist, {
            resolveTrack: (id) => api.getTrackMetadata(id),
            onProgress: ({ downloaded, total }) => {
                button.textContent = `Cancel download (${downloaded}/${total})`;
                feedback(`Downloading ${downloaded} of ${total} songs…`);
            },
        });
        if (scope !== offlineCache.scope()) return;
        const message = result.cancelled
            ? `Download paused. ${result.downloaded} songs are saved.`
            : `${result.downloaded}/${result.total} songs available offline.${result.failures.length ? ` ${result.failures[0].message} Resume from Settings → Downloads.` : ''}`;
        feedback(message);
        showNotification(message);
        await refresh();
    };
    button.onclick = async () => {
        if (offlineCache.controller) {
            offlineCache.cancel();
            return;
        }
        try {
            const scope = offlineCache.scope();
            const id = window.location.pathname.match(/^\/(?:userplaylist|playlist)\/(?:t\/)?([^/]+)\/?$/)?.[1];
            if (!id) throw new Error('Open a playlist before downloading.');
            const playlist = await loadPlaylist(decodeURIComponent(id));
            offlineCache.assertScope(scope);
            await download(playlist);
        } catch (error) {
            showNotification(error.message);
            feedback(error.message);
        }
    };
    let favoriteTask = null;
    let favoritesDirty = false;
    const syncFavorites = () => {
        favoritesDirty = true;
        if (favoriteTask) return favoriteTask;
        favoriteTask = (async () => {
            while (favoritesDirty) {
                favoritesDirty = false;
                if (!libraryReady || !offlineCache.settings.autoFavorites || !navigator.onLine) break;
                const scope = offlineCache.scope();
                favoriteController = new AbortController();
                const signal = favoriteController.signal;
                const favorites = await db.getFavorites('track');
                if (!libraryReady || signal.aborted || scope !== offlineCache.scope()) continue;
                const result = await offlineCache.cacheFavorites(favorites, {
                    resolveTrack: (id) => api.getTrackMetadata(id),
                    signal,
                });
                if (scope === offlineCache.scope() && result.failures.length)
                    feedback(`Some favorites could not be cached. ${result.failures[0].message}`);
            }
        })()
            .catch((error) => {
                if (error.name !== 'AbortError') feedback(error.message);
            })
            .finally(() => {
                favoriteTask = null;
                favoriteController = null;
            });
        return favoriteTask;
    };
    group.querySelector('#offline-favorites').onchange = async (event) => {
        if (!event.target.checked) favoriteController?.abort();
        try {
            await offlineCache.configure({ autoFavorites: event.target.checked });
            void syncFavorites();
        } catch (error) {
            feedback(error.message);
        }
    };
    group.querySelector('[data-offline-apply]').onclick = async () => {
        try {
            await offlineCache.configure({ maxBytes: Number(group.querySelector('#offline-limit').value) * 1024 ** 2 });
            feedback('Cache limit saved. Downloaded playlists are protected.');
            void syncFavorites();
        } catch (error) {
            feedback(error.message);
        }
    };
    group.querySelector('[data-offline-clear]').onclick = async () => {
        try {
            await offlineCache.cleanup({ allAutomatic: true });
            feedback('Automatic cache cleared. Downloaded playlists are kept.');
        } catch (error) {
            feedback(error.message);
        }
    };
    window.addEventListener('favorites-changed', syncFavorites);
    window.addEventListener('library-changed', syncFavorites);
    window.addEventListener('online', () => {
        void syncFavorites();
        void refresh();
    });
    window.addEventListener('offline', () => {
        favoriteController?.abort();
        offlineCache.cancel();
        void refresh();
    });
    const changingAccount = () => {
        libraryReady = false;
        favoriteController?.abort();
        offlineCache.cancel();
        offlineCache.activeId = null;
        available.clear();
        ++refreshSequence;
        feedback('');
    };
    let lastScope = offlineCache.scope();
    pb.authStore.onChange(() => {
        const scope = offlineCache.scope();
        if (scope !== lastScope) {
            changingAccount();
            lastScope = scope;
        }
        void refresh();
    });
    window.addEventListener('account-library-changing', changingAccount);
    window.addEventListener('account-library-ready', (event) => {
        if (event.detail?.scope !== offlineCache.scope()) return;
        libraryReady = true;
        void syncFavorites();
        void refresh();
    });
    window.addEventListener('offline-cache-changed', () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => void refresh(), 100);
    });
    void (async () => {
        libraryReady = (await getActiveLibraryScope(db)) === offlineCache.scope();
        await offlineCache.cleanup();
        await refresh();
        await syncFavorites();
    })().catch((error) => {
        if (error.name !== 'AbortError') feedback(error.message);
    });
}
