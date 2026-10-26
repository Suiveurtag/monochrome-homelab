import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('./lyrics.js', () => ({
    clearLyricsContainerSync: vi.fn(),
    renderLyricsInContainer: vi.fn(),
    renderLyricsInNowPanel: vi.fn(),
}));
vi.mock('./share.js', () => ({ copyShareLink: vi.fn() }));
vi.mock('./downloads.js', () => ({ showNotification: vi.fn() }));
vi.mock('./router.js', () => ({ navigate: vi.fn() }));
vi.mock('./accounts/pocketbase.js', () => ({ syncManager: {} }));
import { NowPlayingPanel } from './now-playing-panel.js';
import { mountSpicyDynamicBackground } from './spicy-dynamic-background.js';
import '../now-playing-panel.css';

// Exercise the shipped markup and stylesheet together: the interaction tests mock media
// and cannot detect an invalid mask, a cascade override, or a fade in the wrong place.
function panelFixture({ expanded = false, canvas = true, width = 420, height = 826 } = {}) {
    const panel = Object.assign(Object.create(NowPlayingPanel.prototype), {
        canvasEnabled: canvas,
        canvasExpanded: expanded,
        reducedMotionMedia: { matches: false },
        currentTrack: null,
    });
    const model = {
        empty: false,
        title: 'Heart Racing',
        source: { label: 'Night Feelings (Nightcore)' },
        artists: [],
        artistLine: 'Kanii, Riovaz, Nimstarr',
        artwork: { staticSrc: '/assets/appicon.png', isVideo: canvas },
        relatedVideos: [],
        artist: null,
        credits: [],
        tourDates: [],
    };
    document.body.innerHTML = `<style>
        #now-playing-panel { position: fixed; inset: 0 auto auto 0; width: ${width}px; height: ${height}px; display: block !important; --now-playing-player-clearance: 126px; }
        #now-playing-panel, #now-playing-panel * { box-sizing: border-box; }
        #now-playing-panel *, #now-playing-panel *::before { transition: none !important; }
    </style><aside id="now-playing-panel" class="now-playing-panel">
        <div class="now-playing-panel-header-slot"></div>
        <div class="now-playing-panel-viewport"><div class="now-playing-panel-scroll">${panel.renderNowPlayingMarkup(model)}</div></div>
    </aside>`;
    panel.root = document.querySelector('#now-playing-panel');
    panel.content = panel.root.querySelector('.now-playing-panel-scroll');
    panel.viewport = panel.content.parentElement;
    panel.headerSlot = panel.root.querySelector('.now-playing-panel-header-slot');
    panel.background = mountSpicyDynamicBackground(panel.root, {
        className: 'now-playing-panel-spicy-bg',
        foregroundClassName: 'now-playing-panel-top-bg',
    });
    panel.syncHeader();
    const stage = panel.root.querySelector('.now-playing-panel-media');
    const video = document.createElement('video');
    video.className = 'now-playing-panel-canvas';
    stage.append(video);
    stage.classList.add('is-canvas-playing');
    return { panel, stage, video };
}

afterEach(() => {
    for (const root of document.querySelectorAll('[data-spicy-background]')) root.spicyDynamicBackground?.dispose();
    document.body.innerHTML = '';
});

const spicyMask = (stop) =>
    `linear-gradient(rgba(0, 0, 0, 0) -5%, rgb(0, 0, 0) 15%, rgb(0, 0, 0) ${stop}%, rgba(0, 0, 0, 0) 100%)`;

