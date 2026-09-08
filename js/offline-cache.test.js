import { test, expect, afterEach } from 'vitest';
import { OfflineCache, planCacheEviction } from './offline-cache.js';

const entry = (key, bytes, lastUsed, playlists = []) => ({ key, id: key, bytes, lastUsed, playlists });
const fixtures = [];
const fixture = (options = {}) => {
    const cache = new OfflineCache({
        dbName: `offline-test-${crypto.randomUUID()}`,
        scope: () => 'fixture',
        ...options,
    });
    fixtures.push(cache);
    return cache;
};
afterEach(async () => {
    for (const cache of fixtures.splice(0)) {
        await cache.pending.catch(() => {});
        localStorage.removeItem(`monochrome-offline-settings:${cache.scope()}`);
        (await cache.open()).close();
        indexedDB.deleteDatabase(cache.dbName);
    }
});
test('LRU cleanup protects explicit playlist downloads and the playing track', () => {
    const plan = planCacheEviction(
        [entry('pin', 10, 0, ['p']), entry('playing', 10, 1), entry('old', 10, 2), entry('new', 10, 3)],
        10,
        30,
        ['playing']
    );
    expect(plan.evict).toEqual(['old', 'new']);
    expect(plan.fits).toBe(true);
    expect(planCacheEviction([entry('pin', 30, 0, ['p'])], 10, 30).fits).toBe(false);
});
test('playlist removal preserves another playlist pin and unrelated automatic audio', async () => {
    const cache = new OfflineCache({ dbName: `offline-test-${crypto.randomUUID()}`, scope: () => 'fixture' });
    const a = { id: 'a', file: new Blob(['music-a'], { type: 'audio/flac' }) };
    const b = { id: 'b', file: new Blob(['music-b'], { type: 'audio/flac' }) };
    await cache.cacheTrack(a, { playlistId: 'one' });
    await cache.cacheTrack(a, { playlistId: 'two' });
    await cache.cacheTrack(b);
    await cache.removePlaylist('one');
    expect((await cache.entries()).find((item) => item.id === 'a').playlists).toEqual(['two']);
    expect(await (await cache.playbackBlob('b')).text()).toBe('music-b');
    cache.activeId = null;
    await cache.removePlaylist('two');
    expect(await cache.playbackBlob('a')).toBeNull();
    expect(await cache.playbackBlob('b')).not.toBeNull();
    (await cache.open()).close();
    indexedDB.deleteDatabase(cache.dbName);
});
test('account changes never expose another account audio', async () => {
    let account = 'a';
    const cache = new OfflineCache({ dbName: `offline-test-${crypto.randomUUID()}`, scope: () => account });
    await cache.cacheTrack({ id: 'private', file: new Blob(['private audio']) });
    account = 'b';
    expect(await cache.entries()).toEqual([]);
    expect(await cache.playbackBlob('private')).toBeNull();
    (await cache.open()).close();
    indexedDB.deleteDatabase(cache.dbName);
});
test('failed downloads never publish incomplete offline availability', async () => {
    const cache = new OfflineCache({
        dbName: `offline-test-${crypto.randomUUID()}`,
        scope: () => 'fixture',
        fetch: async () => new Response('partial', { status: 206 }),
    });
    await expect(cache.cacheTrack({ id: 'broken', serverAudioUrl: '/audio' })).rejects.toThrow('complete audio');
    expect(await cache.entries()).toEqual([]);
    (await cache.open()).close();
    indexedDB.deleteDatabase(cache.dbName);
});

test('an account switch during a blob read cannot return the previous account audio', async () => {
    let scope = 'owner';
    const cache = fixture({ scope: () => scope });
    await cache.cacheTrack({ id: 'private', file: new Blob(['private audio']) });
    const read = cache.read.bind(cache);
    cache.read = async (...args) => {
        const value = await read(...args);
        if (args[0] === 'audio') scope = 'other';
        return value;
    };
    await expect(cache.playbackBlob('private')).rejects.toMatchObject({ name: 'AbortError' });
    expect(cache.activeId).toBeNull();
});

test('queued cleanup never targets an account that signed in after the request', async () => {
    let scope = 'owner';
    const cache = fixture({ scope: () => scope });
    await cache.cacheTrack({ id: 'song', file: new Blob(['owner']) });
    scope = 'other';
    await cache.cacheTrack({ id: 'song', file: new Blob(['other']) });
    scope = 'owner';
    let release;
    cache.pending = new Promise((resolve) => {
        release = resolve;
    });
    const cleanup = cache.cleanup({ allAutomatic: true });
    scope = 'other';
    release();
    await expect(cleanup).rejects.toMatchObject({ name: 'AbortError' });
    expect(await (await cache.playbackBlob('song')).text()).toBe('other');
});

test('removing a playlist while downloading cancels it without leaving orphan pins', async () => {
    let started;
    const fetching = new Promise((resolve) => {
        started = resolve;
    });
    const cache = fixture({
        fetch: (_url, { signal }) =>
            new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), {
                    once: true,
                });
                started();
            }),
    });
    const downloading = cache.downloadPlaylist({
        id: 'one',
        tracks: [
            { id: 'a', audioUrl: '/audio' },
            { id: 'b', audioUrl: '/audio' },
        ],
    });
    await fetching;
    await cache.removePlaylist('one');
    expect(await downloading).toMatchObject({ cancelled: true, downloaded: 0 });
    expect(await cache.playlists()).toEqual([]);
    expect(await cache.entries()).toEqual([]);
});

