import { getArtworkSources } from './artwork-media.js';

export const SPICY_LYRICS_PROJECT_URL = 'https://github.com/spikerko/spicy-lyrics/';

const SHADOW_STYLE_ID = 'monochrome-spicy-lyrics-theme';

const SHADOW_THEME = String.raw`
    :host([data-spicy-lyrics-view]) {
        --lyplus-lyrics-palette: #fff;
        --lyplus-text-primary: rgb(255 255 255 / 0.98);
        --lyplus-text-secondary: rgb(255 255 255 / 0.34);
        --lyplus-blur-amount: 0.105em;
        --lyplus-blur-amount-near: 0.045em;
        --lyplus-padding-line: clamp(7px, 1.1cqw, 13px);
        --lyrics-scroll-padding-top: 28%;
        --char-rise-y: -0.075em;
        color: #fff;
        font-family:
            Inter, 'SF Pro Display', 'Noto Sans', 'Noto Sans JP', 'Noto Sans KR',
            'Noto Sans Arabic', system-ui, sans-serif;
        font-weight: 760;
        letter-spacing: -0.045em;
        isolation: isolate;
    }

    :host([data-spicy-lyrics-view='fullscreen']) {
        --lyplus-font-size-base: clamp(36px, 3.2vw, 58px);
    }

    :host([data-spicy-lyrics-view='side']) {
        --lyplus-font-size-base: clamp(31px, 7cqw, 54px);
    }

    .lyrics-container {
        padding: 24% clamp(12px, 2.8cqw, 30px) 52% !important;
        background: transparent !important;
        scroll-behavior: smooth;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        mask-image: linear-gradient(180deg, transparent 0%, #000 13%, #000 84%, transparent 100%);
        -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 13%, #000 84%, transparent 100%);
        perspective: 900px;
        transform-style: preserve-3d;
    }

    .lyrics-container::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
    }

    .lyrics-line {
        padding-block: clamp(8px, 1.15cqw, 15px) !important;
        padding-inline: clamp(7px, 1cqw, 12px) !important;
        line-height: 1.12 !important;
        letter-spacing: -0.045em;
        opacity: 0.24;
        filter: blur(0.07em) saturate(0.72);
        transform: translate3d(0, 0.16em, -18px) scale(0.965);
        transform-origin: 4% 50%;
        transition:
            opacity 620ms cubic-bezier(0.16, 1, 0.3, 1),
            filter 720ms cubic-bezier(0.16, 1, 0.3, 1),
            transform 760ms cubic-bezier(0.16, 1, 0.3, 1) var(--lyrics-line-delay, 0ms) !important;
        will-change: opacity, filter, transform;
    }

    .lyrics-line.singer-right,
    .lyrics-line.rtl-text {
        transform-origin: 96% 50%;
    }

    .lyrics-line.next-active-line,
    .lyrics-line.pre-active {
        opacity: 0.62;
        filter: blur(0.018em) saturate(0.92);
        transform: translate3d(0, 0.06em, -6px) scale(0.988);
    }

    .lyrics-line.post-active-line {
        opacity: 0.19;
        filter: blur(0.09em) saturate(0.65);
        transform: translate3d(0, -0.08em, -24px) scale(0.95);
    }

    .lyrics-line.active,
    .lyrics-line.persist-highlight {
        opacity: 1;
        filter: none !important;
        transform: translate3d(0, 0, 0) scale(1);
    }

    .lyrics-line-container {
        transform: translateZ(0);
        transition:
            transform 820ms cubic-bezier(0.16, 1, 0.3, 1),
            color 500ms ease !important;
    }

    .lyrics-line.active .lyrics-line-container,
    .lyrics-line.pre-active .lyrics-line-container {
        transform: translate3d(0.035em, 0, 0) scale(1.018);
    }

    .lyrics-word,
    .lyrics-syllable,
    .lyrics-syllable span.char {
        transform-origin: 50% 82%;
        backface-visibility: hidden;
    }

    .lyrics-syllable {
        transition:
            color 560ms ease,
            background-color 560ms ease,
            transform 720ms cubic-bezier(0.16, 1, 0.3, 1),
            filter 520ms ease !important;
    }

    .lyrics-syllable span.char {
        transition:
            color 520ms ease,
            background-color 520ms ease,
            transform 680ms cubic-bezier(0.16, 1, 0.3, 1),
            filter 440ms ease !important;
    }

    .lyrics-line.active .lyrics-syllable.highlight,
    .lyrics-line.active .lyrics-syllable.pre-highlight {
        filter: drop-shadow(0 0 0.22em rgb(255 255 255 / 0.54));
        transform: translate3d(0, -0.07em, 0) scale(1.075);
    }

    .lyrics-line.active .lyrics-syllable span.char.highlight,
    .lyrics-line.active .lyrics-syllable.pre-highlight span.char {
        filter: drop-shadow(0 0 0.2em rgb(255 255 255 / 0.48));
        transform: translate3d(0, -0.075em, 0) scale(1.085);
    }

    .lyrics-line.active .lyrics-syllable.finished,
    .lyrics-line.persist-highlight .lyrics-syllable.finished {
        filter: drop-shadow(0 0 0.25em rgb(255 255 255 / 0.22));
    }

    .lyrics-line.active .lyrics-syllable.finished span.char,
    .lyrics-line.persist-highlight .lyrics-syllable.finished span.char {
        filter: drop-shadow(0 0 0.22em rgb(255 255 255 / 0.2));
    }

    .background-vocal-container {
        color: rgb(255 255 255 / 0.42) !important;
        letter-spacing: -0.025em;
    }

    .lyrics-gap .main-vocal-container {
        filter: drop-shadow(0 0 0.45em rgb(255 255 255 / 0.42));
    }

    .lyrics-line:hover {
        opacity: 0.86 !important;
        filter: blur(0) saturate(1) !important;
        transform: translate3d(0.02em, 0, 0) scale(0.995);
    }

    .lyrics-line.active:hover {
        opacity: 1 !important;
        transform: translate3d(0, 0, 0) scale(1);
    }

    .lyrics-container.user-scrolling .lyrics-line {
        opacity: 0.46 !important;
        transform: none !important;
    }

    .lyrics-container.user-scrolling .lyrics-line:hover,
    .lyrics-container.user-scrolling .lyrics-line.active {
        opacity: 1 !important;
    }

    .lyrics-footer {
        color: rgb(255 255 255 / 0.38) !important;
        letter-spacing: -0.02em;
    }

    @media (max-width: 768px) {
        :host([data-spicy-lyrics-view='fullscreen']) {
            --lyplus-font-size-base: clamp(29px, 7.6vw, 42px);
            --lyplus-padding-line: 6px;
        }

        .lyrics-container {
            padding: 20% 8px 55% !important;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .lyrics-line,
        .lyrics-line-container,
        .lyrics-syllable,
        .lyrics-syllable span.char {
            transition-duration: 1ms !important;
            animation-duration: 1ms !important;
        }
    }
`;

