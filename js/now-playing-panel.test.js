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
}));
vi.mock('./db.js', () => ({
    db: { isFavorite: vi.fn(async () => false), toggleFavorite: vi.fn(async () => true) },
}));
vi.mock('./accounts/pocketbase.js', () => ({
    syncManager: { syncLibraryItem: vi.fn(async () => {}) },
}));
vi.mock('./downloads.js', () => ({ showNotification: vi.fn() }));
vi.mock('./router.js', () => ({ navigate: vi.fn() }));
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
    escapeHtml: (value) => String(value ?? ''),
    getShareUrl: (path) => `http://localhost${path}`,
    getTrackArtists: (track) => track?.artist?.name || 'Unknown artist',
    getTrackTitle: (track) => track?.title || 'Unknown title',
    getTrackYearDisplay: () => '',
}));

function shell() {
    document.body.innerHTML = `<main class="main-content"></main>
        <div id="fullscreen-cover-overlay" style="display: none"></div>
        <aside id="now-playing-panel" class="now-playing-panel" data-spicy-background-host>
            <div class="now-playing-panel-resizer"></div><div class="now-playing-panel-scroll"></div>
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

    test('hands Open queue to the existing independent queue control', async () => {
        const { NowPlayingPanel } = await import('./now-playing-panel.js');
        const panel = new NowPlayingPanel(dependencies());
        await waitForPanel(panel);
        const queueButton = document.getElementById('queue-btn');
        const click = vi.fn();
        queueButton.addEventListener('click', click);
        panel.root.querySelector('.now-playing-panel-open-queue').click();
        expect(click).toHaveBeenCalledOnce();
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

    test('keeps the static poster mounted beneath a deferred Canvas video', async () => {
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
        expect(stage.querySelector('.now-playing-panel-poster')).toBeTruthy();
        const canvas = stage.querySelector('video.now-playing-panel-canvas');
        expect(canvas).toBeTruthy();
        expect(stage.querySelectorAll('img, video')).toHaveLength(2);

        canvas.dispatchEvent(new Event('loadeddata'));
        await vi.waitFor(() => expect(stage.classList.contains('is-canvas-ready')).toBe(true));

        const play = vi.spyOn(canvas, 'play').mockResolvedValue();
        const replacementAudio = document.createElement('audio');
        Object.defineProperty(replacementAudio, 'paused', { configurable: true, get: () => false });
        deps.player.activeElement = replacementAudio;
        intersectionObservers.at(-1).callback([{ isIntersecting: false }]);
        expect(panel.canvasPlaybackElement).toBe(replacementAudio);
        expect(play).toHaveBeenCalled();
        play.mockClear();

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
        audioPaused = true;
        audio.dispatchEvent(new Event('pause'));
        expect(stage.classList.contains('is-canvas-ready')).toBe(true);
        expect(render).not.toHaveBeenCalled();

        panel.reducedMotionMedia.matches = true;
        expect(panel.renderMarkup(model)).not.toContain('has-video-artwork');
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
