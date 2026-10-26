const CANVAS_ENABLED_KEY = 'now-playing-canvas-enabled';
const CANVAS_BACKGROUND_KEY = 'now-playing-canvas-background-source';
const CANVAS_PAUSE_KEY = 'now-playing-canvas-pause-behavior';

export const CANVAS_BACKGROUND_SOURCES = ['canvas', 'cover'];
export const CANVAS_PAUSE_BEHAVIORS = ['cover', 'pause', 'play'];

function readChoice(key, choices) {
    try {
        const value = localStorage.getItem(key);
        return choices.includes(value) ? value : choices[0];
    } catch {
        return choices[0];
    }
}

function writeChoice(key, choices, value, eventName) {
    const next = choices.includes(value) ? value : choices[0];
    try {
        localStorage.setItem(key, next);
    } catch {
        // The preference remains session-only when storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent(eventName, { detail: { value: next } }));
}

export const canvasSettings = {
    isEnabled() {
        try {
            return localStorage.getItem(CANVAS_ENABLED_KEY) !== 'false';
        } catch {
            return true;
        }
    },

    setEnabled(enabled) {
        const nextEnabled = Boolean(enabled);
        try {
            localStorage.setItem(CANVAS_ENABLED_KEY, String(nextEnabled));
        } catch {
            // The preference remains session-only when storage is unavailable.
        }
        window.dispatchEvent(
            new CustomEvent('canvas-playback-preference-changed', { detail: { enabled: nextEnabled } })
        );
    },

    /** Which artwork drives the Spicy Lyrics fluid background: 'canvas' or 'cover'. */
    getBackgroundSource() {
        return readChoice(CANVAS_BACKGROUND_KEY, CANVAS_BACKGROUND_SOURCES);
    },

    setBackgroundSource(value) {
        writeChoice(CANVAS_BACKGROUND_KEY, CANVAS_BACKGROUND_SOURCES, value, 'canvas-background-source-changed');
    },

    /** What Canvas does while music is paused: 'cover' (plain cover), 'pause' (frozen frame) or 'play'. */
    getPauseBehavior() {
        return readChoice(CANVAS_PAUSE_KEY, CANVAS_PAUSE_BEHAVIORS);
    },

    setPauseBehavior(value) {
        writeChoice(CANVAS_PAUSE_KEY, CANVAS_PAUSE_BEHAVIORS, value, 'canvas-pause-behavior-changed');
    },
};
