import { expect, test, describe, beforeEach, vi, afterEach } from 'vitest';
import { Player } from '../player.js';
import { REPEAT_MODE } from '../utils.js';
import { audioEffectsSettings, crossfadeSettings } from '../storage.js';

vi.mock('../audio-context.js', () => ({
    audioContextManager: {
        init: vi.fn(),
        resume: vi.fn(() => Promise.resolve()),
        isReady: vi.fn(() => false),
        setVolume: vi.fn(),
        changeSource: vi.fn(),
        prepareCrossfade: vi.fn(),
        startCrossfade: vi.fn(),
        finishCrossfade: vi.fn(),
        cancelCrossfade: vi.fn(),
    },
}));

vi.mock('@capgo/capacitor-media-session', () => ({
    MediaSession: {
        setActionHandler: vi.fn(() => Promise.resolve()),
        setMetadata: vi.fn(() => Promise.resolve()),
        setPlaybackState: vi.fn(() => Promise.resolve()),
        setPositionState: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../storage.js', () => ({
    queueManager: {
        getQueue: vi.fn(() => null),
        saveQueue: vi.fn(),
    },
    replayGainSettings: { getMode: vi.fn(() => 'off'), getPreamp: vi.fn(() => 0) },
    trackDateSettings: { useAlbumYear: vi.fn(() => true) },
    exponentialVolumeSettings: { applyCurve: vi.fn((v) => v) },
    audioEffectsSettings: {
        getSpeed: vi.fn(() => 1.0),
        setSpeed: vi.fn(),
        isPreservePitchEnabled: vi.fn(() => true),
        setPreservePitch: vi.fn(),
    },
    radioSettings: { isEnabled: vi.fn(() => false) },
    autoplaySettings: {
        isEnabled: vi.fn(() => false),
        setEnabled: vi.fn(),
        isSmartRecsEnabled: vi.fn(() => false),
    },
    binauralDspSettings: { isEnabled: vi.fn(() => false) },
    contentBlockingSettings: {
        shouldHideTrack: vi.fn(() => false),
        shouldHideAlbum: vi.fn(() => false),
        shouldHideArtist: vi.fn(() => false),
    },
    qualityBadgeSettings: { isEnabled: vi.fn(() => true) },
    coverArtSizeSettings: { getSize: vi.fn(() => '1280') },
    apiSettings: {
        loadInstancesFromGitHub: vi.fn(() => Promise.resolve([])),
        getInstances: vi.fn(() => Promise.resolve([])),
    },
    recentActivityManager: { addArtist: vi.fn(), addAlbum: vi.fn() },
    themeManager: { getTheme: vi.fn(() => 'dark'), setTheme: vi.fn() },
    lastFMStorage: { isEnabled: vi.fn(() => false) },
    nowPlayingSettings: { getMode: vi.fn(() => 'cover') },
    gaplessPlaybackSettings: { isEnabled: vi.fn(() => true) },
    crossfadeSettings: {
        isEnabled: vi.fn(() => false),
        getDuration: vi.fn(() => 5),
    },
}));

vi.mock('../db.js', () => ({
    db: {
        get: vi.fn(),
        put: vi.fn(),
    },
}));

vi.mock('../ui.js', () => ({
    UIRenderer: {
        renderQueue: vi.fn(),
    },
}));

vi.mock('shaka-player', () => ({
    default: {
        polyfill: { installAll: vi.fn() },
        Player: {
            isBrowserSupported: vi.fn(() => true),
            prototype: {
                configure: vi.fn(),
                addEventListener: vi.fn(),
                load: vi.fn(),
                unload: vi.fn(),
            },
        },
    },
    polyfill: { installAll: vi.fn() },
    Player: class {
        static isBrowserSupported() {
            return true;
        }
        configure() {}
        addEventListener() {}
        load() {
            return Promise.resolve();
        }
        unload() {
            return Promise.resolve();
        }
        destroy() {
            return Promise.resolve();
        }
    },
}));

describe('Player', () => {
    let audioElement;
    let api;
    let player;

    beforeEach(async () => {
        document.body.innerHTML = `
            <audio id="audio-player"></audio>
            <audio id="audio-player-gapless"></audio>
            <video id="video-player"></video>
            <div class="now-playing-bar">
                <img class="cover" src="">
                <div class="title"></div>
                <div class="artist"></div>
                <div class="album"></div>
            </div>
            <div id="total-duration"></div>
        `;

        audioElement = document.getElementById('audio-player');
        api = {
            getCoverUrl: vi.fn((id) => `url-${id}`),
            getCoverSrcset: vi.fn(),
            getStreamUrl: vi.fn(),
            getTrack: vi.fn(() => Promise.resolve(null)),
            getVideoArtwork: vi.fn(() => Promise.resolve(null)),
        };

        Player._instance = null;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('initialization sets up initial state', async () => {
        player = new Player(audioElement, api);
        expect(player.audio).toBe(audioElement);
        expect(player.getAudioElements()).toHaveLength(2);
        expect(player.api).toBe(api);
        expect(player.queue).toEqual([]);
        expect(player.shuffleActive).toBe(false);
    });

    test('setVolume updates userVolume and localStorage', () => {
        player = new Player(audioElement, api);
        player.setVolume(0.5);
        expect(player.userVolume).toBe(0.5);
        expect(localStorage.getItem('volume')).toBe('0.5');
    });

    test('shuffle toggles correctly', () => {
        player = new Player(audioElement, api);
        player.queue = [{ id: 1 }, { id: 2 }, { id: 3 }];

        player.toggleShuffle();
        expect(player.shuffleActive).toBe(true);
        expect(player.shuffledQueue.length).toBe(3);

        player.toggleShuffle();
        expect(player.shuffleActive).toBe(false);
    });

    test('repeat mode cycles correctly', () => {
        player = new Player(audioElement, api);
        expect(player.repeatMode).toBe(REPEAT_MODE.OFF);

        player.toggleRepeat();
        expect(player.repeatMode).toBe(REPEAT_MODE.ALL);

        player.toggleRepeat();
        expect(player.repeatMode).toBe(REPEAT_MODE.ONE);

        player.toggleRepeat();
        expect(player.repeatMode).toBe(REPEAT_MODE.OFF);
    });

    test('addToQueue adds tracks to the end', async () => {
        player = new Player(audioElement, api);
        player.queue = [{ id: 1 }];

        await player.addToQueue([{ id: 2 }, { id: 3 }]);
        expect(player.queue.length).toBe(3);
        expect(player.queue[2].id).toBe(3);
    });

    test('preloads a static next track into the inactive gapless deck', async () => {
        const standby = document.getElementById('audio-player-gapless');
        vi.spyOn(standby, 'pause').mockImplementation(() => {});
        vi.spyOn(standby, 'load').mockImplementation(() => {});
        api.getStreamUrl.mockResolvedValue({ url: 'https://media.test/next.flac' });

        player = new Player(audioElement, api);
        player.queue = [{ id: 'current' }, { id: 'next' }];
        player.currentQueueIndex = 0;

        await player._executePreloadNextTracks();

        expect(api.getStreamUrl).toHaveBeenCalledWith('next', player.quality);
        expect(player.preloadCache.get('next').preloader).toBe(standby);
        expect(standby.src).toBe('https://media.test/next.flac');
        expect(standby.preload).toBe('auto');
        expect(standby.load).toHaveBeenCalledOnce();
    });

    test('limits background preload on a constrained connection', async () => {
        const standby = document.getElementById('audio-player-gapless');
        vi.spyOn(standby, 'pause').mockImplementation(() => {});
        vi.spyOn(standby, 'load').mockImplementation(() => {});
        api.getStreamUrl.mockResolvedValue({ url: 'https://media.test/next.flac' });

        player = new Player(audioElement, api);
        vi.spyOn(player, 'isConstrainedConnection').mockReturnValue(true);
        player.queue = [{ id: 'current' }, { id: 'next' }];
        player.currentQueueIndex = 0;

        await player._executePreloadNextTracks();

        expect(standby.preload).toBe('metadata');
        expect(standby.getAttribute('fetchpriority')).toBe('low');
    });

    test('starts playback from the preloaded standby deck without reassigning its source', async () => {
        const standby = document.getElementById('audio-player-gapless');
        standby.src = 'https://media.test/next.flac';
        player = new Player(audioElement, api);
        player.audio = standby;
        player.currentTrack = { id: 'next' };
        player.playbackSequence = 4;
        player.preloadCache.set('next', {
            url: 'https://media.test/next.flac',
            preloader: standby,
        });
        vi.spyOn(player, 'safePlay').mockResolvedValue(true);

        const started = player.tryStartPreloadedTrackImmediately({
            track: player.currentTrack,
            activeElement: standby,
            previousActiveElement: audioElement,
            currentSequence: 4,
        });
        await Promise.resolve();

        expect(started).toBe(true);
        expect(player.safePlay).toHaveBeenCalledWith(standby);
        expect(standby.src).toBe('https://media.test/next.flac');
    });

    test('starts an enabled crossfade within the configured twelve second window', async () => {
        const standby = document.getElementById('audio-player-gapless');
        player = new Player(audioElement, api);
        player.queue = [{ id: 'current' }, { id: 'next' }];
        player.currentQueueIndex = 0;
        player.currentTrack = player.queue[0];
        player.preloadCache.set('next', { url: 'https://media.test/next.flac', preloader: standby });
        Object.defineProperty(audioElement, 'duration', { configurable: true, value: 100 });
        Object.defineProperty(audioElement, 'currentTime', { configurable: true, value: 88.5 });
        crossfadeSettings.isEnabled.mockReturnValue(true);
        crossfadeSettings.getDuration.mockReturnValue(12);
        vi.spyOn(player, 'playNext').mockResolvedValue();

        const started = await player.startCrossfadeIfNeeded(audioElement);

        expect(started).toBe(true);
        expect(player.playNext).toHaveBeenCalledWith(0, {
            preserveGestureToken: true,
            crossfadeFrom: audioElement,
            crossfadeDuration: 11.5,
        });
    });

    test('does not crossfade when the option is disabled', async () => {
        player = new Player(audioElement, api);
        player.queue = [{ id: 'current' }, { id: 'next' }];
        player.currentQueueIndex = 0;
        player.currentTrack = player.queue[0];
        crossfadeSettings.isEnabled.mockReturnValue(false);
        vi.spyOn(player, 'playNext').mockResolvedValue();

        expect(await player.startCrossfadeIfNeeded(audioElement)).toBe(false);
        expect(player.playNext).not.toHaveBeenCalled();
    });

    test('switches a version in place without discarding the current queue context', async () => {
        player = new Player(audioElement, api);
        const original = { id: 'original', title: 'Song' };
        const alternative = { id: 'instrumental', title: 'Song (Instrumental)' };
        player.queue = [original, { id: 'next' }];
        player.currentTrack = original;
        player.currentQueueIndex = 0;
        player.sourceContext = { kind: 'album', id: 'album-1', label: 'Album' };
        vi.spyOn(player, 'playTrackFromQueue').mockResolvedValue();

        expect(await player.switchTrackVersion(alternative)).toBe(true);
        expect(player.queue).toEqual([alternative, { id: 'next' }]);
        expect(player.currentQueueIndex).toBe(0);
        expect(player.sourceContext).toEqual({ kind: 'album', id: 'album-1', label: 'Album' });
        expect(player.playTrackFromQueue).toHaveBeenCalledWith(0, 0);
    });

    test('clearQueue resets queue state', async () => {
        player = new Player(audioElement, api);
        player.queue = [{ id: 1 }];
        player.currentQueueIndex = 0;

        await player.clearQueue();
        expect(player.queue).toEqual([]);
        expect(player.currentQueueIndex).toBe(-1);
    });

    test('setPlaybackSpeed clamps values', () => {
        player = new Player(audioElement, api);

        player.setPlaybackSpeed(2.0);
        expect(audioEffectsSettings.setSpeed.mock.calls).toContainEqual([2.0]);

        player.setPlaybackSpeed(0);
        expect(audioEffectsSettings.setSpeed.mock.calls).toContainEqual([0.01]);
    });
});
