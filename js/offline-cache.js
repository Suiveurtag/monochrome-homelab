import { pb } from './accounts/config.js';

const MB = 1024 * 1024;
export const OFFLINE_DEFAULTS = { autoFavorites: true, maxBytes: 1024 * MB };
const SETTINGS_KEY = 'monochrome-offline-settings';

function cacheError(message, code) {
    return Object.assign(new Error(message), { code });
}

export function planCacheEviction(entries, requiredBytes, maxBytes, protectedIds = []) {
    let usage = entries.reduce((sum, item) => sum + item.bytes, 0);
    const protectedSet = new Set(protectedIds.map(String));
    const candidates = entries.filter((entry) => !entry.playlists?.length && !protectedSet.has(String(entry.id)))
        .sort((a, b) => a.lastUsed - b.lastUsed || a.key.localeCompare(b.key));
    const evict = [];
    for (const entry of candidates) {
        if (usage + requiredBytes <= maxBytes) break;
        usage -= entry.bytes;
        evict.push(entry.key);
    }
    return { evict, fits: usage + requiredBytes <= maxBytes, usage };
}

function cloneMetadata(track) {
    return JSON.parse(JSON.stringify(track, (key, value) =>
        ['file', 'fileHandle', 'handle'].includes(key) || (typeof value === 'string' && value.startsWith('blob:'))
            ? undefined : value));
}

export class OfflineCache {
    constructor(options = {}) {
        this.dbName = options.dbName || 'monochrome-offline-v1';
        this.scope = options.scope || (() => `${pb.baseURL}|${pb.authStore.record?.id || pb.authStore.model?.id || 'guest'}`);
        this.fetch = options.fetch || ((...args) => fetch(...args));
        this.now = options.now || Date.now;
        this.activeId = null;
        this.pending = Promise.resolve();
        this.database = null;
        this.controller = null;
        this.download = null;
        this.progress = null;
    }

    get settings() {
        return this.settingsFor(this.scope());
    }

    settingsFor(scope) {
        try {
            const stored = JSON.parse(localStorage.getItem(`${SETTINGS_KEY}:${scope}`) || '{}');
            return { autoFavorites: stored.autoFavorites !== false, maxBytes: Math.min(1024 ** 4, Math.max(MB, Number(stored.maxBytes) || OFFLINE_DEFAULTS.maxBytes)) };
        } catch { return { ...OFFLINE_DEFAULTS }; }
    }

    async configure(values) {
        const scope = this.scope();
        const settings = { ...this.settingsFor(scope), ...values };
        if (!Number.isFinite(settings.maxBytes) || settings.maxBytes < MB || settings.maxBytes > 1024 ** 4) {
            throw new Error('Choose a cache size between 1 MB and 1 TB.');
        }
        localStorage.setItem(`${SETTINGS_KEY}:${scope}`, JSON.stringify(settings));
        await this.cleanup({ scope });
        this.changed();
    }

    assertScope(scope, signal) {
        if (signal?.aborted || scope !== this.scope()) {
            throw new DOMException('Account changed or download cancelled.', 'AbortError');
        }
    }

    changed() { window.dispatchEvent(new CustomEvent('offline-cache-changed')); }

    open() {
        if (this.database) return this.database;
        this.database = new Promise((resolve, reject) => {
            if (!globalThis.indexedDB) { reject(new Error('Offline storage is unavailable in this browser.')); return; }
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = () => {
                for (const name of ['tracks', 'audio', 'playlists']) request.result.createObjectStore(name, { keyPath: 'key' });
            };
            request.onsuccess = () => {
                request.result.onversionchange = () => { request.result.close(); this.database = null; };
                resolve(request.result);
            };
            request.onerror = () => { this.database = null; reject(request.error); };
        });
        return this.database;
    }

