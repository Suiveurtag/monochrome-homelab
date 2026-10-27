import { beforeEach, describe, expect, test, vi } from 'vitest';

const intersectionObservers = [];

vi.mock('./spicy-dynamic-background.js', () => ({
    mountSpicyDynamicBackground: () => ({
        setSource: vi.fn(async () => true),
        connectPlayback: vi.fn(),
        dispose: vi.fn(),
    }),
}));
vi.mock('./lyrics.js', () => ({
    clearLyricsContainerSync: vi.fn(),
    renderLyricsInContainer: vi.fn(async () => null),
    renderLyricsInNowPanel: vi.fn(async () => null),
}));
vi.mock('./db.js', () => ({
    db: {
        getHistory: vi.fn(async () => []),
        isFavorite: vi.fn(async () => false),
        toggleFavorite: vi.fn(async () => true),
    },
}));
vi.mock('./accounts/pocketbase.js', () => ({
    syncManager: { syncLibraryItem: vi.fn(async () => {}) },
}));
vi.mock('./downloads.js', () => ({ showNotification: vi.fn() }));
vi.mock('./router.js', () => ({ navigate: vi.fn() }));
vi.mock('./share.js', () => ({ copyShareLink: vi.fn(async () => true) }));
vi.mock('./track-save-ui.js', () => ({ createTrackSaveIconHTML: () => '<span></span>' }));
vi.mock('./animated-artwork.js', () => ({
    isVideoArtwork: (source) => /\.mp4(?:$|[?#])/i.test(String(source || '')),
    renderArtworkElement: (element, source) => {
        const video = document.createElement('video');
        video.className = element.className;
        video.src = source;
        element.replaceWith(video);
        return video;
    },
}));
vi.mock('./audio-context.js', () => ({ audioContextManager: { getAnalyser: vi.fn(() => null) } }));
vi.mock('./listening-tracker.js', () => ({
    listeningTracker: { getArtistSignal: vi.fn(() => ({ playCount: 1234 })) },
}));
vi.mock('./utils.js', () => ({
    REPEAT_MODE: { OFF: 0, ALL: 1, ONE: 2 },
    escapeHtml: (value) => String(value ?? ''),
    getTrackArtists: (track) => track?.artist?.name || 'Unknown artist',
    getTrackTitle: (track) => track?.title || 'Unknown title',
    getTrackYearDisplay: () => '',
}));

function shell() {
    document.body.innerHTML = `<main class="main-content"></main>
        <div id="fullscreen-cover-overlay" style="display: none"></div>
        <aside id="now-playing-panel" class="now-playing-panel" data-spicy-background-host>
            <div class="now-playing-panel-resizer"></div><div class="now-playing-panel-scroll"></div>
            <div class="now-playing-panel-scrollbar"><span class="now-playing-panel-scrollbar-thumb"></span></div>
        </aside>
        <button id="now-playing-panel-reopen"></button><button id="queue-btn"></button>`;
}

function dependencies() {
    return {
        player: {
            currentTrack: null,
            currentQueueIndex: -1,
            sourceContext: null,
            getCurrentQueue: () => [],
            playAtIndex: vi.fn(async () => {}),
            setQueue: vi.fn(async () => {}),
            playTrackFromQueue: vi.fn(async () => {}),
            autoplayEnabled: false,
            radioEnabled: false,
            repeatMode: 0,
            enableAutoplay: vi.fn(function () {
                this.autoplayEnabled = true;
            }),
            disableAutoplay: vi.fn(function () {
                this.autoplayEnabled = false;
            }),
            disableRadio: vi.fn(function () {
                this.radioEnabled = false;
            }),
            fetchAutoplayRecommendations: vi.fn(async () => {}),
        },
        api: { getCoverUrl: (value) => value },
        ui: {
            createHeartIcon: (liked) => `<span data-liked="${liked}"></span>`,
            refreshTrackSaveButtons: vi.fn(async () => {}),
        },
        lyricsManager: {},
    };
}

async function waitForPanel(panel) {
    await vi.waitFor(() => expect(panel.root.querySelector('.now-playing-panel-close')).toBeTruthy());
}

beforeEach(() => {
    intersectionObservers.length = 0;
    vi.stubGlobal(
        'IntersectionObserver',
        class IntersectionObserverMock {
            constructor(callback) {
                this.callback = callback;
                this.observe = vi.fn();
                this.disconnect = vi.fn();
                intersectionObservers.push(this);
            }
        }
    );
    const values = new Map();
    vi.stubGlobal('localStorage', {
        getItem: vi.fn((key) => values.get(key) ?? null),
        setItem: vi.fn((key, value) => values.set(key, String(value))),
        removeItem: vi.fn((key) => values.delete(key)),
    });
    shell();
    vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
            matches: query === '(min-width: 769px)',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }))
    );
});

