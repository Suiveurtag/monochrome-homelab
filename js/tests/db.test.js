import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import { MusicDatabase } from '../db.js';

describe('MusicDatabase', () => {
    let db;
    const TEST_DB_NAME = 'TestMonochromeDB';

    beforeEach(async () => {
        db = new MusicDatabase();
        db.dbName = TEST_DB_NAME;
        const req = indexedDB.deleteDatabase(TEST_DB_NAME);
        await new Promise((resolve) => {
            req.onsuccess = resolve;
            req.onerror = resolve;
        });
    });

    afterEach(async () => {
        if (db.db) {
            db.db.close();
        }
        const req = indexedDB.deleteDatabase(TEST_DB_NAME);
        await new Promise((resolve) => {
            req.onsuccess = resolve;
            req.onerror = resolve;
        });
    });

    test('opens database and creates stores', async () => {
        const openedDb = await db.open();
        expect(openedDb.name).toBe(TEST_DB_NAME);
        expect(openedDb.objectStoreNames.contains('favorites_tracks')).toBe(true);
        expect(openedDb.objectStoreNames.contains('history_tracks')).toBe(true);
        expect(openedDb.objectStoreNames.contains('user_playlists')).toBe(true);
        expect(openedDb.objectStoreNames.contains('track_catalog')).toBe(true);
        expect(openedDb.objectStoreNames.contains('track_metadata_overrides')).toBe(true);
        expect(openedDb.objectStoreNames.contains('favorites_track_refs')).toBe(true);
    });

    test('toggleFavorite adds and removes items', async () => {
        const track = { id: 'track1', title: 'Test Track', artist: { name: 'Artist' } };

        const added = await db.toggleFavorite('track', track);
        expect(added).toBe(true);
        const favorites = await db.getFavorites('track');
        expect(favorites.length).toBe(1);
        expect(favorites[0].id).toBe('track1');

        const removed = await db.toggleFavorite('track', track);
        expect(removed).toBe(false);
        const favoritesAfter = await db.getFavorites('track');
        expect(favoritesAfter.length).toBe(0);
    });

    test('addToHistory manages recent tracks and avoids duplicates', async () => {
        const track1 = { id: 't1', title: 'Track 1' };
        const track2 = { id: 't2', title: 'Track 2' };

        await db.addToHistory(track1);
        await db.addToHistory(track2);
        await db.addToHistory(track1);

        const history = await db.getHistory();
        expect(history.length).toBe(2);
        expect(history[0].id).toBe('t1');
        expect(history[1].id).toBe('t2');
    });

    test('playlist operations: create, add, remove, delete', async () => {
        const track = { id: 'track1', title: 'Test Track' };

        const playlist = await db.createPlaylist('My Playlist', [track]);
        expect(playlist.name).toBe('My Playlist');
        expect(playlist.tracks.length).toBe(1);

        const track2 = { id: 'track2', title: 'Track 2' };
        await db.addTrackToPlaylist(playlist.id, track2);

        const updated = await db.getPlaylist(playlist.id);
        expect(updated.tracks.length).toBe(2);
        expect(updated.tracks[1].id).toBe('track2');

        await db.removeTrackFromPlaylist(playlist.id, 'track1');
        const afterRemove = await db.getPlaylist(playlist.id);
        expect(afterRemove.tracks.length).toBe(1);
        expect(afterRemove.tracks[0].id).toBe('track2');

        await db.deletePlaylist(playlist.id);
        const deleted = await db.getPlaylist(playlist.id);
        expect(deleted).toBeUndefined();
    });

    test('legacy favorites without trackKey remain readable', async () => {
        await db.performTransaction('favorites_tracks', 'readwrite', (store) =>
            store.put({ id: 'legacy-track', title: 'Legacy Track', addedAt: 1 })
        );

        const favorites = await db.getFavorites('track');

        expect(favorites.length).toBe(1);
        expect(favorites[0].id).toBe('legacy-track');
        expect(await db.isFavorite('track', 'legacy-track')).toBe(true);
    });

    test('track favorites can coexist across sources with the same legacy id', async () => {
        const external = { id: 'shared', title: 'External Track' };
        const upload = {
            id: 'shared',
            title: 'Uploaded Track',
            source: { kind: 'server-upload', sourceId: 'shared' },
        };

        expect(await db.toggleFavorite('track', external)).toBe(true);
        expect(await db.toggleFavorite('track', upload)).toBe(true);

        const favorites = await db.getFavorites('track');

        expect(favorites.length).toBe(2);
        expect(favorites.map((track) => track.trackKey).sort()).toEqual([
            'v1:external:tidal:shared',
            'v1:server-upload:none:shared',
        ]);
    });

    test('playlist operations dedupe and remove tracks by trackKey', async () => {
        const track = { id: 'shared', title: 'External Track' };
        const upload = {
            id: 'shared',
            title: 'Uploaded Track',
            source: { kind: 'server-upload', sourceId: 'shared' },
        };

        const playlist = await db.createPlaylist('Hybrid Playlist', [track]);
        await db.addTrackToPlaylist(playlist.id, { ...track });
        await db.addTrackToPlaylist(playlist.id, upload);

        const updated = await db.getPlaylist(playlist.id);
        expect(updated.tracks.length).toBe(2);

        await db.removeTrackFromPlaylist(playlist.id, updated.tracks[1].trackKey);
        const afterRemove = await db.getPlaylist(playlist.id);

        expect(afterRemove.tracks.length).toBe(1);
        expect(afterRemove.tracks[0].trackKey).toBe('v1:external:tidal:shared');
    });

    test('export and import preserve trackKey and source', async () => {
        const track = {
            id: 'upload-1',
            title: 'Uploaded Track',
            source: { kind: 'server-upload', sourceId: 'upload-1' },
        };

        await db.toggleFavorite('track', track);
        const exported = await db.exportData();

        expect(exported.favorites_tracks[0].trackKey).toBe('v1:server-upload:none:upload-1');
        expect(exported.favorites_tracks[0].source).toEqual({ kind: 'server-upload', sourceId: 'upload-1' });
        expect(exported.favorites_track_refs[0]).toEqual({
            trackKey: 'v1:server-upload:none:upload-1',
            addedAt: exported.favorites_track_refs[0].addedAt,
        });

        const importedDb = new MusicDatabase();
        importedDb.dbName = `${TEST_DB_NAME}_import`;
        const deleteReq = indexedDB.deleteDatabase(importedDb.dbName);
        await new Promise((resolve) => {
            deleteReq.onsuccess = resolve;
            deleteReq.onerror = resolve;
        });

        await importedDb.importData(exported, true);
        const importedFavorites = await importedDb.getFavorites('track');

        expect(importedFavorites.length).toBe(1);
        expect(importedFavorites[0].trackKey).toBe('v1:server-upload:none:upload-1');
        expect(importedFavorites[0].source.kind).toBe('server-upload');

        importedDb.db.close();
        const cleanupReq = indexedDB.deleteDatabase(importedDb.dbName);
        await new Promise((resolve) => {
            cleanupReq.onsuccess = resolve;
            cleanupReq.onerror = resolve;
        });
    });

    test('pinned items management', async () => {
        const album = { id: 'album1', title: 'Album 1', type: 'album' };

        await db.togglePinned(album, 'album');
        let pinned = await db.getPinned();
        expect(pinned.length).toBe(1);
        expect(pinned[0].id).toBe('album1');

        await db.togglePinned({ id: 'a2', title: 'A2' }, 'album');
        await db.togglePinned({ id: 'a3', title: 'A3' }, 'album');
        await db.togglePinned({ id: 'a4', title: 'A4' }, 'album');

        pinned = await db.getPinned();
        expect(pinned.length).toBe(3);
        expect(pinned.some((p) => p.id === 'a4')).toBe(true);
        expect(pinned.some((p) => p.id === 'album1')).toBe(false);
    });
});
