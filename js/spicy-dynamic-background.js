import Kawarp from '@kawarp/core';

const KAWARP_OPTIONS = {
    warpIntensity: 1,
    blurPasses: 8,
    animationSpeed: 1,
    saturation: 1.5,
    dithering: 0.008,
    transitionDuration: 500,
    tintIntensity: 0,
    scale: 1,
};

const PLAYING_SPEED = 1;
const PAUSED_SPEED = 0.1;
const BEAT_THRESHOLD = 0.75;
const BEAT_SPEED = 2.4;
const BEAT_SCALE = 1.02;
const ANALYSIS_INTERVAL = 100;

function safeBackgroundUrl(source) {
    return String(source || '').replaceAll('"', '%22');
}

export class SpicyDynamicBackground {
    constructor({ root, canvas, fallback, removeOnDispose = false }) {
        this.root = root;
        this.canvas = canvas;
        this.fallback = fallback;
        this.removeOnDispose = removeOnDispose;
        this.kawarp = null;
        this.generation = 0;
        this.source = '';
        this.transitionTimer = null;
        this.disposed = false;
        this.loadQueue = Promise.resolve(false);
        this.playbackElement = null;
        this.getPlaybackElement = null;
        this.getAnalyser = null;
        this.analysisFrame = 0;
        this.lastAnalysisTime = 0;
        this.lastMotionOptions = {};
        this.timeDomainData = null;
        this.onPlay = () => this.syncMotion(true);
        this.onPause = () => this.syncMotion(true);
    }

    connectPlayback({ getElement, getAnalyser } = {}) {
        this.getPlaybackElement = typeof getElement === 'function' ? getElement : null;
        this.getAnalyser = typeof getAnalyser === 'function' ? getAnalyser : null;
        this.syncPlaybackElement();
        this.syncMotion(true);
    }

    syncPlaybackElement() {
        const nextElement = this.getPlaybackElement?.() || null;
        if (nextElement === this.playbackElement) return;
        this.playbackElement?.removeEventListener('play', this.onPlay);
        this.playbackElement?.removeEventListener('pause', this.onPause);
        this.playbackElement = nextElement;
        this.playbackElement?.addEventListener('play', this.onPlay);
        this.playbackElement?.addEventListener('pause', this.onPause);
    }

    prefersReducedMotion() {
        return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    }

    applyMotionOptions(animationSpeed, scale = 1, force = false) {
        if (!this.kawarp) return;
        const transitionDuration = this.prefersReducedMotion() ? 0 : 1000;
        const next = { animationSpeed, scale, transitionDuration };
        if (!force && Object.entries(next).every(([key, value]) => this.lastMotionOptions[key] === value)) {
            return;
        }
        this.lastMotionOptions = next;
        void this.kawarp.setOptions(next);
    }

    syncMotion(force = false) {
        this.syncPlaybackElement();
        window.cancelAnimationFrame?.(this.analysisFrame);
        this.analysisFrame = 0;
        if (!this.kawarp || this.disposed) return;

        if (this.prefersReducedMotion()) {
            this.applyMotionOptions(0, 1, force);
            return;
        }

        const paused = Boolean(this.playbackElement?.paused);
        this.applyMotionOptions(paused ? PAUSED_SPEED : PLAYING_SPEED, 1, force);
        if (!paused && this.playbackElement) this.scheduleAudioReaction();
    }

    scheduleAudioReaction() {
        if (this.analysisFrame || this.disposed || this.prefersReducedMotion()) return;
        this.analysisFrame = window.requestAnimationFrame?.((time) => {
            this.analysisFrame = 0;
            this.syncPlaybackElement();
            if (!this.kawarp || this.disposed || this.playbackElement?.paused) {
                this.syncMotion();
                return;
            }

            if (time - this.lastAnalysisTime >= ANALYSIS_INTERVAL) {
                const analyser = this.getAnalyser?.();
                if (analyser?.frequencyBinCount && typeof analyser.getByteTimeDomainData === 'function') {
                    if (this.timeDomainData?.length !== analyser.frequencyBinCount) {
                        this.timeDomainData = new Uint8Array(analyser.frequencyBinCount);
                    }
                    analyser.getByteTimeDomainData(this.timeDomainData);
                    let peak = 0;
                    for (const sample of this.timeDomainData) {
                        peak = Math.max(peak, Math.abs(sample - 128) / 128);
                        if (peak > BEAT_THRESHOLD) break;
                    }
                    const beat = peak > BEAT_THRESHOLD;
                    this.applyMotionOptions(beat ? BEAT_SPEED : PLAYING_SPEED, beat ? BEAT_SCALE : 1);
                } else {
                    this.applyMotionOptions(PLAYING_SPEED, 1);
                }
                this.lastAnalysisTime = time;
            }
            this.scheduleAudioReaction();
        });
    }

