import { getTrackKey, isSameTrack, minifyHybridTrack, withTrackIdentity } from './track-model.ts';

export class MusicDatabase {
    constructor() {
        this.dbName = 'MonochromeDB';
        this.version = 12;
        this.db = null;
    }

    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // v10 introduced track_ratings (bad PR) - remove it
                if (db.objectStoreNames.contains('track_ratings')) {
                    db.deleteObjectStore('track_ratings');
                }

                // Favorites stores
                if (!db.objectStoreNames.contains('favorites_tracks')) {
                    const store = db.createObjectStore('favorites_tracks', { keyPath: 'id' });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('favorites_videos')) {
                    const store = db.createObjectStore('favorites_videos', { keyPath: 'id' });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('favorites_albums')) {
                    const store = db.createObjectStore('favorites_albums', { keyPath: 'id' });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('favorites_artists')) {
                    const store = db.createObjectStore('favorites_artists', { keyPath: 'id' });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('favorites_playlists')) {
                    const store = db.createObjectStore('favorites_playlists', { keyPath: 'uuid' });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('favorites_mixes')) {
                    const store = db.createObjectStore('favorites_mixes', { keyPath: 'id' });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('history_tracks')) {
                    const store = db.createObjectStore('history_tracks', { keyPath: 'timestamp' });
                    store.createIndex('timestamp', 'timestamp', { unique: true });
                }
                if (!db.objectStoreNames.contains('user_playlists')) {
                    const store = db.createObjectStore('user_playlists', { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('user_folders')) {
                    const store = db.createObjectStore('user_folders', { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings');
                }
                if (!db.objectStoreNames.contains('pinned_items')) {
                    const store = db.createObjectStore('pinned_items', { keyPath: 'id' });
                    store.createIndex('pinnedAt', 'pinnedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('track_catalog')) {
                    const store = db.createObjectStore('track_catalog', { keyPath: 'trackKey' });
                    store.createIndex('source.kind', 'source.kind', { unique: false });
                    store.createIndex('source.provider', 'source.provider', { unique: false });
                    store.createIndex('source.sourceId', 'source.sourceId', { unique: false });
                    store.createIndex('isrc', 'isrc', { unique: false });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('track_metadata_overrides')) {
                    db.createObjectStore('track_metadata_overrides', { keyPath: 'trackKey' });
                }
                if (!db.objectStoreNames.contains('favorites_track_refs')) {
                    const store = db.createObjectStore('favorites_track_refs', { keyPath: 'trackKey' });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                }
            };
        });
    }

    // Generic Helper
    async performTransaction(storeName, mode, callback) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = callback(store);

            let result;
            if (request) {
                request.onsuccess = () => {
                    result = request.result;
                };
            }

            transaction.oncomplete = () => {
                resolve(result);
            };
            transaction.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async getAll(storeName) {
        return this.performTransaction(storeName, 'readonly', (store) => store.getAll());
    }

    async _putTrackSnapshot(track) {
        if (!track) return null;
        const snapshot = minifyHybridTrack(track);
        snapshot.updatedAt = snapshot.updatedAt || Date.now();
        await this.performTransaction('track_catalog', 'readwrite', (store) => store.put(snapshot));
        return snapshot;
    }

    async _getTrackSnapshot(trackKey) {
        if (!trackKey) return null;
        try {
            return await this.performTransaction('track_catalog', 'readonly', (store) => store.get(trackKey));
        } catch {
            return null;
        }
    }

    _getTrackKey(item) {
        return getTrackKey(item);
    }

    // History API
    async addToHistory(track) {
        const storeName = 'history_tracks';
        const minified = this._minifyItem(track.type || 'track', track);
        await this._putTrackSnapshot(minified);

        const db = await this.open();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const index = store.index('timestamp');

            const lastReq = index.openCursor(null, 'prev');
            let lastTimestamp = 0;

            lastReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && lastTimestamp === 0) {
                    lastTimestamp = cursor.value.timestamp;
                }

                const timestamp = Math.max(Date.now(), lastTimestamp + 1);
                const entry = { ...minified, timestamp };

                const dedupeReq = index.openCursor(null, 'prev');
                dedupeReq.onsuccess = (e2) => {
                    const dedupeCursor = e2.target.result;
                    if (dedupeCursor) {
                        const trackInHistory = dedupeCursor.value;
                        if (isSameTrack(trackInHistory, minified)) {
                            store.delete(dedupeCursor.primaryKey);
                        }
                        dedupeCursor.continue();
                    } else {
                        store.put(entry);
                        resolve(entry);
                    }
                };
            };

