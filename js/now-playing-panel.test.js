import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./spicy-dynamic-background.js', () => ({
    mountSpicyDynamicBackground: () => ({ setSource: vi.fn(async () => true), dispose: vi.fn() }),
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
vi.mock('./animated-artwork.js', () => ({ isVideoArtwork: () => false }));
vi.mock('./utils.js', () => ({
    escapeHtml: (value) => String(value ?? ''),
    getShareUrl: (path) => `http://localhost${path}`,
    getTrackArtists: (track) => track?.artist?.name || 'Unknown artist',
    getTrackTitle: (track) => track?.title || 'Unknown title',
    getTrackYearDisplay: () => '',
}));

function shell() {
    document.body.innerHTML = `<main class="main-content"></main>
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
        },
        api: { getCoverUrl: (value) => value },
        ui: { refreshTrackSaveButtons: vi.fn(async () => {}) },
        lyricsManager: {},
    };
}

async function waitForPanel(panel) {
    await vi.waitFor(() => expect(panel.root.querySelector('.now-playing-panel-close')).toBeTruthy());
}

beforeEach(() => {
    shell();
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
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
});