    async read(store, key) {
        const database = await this.open();
        return new Promise((resolve, reject) => {
            const request = database.transaction(store).objectStore(store)[key == null ? 'getAll' : 'get'](key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async write(callback) {
        const database = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['tracks', 'audio', 'playlists'], 'readwrite');
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Offline storage could not be updated.'));
            try { callback(transaction); } catch (error) { transaction.abort(); reject(error); }
        });
    }

    exclusive(callback) {
        const task = this.pending.catch(() => {}).then(() =>
            navigator.locks ? navigator.locks.request(`${this.dbName}:write`, callback) : callback());
        this.pending = task;
        return task;
    }

    key(id, scope = this.scope()) { return `${scope}:${id}`; }
    async entries(scope = this.scope()) {
        const entries = await this.read('tracks');
        this.assertScope(scope);
        return entries.filter((item) => item.scope === scope);
    }
    async playlists(scope = this.scope()) {
        const playlists = await this.read('playlists');
        this.assertScope(scope);
        return playlists.filter((item) => item.scope === scope);
    }
    async tracks() { return (await this.entries()).map((entry) => ({ ...entry.track, offlineAvailable: true })); }
    async status() {
        const scope = this.scope();
        const entries = await this.entries(scope);
        return {
            count: entries.length,
            bytes: entries.reduce((sum, item) => sum + item.bytes, 0),
            pinnedBytes: entries.filter((item) => item.playlists.length).reduce((sum, item) => sum + item.bytes, 0),
            ...this.settingsFor(scope),
        };
    }

    async cleanup({ allAutomatic = false, scope = this.scope() } = {}) {
        return this.exclusive(async () => {
            const entries = await this.entries(scope);
            const { evict } = planCacheEviction(entries, 0, allAutomatic ? 0 : this.settingsFor(scope).maxBytes, [this.activeId]);
            await this.write((transaction) => {
                this.assertScope(scope);
                evict.forEach((key) => {
                    transaction.objectStore('tracks').delete(key);
                    transaction.objectStore('audio').delete(key);
                });
            });
            this.changed();
        });
    }

    async cacheTrack(track, { playlistId = null, signal, resolveTrack, protectedIds = [] } = {}) {
        const scope = this.scope();
        if (track?.id == null) throw new Error('This song has no identifier.');
        if (playlistId != null) playlistId = String(playlistId);
        return this.exclusive(async () => {
            this.assertScope(scope, signal);
            const key = this.key(track.id, scope);
            const existing = await this.read('tracks', key);
            if (existing && (await this.read('audio', key))?.blob?.size) {
                if (playlistId && !existing.playlists.includes(playlistId)) existing.playlists.push(playlistId);
                existing.lastUsed = this.now();
                await this.write((tx) => {
                    this.assertScope(scope, signal);
                    tx.objectStore('tracks').put(existing);
                });
                this.changed();
                return existing;
            }
            let source = track;
            if (!source.file && !source.serverAudioUrl && !source.audioUrl && resolveTrack) source = await resolveTrack(track.id);
            this.assertScope(scope, signal);
            if (!source) throw new Error('This song is no longer available.');
            let blob = source.file;
            if (!blob) {
                const url = source.serverAudioUrl || source.audioUrl || source.remoteUrl;
                if (!url || /\.(m3u8|mpd)(?:$|[?#])/i.test(url)) throw new Error('This song has no downloadable audio file.');
                const timeout = AbortSignal.timeout(120000);
                const response = await this.fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
                if (!response.ok || response.status === 206 || response.type === 'opaque') throw new Error('The complete audio file could not be downloaded.');
                const type = response.headers.get('content-type') || '';
                if (/text\/|json|mpegurl|dash\+xml/i.test(type)) throw new Error('The server did not return an audio file.');
                const maxBytes = this.settingsFor(scope).maxBytes;
                if (Number(response.headers.get('content-length')) > maxBytes) {
                    await response.body?.cancel();
                    throw cacheError('This song is larger than the cache limit. Increase the limit in Settings.', 'TRACK_TOO_LARGE');
                }
                if (response.body) {
                    const reader = response.body.getReader();
                    const chunks = [];
                    let size = 0;
                    while (true) {
                        const part = await reader.read();
                        if (signal?.aborted || scope !== this.scope()) {
                            await reader.cancel();
                            this.assertScope(scope, signal);
                        }
                        if (part.done) break;
                        size += part.value.byteLength;
                        if (size > maxBytes) { await reader.cancel(); throw cacheError('This song is larger than the cache limit.', 'TRACK_TOO_LARGE'); }
                        chunks.push(part.value);
                    }
                    blob = new Blob(chunks, { type: type || 'audio/flac' });
                } else blob = await response.blob();
            }
            if (!blob.size) throw new Error('The audio file is empty.');
            this.assertScope(scope, signal);
            if (blob.size > this.settingsFor(scope).maxBytes) throw cacheError('This song is larger than the cache limit.', 'TRACK_TOO_LARGE');
            const entries = await this.entries(scope);
            const plan = planCacheEviction(entries.filter((item) => item.key !== key), blob.size, this.settingsFor(scope).maxBytes, [this.activeId, ...protectedIds]);
            if (!plan.fits) throw cacheError('The cache is full of songs being kept. Increase the limit or remove a downloaded playlist.', 'CACHE_FULL');
            const entry = { key, scope, id: String(track.id), track: cloneMetadata({ ...track, ...source }), bytes: blob.size,
                lastUsed: this.now(), playlists: playlistId ? [playlistId] : [] };
            // Audio, metadata and eviction commit together. A quota failure preserves existing music.
            await this.write((transaction) => {
                this.assertScope(scope, signal);
                for (const oldKey of plan.evict) {
                    transaction.objectStore('tracks').delete(oldKey);
                    transaction.objectStore('audio').delete(oldKey);
                }
                transaction.objectStore('tracks').put(entry);
                transaction.objectStore('audio').put({ key, blob });
            });
            this.changed();
            return entry;
        });
    }

    async playbackBlob(id) {
        const scope = this.scope();
        const key = this.key(id, scope);
        const audio = await this.read('audio', key);
        this.assertScope(scope);
        if (!audio?.blob) return null;
        this.activeId = String(id);
        void this.exclusive(async () => {
            this.assertScope(scope);
            const entry = await this.read('tracks', key);
            if (entry) {
                entry.lastUsed = this.now();
                await this.write((tx) => { this.assertScope(scope); tx.objectStore('tracks').put(entry); });
            }
        }).catch(console.warn);
        return audio.blob;
    }

    async downloadPlaylist(playlist, { resolveTrack, onProgress } = {}) {
        if (this.controller) throw new Error('An offline download is already in progress.');
        this.controller = new AbortController();
        const signal = this.controller.signal;
        const scope = this.scope();
        const id = String(playlist.uuid || playlist.id);
        this.download = { scope, id };
        const tracks = [...new Map((playlist.tracks || []).filter((track) => track?.id).map((track) => [String(track.id), track])).values()];
        if (!tracks.length) { this.controller = null; this.download = null; throw new Error('This playlist has no songs to download.'); }
        const snapshot = { key: this.key(id, scope), scope, id, name: playlist.name || playlist.title || 'Playlist', tracks: tracks.map(cloneMetadata), updatedAt: this.now() };
        const failures = [];
        let downloaded = 0;
        try {
            await this.exclusive(async () => {
                // Updating an offline playlist releases removed songs, without touching shared pins.
                const retained = new Set(tracks.map((track) => String(track.id)));
                const entries = await this.entries(scope);
                await this.write((tx) => {
                    this.assertScope(scope, signal);
                    tx.objectStore('playlists').put(snapshot);
                    for (const entry of entries) {
                        if (entry.playlists.includes(id) && !retained.has(entry.id)) {
                            entry.playlists = entry.playlists.filter((value) => value !== id);
                            tx.objectStore('tracks').put(entry);
                        }
                    }
                });
            });
            for (const track of tracks) {
                if (signal.aborted || scope !== this.scope()) break;
                try { await this.cacheTrack(track, { playlistId: id, resolveTrack, signal }); downloaded++; }
                catch (error) { if (error.name === 'AbortError') break; failures.push({ id: track.id, message: error.message }); }
                this.progress = { downloaded, total: tracks.length, failed: failures.length };
                onProgress?.(this.progress);
                this.changed();
            }
            return { downloaded, total: tracks.length, failures, cancelled: signal.aborted || scope !== this.scope() };
        } finally { this.controller = null; this.download = null; this.progress = null; this.changed(); }
    }

    cancel() { this.controller?.abort(); }

    async cacheFavorites(tracks, { resolveTrack, signal } = {}) {
        const scope = this.scope();
        let available = new Set((await this.entries(scope)).map((entry) => entry.id));
        const protectedIds = new Set();
        const result = { cached: 0, failures: [], full: false, cancelled: false };
        // Favorites arrive newest first. Keep that working set across scans instead
        // of cycling the whole library through a cache smaller than the library.
        for (const track of tracks) {
            if (signal?.aborted || scope !== this.scope() || !this.settingsFor(scope).autoFavorites) {
                result.cancelled = true;
                break;
            }
            if (track?.id == null || track.isVideo || track.isPodcast) continue;
            const id = String(track.id);
            if (available.has(id)) { protectedIds.add(id); continue; }
            try {
                await this.cacheTrack(track, { resolveTrack, signal, protectedIds: [...protectedIds] });
                protectedIds.add(id);
                available = new Set((await this.entries(scope)).map((entry) => entry.id));
                result.cached++;
            } catch (error) {
                if (error.name === 'AbortError') { result.cancelled = true; break; }
                if (error.code === 'CACHE_FULL') { result.full = true; break; }
                result.failures.push({ id, message: error.message });
            }
        }
        return result;
    }

    async removePlaylist(id) {
        id = String(id);
        const scope = this.scope();
        if (this.download?.id === id && this.download.scope === scope) this.cancel();
        return this.exclusive(async () => {
            const entries = await this.entries(scope);
            await this.write((tx) => {
                this.assertScope(scope);
                tx.objectStore('playlists').delete(this.key(id, scope));
                for (const entry of entries) {
                    if (!entry.playlists.includes(id)) continue;
                    entry.playlists = entry.playlists.filter((value) => value !== id);
                    if (!entry.playlists.length && entry.id !== this.activeId) {
                        tx.objectStore('tracks').delete(entry.key);
                        tx.objectStore('audio').delete(entry.key);
                    } else tx.objectStore('tracks').put(entry);
                }
            });
            this.changed();
        });
    }
}

export const offlineCache = new OfflineCache();
