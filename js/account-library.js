// Keep device uploads/settings in place while switching the user's private library.
export const ACCOUNT_LIBRARY_STORES = [
    'favorites_tracks', 'favorites_videos', 'favorites_albums', 'favorites_artists',
    'favorites_playlists', 'favorites_mixes', 'history_tracks', 'user_playlists',
    'user_folders', 'pinned_items',
];
const ACTIVE = 'account-library-active';
const snapshotKey = (scope) => `account-library-snapshot:${scope}`;
export const accountLibraryScope = (pb) => `${pb.baseURL}|${pb.authStore.record?.id || 'guest'}`;

export async function getActiveLibraryScope(database) {
    return database.performTransaction('settings', 'readonly', (store) => store.get(ACTIVE));
}

export async function activateAccountLibrary(database, scope, isCurrent = () => true) {
    const connection = await database.open();
    if (!isCurrent()) return false;
    return new Promise((resolve, reject) => {
        const tx = connection.transaction(['settings', ...ACCOUNT_LIBRARY_STORES], 'readwrite');
        const settings = tx.objectStore('settings');
        let activated = false;
        tx.oncomplete = () => resolve(activated);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not switch account library.'));
        const active = settings.get(ACTIVE);
        active.onsuccess = () => {
            if (!isCurrent()) return;
            const previous = active.result;
            if (!previous || previous === scope) {
                // Adopt the pre-upgrade library once; future accounts each get their own snapshot.
                settings.put(scope, ACTIVE);
                activated = true;
                return;
            }
            const snapshot = {};
            let pending = ACCOUNT_LIBRARY_STORES.length + 1;
            let restored;
            const ready = () => {
                if (--pending || !isCurrent()) return;
                settings.put(snapshot, snapshotKey(previous));
                for (const name of ACCOUNT_LIBRARY_STORES) {
                    const store = tx.objectStore(name);
                    store.clear();
                    for (const item of restored?.[name] || []) store.put(item);
                }
                settings.put(scope, ACTIVE);
                activated = true;
            };
            for (const name of ACCOUNT_LIBRARY_STORES) {
                const request = tx.objectStore(name).getAll();
                request.onsuccess = () => { snapshot[name] = request.result; ready(); };
            }
            const restore = settings.get(snapshotKey(scope));
            restore.onsuccess = () => { restored = restore.result; ready(); };
        };
    });
}

/** Import cloud data atomically, retaining shared records that may have advanced in realtime. */
export async function replaceAccountLibrary(database, scope, data, isCurrent = () => true) {
    const connection = await database.open();
    if (!isCurrent()) return false;
    const names = ACCOUNT_LIBRARY_STORES.filter((name) => Object.hasOwn(data, name));
    return new Promise((resolve, reject) => {
        const tx = connection.transaction(['settings', ...names], 'readwrite');
        let imported = false;
        tx.oncomplete = () => resolve(imported);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not sync account library.'));
        const active = tx.objectStore('settings').get(ACTIVE);
        active.onsuccess = () => {
            if (active.result !== scope || !isCurrent()) return;
            const write = (shared = []) => {
                if (!isCurrent()) return;
                const sharedIds = new Set(shared.map((playlist) => playlist.id));
                for (const name of names) {
                    const store = tx.objectStore(name);
                    store.clear();
                    for (const item of data[name]) {
                        if (name === 'user_playlists' && (item.collaboration || sharedIds.has(item.id))) continue;
                        store.put(item);
                    }
                    if (name === 'user_playlists') for (const playlist of shared) store.put(playlist);
                }
                imported = true;
            };
            if (names.includes('user_playlists')) {
                const request = tx.objectStore('user_playlists').getAll();
                request.onsuccess = () => write(request.result.filter((playlist) => playlist.collaboration));
            } else write();
        };
    });
}
