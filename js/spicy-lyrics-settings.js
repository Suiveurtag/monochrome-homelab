const defaults = {
    font: 'spicy',
    size: '100',
    style: 'spring',
    joinWords: 'off',
    keepSyllablePace: 'false',
    romanization: 'underLine',
    romajiAsWritten: 'true',
    credits: 'off',
    fadePrevious: 'true',
    smoothScrolling: 'false',
    springLineSpacing: 'true',
    backgroundLinePop: 'true',
    keepOverlappingLines: 'false',
    largerCinemaLyrics: 'false',
    seekCompensation: 'true',
    scrollToActive: 'true',
    staticScroll: 'off',
    showQueueWithoutLyrics: 'false',
    upNext: 'true',
    motionArtwork: 'true',
    canvasPreference: 'motion',
    motionOnStage: 'true',
    reactiveBackground: 'true',
    portraitFullscreen: 'true',
    playerBelowCover: 'false',
    groupedControls: 'true',
    releaseYear: 'off',
    reviewer: 'false',
    offset: '0',
};

const choices = {
    font: ['spicy', 'system'],
    style: ['spring', 'bloom'],
    joinWords: ['off', 'all', 'steady', 'held'],
    romanization: ['off', 'underLine', 'replace'],
    credits: ['off', 'source', 'full'],
    staticScroll: ['off', 'basic', 'advanced'],
    canvasPreference: ['motion', 'canvas'],
    releaseYear: ['off', 'before', 'after'],
};

export const SPICY_LYRICS_VERSION = '6.5.10';

const reviewerSettings = {
    style: 'spring',
    font: 'spicy',
    joinWords: 'off',
    romanization: 'off',
    seekCompensation: 'false',
    upNext: 'false',
    reactiveBackground: 'false',
    smoothScrolling: 'false',
    fadePrevious: 'false',
    backgroundLinePop: 'false',
    keepOverlappingLines: 'false',
    staticScroll: 'off',
    offset: '0',
};

export function normalizeSpicyLyricsOffset(value) {
    return Math.round(Math.min(10000, Math.max(-10000, Number(value) || 0)));
}

function valid(key, value) {
    if (value === null || !Object.hasOwn(defaults, key)) return false;
    if (key === 'size') return /^\d+$/.test(value) && Number(value) >= 60 && Number(value) <= 200;
    if (key === 'offset') return /^-?\d+$/.test(value) && Number(value) === normalizeSpicyLyricsOffset(value);
    return (choices[key] ?? ['true', 'false']).includes(value);
}

export function getSpicyLyricsSetting(key, { saved = false } = {}) {
    if (!saved && Object.hasOwn(reviewerSettings, key) && getSpicyLyricsSetting('reviewer') === 'true') {
        return reviewerSettings[key];
    }
    const value = localStorage.getItem(`spicyLyrics.${key}`);
    if (valid(key, value)) return value;
    if (key === 'style' && localStorage.getItem('spicyLyrics.simple') === 'true') return 'bloom';
    if (key === 'romanization' && localStorage.getItem('lyricsRomajiMode') === 'true') return 'replace';
    return defaults[key];
}

export function setSpicyLyricsSetting(key, value) {
    if (!valid(key, value)) return;
    localStorage.setItem(`spicyLyrics.${key}`, value);
    window.dispatchEvent(new CustomEvent('spicy-lyrics-settings-changed', { detail: { key } }));
}