describe('Now Playing Canvas compositing', () => {
    test('uses the complete upstream mask, including its upper blend', () => {
        const { video } = panelFixture();
        expect(getComputedStyle(video).maskImage).toBe(spicyMask(25));
        expect(getComputedStyle(video).opacity).toBe('0.9');
        expect(getComputedStyle(video).maskSize).toBe('auto');
    });

    test.each([
        [360, 600],
        [420, 826],
        [520, 1080],
    ])('preserves the 9:16 surface across both layouts at %i × %i', (width, height) => {
        const { panel, stage, video } = panelFixture({ width, height });
        const row = stage.parentElement;
        const title = panel.root.querySelector('h2');
        const lyrics = panel.root.querySelector('.now-playing-panel-lyrics');
        const visual = video.getBoundingClientRect();
        expect(row.getBoundingClientRect().height).toBeCloseTo(width - 32, 1);
        expect(visual.height / visual.width).toBeCloseTo(16 / 9, 3);
        expect(visual.top - panel.root.getBoundingClientRect().top).toBeCloseTo(-25, 1);
        // Screenshot 3: the Canvas still contributes behind the title and the lyrics card.
        expect(visual.bottom - lyrics.getBoundingClientRect().top).toBeGreaterThan(100);
        expect(getComputedStyle(stage).overflow).toBe('visible');
        panel.canvasExpanded = true;
        panel.applyCanvasMode();
        expect(getComputedStyle(video).maskImage).toBe(spicyMask(80));
        expect(video.getBoundingClientRect().height).toBeCloseTo(visual.height, 1);
        expect(row.getBoundingClientRect().height).toBeCloseTo(((width - 32) * (height < 608 ? 11 : 14.5)) / 9, 1);
        expect(video.getBoundingClientRect().bottom).toBeGreaterThan(title.getBoundingClientRect().top);
        expect(getComputedStyle(video).maskSize).toBe('auto');
    });

    test('matches the title and lyrics offsets in the 420px Spotify screenshots', () => {
        const { panel } = panelFixture();
        const metadata = panel.root.querySelector('.now-playing-panel-metadata');
        const lyrics = panel.root.querySelector('.now-playing-panel-lyrics');
        expect(metadata.getBoundingClientRect().top).toBeCloseTo(25 + 388 + 16, 1);
        expect(lyrics.getBoundingClientRect().top).toBeCloseTo(25 + 388 + 16 + 56 + 24, 1);
    });

    test('keeps the header outside the masked scroll content', () => {
        const { panel } = panelFixture();
        expect(getComputedStyle(panel.viewport).maskImage).not.toContain('rgba(0, 0, 0, 0)');
        expect(getComputedStyle(panel.viewport).top).toBe('0px');
        expect(getComputedStyle(panel.headerSlot).position).toBe('absolute');
        expect(panel.headerSlot.contains(panel.root.querySelector('.now-playing-panel-header'))).toBe(true);
    });

    test.each([true, false])('blends scrolled content from the first pixel (Canvas: %s)', (canvas) => {
        const { panel } = panelFixture({ canvas, height: 420 });
        panel.content.scrollTop = 1;
        panel.syncScrolled();
        expect(panel.root.classList.contains('is-scrolled')).toBe(true);
        const style = getComputedStyle(panel.viewport);
        expect(style.maskImage).not.toContain('rgba(0, 0, 0, 0)');
        expect(style.top).toBe('32px');
        expect(style.backdropFilter).toBe('none');
        panel.content.scrollTop = 0;
        panel.syncScrolled();
        expect(getComputedStyle(panel.viewport).top).toBe('0px');
    });

    test.each(['.now-playing-panel-metadata', '.now-playing-panel-lyrics', '.now-playing-panel-section'])(
        'fully covers %s until it passes below the fixed header',
        (selector) => {
            const { panel } = panelFixture({ height: 420 });
            const section = document.createElement('section');
            section.className = 'now-playing-panel-section';
            section.innerHTML = '<button>Related music video</button>';
            panel.root.querySelector('.now-playing-panel-body').append(section);
            panel.content.scrollTop = 200;
            panel.syncScrolled();
            const element = panel.root.querySelector(selector);
            expect(element.closest('.now-playing-panel-scroll')).toBe(panel.content);
            const foreground = panel.root.querySelector('.now-playing-panel-top-bg');
            expect(foreground).toBeTruthy();
            const mask = getComputedStyle(foreground).maskImage;
            const opaqueStop = Number(mask.match(/rgb\(0, 0, 0\) ([\d.]+)px/)[1]);
            const coverBottom = foreground.getBoundingClientRect().top + opaqueStop;
            const headerBottom = panel.headerSlot.getBoundingClientRect().bottom;
            expect(Number(getComputedStyle(foreground).zIndex)).toBeGreaterThan(
                Number(getComputedStyle(panel.viewport).zIndex)
            );
            expect(Number(getComputedStyle(foreground).zIndex)).toBeLessThan(
                Number(getComputedStyle(panel.headerSlot).zIndex)
            );
            expect(getComputedStyle(foreground).pointerEvents).toBe('none');
            expect(coverBottom).toBeGreaterThanOrEqual(headerBottom);
        }
    );

    test('composites the glass cards inside a stationary masked viewport, outside the native scroll layer', () => {
        const { panel } = panelFixture({ height: 420 });
        const maskOwner = panel.viewport;
        expect(getComputedStyle(maskOwner).maskImage).not.toBe('none');
        expect(getComputedStyle(maskOwner).overflowY).toBe('hidden');
        expect(getComputedStyle(maskOwner).isolation).toBe('isolate');
        expect(getComputedStyle(panel.content).maskImage).toBe('none');
        expect(getComputedStyle(panel.content).overflowY).toBe('auto');
        panel.content.scrollTop = 200;
        panel.syncScrolled();
        expect(maskOwner.scrollTop).toBe(0);
        expect(maskOwner.contains(panel.root.querySelector('.now-playing-panel-lyrics-actions'))).toBe(true);
        expect(maskOwner.contains(panel.headerSlot)).toBe(false);
    });

    test('uses the cover and stops following the hidden Canvas while lyrics fill the panel', () => {
        const { panel, stage, video } = panelFixture();
        panel.canvasMedia = video;
        panel.canvasStage = stage;
        panel.canvasBackgroundSource = 'canvas';
        panel.canvasPauseBehavior = 'play';
        panel.background = { followVideo: vi.fn(), setKeepAnimating: vi.fn() };
        panel.expandedLyrics = true;
        panel.syncCanvasBackground();
        expect(panel.background.followVideo).toHaveBeenLastCalledWith(null);
        expect(panel.background.setKeepAnimating).toHaveBeenLastCalledWith(false);
        panel.expandedLyrics = false;
        panel.syncCanvasBackground();
        expect(panel.background.followVideo).toHaveBeenLastCalledWith(video);
    });

    test('keeps related content above the overflowing Canvas when the lyrics preview is collapsed', () => {
        const { panel } = panelFixture({ width: 360, height: 600 });
        panel.root.querySelector('.now-playing-panel-lyrics').classList.add('is-collapsed');
        const section = document.createElement('section');
        section.className = 'now-playing-panel-section';
        section.innerHTML = '<button style="height:100px">Related music video</button>';
        panel.root.querySelector('.now-playing-panel-body').append(section);
        const rect = section.getBoundingClientRect();
        expect(section.contains(document.elementFromPoint(rect.left + 10, rect.top + 10))).toBe(true);
    });

    test('fills the panel without a residual Canvas offset when lyrics are expanded', () => {
        const { panel } = panelFixture();
        panel.root.classList.add('is-scrolled', 'lyrics-expanded');
        const lyrics = panel.root.querySelector('.now-playing-panel-lyrics');
        expect(getComputedStyle(panel.viewport).top).toBe('0px');
        expect(getComputedStyle(panel.viewport).maskImage).toBe('none');
        expect(lyrics.getBoundingClientRect().top).toBe(panel.root.getBoundingClientRect().top);
        expect(lyrics.getBoundingClientRect().bottom).toBe(panel.root.getBoundingClientRect().bottom);
    });

    test('does not mount a poster or cover fallback for a Canvas track', () => {
        const { stage, video } = panelFixture();
        expect(stage.querySelector('img')).toBeNull();
        expect(video.getAttribute('poster')).toBeNull();
    });
});