    setSource(source) {
        const nextSource = String(source || '');
        const generation = ++this.generation;
        this.source = nextSource;
        this.disposed = false;

        const safeUrl = safeBackgroundUrl(nextSource);
        this.fallback.style.backgroundImage = safeUrl ? `url("${safeUrl}")` : '';
        this.root.classList.remove('has-kawarp-background');

        if (!nextSource || /\.mp4(?:$|[?#])/i.test(nextSource)) {
            this.canvas.style.display = 'none';
            return Promise.resolve(false);
        }

        this.canvas.style.display = '';
        this.loadQueue = this.loadQueue
            .catch(() => false)
            .then(async () => {
                if (this.disposed || generation !== this.generation) return false;
                try {
                    if (!this.kawarp) this.kawarp = new Kawarp(this.canvas, KAWARP_OPTIONS);
                    await this.kawarp.loadImage(nextSource);
                    if (this.disposed || generation !== this.generation) return false;
                    this.kawarp.start();
                    this.syncMotion(true);
                    this.root.classList.add('has-kawarp-background');
                    window.clearTimeout(this.transitionTimer);
                    this.transitionTimer = window.setTimeout(() => {
                        if (!this.disposed && generation === this.generation) {
                            this.kawarp?.setOptions({ transitionDuration: this.prefersReducedMotion() ? 0 : 1000 });
                        }
                    }, 1000);
                    return true;
                } catch (error) {
                    if (!this.disposed && generation === this.generation) {
                        this.root.classList.remove('has-kawarp-background');
                        this.canvas.style.display = 'none';
                        console.warn('Spicy Lyrics dynamic background fell back to cover blur:', error);
                    }
                    return false;
                }
            });
        return this.loadQueue;
    }

    dispose() {
        this.disposed = true;
        this.generation += 1;
        window.clearTimeout(this.transitionTimer);
        this.transitionTimer = null;
        window.cancelAnimationFrame?.(this.analysisFrame);
        this.analysisFrame = 0;
        this.playbackElement?.removeEventListener('play', this.onPlay);
        this.playbackElement?.removeEventListener('pause', this.onPause);
        this.playbackElement = null;
        this.getPlaybackElement = null;
        this.getAnalyser = null;
        this.kawarp?.dispose();
        this.kawarp = null;
        this.root.classList.remove('has-kawarp-background');
        if (this.removeOnDispose) this.root.remove();
    }
}

export function mountSpicyDynamicBackground(target, { className = 'spicy-lyrics-external-bg' } = {}) {
    const existing = Array.from(target.children).find((child) => child.hasAttribute('data-spicy-background'));
    if (existing?.spicyDynamicBackground) return existing.spicyDynamicBackground;

    const root = document.createElement('div');
    root.className = className;
    root.dataset.spicyBackground = '';
    root.setAttribute('aria-hidden', 'true');
    const fallback = document.createElement('div');
    fallback.className = 'spicy-dynamic-bg-fallback';
    const canvas = document.createElement('canvas');
    canvas.className = 'spicy-dynamic-bg';
    const shade = document.createElement('div');
    shade.className = 'spicy-dynamic-bg-shade';
    root.append(fallback, canvas, shade);
    target.prepend(root);

    const controller = new SpicyDynamicBackground({ root, canvas, fallback, removeOnDispose: true });
    root.spicyDynamicBackground = controller;
    return controller;
}
