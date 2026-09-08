import { afterEach, expect, test } from 'vitest';
import { MusicDatabase } from './db.js';
import { activateAccountLibrary, replaceAccountLibrary, getActiveLibraryScope } from './account-library.js';

const databases = [];
afterEach(async () => {
    for (const database of databases.splice(0)) {
        database.db?.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(database.dbName);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        });
    }
});
async function fixture() {
    const database = new MusicDatabase();
    database.dbName = `account-library-test-${crypto.randomUUID()}`;
    databases.push(database);
    await database.open();
    return database;
}

test('switching accounts preserves each private library and leaves device uploads untouched', async () => {
    const database = await fixture();
    await database.performTransaction('favorites_tracks', 'readwrite', (store) => store.put({ id: 'legacy' }));
    await database.performTransaction('selfhost_tracks', 'readwrite', (store) => store.put({ id: 'device-upload' }));
    await activateAccountLibrary(database, 'server|alice');
    expect((await database.getAll('favorites_tracks')).map((track) => track.id)).toEqual(['legacy']);
    await activateAccountLibrary(database, 'server|bob');
    expect(await database.getAll('favorites_tracks')).toEqual([]);
    await database.performTransaction('favorites_tracks', 'readwrite', (store) => store.put({ id: 'bob-song' }));
    await activateAccountLibrary(database, 'server|alice');
    expect((await database.getAll('favorites_tracks')).map((track) => track.id)).toEqual(['legacy']);
    await activateAccountLibrary(database, 'server|bob');
    expect((await database.getAll('favorites_tracks')).map((track) => track.id)).toEqual(['bob-song']);
    expect((await database.getAll('selfhost_tracks')).map((track) => track.id)).toEqual(['device-upload']);
});

test('late cloud responses cannot replace the newly selected account library', async () => {
    const database = await fixture();
    await activateAccountLibrary(database, 'server|alice');
    await activateAccountLibrary(database, 'server|bob');
    expect(await replaceAccountLibrary(database, 'server|alice', { favorites_tracks: [{ id: 'private-alice' }] })).toBe(
        false
    );
    expect(await database.getAll('favorites_tracks')).toEqual([]);
    expect(await getActiveLibraryScope(database)).toBe('server|bob');
});

test('legacy import preserves the latest shared playlist instead of an older snapshot', async () => {
    const database = await fixture();
    await activateAccountLibrary(database, 'server|alice');
    const shared = { id: 'shared', collaboration: { revision: 9 }, tracks: [{ id: 'new' }] };
    await database.performTransaction('user_playlists', 'readwrite', (store) => store.put(shared));
    await replaceAccountLibrary(database, 'server|alice', {
        user_playlists: [
            { id: 'shared', tracks: [{ id: 'old' }] },
            { id: 'personal', tracks: [] },
        ],
    });
    expect(await database.performTransaction('user_playlists', 'readonly', (store) => store.get('shared'))).toEqual(
        shared
    );
    expect((await database.getAll('user_playlists')).map((playlist) => playlist.id)).toEqual(['personal', 'shared']);
});

test('a superseded activation does not clear the active library', async () => {
    const database = await fixture();
    await activateAccountLibrary(database, 'server|alice');
    await database.performTransaction('favorites_tracks', 'readwrite', (store) => store.put({ id: 'keep' }));
    let current = true;
    const pending = activateAccountLibrary(database, 'server|bob', () => current);
    current = false;
    expect(await pending).toBe(false);
    expect(await getActiveLibraryScope(database)).toBe('server|alice');
    expect((await database.getAll('favorites_tracks')).map((track) => track.id)).toEqual(['keep']);
});
