import { getSpicyLyricsSetting } from '../../../spicy-lyrics-settings.js';

function setting(key, map = (value) => value) {
    const get = () => map(getSpicyLyricsSetting(key));
    return {
        get,
        listen(callback) {
            let previous = get();
            const onChange = () => {
                const value = get();
                if (value === previous) return;
                previous = value;
                callback(value);
            };
            window.addEventListener('spicy-lyrics-settings-changed', onChange);
            return () => window.removeEventListener('spicy-lyrics-settings-changed', onChange);
        },
    };
}

const enabled = (value) => value === 'true';
export const $rendererVisualStyle = setting('style');
export const $lyricsSize = setting('size', Number);
export const $smoothScrolling = setting('smoothScrolling', enabled);
export const $romanizationDisplay = setting('romanization');
export const $experiment = (key) => setting(key, enabled);
export const isExperimentEnabled = (key) => $experiment(key).get();
export const isBloomRenderer = () => $rendererVisualStyle.get() === 'bloom';
export const preHiddenDotLineMs = 500;
export const BlurMultiplier = 1.25;
export const timeOffset = 0;

export const SimpleLyricsMode_LetterEffectsStrengthConfig = {
    LongerThan: 1500,
    Longer: { Glow: 0.4, YOffset: 0.45, Scale: 1.103 },
    Shorter: { Glow: 0.285, YOffset: 0.1, Scale: 1.09 },
};