test('a failed quota transaction retains the audio selected for eviction', async () => {
    const cache = fixture();
    await cache.configure({ maxBytes: 1024 ** 2 });
    const file = new Blob([new Uint8Array(700000)]);
    await cache.cacheTrack({ id: 'old', file });
    const write = cache.write.bind(cache);
    cache.write = (callback) =>
        write((transaction) => {
            callback(transaction);
            transaction.abort();
        });
    await expect(cache.cacheTrack({ id: 'new', file })).rejects.toThrow();
    cache.write = write;
    expect((await cache.entries()).map((item) => item.id)).toEqual(['old']);
    expect((await cache.playbackBlob('old')).size).toBe(700000);
    expect(await cache.playbackBlob('new')).toBeNull();
});

test('a smaller limit preserves explicit downloads and removes automatic songs', async () => {
    const cache = fixture();
    const file = new Blob([new Uint8Array(700000)]);
    await cache.cacheTrack({ id: 'one', file }, { playlistId: 'saved' });
    await cache.cacheTrack({ id: 'two', file }, { playlistId: 'saved' });
    await cache.cacheTrack({ id: 'automatic', file });
    await cache.configure({ maxBytes: 1024 ** 2 });
    expect((await cache.entries()).map((item) => item.id).sort()).toEqual(['one', 'two']);
    expect(await cache.status()).toMatchObject({ pinnedBytes: 1400000, maxBytes: 1024 ** 2 });
    await expect(cache.cacheTrack({ id: 'new', file })).rejects.toMatchObject({ code: 'CACHE_FULL' });
});

test('favorite scans retain the newest working set without repeatedly evicting it', async () => {
    const cache = fixture();
    await cache.configure({ maxBytes: 1024 ** 2 });
    const file = new Blob([new Uint8Array(500000)]);
    const tracks = ['new', 'middle', 'old'].map((id) => ({ id, file }));
    expect(await cache.cacheFavorites(tracks)).toMatchObject({ cached: 2, full: true });
    expect((await cache.entries()).map((item) => item.id).sort()).toEqual(['middle', 'new']);
    expect(await cache.cacheFavorites(tracks)).toMatchObject({ cached: 0, full: true });
    expect((await cache.entries()).map((item) => item.id).sort()).toEqual(['middle', 'new']);
    await cache.cacheFavorites([{ id: 'latest', file }, ...tracks]);
    expect((await cache.entries()).map((item) => item.id).sort()).toEqual(['latest', 'new']);
});

test('an unavailable favorite does not prevent other favorites from being cached', async () => {
    const cache = fixture({
        fetch: async (url) =>
            url === '/missing'
                ? new Response(null, { status: 404 })
                : new Response('song', { headers: { 'content-type': 'audio/flac' } }),
    });
    const result = await cache.cacheFavorites([
        { id: 'missing', audioUrl: '/missing' },
        { id: 'song', audioUrl: '/song' },
    ]);
    expect(result.cached).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect((await cache.entries()).map((item) => item.id)).toEqual(['song']);
});

test('playlist updates release removed pins and saved blobs survive reopening storage', async () => {
    const cache = fixture();
    const a = { id: 'a', file: new Blob(['audio a']) };
    const b = { id: 'b', file: new Blob(['audio b']) };
    await cache.downloadPlaylist({ id: 'saved', name: 'Saved music', tracks: [a, b] });
    await cache.downloadPlaylist({ id: 'saved', name: 'Renamed music', tracks: [b] });
    expect((await cache.entries()).find((item) => item.id === 'a').playlists).toEqual([]);
    const restored = new OfflineCache({
        dbName: cache.dbName,
        scope: cache.scope,
        fetch: () => {
            throw new Error('Network is offline');
        },
    });
    expect(await (await restored.playbackBlob('b')).text()).toBe('audio b');
    expect((await restored.playlists())[0]).toMatchObject({ name: 'Renamed music', tracks: [{ id: 'b' }] });
    await restored.pending;
    (await restored.open()).close();
});

test('downloaded WAV audio remains decodable after reopening storage without network access', async () => {
    // A short PCM waveform exercises real browser audio decoding, not a text blob.
    const frames = 800;
    const buffer = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(buffer);
    const label = (offset, value) =>
        [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
    label(0, 'RIFF');
    view.setUint32(4, buffer.byteLength - 8, true);
    label(8, 'WAVE');
    label(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    label(36, 'data');
    view.setUint32(40, frames * 2, true);
    for (let index = 0; index < frames; index++)
        view.setInt16(44 + index * 2, Math.sin((index * 2 * Math.PI * 440) / 8000) * 4000, true);
    const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    const cache = fixture();
    let restored;
    try {
        const result = await cache.downloadPlaylist({
            id: 'audio-check',
            name: 'Audio check',
            tracks: [{ id: 'tone', audioUrl: url }],
        });
        expect(result).toMatchObject({ downloaded: 1, total: 1, failures: [] });
        URL.revokeObjectURL(url);
        restored = new OfflineCache({
            dbName: cache.dbName,
            scope: cache.scope,
            fetch: () => {
                throw new Error('Network unavailable');
            },
        });
        const saved = await restored.playbackBlob('tone');
        const context = new OfflineAudioContext(1, frames, 8000);
        const decoded = await context.decodeAudioData(await saved.arrayBuffer());
        expect(decoded.numberOfChannels).toBe(1);
        expect(decoded.duration).toBeCloseTo(0.1, 3);
        expect(Math.max(...decoded.getChannelData(0))).toBeGreaterThan(0.1);
        expect((await restored.playlists())[0].tracks[0].id).toBe('tone');
    } finally {
        URL.revokeObjectURL(url);
        if (restored) {
            await restored.pending;
            (await restored.open()).close();
        }
    }
});
