const CANVAS_ENABLED_KEY = 'now-playing-canvas-enabled';

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
};
