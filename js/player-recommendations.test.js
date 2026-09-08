import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Player } from './player.js';
import { recommendationService } from './recommendation-service.js';

vi.mock('./ui.js', () => ({ UIRenderer: {} }));
vi.mock('./audio-context.js', () => ({ audioContextManager: {} }));
vi.mock('./recommendation-service.js', () => ({ recommendationService: { rank: vi.fn() } }));

beforeEach(() => { recommendationService.rank.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

function fixture() {
    const player = Object.create(Player.prototype);
    Object.assign(player, {
        queue: [{ id: 'seed' }], shuffledQueue: [], shuffleActive: false,
        currentQueueIndex: 0, radioEnabled: false, autoplayEnabled: true,
        repeatMode: 0, playbackSequence: 1, _queueGeneration: 1,
        _recentlyPlayedIds: ['old'], radioSeeds: [],
        api: { getTracks: vi.fn(async () => [{ id: 'new' }, { id: 'seed' }, { id: 'old' }]) },
        showRadioLoading: vi.fn(), saveQueueState: vi.fn(async () => {}),
        preloadCache: new Map(), audio: { pause: vi.fn() },
        disableRadio: vi.fn(function () { this.radioEnabled = false; }),
        playNext: vi.fn(async function () { this.currentQueueIndex++; this.playbackSequence++; }),
        addToQueue: vi.fn(async function (tracks) { this.queue.push(...tracks); }),
    });
    return player;
}

test('concurrent queue extension shares work and rechecks manually queued tracks', async () => {
    const player = fixture();
    let finish;
    recommendationService.rank.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const first = player.extendRecommendationQueue('autoplay');
    const second = player.extendRecommendationQueue('autoplay');
    expect(second).toBe(first);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    player.queue.push({ id: 'new' });
    finish([{ id: 'new' }, { id: 'another' }]);
    await first;
    expect(player.api.getTracks).toHaveBeenCalledOnce();
    expect(player.queue.map((track) => track.id)).toEqual(['seed', 'new', 'another']);
    expect(recommendationService.rank.mock.calls[0][1].excludeIds).toEqual(['seed', 'old']);
});

test('replacing a queue invalidates its pending recommendations', async () => {
    const player = fixture();
    let finish;
    recommendationService.rank.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = player.extendRecommendationQueue('autoplay');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await player.setQueue([{ id: 'different-session' }]);
    finish([{ id: 'old-session-result' }]);
    await pending;
    expect(player.queue.map((track) => track.id)).toEqual(['different-session']);
    expect(player.addToQueue).not.toHaveBeenCalled();
});

test('repeat suspends extension and an empty catalogue backs off', async () => {
    const player = fixture();
    for (const repeatMode of [1, 2]) {
        player.repeatMode = repeatMode;
        await player.extendRecommendationQueue('autoplay');
    }
    expect(player.api.getTracks).not.toHaveBeenCalled();
    player.repeatMode = 0;
    recommendationService.rank.mockResolvedValue([]);
    await player.extendRecommendationQueue('autoplay');
    await player.extendRecommendationQueue('autoplay');
    expect(player.api.getTracks).toHaveBeenCalledOnce();
    expect(player._recommendationRetryAt).toBeGreaterThan(Date.now());
});

test('a finished request cannot advance playback after the user changes tracks', async () => {
    const player = fixture();
    let finish;
    player.extendRecommendationQueue = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const pending = player.continueRecommendedPlayback('autoplay', {});
    player.queue.push({ id: 'next' });
    player.playbackSequence++;
    finish();
    await pending;
    expect(player.playNext).not.toHaveBeenCalled();
});

test('queue exhaustion advances once when overlapping callbacks receive recommendations', async () => {
    const player = fixture();
    let finish;
    const request = new Promise((resolve) => { finish = resolve; });
    player.extendRecommendationQueue = vi.fn(() => request);
    const first = player.continueRecommendedPlayback('autoplay', {});
    const second = player.continueRecommendedPlayback('autoplay', {});
    player.queue.push({ id: 'next' });
    finish();
    await Promise.all([first, second]);
    expect(player.playNext).toHaveBeenCalledOnce();
});

test.each(['track', 'artist', 'album'])('radio retains the %s seed context when requesting the next songs', async (kind) => {
    const player = fixture();
    const savedRadio = localStorage.getItem('radio-enabled');
    const seeds = [{ id: `${kind}-seed`, artist: { id: 'artist' }, album: { id: 'album' } }];
    player.wipeQueue = vi.fn(async function () { this.queue = []; this.currentQueueIndex = -1; });
    player.playAtIndex = vi.fn(async () => {});
    recommendationService.rank.mockResolvedValue([{ id: 'recommendation' }]);
    try {
        const source = { kind: 'radio', id: `${kind}-source`, label: `${kind} Radio` };
        await player.enableRadio(seeds, source);
        expect(player.radioEnabled).toBe(true);
        expect(player.radioSeeds).toEqual(seeds);
        expect(player.sourceContext).toEqual(source);
        expect(recommendationService.rank.mock.calls[0][1].seeds).toEqual(seeds);
        expect(player.queue.map((track) => track.id)).toEqual([`${kind}-seed`, 'recommendation']);
    } finally {
        if (savedRadio === null) localStorage.removeItem('radio-enabled');
        else localStorage.setItem('radio-enabled', savedRadio);
    }
});