            transaction.onerror = (e) => reject(e.target.error);
        });
    }

    async getHistory() {
        const storeName = 'history_tracks';
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index('timestamp');
            const request = index.getAll();

            request.onsuccess = () => {
                // Return reversed (newest first)
                resolve(request.result.reverse());
            };
            request.onerror = () => reject(request.error);
        });
    }

    async clearHistory() {
        const storeName = 'history_tracks';
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Favorites API
    async toggleFavorite(type, item) {
        const plural = type === 'mix' ? 'mixes' : `${type}s`;
        const storeName = `favorites_${plural}`;
        const isTrack = type === 'track';
        const identifiedItem = isTrack ? withTrackIdentity(item) : item;
        const key = type === 'playlist' ? item.uuid : isTrack ? this._getTrackKey(identifiedItem) : item.id;
        const legacyKey = type === 'playlist' ? item.uuid : item.id;
        const exists = await this.isFavorite(type, isTrack ? identifiedItem : key);

        if (exists) {
            if (isTrack) {
                await this.performTransaction('favorites_track_refs', 'readwrite', (store) => store.delete(key));
                const legacyExists = await this.performTransaction(storeName, 'readonly', (store) => store.get(legacyKey));
                if (legacyExists && !legacyExists.trackKey) {
                    await this.performTransaction(storeName, 'readwrite', (store) => store.delete(legacyKey));
                }
            } else {
                await this.performTransaction(storeName, 'readwrite', (store) => store.delete(key));
            }
            window.dispatchEvent(new CustomEvent('favorites-changed'));
            return false; // Removed
        } else {
            const minified = this._minifyItem(type, identifiedItem);
            const entry = { ...minified, addedAt: Date.now() };
            if (isTrack) {
                await this._putTrackSnapshot(entry);
                await this.performTransaction('favorites_track_refs', 'readwrite', (store) =>
                    store.put({ trackKey: entry.trackKey, addedAt: entry.addedAt })
                );
            } else {
                await this.performTransaction(storeName, 'readwrite', (store) => store.put(entry));
            }
            window.dispatchEvent(new CustomEvent('favorites-changed'));
            return true; // Added
        }
    }

    async isFavorite(type, id) {
        const plural = type === 'mix' ? 'mixes' : `${type}s`;
        const storeName = `favorites_${plural}`;
        try {
            if (type === 'track') {
                const trackKey = this._getTrackKey(id);
                if (trackKey) {
                    const ref = await this.performTransaction('favorites_track_refs', 'readonly', (store) =>
                        store.get(trackKey)
                    );
                    if (ref) return true;
                }
                const legacyId = typeof id === 'object' && id !== null ? id.id : id;
                const legacy = await this.performTransaction(storeName, 'readonly', (store) => store.get(legacyId));
                return !!legacy;
            }
            const result = await this.performTransaction(storeName, 'readonly', (store) => store.get(id));
            return !!result;
        } catch {
            return false;
        }
    }

    async getFavorites(type) {
        const plural = type === 'mix' ? 'mixes' : `${type}s`;
        const storeName = `favorites_${plural}`;
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);

            const request = store.getAll();

            request.onsuccess = async () => {
                let results =
                    type === 'track'
                        ? request.result.map((track) => (track.trackKey ? track : this._minifyItem('track', track)))
                        : request.result;
                if (type === 'track') {
                    const refs = await this.getAll('favorites_track_refs').catch(() => []);
                    const snapshots = await Promise.all(
                        refs.map(async (ref) => {
                            const snapshot = await this._getTrackSnapshot(ref.trackKey);
                            return snapshot ? { ...snapshot, addedAt: ref.addedAt || snapshot.addedAt || null } : null;
                        })
                    );
                    const seen = new Set();
                    results = [...snapshots.filter(Boolean), ...results].filter((track) => {
                        const key = track.trackKey || `legacy:${track.id}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                }
                results.sort((a, b) => {
                    const aTime = a.addedAt || 0;
                    const bTime = b.addedAt || 0;
                    return bTime - aTime; // Newest first
                });
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    _minifyItem(type, item) {
        if (!item) return item;
        const normalizedType = (type || '').toLowerCase();

        // Base properties to keep
        const base = {
            id: item.id,
            addedAt: item.addedAt || null,
        };

        if (normalizedType === 'track') {
            return minifyHybridTrack({ ...base, ...item });
        }

        if (normalizedType === 'video') {
            return {
                ...base,
                type: 'video',
                title: item.title || null,
                duration: item.duration || null,
                image: item.image || item.cover || null,
                artist: item.artist || (item.artists && item.artists.length > 0 ? item.artists[0] : null) || null,
                artists: item.artists?.map((a) => ({ id: a.id, name: a.name || null })) || [],
                album: item.album || { title: 'Video', cover: item.image || item.cover },
            };
        }

        if (type === 'album') {
            return {
                ...base,
                title: item.title || null,
                cover: item.cover || null,
                releaseDate: item.releaseDate || null,
                explicit: item.explicit || false,
                // UI uses singular 'artist'
                artist: item.artist
                    ? { name: item.artist.name || null, id: item.artist.id }
                    : item.artists?.[0]
                      ? { name: item.artists[0].name || null, id: item.artists[0].id }
                      : null,
                // Keep type and track count for UI labels
                type: item.type || null,
                numberOfTracks: item.numberOfTracks || null,
            };
        }

        if (type === 'artist') {
            return {
                ...base,
                name: item.name || null,
                picture: item.picture || item.image || null, // Handle both just in case
            };
        }

        if (type === 'playlist') {
            return {
                uuid: item.uuid || item.id,
                addedAt: item.addedAt || item.createdAt || null,
                title: item.title || item.name || null,
                // UI checks squareImage || image || uuid
                image: item.image || item.squareImage || item.cover || null,
                numberOfTracks: item.numberOfTracks || (item.tracks ? item.tracks.length : 0),
                user: item.user ? { name: item.user.name || null } : null,
            };
        }

        if (type === 'mix') {
            return {
                id: item.id,
                addedAt: item.addedAt,
                title: item.title,
                subTitle: item.subTitle,
                description: item.description,
                mixType: item.mixType,
                cover: item.cover,
            };
        }

        return item;
    }

    _minifyPinnedItem(item, type) {
        if (!item) return null;

        const id = item.id || item.uuid;
        let name, cover, href, images;

        switch (type) {
            case 'album':
                name = item.title;
                cover = item.cover;
                href = `/album/${id}`;
                break;
            case 'artist':
                name = item.name;
                cover = item.picture;
                href = `/artist/${id}`;
                break;
            case 'playlist':
                name = item.title || item.name;
                cover = item.image || item.cover;
                href = `/playlist/${id}`;
                break;
            case 'user-playlist':
                name = item.name;
                cover = item.cover;
                images = item.images;
                href = `/userplaylist/${id}`;
                break;
            default:
                return null;
        }

        return {
            id: id,
            type: type,
            name: name,
            cover: cover,
            images: images,
            href: href,
        };
    }

    async togglePinned(item, type) {
        const storeName = 'pinned_items';
        const minifiedItem = this._minifyPinnedItem(item, type);
        if (!minifiedItem) return;

        const key = minifiedItem.id;
        const exists = await this.isPinned(key);

        if (exists) {
            await this.performTransaction(storeName, 'readwrite', (store) => store.delete(key));
            return false;
        } else {
            const allPinned = await this.getPinned();
            if (allPinned.length >= 3) {
                const oldest = allPinned.sort((a, b) => a.pinnedAt - b.pinnedAt)[0];
                await this.performTransaction(storeName, 'readwrite', (store) => store.delete(oldest.id));
            }
            const entry = { ...minifiedItem, pinnedAt: Date.now() };
            await this.performTransaction(storeName, 'readwrite', (store) => store.put(entry));
            return true;
        }
    }

    async isPinned(id) {
        const storeName = 'pinned_items';
        try {
            const result = await this.performTransaction(storeName, 'readonly', (store) => store.get(id));
            return !!result;
        } catch {
            return false;
        }
    }

    async exportData() {
        const tracks = await this.getFavorites('track');
        const albums = await this.getFavorites('album');
        const artists = await this.getFavorites('artist');
        const playlists = await this.getFavorites('playlist');
        const mixes = await this.getFavorites('mix');
        const history = await this.getHistory();

        const userPlaylists = await this.getPlaylists(true);
        const userFolders = await this.getFolders();
        const data = {
            favorites_tracks: tracks.map((t) => this._minifyItem('track', t)),
            favorites_track_refs: tracks
                .map((t) => (t.trackKey ? { trackKey: t.trackKey, addedAt: t.addedAt || null } : null))
                .filter(Boolean),
            favorites_albums: albums.map((a) => this._minifyItem('album', a)),
            favorites_artists: artists.map((a) => this._minifyItem('artist', a)),
            favorites_playlists: playlists.map((p) => this._minifyItem('playlist', p)),
            favorites_mixes: mixes.map((m) => this._minifyItem('mix', m)),
            history_tracks: history.map((t) => this._minifyItem('track', t)),
            user_playlists: userPlaylists,
            user_folders: userFolders,
        };
        return data;
    }

    async importData(data, clear = false) {
        const db = await this.open();

        // Safety check: if clear=true but all data is empty, skip to avoid wiping existing data
        if (clear) {
            const allEmpty = [
                data.favorites_tracks,
                data.favorites_track_refs,
                data.favorites_albums,
                data.favorites_artists,
                data.favorites_playlists,
                data.favorites_mixes,
                data.history_tracks,
                data.user_playlists,
                data.user_folders,
            ].every((arr) => !arr || (Array.isArray(arr) ? arr.length === 0 : Object.keys(arr).length === 0));

            if (allEmpty) {
                console.warn(
                    '[importData] Aborting: clear=true but all import data is empty. Existing data preserved.'
                );
                return false;
            }
        }

        const importStore = async (storeName, items) => {
            if (items === undefined) return false;

            let itemsArray = Array.isArray(items) ? items : Object.values(items || {});

            console.log(`Importing to ${storeName}: ${itemsArray.length} items`);

            if (itemsArray.length === 0) {
                if (clear) {
                    return new Promise((resolve, reject) => {
                        const transaction = db.transaction(storeName, 'readwrite');
                        const store = transaction.objectStore(storeName);

                        const countReq = store.count();
                        countReq.onsuccess = () => {
                            if (countReq.result > 0) {
                                store.clear();
                            }
                        };

                        transaction.oncomplete = () => {
                            resolve(countReq.result > 0);
                        };
                        transaction.onerror = () => reject(transaction.error);
                    });
                }
                return false;
            }

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);

                if (clear) {
                    console.log(`[importData] Clearing ${storeName} before import`);
                    store.clear();
                }

                itemsArray.forEach((item) => {
                    if (item.id && typeof item.id === 'string' && !isNaN(item.id)) {
                        item.id = parseInt(item.id, 10);
                    }
                    if (item.album?.id && typeof item.album.id === 'string' && !isNaN(item.album.id)) {
                        item.album.id = parseInt(item.album.id, 10);
                    }
                    if (item.artists) {
                        item.artists.forEach((artist) => {
                            if (artist.id && typeof artist.id === 'string' && !isNaN(artist.id)) {
                                artist.id = parseInt(artist.id, 10);
                            }
                        });
                    }

                    // Critical: Ensure key exists for IndexedDB store.put()
                    const keyPath = store.keyPath;
                    if (keyPath && !item[keyPath]) {
                        console.warn(`Item missing keyPath "${keyPath}" in ${storeName}, generating fallback.`);
                        if (keyPath === 'uuid') item.uuid = crypto.randomUUID();
                        else if (keyPath === 'id')
                            item.id = item.trackId || item.albumId || item.artistId || Date.now() + Math.random();
                        else if (keyPath === 'timestamp') item.timestamp = Date.now() + Math.random();
                    }

                    store.put(item);
                });

                transaction.oncomplete = () => {
                    console.log(`${storeName}: Imported ${itemsArray.length} items`);
                    resolve(true);
                };

                transaction.onerror = (event) => {
                    console.error(`${storeName}: Transaction error:`, event.target.error);
                    reject(transaction.error);
                };
            });
        };

        console.log('Starting import with data:', {
            tracks: data.favorites_tracks?.length || 0,
            albums: data.favorites_albums?.length || 0,
            artists: data.favorites_artists?.length || 0,
            playlists: data.favorites_playlists?.length || 0,
            mixes: data.favorites_mixes?.length || 0,
            history: data.history_tracks?.length || 0,
            userPlaylists: data.user_playlists?.length || 0,
            user_folders: data.user_folders?.length || 0,
        });

        const results = await Promise.all([
            (async () => {
                const trackItems = Array.isArray(data.favorites_tracks)
                    ? data.favorites_tracks
                    : Object.values(data.favorites_tracks || {});
                const trackRefs = Array.isArray(data.favorites_track_refs)
                    ? data.favorites_track_refs
                    : Object.values(data.favorites_track_refs || {});

                if (clear) {
                    await importStore('track_catalog', []);
                    await importStore('favorites_track_refs', []);
                }

                for (const track of trackItems) {
                    if (track?.trackKey) {
                        const snapshot = await this._putTrackSnapshot(track);
                        if (snapshot) {
                            await this.performTransaction('favorites_track_refs', 'readwrite', (store) =>
                                store.put({ trackKey: snapshot.trackKey, addedAt: track.addedAt || Date.now() })
                            );
                        }
                    }
                }

                for (const ref of trackRefs) {
                    if (ref?.trackKey) {
                        await this.performTransaction('favorites_track_refs', 'readwrite', (store) => store.put(ref));
                    }
                }

                return importStore('favorites_tracks', data.favorites_tracks);
            })(),
            importStore('favorites_albums', data.favorites_albums),
            importStore('favorites_artists', data.favorites_artists),
            importStore('favorites_playlists', data.favorites_playlists),
            importStore('favorites_mixes', data.favorites_mixes),
            importStore('history_tracks', data.history_tracks),
            data.user_playlists ? importStore('user_playlists', data.user_playlists) : Promise.resolve(false),
            data.user_folders ? importStore('user_folders', data.user_folders) : Promise.resolve(false),
        ]);

        console.log('Import results:', results);
        return results.some((r) => r);
    }

    _updatePlaylistMetadata(playlist) {
        playlist.numberOfTracks = playlist.tracks ? playlist.tracks.length : 0;

        if (!playlist.cover) {
            const uniqueCovers = [];
            const seenCovers = new Set();
            const tracks = playlist.tracks || [];
            for (const track of tracks) {
                const cover = track.album?.cover;
                if (cover && !seenCovers.has(cover)) {
                    seenCovers.add(cover);
                    uniqueCovers.push(cover);
                    if (uniqueCovers.length >= 4) break;
                }
            }
            playlist.images = uniqueCovers;
        }
        return playlist;
    }

    _dispatchPlaylistSync(action, playlist) {
        window.dispatchEvent(
            new CustomEvent('sync-playlist-change', {
                detail: { action, playlist },
            })
        );
    }

    // User Playlists API
    async createPlaylist(name, tracks = [], cover = '', description = '') {
        const id = crypto.randomUUID();
        const playlist = {
            id: id,
            name: name,
            tracks: tracks.map((t) => this._minifyItem(t.type || 'track', { ...t, addedAt: Date.now() })),
            cover: cover,
            description: description,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            numberOfTracks: tracks.length,
            images: [], // Initialize images
        };
        for (const track of playlist.tracks) {
            await this._putTrackSnapshot(track);
        }
        this._updatePlaylistMetadata(playlist);
        await this.performTransaction('user_playlists', 'readwrite', (store) => store.put(playlist));

        // TRIGGER SYNC
        this._dispatchPlaylistSync('create', playlist);
        window.dispatchEvent(new CustomEvent('playlist-tracks-changed'));

        return playlist;
    }

    async addTrackToPlaylist(playlistId, track) {
        const playlist = await this.performTransaction('user_playlists', 'readonly', (store) => store.get(playlistId));
        if (!playlist) throw new Error('Playlist not found');
        playlist.tracks = playlist.tracks || [];
        const trackWithDate = { ...track, addedAt: Date.now() };
        const minifiedTrack = this._minifyItem(track.type || 'track', trackWithDate);
        if (playlist.tracks.some((t) => isSameTrack(t, minifiedTrack))) return;
        await this._putTrackSnapshot(minifiedTrack);
        playlist.tracks.push(minifiedTrack);
        playlist.updatedAt = Date.now();
        this._updatePlaylistMetadata(playlist);
        await this.performTransaction('user_playlists', 'readwrite', (store) => store.put(playlist));

        this._dispatchPlaylistSync('update', playlist);
        window.dispatchEvent(new CustomEvent('playlist-tracks-changed'));

        return playlist;
    }

    async addTracksToPlaylist(playlistId, tracks) {
        const playlist = await this.performTransaction('user_playlists', 'readonly', (store) => store.get(playlistId));
        if (!playlist) throw new Error('Playlist not found');
        playlist.tracks = playlist.tracks || [];

        let addedCount = 0;
        for (const track of tracks) {
            if (!playlist.tracks.some((t) => isSameTrack(t, track))) {
                const trackWithDate = { ...track, addedAt: Date.now() };
                const minifiedTrack = this._minifyItem(track.type || 'track', trackWithDate);
                await this._putTrackSnapshot(minifiedTrack);
                playlist.tracks.push(minifiedTrack);
                addedCount++;
            }
        }

        if (addedCount > 0) {
            playlist.updatedAt = Date.now();
            this._updatePlaylistMetadata(playlist);
            await this.performTransaction('user_playlists', 'readwrite', (store) => store.put(playlist));
            this._dispatchPlaylistSync('update', playlist);
            window.dispatchEvent(new CustomEvent('playlist-tracks-changed'));
        }

        return playlist;
    }

    async removeTrackFromPlaylist(playlistId, trackId, trackType = null) {
        const playlist = await this.performTransaction('user_playlists', 'readonly', (store) => store.get(playlistId));
        if (!playlist) throw new Error('Playlist not found');
        playlist.tracks = playlist.tracks || [];
        playlist.tracks = playlist.tracks.filter((t) => {
            if (trackId && t.trackKey === trackId) return false;
            if (trackType) {
                return !(t.id == trackId && (t.type || 'track') === trackType);
            }
            return t.id != trackId;
        });
        playlist.updatedAt = Date.now();
        this._updatePlaylistMetadata(playlist);
        await this.performTransaction('user_playlists', 'readwrite', (store) => store.put(playlist));

        this._dispatchPlaylistSync('update', playlist);
        window.dispatchEvent(new CustomEvent('playlist-tracks-changed'));

        return playlist;
    }

    async deletePlaylist(playlistId) {
        await this.performTransaction('user_playlists', 'readwrite', (store) => store.delete(playlistId));

        // TRIGGER SYNC (but for deleting)
        this._dispatchPlaylistSync('delete', { id: playlistId });
        window.dispatchEvent(new CustomEvent('playlist-tracks-changed'));
    }

    async getPlaylist(playlistId) {
        return await this.performTransaction('user_playlists', 'readonly', (store) => store.get(playlistId));
    }

    async updatePlaylist(playlist) {
        playlist.updatedAt = Date.now();
        this._updatePlaylistMetadata(playlist);
        await this.performTransaction('user_playlists', 'readwrite', (store) => store.put(playlist));

        this._dispatchPlaylistSync('update', playlist);

        return playlist;
    }

    async addPlaylistToFolder(folderId, playlistId) {
        const folder = await this.getFolder(folderId);
        if (!folder) throw new Error('Folder not found');
        folder.playlists = folder.playlists || [];
        if (!folder.playlists.includes(playlistId)) {
            folder.playlists.push(playlistId);
            folder.updatedAt = Date.now();
            await this.performTransaction('user_folders', 'readwrite', (store) => store.put(folder));
        }
        return folder;
    }

    // User Folders API
    async createFolder(name, cover = '') {
        const id = crypto.randomUUID();
        const folder = {
            id: id,
            name: name,
            cover: cover,
            playlists: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        await this.performTransaction('user_folders', 'readwrite', (store) => store.put(folder));
        return folder;
    }

    async getFolders() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('user_folders', 'readonly');
            const store = transaction.objectStore('user_folders');
            const index = store.index('createdAt');
            const request = index.getAll();
            request.onsuccess = () => resolve(request.result.reverse());
            request.onerror = () => reject(request.error);
        });
    }

    async getFolder(id) {
        return await this.performTransaction('user_folders', 'readonly', (store) => store.get(id));
    }

    async deleteFolder(id) {
        await this.performTransaction('user_folders', 'readwrite', (store) => store.delete(id));
    }

    async getPinned() {
        const storeName = 'pinned_items';
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result;
                results.sort((a, b) => b.pinnedAt - a.pinnedAt);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getPlaylists(includeTracks = false) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('user_playlists', 'readwrite'); // Changed to readwrite for lazy migration
            const store = transaction.objectStore('user_playlists');
            const index = store.index('createdAt');
            const request = index.getAll();
            request.onsuccess = () => {
                const playlists = request.result.reverse(); // Newest first
                const processedPlaylists = playlists.map((playlist) => {
                    let needsUpdate = false;

                    // Lazy migration for numberOfTracks
                    if (typeof playlist.numberOfTracks === 'undefined') {
                        playlist.numberOfTracks = playlist.tracks ? playlist.tracks.length : 0;
                        needsUpdate = true;
                    }

                    // Lazy migration for images (collage)
                    if (!playlist.cover && (!playlist.images || playlist.images.length === 0)) {
                        this._updatePlaylistMetadata(playlist);
                        needsUpdate = true;
                    }

                    if (needsUpdate) {
                        // We are in a readwrite transaction, so we can put back
                        try {
                            store.put(playlist);
                        } catch (e) {
                            console.warn('Failed to update playlist metadata', e);
                        }
                    }

                    if (includeTracks) {
                        return playlist;
                    }

                    // Return lightweight copy without tracks
                    const { tracks, ...minified } = playlist;
                    return minified;
                });
                resolve(processedPlaylists);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async updatePlaylistName(playlistId, newName) {
        const playlist = await this.performTransaction('user_playlists', 'readonly', (store) => store.get(playlistId));
        if (!playlist) throw new Error('Playlist not found');
        playlist.name = newName;
        playlist.updatedAt = Date.now();
        await this.performTransaction('user_playlists', 'readwrite', (store) => store.put(playlist));
        return playlist;
    }

    async updatePlaylistDescription(playlistId, newDescription) {
        const playlist = await this.performTransaction('user_playlists', 'readonly', (store) => store.get(playlistId));
        if (!playlist) throw new Error('Playlist not found');
        playlist.description = newDescription;
        playlist.updatedAt = Date.now();
        await this.performTransaction('user_playlists', 'readwrite', (store) => store.put(playlist));

        this._dispatchPlaylistSync('update', playlist);

        return playlist;
    }

    async updatePlaylistTracks(playlistId, tracks) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('user_playlists', 'readwrite');
            const store = transaction.objectStore('user_playlists');

            const getRequest = store.get(playlistId);
            getRequest.onsuccess = () => {
                const playlist = getRequest.result;
                if (!playlist) {
                    reject(new Error('Playlist not found'));
                    return;
                }
                playlist.tracks = tracks;
                playlist.updatedAt = Date.now();
                this._updatePlaylistMetadata(playlist);
                const putRequest = store.put(playlist);
                putRequest.onsuccess = () => {
                    resolve(playlist);
                };
                putRequest.onerror = () => {
                    reject(putRequest.error);
                };
            };
            getRequest.onerror = () => {
                reject(getRequest.error);
            };

            transaction.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async saveSetting(key, value) {
        await this.performTransaction('settings', 'readwrite', (store) => store.put(value, key));
    }

    async getSetting(key) {
        return await this.performTransaction('settings', 'readonly', (store) => store.get(key));
    }
}

export const db = new MusicDatabase();
