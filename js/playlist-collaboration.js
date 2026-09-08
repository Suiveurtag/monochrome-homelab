import { pb } from './accounts/config.js';
import { db } from './db.js';

const COLLECTION = 'shared_playlists';
const trackKey = (track) => `${track.type || 'track'}:${String(track.id)}`;
const accountScope = () => `${pb.baseURL}|${pb.authStore.record?.id || ''}`;

export function mapSharedPlaylist(record) {
    const tracks = record.tracks || [];
    return {
        id: record.uuid,
        name: record.name,
        description: record.description || '',
        cover: record.cover || '',
        tracks,
        numberOfTracks: tracks.length,
        images: [...new Set(tracks.map((track) => track.album?.cover).filter(Boolean))].slice(0, 4),
        createdAt: Date.parse(record.created) || Date.now(),
        updatedAt: Date.parse(record.updated) || Date.now(),
        isPublic: !!record.isPublic,
        collaboration: {
            recordId: record.id,
            owner: record.owner,
            members: record.members || [],
            identities: record.identities || [],
            revision: record.revision,
        },
    };
}

export function isPlaylistOwner(playlist) {
    return !playlist?.collaboration || playlist.collaboration.owner === pb.authStore.record?.id;
}

export function canEditPlaylist(playlist) {
    if (!playlist?.collaboration) return true;
    const userId = pb.authStore.record?.id;
    return !!userId && (playlist.collaboration.owner === userId || playlist.collaboration.members.includes(userId));
}

function changed(playlist, extra = {}) {
    window.dispatchEvent(new CustomEvent('playlist-tracks-changed', { detail: { playlistId: playlist.id, ...extra } }));
    window.dispatchEvent(new CustomEvent('collaborative-playlist-changed', { detail: { playlistId: playlist.id, ...extra } }));
    window.dispatchEvent(new CustomEvent('library-changed'));
}