function getView(container) {
    return container?.id === 'fullscreen-lyrics-content' ? 'fullscreen' : 'side';
}

function getSurface(container, view) {
    if (view === 'fullscreen') return container?.closest?.('#fullscreen-cover-overlay');
    return container?.closest?.('#side-panel');
}

function escapeCssUrl(value) {
    return String(value || '')
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replace(/[\r\n\f]/g, '');
}

export function getSpicyLyricsArtworkUrl(track, api) {
    const artwork = getArtworkSources(track?.album || track?.cover || track?.image);
    return api?.getCoverUrl?.(artwork.static, '1280') || artwork.static;
}

export function applySpicyLyricsSurface(container, track, api) {
    const view = getView(container);
    const surface = getSurface(container, view);
    if (!surface) return null;

    const artworkUrl = getSpicyLyricsArtworkUrl(track, api);
    surface.classList.add('spicy-lyrics-active');
    surface.dataset.spicyLyricsView = view;
    surface.style.setProperty('--spicy-lyrics-artwork', `url("${escapeCssUrl(artworkUrl)}")`);
    return surface;
}

export function applySpicyLyricsShadowTheme(amLyrics, container) {
    if (!amLyrics) return;

    const view = getView(container);
    amLyrics.dataset.spicyLyricsView = view;
    amLyrics.setAttribute('highlight-color', '#ffffff');

    const inject = () => {
        const root = amLyrics.shadowRoot;
        if (!root) return false;

        let style = root.getElementById(SHADOW_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = SHADOW_STYLE_ID;
            root.appendChild(style);
        }
        style.textContent = SHADOW_THEME;
        return true;
    };

    if (inject()) return;

    let attempts = 0;
    const retry = () => {
        attempts += 1;
        if (inject() || attempts >= 24) return;
        requestAnimationFrame(retry);
    };
    requestAnimationFrame(retry);
}
