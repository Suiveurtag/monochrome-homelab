const atom = (initialValue) => {
    let value = initialValue;
    const subscribers = new Set();
    return {
        get: () => value,
        set: (nextValue) => {
            value = nextValue;
            subscribers.forEach((subscriber) => subscriber(value));
            return value;
        },
        subscribe: (subscriber) => {
            subscribers.add(subscriber);
            subscriber(value);
            return () => subscribers.delete(subscriber);
        },
    };
};

export const $currentLyricsType = atom('Syllable');
export const $simpleLyricsMode = atom(false);
export const $simpleLyricsModeRenderingType = atom('calculate');

export const LyricsObject = {
    Types: {
        Syllable: { Lines: [] },
        Line: { Lines: [] },
        Static: { Lines: [] },
    },
};

export const SimpleLyricsMode_LetterEffectsStrengthConfig = {
    LongerThan: 1500,
    Longer: { Glow: 0.4, YOffset: 0.45, Scale: 1.103 },
    Shorter: { Glow: 0.285, YOffset: 0.1, Scale: 1.09 },
};

export const preHiddenDotLineMs = 500;
export const BlurMultiplier = 1.25;
export const timeOffset = 0;

let onNewElementMounted = null;

// Keep the animator/virtualizer boundary used upstream. The renderer owns a
// virtualizer instance per lyrics surface and forwards its remount signal here.
export function setOnNewElementMounted(callback) {
    onNewElementMounted = callback;
}

export function notifyNewElementMounted() {
    onNewElementMounted?.();
}

export function replaceSyllableLines(lines) {
    LyricsObject.Types.Syllable.Lines = lines;
    $currentLyricsType.set('Syllable');
}
