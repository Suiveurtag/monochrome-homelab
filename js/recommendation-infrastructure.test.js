import { afterEach, expect, test, vi } from 'vitest';
import { RecommendationService } from './recommendation-service.js';
import { PersistedAudioEmbeddings, validateEmbedding } from './audio-embeddings.js';
import { artistsOf, DAY } from './recommendation-metadata.js';
import { rankTracks, realRandom, scoreTrack, smartRandom } from './recommendation-engine.js';

afterEach(() => { vi.useRealTimers(); });
const song = (id, artist = id) => ({ id, artist: { id: artist, name: artist }, title: id });

test('Real Random is an unbiased occurrence permutation over all two-item outcomes', () => {
    const a = song('same'), b = song('same');
    expect(realRandom([a, b], () => 0)).toEqual([b, a]);
    expect(realRandom([a, b], () => 0.99)).toEqual([a, b]);
    expect(realRandom([a, b], () => 0)[0]).toBe(b);
});

test('Smart Random retains duplicates while postponing repeated tracks and recent artists', () => {
    const tracks = [song('a', 'artist-a'), song('a', 'artist-a'), song('b', 'artist-b'), song('c', 'artist-c')];
    const ranked = smartRandom(tracks, { random: () => 0, now: 1000,
        profile: { recent: [{ id: 'previous', artists: ['artist-a'], at: 999 }] } });
    expect(ranked.map((track) => track.id)).toEqual(['b', 'a', 'c', 'a']);
    expect(tracks.map((track) => track.id)).toEqual(['a', 'a', 'b', 'c']);
});

test('Smart Random remains unpredictable with the same history', () => {
    const tracks = [song('a'), song('b'), song('c')];
    expect(smartRandom(tracks, { random: () => 0 }).map((t) => t.id))
        .not.toEqual(smartRandom(tracks, { random: () => 0.99 }).map((t) => t.id));
});

test('ranking responds to behavior, recency and discovery without an embedding adapter', () => {
    const now = Date.now();
    const neutral = scoreTrack(song('neutral'), { now });
    const score = (signal) => scoreTrack(song('known'), { now, profile: { tracks: { known: signal } } });
    expect(score({ playCount: 4, completionCount: 4, likeCount: 1, replayCount: 2 })).toBeGreaterThan(neutral);
    expect(score({ playCount: 4, earlySkipCount: 4 })).toBeLessThan(neutral);
    expect(score({ playCount: 4, earlySkipCount: 4, lastPlayed: now - 180 * DAY }))
        .toBeGreaterThan(score({ playCount: 4, earlySkipCount: 4, lastPlayed: now - 3 * DAY }));
    expect(score({ playCount: 1, lastPlayed: now })).toBeLessThan(score({ playCount: 1, lastPlayed: now - 10 * DAY }));
    expect(score({ playlistAddCount: 3, searchCount: 3 })).toBeGreaterThan(neutral);
});

test('ranking spaces artists across the previous session and rejects unavailable or duplicate candidates', () => {
    const tracks = [song('a1', 'a'), song('a2', 'a'), song('b', 'b'), song('b', 'b'),
        { ...song('hidden'), isUnavailable: true }, { ...song('video'), type: 'video' }];
    const ranked = rankTracks(tracks, { exploration: 0,
        profile: { recent: [{ id: 'previous', artists: ['a'], at: Date.now() }] }, excludeIds: ['a2'] });
    expect(ranked.map((track) => track.id)).toEqual(['b', 'a1']);
});

test('audio similarity only compares compatible model versions and tolerates malformed optional entries', () => {
    const seed = song('seed');
    const candidate = song('candidate');
    const options = { seeds: [seed], embeddings: new Map([
        ['seed', [{ model: 'mert', version: '1', vector: [1, 0] }]],
        ['candidate', [null, { model: 'mert', version: '2', vector: [1, 0] }]],
    ]) };
    const baseline = scoreTrack(candidate, options);
    options.embeddings.get('candidate')[1].version = '1';
    expect(scoreTrack(candidate, options)).toBe(baseline + 4);
    options.embeddings.set('candidate', {});
    expect(scoreTrack(candidate, options)).toBe(baseline);
});

test('metadata accepts string artists without assigning a compilation album artist to credited tracks', () => {
    expect(artistsOf({ artists: ['Artist'], album: { artist: { id: 'various', name: 'Various Artists' } } }))
        .toEqual([{ id: 'artist', name: 'Artist' }]);
    expect(artistsOf({ album: { artist: { id: 'album-artist', name: 'Album Artist' } } }))
        .toEqual([{ id: 'album-artist', name: 'Album Artist' }]);
});

function serviceFixture(overrides = {}) {
    const tracker = { accountGeneration: 1, getTasteProfile: () => ({}) };
    return { tracker, service: new RecommendationService({ tracker, favorites: async () => [],
        embeddings: null, shouldHideTrack: (track) => track.blocked, ...overrides }) };
}

test('service applies favorites/content blocking and accepts a synchronous embedding adapter', async () => {
    const { service } = serviceFixture({ favorites: async () => [song('liked')], embeddings: { getMany: () => new Map() } });
    const ranked = await service.rank([song('other'), song('liked'), { ...song('blocked'), blocked: true }], { exploration: 0 });
    expect(ranked.map((track) => track.id)).toEqual(['liked', 'other']);
});

test('optional embedding failures and a stalled adapter fall back to metadata ranking', async () => {
    const { service } = serviceFixture({ embeddings: { getMany() { throw new Error('offline adapter'); } } });
    expect(await service.rank([song('a')])).toHaveLength(1);
    vi.useFakeTimers();
    service.setEmbeddingAdapter({ getMany: () => new Promise(() => {}) });
    const pending = service.rank([song('a')]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toHaveLength(1);
});

test('service discards pending recommendations when the authenticated account changes', async () => {
    let resolveFavorites;
    const { service, tracker } = serviceFixture({ favorites: () => new Promise((resolve) => { resolveFavorites = resolve; }) });
    const pending = service.rank([song('old-account-song')]);
    await Promise.resolve();
    tracker.accountGeneration++;
    resolveFavorites([song('old-account-song')]);
    expect(await pending).toEqual([]);
});

test('persisted embeddings retain model/version identity and overwrite only the matching record', async () => {
    const name = `recommendation-embeddings-test-${crypto.randomUUID()}`;
    const adapter = new PersistedAudioEmbeddings(name);
    try {
        await adapter.putMany([
            { trackId: 'song', model: 'clap', version: '1', vector: [1, 0] },
            { trackId: 'song', model: 'mert', version: '1', vector: [0, 1] },
        ]);
        await adapter.putMany([{ trackId: 'song', model: 'clap', version: '1', vector: [1, 1] }]);
        const rows = (await adapter.getMany(['song', 'song', 'missing'])).get('song');
        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.model === 'clap')?.vector).toEqual([1, 1]);
        expect(() => validateEmbedding({ trackId: 'song', model: 'clap', version: '1', vector: [0, 0] })).toThrow();
        expect(() => validateEmbedding({ trackId: 'song', model: ' ', version: '1', vector: [1, 0] })).toThrow();
        await expect(adapter.putMany([{ trackId: 'bad', model: 'mert', version: '1', vector: [1, NaN] }])).rejects.toThrow();
        expect((await adapter.getMany(['bad'])).size).toBe(0);
    } finally {
        (await adapter.open()).close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        });
    }
});