describe('Now Playing panel interactions', () => {
    test('opens by default on desktop and leaves a focused reopen tab after closing', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        expect(panel.isOpen).toBe(true);
        panel.root.querySelector('.now-playing-panel-close').click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        expect(panel.isOpen).toBe(false);
        expect(panel.root.getAttribute('aria-hidden')).toBe('true');
        expect(document.activeElement).toBe(panel.reopenButton);
        panel.reopenButton.click();
        expect(panel.isOpen).toBe(true);
        panel.destroy();
    });

    test('keeps a visible, inert panel rail when collapsed', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        panel.setOpen(false, { restoreFocus: false });
        expect(panel.root.classList.contains('is-closed')).toBe(true);
        expect(panel.content.inert).toBe(true);
        expect(panel.reopenButton.classList.contains('is-visible')).toBe(true);
        expect(panel.reopenButton.hidden).toBe(false);
        panel.destroy();
    });

    test('hides the panel and reopen rail while fullscreen is visible', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        document.getElementById('fullscreen-cover-overlay').style.display = 'flex';
        await vi.waitFor(() => expect(panel.root.classList.contains('is-fullscreen-hidden')).toBe(true));
        expect(panel.root.getAttribute('aria-hidden')).toBe('true');
        expect(panel.reopenButton.hidden).toBe(true);
        panel.destroy();
    });

    test('renders local artist streams, a biography fallback, and an artist Like control', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        panel.content.innerHTML = panel.renderArtist({
            artist: { id: 'artist', name: 'Artist', banner: '/artist.jpg', biography: '' },
            artwork: { staticSrc: '/cover.jpg' },
        });
        expect(panel.root.querySelector('[data-artist-streams]').textContent).toContain('1,234 total streams');
        expect(panel.root.querySelector('.now-playing-panel-biography').textContent).toContain('No biography');
        expect(panel.root.querySelector('.now-playing-panel-artist-like')).toBeTruthy();
        expect(panel.root.querySelector('.now-playing-panel-follow')).toBeNull();
        panel.destroy();
    });

    test('does not expose the desktop panel below the desktop breakpoint', async () => {
        matchMedia.mockImplementation((query) => ({
            matches: query === '(min-width: 769px)' ? false : false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        expect(panel.isOpen).toBe(false);
        expect(panel.root.getAttribute('aria-hidden')).toBe('true');
        expect(panel.reopenButton.hidden).toBe(true);
        panel.destroy();
    });

    test('uses the Escape hierarchy before closing the panel', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        panel.root.querySelector('.now-playing-panel-lyrics-expand').click();
        expect(panel.expandedLyrics).toBe(true);
        panel.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(panel.expandedLyrics).toBe(false);
        expect(panel.isOpen).toBe(true);
        panel.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(panel.isOpen).toBe(false);
        panel.destroy();
    });

    test('reduces collapsed lyrics to an inert header-only state', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        const collapse = panel.root.querySelector('.now-playing-panel-lyrics-collapse');

        collapse.click();

        const lyrics = panel.root.querySelector('.now-playing-panel-lyrics');
        const host = panel.root.querySelector('.now-playing-panel-lyrics-host');
        expect(lyrics.classList.contains('is-collapsed')).toBe(true);
        expect(host.inert).toBe(true);
        expect(host.getAttribute('aria-hidden')).toBe('true');
        expect(collapse.getAttribute('aria-expanded')).toBe('false');
        expect(collapse.getAttribute('aria-label')).toBe('Show lyrics preview');
        panel.destroy();
    });

    test('opens the integrated queue directly from Now Playing', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        panel.root.querySelector('.now-playing-panel-open-queue').click();
        expect(panel.activeView).toBe('queue');
        expect(panel.root.classList.contains('is-queue-view')).toBe(true);
        expect(panel.isOpen).toBe(true);
        panel.destroy();
    });

    test('plays the next queued track when its row is activated', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        deps.player.currentQueueIndex = 2;
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        panel.content.innerHTML = panel.renderQueue({
            nextTrack: {
                id: 'next',
                title: 'Next track',
                artist: { name: 'Artist' },
                album: { cover: '/next.jpg' },
            },
        });

        const nextTrack = panel.root.querySelector('[data-play-next]');
        expect(nextTrack.tagName).toBe('BUTTON');
        nextTrack.click();
        await vi.waitFor(() => expect(deps.player.playAtIndex).toHaveBeenCalledWith(3));
        panel.destroy();
    });

    test('keeps queue rows static on advances so FLIP owns their movement', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        deps.player.currentQueueIndex = 0;
        deps.player.getCurrentQueue = () => [
            { id: 'current', title: 'Current', artist: { name: 'Artist' }, album: { cover: '/current.jpg' } },
            { id: 'next', title: 'Next', artist: { name: 'Artist' }, album: { cover: '/next.jpg' } },
        ];
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);

        const refreshMarkup = panel.renderQueue();
        expect(refreshMarkup).toContain('queue-track-row-static');

        panel.queueMotionReason = 'advance';
        const advanceMarkup = panel.renderQueue();
        expect(advanceMarkup).toContain('queue-track-row-static');
        panel.destroy();
    });

    test('uses persistent Queue and History tabs with searchable, day-grouped listening history', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        const now = Date.now();
        panel.activeView = 'queue';
        panel.historyLoaded = true;
        panel.queueHistory = [
            {
                id: 'session-track',
                title: 'Session song',
                artist: { name: 'Session artist' },
                album: { title: 'Session album', cover: '/session.jpg' },
                playedAt: now,
            },
        ];
        panel.historyItems = [
            {
                id: 'session-track',
                title: 'Session song',
                artist: { name: 'Session artist' },
                album: { title: 'Session album', cover: '/session.jpg' },
                timestamp: now - 1000,
            },
            {
                id: 'older-track',
                title: 'Older song',
                artist: { name: 'Archive artist' },
                album: { title: 'Blue archive', cover: '/older.jpg' },
                timestamp: now - 86400000,
            },
            {
                id: 'oldest-track',
                title: 'Oldest song',
                artist: { name: 'Another artist' },
                album: { title: 'Red archive', cover: '/oldest.jpg' },
                timestamp: now - 172800000,
            },
        ];
        panel.queueLayer.classList.add('is-visible');
        panel.queueLayer.innerHTML = panel.renderQueue();

        const tabs = panel.queueLayer.querySelectorAll('.queue-view-switch[role="tab"]');
        expect([...tabs].map((tab) => tab.textContent)).toEqual(['Queue', 'History']);
        expect(tabs[0].getAttribute('aria-selected')).toBe('true');

        tabs[1].click();

        expect(panel.queueView).toBe('history');
        expect(panel.queueLayer.querySelector('#queue-tab-history').getAttribute('aria-selected')).toBe('true');
        expect(panel.queueLayer.textContent).toContain('This queue');
        expect(panel.queueLayer.textContent).toContain('Session song');
        expect(panel.queueLayer.textContent).toContain('All history');
        expect(panel.queueLayer.querySelectorAll('[data-history-track-id="session-track"]')).toHaveLength(2);
        expect(panel.queueLayer.querySelectorAll('.queue-history-day')).toHaveLength(3);
        expect(panel.queueLayer.querySelector('[data-history-summary]').hidden).toBe(true);

        panel.queueLayer.querySelector('[data-history-search-toggle]').click();
        const input = panel.queueLayer.querySelector('#queue-history-search');
        input.value = 'blue archive';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        expect(panel.queueLayer.textContent).toContain('Older song');
        expect(panel.queueLayer.textContent).not.toContain('Oldest song');
        expect(panel.queueLayer.textContent).not.toContain('Session song');
        expect(panel.queueLayer.querySelector('[data-history-summary]').textContent).toBe('1 result');
        panel.queueLayer.querySelector('[data-history-track-id="older-track"]').click();
        await vi.waitFor(() => expect(deps.player.setQueue).toHaveBeenCalledOnce());
        expect(deps.player.playTrackFromQueue).toHaveBeenCalledOnce();
        panel.destroy();
    });

    test('renders long listening history progressively as the user reaches the end', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        panel.activeView = 'queue';
        panel.queueView = 'history';
        panel.historyLoaded = true;
        panel.historyItems = Array.from({ length: 70 }, (_, index) => ({
            id: `history-${index}`,
            title: `History song ${index}`,
            artist: { name: 'Artist' },
            album: { title: 'Album', cover: '/history.jpg' },
            timestamp: Date.now() - index * 60000,
        }));
        panel.queueLayer.classList.add('is-visible');
        panel.queueLayer.innerHTML = panel.renderQueue();

        expect(panel.queueLayer.querySelectorAll('[data-history-track-id]')).toHaveLength(32);
        expect(panel.queueLayer.querySelector('[data-history-load-more] small').textContent).toBe('38 more songs');

        panel.loadMoreHistory();
        expect(panel.queueLayer.querySelectorAll('[data-history-track-id]')).toHaveLength(56);
        expect(panel.queueLayer.querySelector('[data-history-load-more] small').textContent).toBe('14 more songs');

        panel.loadMoreHistory();
        expect(panel.queueLayer.querySelectorAll('[data-history-track-id]')).toHaveLength(70);
        expect(panel.queueLayer.querySelector('[data-history-load-more]')).toBeNull();
        panel.destroy();
    });

    test('reveals history rows with the queue row motion as they enter the scroll viewport', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        panel.activeView = 'queue';
        panel.queueView = 'history';
        panel.historyLoaded = true;
        panel.historyItems = [
            {
                id: 'history-track',
                title: 'History track',
                artist: { name: 'Artist' },
                album: { title: 'Album', cover: '/history.jpg' },
                timestamp: Date.now(),
            },
        ];
        panel.queueLayer.classList.add('is-visible');
        panel.queueLayer.innerHTML = panel.renderQueue();
        panel.setupHistoryRowReveal();
        const row = panel.queueLayer.querySelector('[data-history-reveal]');
        const observer = intersectionObservers.at(-1);

        expect(row.classList.contains('is-scroll-pending')).toBe(true);
        observer.callback([{ target: row, isIntersecting: true }]);
        expect(row.classList.contains('is-scroll-pending')).toBe(false);
        expect(row.classList.contains('is-scroll-visible')).toBe(true);
        panel.destroy();
    });

    test('does not replay row entrance animation after removing a queue track', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        const current = { id: 'current', title: 'Current', artist: { name: 'Artist' }, album: { cover: '/current.jpg' } };
        const removed = { id: 'removed', title: 'Removed', artist: { name: 'Artist' }, album: { cover: '/removed.jpg' } };
        const remaining = { id: 'remaining', title: 'Remaining', artist: { name: 'Artist' }, album: { cover: '/remaining.jpg' } };
        let queue = [current, removed, remaining];
        deps.player.currentTrack = current;
        deps.player.currentQueueIndex = 0;
        deps.player.getCurrentQueue = () => queue;
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        panel.activeView = 'queue';
        panel.currentTrack = current;
        panel.queueLayer.classList.add('is-visible');
        panel.queueLayer.innerHTML = panel.renderQueue();

        queue = [current, remaining];
        panel.queueMotionReason = 'remove';
        panel.renderQueueLayer(panel.model || {}, 0);

        await vi.waitFor(() => {
            expect(panel.queueLayer.querySelector('[data-track-id="removed"]')).toBeNull();
        });
        expect(
            [...panel.queueLayer.querySelectorAll('.queue-track-row')].every((row) =>
                row.classList.contains('queue-track-row-static')
            )
        ).toBe(true);
        panel.destroy();
    });

    test('keeps the full-screen queue open and interactive when the viewport becomes mobile', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);

        panel.openQueue();
        panel.boundDesktopViewportChanged({ matches: false });

        expect(panel.isOpen).toBe(true);
        expect(panel.root.classList.contains('is-closed')).toBe(false);
        expect(panel.content.inert).toBe(false);
        expect(panel.root.getAttribute('role')).toBe('dialog');
        expect(panel.root.getAttribute('aria-modal')).toBe('true');
        panel.destroy();
    });

    test('lets the queue cover the fullscreen player instead of becoming inert', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        document.getElementById('fullscreen-cover-overlay').style.display = 'flex';

        panel.openQueue();
        panel.syncFullscreenVisibility();

        expect(panel.root.classList.contains('is-fullscreen-hidden')).toBe(false);
        expect(panel.root.getAttribute('aria-hidden')).toBe('false');
        expect(panel.content.inert).toBe(false);
        panel.destroy();
    });

    test('Endless toggles the real player preference and requests songs for a short queue', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        deps.player.getCurrentQueue = () => [{ id: 'seed', title: 'Seed' }];
        deps.player.currentQueueIndex = 0;
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        panel.activeView = 'queue';
        panel.content.innerHTML = panel.renderQueue();

        const endless = panel.root.querySelector('[data-endless-toggle]');
        endless.click();

        await vi.waitFor(() =>
            expect(panel.root.querySelector('[data-endless-toggle]').getAttribute('aria-pressed')).toBe('true')
        );
        expect(deps.player.enableAutoplay).toHaveBeenCalledOnce();
        expect(deps.player.fetchAutoplayRecommendations).toHaveBeenCalledOnce();
        panel.root.querySelector('[data-endless-toggle]').click();
        await vi.waitFor(() => expect(deps.player.disableAutoplay).toHaveBeenCalledOnce());
        expect(deps.player.autoplayEnabled).toBe(false);
        panel.destroy();
    });

    test('Endless pauses under either repeat mode without clearing the saved preference', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        deps.player.autoplayEnabled = true;
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        panel.activeView = 'queue';
        for (const mode of [1, 2]) {
            deps.player.repeatMode = mode;
            panel.content.innerHTML = panel.renderQueue();
            const button = panel.root.querySelector('[data-endless-toggle]');
            expect(button.getAttribute('aria-pressed')).toBe('false');
            expect(button.textContent).toContain('Paused while repeat is on');
            button.click();
        }
        expect(deps.player.autoplayEnabled).toBe(true);
        expect(deps.player.disableAutoplay).not.toHaveBeenCalled();
        panel.destroy();
    });

    test('labels a manually inserted album track and keeps its grip on the right', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        const current = { id: 'album-1', title: 'First', artist: { name: 'Artist' }, duration: 120 };
        const inserted = { id: 'manual', title: 'Inserted', artist: { name: 'Guest' }, duration: 180 };
        const albumNext = { id: 'album-2', title: 'Second', artist: { name: 'Artist' }, duration: 150 };
        deps.player.currentTrack = current;
        deps.player.currentQueueIndex = 0;
        deps.player.sourceContext = { kind: 'album', id: 'album', label: 'The Album' };
        deps.player.getCurrentQueue = () => [current, inserted, albumNext];
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        panel.currentTrack = current;
        panel.sourceContext = deps.player.sourceContext;
        panel.boundQueueTracksAdded({ detail: { mode: 'next', tracks: [inserted] } });
        panel.content.innerHTML = panel.renderQueue();

        const firstRow = panel.root.querySelector('.queue-track-row');
        expect(panel.root.querySelector('.queue-source-context').textContent).toContain('Continuing The Album');
        expect(firstRow.classList.contains('is-pinned-next')).toBe(true);
        expect(firstRow.textContent).toContain('Pinned next');
        expect(firstRow.lastElementChild.classList.contains('queue-drag-handle')).toBe(true);
        panel.destroy();
    });

    test('mounts Canvas without a poster and preserves its decoded frame while paused', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        const audio = document.createElement('audio');
        let audioPaused = false;
        Object.defineProperty(audio, 'paused', { configurable: true, get: () => audioPaused });
        deps.player.activeElement = audio;
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        const model = {
            ...panel.model,
            empty: false,
            title: 'Canvas track',
            source: { label: 'Album', href: null },
            artists: [],
            artistLine: 'Artist',
            releaseYear: '',
            explicit: false,
            artwork: {
                staticSrc: '/poster.jpg',
                animatedSrc: '/canvas.mp4',
                isVideo: true,
            },
            relatedVideos: [],
            artist: null,
            credits: [],
            tourDates: [],
            nextTrack: null,
        };
        panel.content.innerHTML = panel.renderMarkup(model);
        await panel.mountMedia(model, new AbortController().signal);

        const stage = panel.content.querySelector('.now-playing-panel-media');
        expect(stage.tagName).toBe('BUTTON');
        expect(stage.getAttribute('aria-expanded')).toBe('false');
        expect(stage.querySelector('.now-playing-panel-poster')).toBeNull();
        const canvas = stage.querySelector('video.now-playing-panel-canvas');
        expect(canvas).toBeTruthy();
        expect(stage.querySelectorAll(':scope > img, video')).toHaveLength(1);
        expect(canvas.getAttribute('poster')).toBeNull();
        let canvasPaused = true;
        Object.defineProperty(canvas, 'paused', { configurable: true, get: () => canvasPaused });

        canvas.dispatchEvent(new Event('loadeddata'));
        await vi.waitFor(() => expect(stage.classList.contains('is-canvas-ready')).toBe(true));
        expect(stage.classList.contains('is-canvas-playing')).toBe(true);

        const play = vi.spyOn(canvas, 'play').mockResolvedValue();
        const replacementAudio = document.createElement('audio');
        let replacementAudioPaused = false;
        Object.defineProperty(replacementAudio, 'paused', {
            configurable: true,
            get: () => replacementAudioPaused,
        });
        deps.player.activeElement = replacementAudio;
        intersectionObservers.at(-1).callback([{ isIntersecting: false }]);
        expect(panel.canvasPlaybackElement).toBe(replacementAudio);
        expect(play).toHaveBeenCalled();
        play.mockClear();

        // A mocked play() does not emit the browser event that resets retry backoff.
        canvasPaused = false;
        canvas.dispatchEvent(new Event('play'));
        expect(stage.classList.contains('is-canvas-playing')).toBe(true);
        const schedule = vi.spyOn(window, 'setTimeout');
        canvas.dispatchEvent(new Event('pause'));
        const retry = schedule.mock.calls.find(([, delay]) => delay === 240);
        expect(retry).toBeTruthy();
        retry[0]();
        expect(play).toHaveBeenCalled();
        schedule.mockRestore();

        stage.click();
        expect(panel.canvasExpanded).toBe(true);
        expect(stage.getAttribute('aria-expanded')).toBe('true');
        expect(stage.closest('.now-playing-panel-body').classList.contains('is-canvas-expanded')).toBe(true);

        const render = vi.spyOn(panel, 'render');
        const pause = vi.spyOn(canvas, 'pause');
        replacementAudioPaused = true;
        canvasPaused = true;
        replacementAudio.dispatchEvent(new Event('pause'));
        expect(stage.classList.contains('is-canvas-ready')).toBe(true);
        expect(stage.classList.contains('is-canvas-playing')).toBe(true);
        expect(pause).toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();

        panel.reducedMotionMedia.matches = true;
        expect(panel.renderMarkup(model)).not.toContain('has-video-artwork');
        panel.destroy();
    });

    test('starts Canvas without waiting for background loading', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        panel.background.setSource.mockImplementation(() => new Promise(() => {}));
        panel.currentTrack = { id: 'parallel-canvas', title: 'Canvas', videoCoverUrl: '/canvas.mp4' };
        await panel.render({});
        expect(panel.canvasMedia).toBeTruthy();
        expect(panel.canvasMedia.getAttribute('poster')).toBeNull();
        expect(panel.content.querySelector('.now-playing-panel-cover:not(.is-artwork-leaving)')).toBeNull();
        panel.failCanvasMedia();
        expect(panel.content.querySelector('[role="status"]').textContent).toBe('Canvas unavailable');
        expect(panel.content.querySelector('.now-playing-panel-cover')).toBeNull();
        panel.destroy();
    });

    test('fades the previous artwork over the next track instead of blanking it', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        panel.currentTrack = { id: 'first', title: 'First', album: { cover: '/first.jpg' } };
        await panel.render({});
        const previous = panel.content.querySelector('.now-playing-panel-cover');
        panel.currentTrack = { id: 'second', title: 'Second', album: { cover: '/second.jpg' } };
        await panel.render({});
        const media = panel.content.querySelector('.now-playing-panel-media');
        expect(previous.classList.contains('is-artwork-leaving')).toBe(true);
        expect(previous.parentElement).toBe(media);
        expect(media.querySelectorAll('.now-playing-panel-cover')).toHaveLength(2);
        panel.destroy();
    });

    test('does not rebuild the panel for duplicate same-track playback events', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        deps.player.currentTrack = { id: 'track', title: 'Track' };
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        const body = panel.content.querySelector('.now-playing-panel-body');

        window.dispatchEvent(
            new CustomEvent('player-track-changed', {
                detail: { track: { ...deps.player.currentTrack } },
            })
        );
        await Promise.resolve();

        expect(panel.content.querySelector('.now-playing-panel-body')).toBe(body);
        expect(panel.root.classList.contains('is-track-transitioning')).toBe(false);
        panel.destroy();
    });

    test('waits for the skipped track before rendering the queue advance', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        const current = { id: 'current', title: 'Current', artist: { name: 'Artist' }, album: { cover: '/current.jpg' } };
        const next = { id: 'next', title: 'Next', artist: { name: 'Artist' }, album: { cover: '/next.jpg' } };
        const after = { id: 'after', title: 'After', artist: { name: 'Artist' }, album: { cover: '/after.jpg' } };
        const queue = [current, next, after];
        deps.player.currentTrack = current;
        deps.player.currentQueueIndex = 0;
        deps.player.getCurrentQueue = () => queue;
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        await panel.render({ preserveScroll: true });
        panel.activeView = 'queue';
        panel.currentTrack = current;
        panel.queueLayer.hidden = false;
        panel.queueLayer.classList.add('is-visible');
        panel.queueLayer.innerHTML = panel.renderQueue();
        const nowPlayingBody = panel.content.querySelector('.now-playing-panel-body');

        const readBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
        const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
        getBoundingClientRect.mockImplementation(function () {
            if (this.matches('.queue-current-artwork img')) return new DOMRect(8, 80, 48, 48);
            const row = this.matches('.queue-track-row') ? this : this.closest('.queue-track-row');
            if (row) {
                const rows = [...row.parentElement.querySelectorAll('.queue-track-row')];
                const top = 160 + rows.indexOf(row) * 60;
                return this === row ? new DOMRect(0, top, 320, 56) : new DOMRect(8, top, 48, 48);
            }
            return readBoundingClientRect.call(this);
        });
        const rowAnimations = vi.spyOn(HTMLElement.prototype, 'animate');

        deps.player.currentQueueIndex = 1;
        const renderQueueLayer = vi.spyOn(panel, 'renderQueueLayer');
        panel.boundQueueChanged(
            new CustomEvent('player-queue-changed', {
                detail: { queue, currentIndex: 1, sourceContext: deps.player.sourceContext },
            })
        );
        await panel.render({ preserveScroll: true });

        expect(renderQueueLayer).not.toHaveBeenCalled();

        deps.player.currentTrack = next;
        const renderPanel = vi.spyOn(panel, 'render');
        const updateBackgroundSource = vi.spyOn(panel.background, 'setSource');
        updateBackgroundSource.mockClear();
        panel.boundTrackChanged(new CustomEvent('player-track-changed', { detail: { track: next } }));
        window.dispatchEvent(
            new CustomEvent('player-canvas-changed', {
                detail: { trackId: 'next', track: { videoCoverUrl: '/next-video.mp4' } },
            })
        );
        window.dispatchEvent(
            new CustomEvent('track-metadata-updated', {
                detail: { trackId: 'next', track: { title: 'Next metadata' } },
            })
        );

        expect(renderPanel).not.toHaveBeenCalled();
        expect(updateBackgroundSource).not.toHaveBeenCalled();
        expect(renderQueueLayer).toHaveBeenCalledTimes(1);
        expect(panel.nowPlayingNeedsRender).toBe(true);
        expect(panel.content.querySelector('.now-playing-panel-body')).toBe(nowPlayingBody);
        expect(panel.queueLayer.querySelector('#queue-current-title .queue-current-title-text').textContent).toBe('Next');
        const movedRowAnimationIndex = rowAnimations.mock.contexts.findIndex((element) =>
            element.matches('.queue-track-row')
        );
        expect(movedRowAnimationIndex).toBeGreaterThanOrEqual(0);
        expect(rowAnimations.mock.calls[movedRowAnimationIndex][0][0].transform).toContain('60px');
        expect(rowAnimations.mock.contexts.filter((element) => element.matches('.queue-track-row'))).toHaveLength(1);
        const afterRow = panel.queueLayer.querySelector('[data-track-id="after"]');
        expect(afterRow.classList.contains('queue-track-row-static')).toBe(true);
        expect(panel.queueLayer.querySelector('[data-track-id="after"]')).toBe(afterRow);
        expect(panel.queueLayer.querySelector('[data-track-id="next"]')).toBeNull();
        rowAnimations.mockRestore();
        getBoundingClientRect.mockRestore();
        panel.destroy();
    });

    test.each([
        { mode: 'queue', insertionIndex: 3, expectedMovingRows: 0, duplicate: false },
        { mode: 'next', insertionIndex: 1, expectedMovingRows: 2, duplicate: false },
        { mode: 'next', insertionIndex: 1, expectedMovingRows: 2, duplicate: true },
    ])(
        'animates only newly added rows for $mode queue additions (duplicate: $duplicate)',
        async ({ mode, insertionIndex, expectedMovingRows, duplicate }) => {
            const { NowPlayingPanel } = await import('./now-playing-panel.js');
            const deps = dependencies();
            const current = { id: 'current', title: 'Current', artist: { name: 'Artist' }, album: { cover: '/current.jpg' } };
            const next = { id: 'next', title: 'Next', artist: { name: 'Artist' }, album: { cover: '/next.jpg' } };
            const after = { id: 'after', title: 'After', artist: { name: 'Artist' }, album: { cover: '/after.jpg' } };
            const added = {
                id: duplicate ? 'next' : 'added',
                title: 'Added',
                artist: { name: 'Artist' },
                album: { cover: '/added.jpg' },
            };
            const queue = [current, next, after];
            deps.player.currentTrack = current;
            deps.player.currentQueueIndex = 0;
            deps.player.getCurrentQueue = () => queue;
            const panel = new NowPlayingPanel(deps);
            await waitForPanel(panel);
            await panel.render({ preserveScroll: true });
            panel.activeView = 'queue';
            panel.queueLayer.hidden = false;
            panel.queueLayer.classList.add('is-visible');
            panel.queueLayer.innerHTML = panel.renderQueue();

            const readBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
            const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
            getBoundingClientRect.mockImplementation(function () {
                const row = this.matches('.queue-track-row') ? this : this.closest('.queue-track-row');
                if (row) {
                    const rows = [...row.parentElement.querySelectorAll('.queue-track-row')];
                    const top = 160 + rows.indexOf(row) * 60;
                    return this === row ? new DOMRect(0, top, 320, 56) : new DOMRect(8, top, 48, 48);
                }
                return readBoundingClientRect.call(this);
            });
            const rowAnimations = vi.spyOn(HTMLElement.prototype, 'animate');

            queue.splice(insertionIndex, 0, added);
            window.dispatchEvent(
                new CustomEvent('queue-tracks-added', {
                    detail: { tracks: [added], mode, userInitiated: true },
                })
            );
            window.dispatchEvent(
                new CustomEvent('player-queue-changed', {
                    detail: { queue, currentIndex: 0, sourceContext: deps.player.sourceContext },
                })
            );

            const rows = [...panel.queueLayer.querySelectorAll('.queue-track-row')];
            const addedRow = rows[insertionIndex - 1];
            expect(addedRow.dataset.trackId).toBe(added.id);
            expect(addedRow.classList.contains('queue-track-row-static')).toBe(false);
            expect(addedRow.classList.contains('queue-track-row-added')).toBe(true);
            expect(addedRow.dataset.queueAddedOrder).toBe('0');
            rows.filter((row) => row !== addedRow).forEach((row) => {
                expect(row.classList.contains('queue-track-row-static')).toBe(true);
                expect(row.classList.contains('queue-track-row-added')).toBe(false);
            });
            const movedRows = rowAnimations.mock.contexts.filter((element) => element.matches('.queue-track-row'));
            expect(movedRows).toHaveLength(expectedMovingRows + 1);
            await panel.render({ preserveScroll: true });
            expect([...panel.queueLayer.querySelectorAll('.queue-track-row')]).toEqual(rows);
            expect(rowAnimations.mock.contexts.filter((element) => element.matches('.queue-track-row'))).toHaveLength(
                expectedMovingRows + 1
            );
            panel.destroy();
            rowAnimations.mockRestore();
            getBoundingClientRect.mockRestore();
        }
    );

    test('does not rebuild the panel when endless playback appends tracks', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        const current = { id: 'current', title: 'Current' };
        deps.player.currentTrack = current;
        deps.player.currentQueueIndex = 0;
        deps.player.getCurrentQueue = () => [current];
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        const body = panel.content.querySelector('.now-playing-panel-body');

        window.dispatchEvent(
            new CustomEvent('player-queue-changed', {
                detail: {
                    queue: [current, { id: 'endless-1' }, { id: 'endless-2' }],
                    currentIndex: 0,
                    sourceContext: deps.player.sourceContext,
                },
            })
        );
        await Promise.resolve();

        expect(panel.content.querySelector('.now-playing-panel-body')).toBe(body);
        expect(panel.root.classList.contains('is-track-transitioning')).toBe(false);
        panel.destroy();
    });

    test('does not rebuild the panel when pause saves an unchanged queue', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        const current = { id: 'current', title: 'Current' };
        const next = { id: 'next', title: 'Next' };
        deps.player.currentTrack = current;
        deps.player.currentQueueIndex = 0;
        deps.player.getCurrentQueue = () => [current, next];
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);
        const body = panel.content.querySelector('.now-playing-panel-body');

        window.dispatchEvent(
            new CustomEvent('player-queue-changed', {
                detail: {
                    queue: [current, next],
                    currentIndex: 0,
                    sourceContext: deps.player.sourceContext,
                },
            })
        );
        await Promise.resolve();

        expect(panel.content.querySelector('.now-playing-panel-body')).toBe(body);
        expect(panel.root.classList.contains('is-track-transitioning')).toBe(false);
        panel.destroy();
    });

    test('positions the visual scrollbar over the panel without a native gutter', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        Object.defineProperties(panel.content, {
            clientHeight: { configurable: true, value: 400 },
            scrollHeight: { configurable: true, value: 1000 },
            scrollTop: { configurable: true, value: 300, writable: true },
        });
        Object.defineProperty(panel.scrollbar, 'clientHeight', { configurable: true, value: 400 });

        panel.updateScrollbar();

        expect(panel.scrollbar.classList.contains('has-overflow')).toBe(true);
        expect(panel.scrollbarThumb.style.height).toBe('160px');
        expect(panel.scrollbarThumb.style.transform).toBe('translateY(120px)');
        panel.destroy();
    });

    test('opens the current album when the track title is activated', async () => {
        const { navigate } = await import('./router.js');
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const deps = dependencies();
        deps.player.currentTrack = {
            id: 'track',
            title: 'Track title',
            album: { id: 'album-id', title: 'Album title', cover: '/cover.jpg' },
        };
        const panel = new NowPlayingPanel(deps);
        await waitForPanel(panel);

        panel.root.querySelector('.now-playing-panel-track-title').click();
        expect(navigate).toHaveBeenCalledWith('/album/album-id');
        panel.destroy();
    });
});