export const playlistCollaboration = {
    userId: null,
    timer: null,
    unsubscribe: null,
    refreshing: null,
    generation: 0,
    removed: new Set(),

    session() {
        return { scope: accountScope(), generation: this.generation };
    },

    isCurrent(session) {
        return session.scope === accountScope() && session.generation === this.generation;
    },

    async cache(record, { notify = true, session = this.session(), authoritative = false } = {}) {
        const playlist = mapSharedPlaylist(record);
        if (!this.isCurrent(session) || !canEditPlaylist(playlist)) return null;
        const database = await db.open();
        if (!this.isCurrent(session)) return null;
        return new Promise((resolve, reject) => {
            // Comparison and replacement share one transaction, including across tabs.
            const transaction = database.transaction('user_playlists', 'readwrite');
            const store = transaction.objectStore('user_playlists');
            const request = store.get(playlist.id);
            let result = null;
            let updated = false;
            request.onsuccess = () => {
                if (!this.isCurrent(session) || (!authoritative && this.removed.has(record.id))) return;
                const previous = request.result;
                if (previous?.collaboration?.recordId === record.id && previous.collaboration.revision >= playlist.collaboration.revision) {
                    result = previous;
                    return;
                }
                if (authoritative) this.removed.delete(record.id);
                store.put(playlist);
                result = playlist;
                updated = true;
            };
            transaction.oncomplete = () => {
                if (!this.isCurrent(session)) { resolve(null); return; }
                if (updated && notify) changed(playlist);
                resolve(result);
            };
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Playlist cache update was interrupted.'));
        });
    },

    async removeCached(id, { session = this.session(), recordId } = {}) {
        if (!this.isCurrent(session)) return;
        if (recordId) this.removed.add(recordId);
        const database = await db.open();
        if (!this.isCurrent(session)) return;
        await new Promise((resolve, reject) => {
            const transaction = database.transaction('user_playlists', 'readwrite');
            const store = transaction.objectStore('user_playlists');
            const request = store.get(id);
            let deleted = false;
            request.onsuccess = () => {
                const previous = request.result;
                if (!this.isCurrent(session) || !previous?.collaboration || (recordId && previous.collaboration.recordId !== recordId)) return;
                this.removed.add(previous.collaboration.recordId);
                store.delete(id);
                deleted = true;
            };
            transaction.oncomplete = () => {
                if (deleted && this.isCurrent(session)) changed({ id }, { removed: true });
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Playlist cache update was interrupted.'));
        });
    },

    async refresh(playlist, { notify = false, session = this.session() } = {}) {
        if (!playlist?.collaboration) return playlist;
        if (!this.isCurrent(session)) return null;
        if (!canEditPlaylist(playlist)) {
            await this.removeCached(playlist.id, { session, recordId: playlist.collaboration.recordId });
            return null;
        }
        try {
            const record = await pb.collection(COLLECTION).getOne(playlist.collaboration.recordId);
            return this.cache(record, { notify, session, authoritative: true });
        } catch (error) {
            if (!this.isCurrent(session)) return null;
            if ([401, 403, 404].includes(error.status)) {
                await this.removeCached(playlist.id, { session, recordId: playlist.collaboration.recordId });
                return null;
            }
            // The last confirmed version stays readable when disconnected; writes always need the server.
            return { ...playlist, collaboration: { ...playlist.collaboration, offline: true } };
        }
    },

    async enable(playlist) {
        if (!pb.authStore.isValid) throw new Error('Sign in to collaborate on a playlist.');
        const session = this.session();
        if (playlist.collaboration) {
            const current = await this.refresh(playlist, { session });
            if (!current) throw new Error('You no longer have access to this playlist.');
            return current;
        }
        const record = await pb.send('/api/monochrome/playlists', {
            method: 'POST',
            body: { uuid: playlist.id, name: playlist.name, description: playlist.description, cover: playlist.cover, tracks: playlist.tracks, isPublic: playlist.isPublic },
        });
        const saved = await this.cache(record, { session, authoritative: true });
        if (!saved) throw new Error('Your account changed. Reopen the playlist to continue.');
        return saved;
    },

    async mutate(playlist, operation, { expectedRevision } = {}) {
        if (!canEditPlaylist(playlist)) throw new Error('You no longer have access to this playlist.');
        if (navigator.onLine === false) throw new Error('Reconnect to edit this shared playlist.');
        const session = this.session();
        let current = playlist;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                if (!this.isCurrent(session)) throw new Error('Your account changed. Reopen the playlist to continue.');
                const result = await pb.send(`/api/monochrome/playlists/${current.collaboration.recordId}/operations`, {
                    method: 'POST',
                    body: { revision: expectedRevision ?? current.collaboration.revision, operation },
                });
                if (!this.isCurrent(session)) throw new Error('Your account changed. Reopen the playlist to continue.');
                if (result.deleted || result.left) {
                    await this.removeCached(playlist.id, { session, recordId: current.collaboration.recordId });
                    return null;
                }
                const saved = await this.cache(result, { session, authoritative: true });
                if (operation.type === 'add') {
                    const prior = new Set((current.tracks || []).map(trackKey));
                    const addedTracks = (saved?.tracks || []).filter((track) => !prior.has(trackKey(track)));
                    if (addedTracks.length) window.dispatchEvent(new CustomEvent('playlist-tracks-changed', { detail: { playlistId: playlist.id, addedTracks } }));
                }
                return saved;
            } catch (error) {
                if ([401, 403, 404].includes(error.status)) {
                    await this.refresh(current, { notify: true, session });
                    throw new Error('Your playlist access changed. Refresh to continue.');
                }
                if (error.status === 409) {
                    current = await this.refresh(current, { notify: true, session });
                    // Semantic add/remove operations are safe to retry; never overwrite a newer order or membership edit.
                    if (current && ['add', 'remove'].includes(operation.type) && attempt < 2) continue;
                    throw new Error('Someone updated this playlist. The latest version is loaded; try your change again.');
                }
                throw new Error(error.response?.message || error.message || 'Could not save the playlist. Reconnect and try again.');
            }
        }
    },

    async reconcile() {
        if (!this.userId || !pb.authStore.isValid) return;
        if (this.refreshing) return this.refreshing;
        const session = this.session();
        const pending = (async () => {
            const records = await pb.collection(COLLECTION).getFullList();
            if (!this.isCurrent(session)) return;
            const ids = new Set(records.map((record) => record.uuid));
            const cached = await db.getAll('user_playlists');
            for (const playlist of cached) {
                if (!this.isCurrent(session)) return;
                if (playlist.collaboration && !ids.has(playlist.id)) await this.removeCached(playlist.id, { session, recordId: playlist.collaboration.recordId });
            }
            for (const record of records) await this.cache(record, { session, authoritative: true });
        })().finally(() => { if (this.refreshing === pending) this.refreshing = null; });
        this.refreshing = pending;
        return this.refreshing;
    },

    async start(user) {
        this.generation++;
        const session = this.session();
        clearInterval(this.timer);
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.refreshing = null;
        this.removed = new Set();
        this.userId = user?.$id || user?.id || null;
        // Clear another account's shared snapshots even if the new account is offline.
        const cached = await db.getAll('user_playlists');
        for (const playlist of cached) {
            if (!this.isCurrent(session)) return;
            if (playlist.collaboration && (!this.userId || !canEditPlaylist(playlist))) await this.removeCached(playlist.id, { session, recordId: playlist.collaboration.recordId });
        }
        if (!this.userId) {
            return;
        }
        const refresh = () => this.reconcile().catch((error) => console.warn('[Playlists] Sync unavailable:', error.status || error.message));
        await refresh();
        if (!this.isCurrent(session)) return;
        // Reconcile after reconnect and periodically: revoked memberships stop receiving record events.
        this.timer = setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, 20000);
        if (!this.onReconnect) {
            this.onReconnect = () => { if (document.visibilityState !== 'hidden') void this.reconcile().catch(() => {}); };
            window.addEventListener('online', this.onReconnect);
            document.addEventListener('visibilitychange', this.onReconnect);
        }
        try {
            const unsubscribe = await pb.collection(COLLECTION).subscribe('*', (event) => {
                if (!this.isCurrent(session)) return;
                const update = event.action === 'delete'
                    ? this.removeCached(event.record.uuid, { session, recordId: event.record.id })
                    : this.cache(event.record, { session });
                void update.catch((error) => console.warn('[Playlists] Could not store live update:', error.message));
            });
            if (!this.isCurrent(session)) { void unsubscribe(); return; }
            this.unsubscribe = unsubscribe;
        } catch (error) { console.warn('[Playlists] Live updates unavailable; periodic sync remains active.', error.status); }
    },
};

export { trackKey as sharedPlaylistTrackKey };
