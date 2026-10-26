import Kawarp from '@kawarp/core';

const KAWARP_OPTIONS = {
    warpIntensity: 1,
    blurPasses: 8,
    animationSpeed: 0.04,
    saturation: 1.5,
    dithering: 0.008,
    transitionDuration: 0,
    tintIntensity: 0,
    scale: 1,
};

const PLAYING_SPEED = 0.35;
const BEAT_THRESHOLD = 0.75;
const BEAT_SPEED = 0.55;
const BEAT_SCALE = 1.008;
const ANALYSIS_INTERVAL = 100;
// Upstream NpvCanvasBackground: Canvas loops are 9:16, and smoothing eases hard cuts.
const VIDEO_OPTIONS = { sampleWidth: 72, sampleHeight: 128, smoothing: 100 };

function isAnimatedSource(source) {
    return /^(?:data:video\/)|\.(?:m3u8|mp4)(?:$|[?#])/i.test(String(source || ''));
}

export class SpicyDynamicBackground {
    constructor({ root, canvas, foreground = null, removeOnDispose = false }) {
        this.root = root;
        this.canvas = canvas;
        this.foreground = foreground;
        this.foregroundContext = foreground?.getContext('2d');
        this.foregroundFrame = 0;
        this.foregroundActive = false;
        this.foregroundUntil = 0;
        this.deferToVideo = false;
        this.failedVideo = null;
        this.removeOnDispose = removeOnDispose;
        this.kawarp = null;
        this.generation = 0;
        this.source = '';
        this.loadingSource = '';
        this.disposed = false;
        this.loadQueue = Promise.resolve(false);
        this.video = null;
        this.playbackElement = null;
        this.getPlaybackElement = null;
        this.getAnalyser = null;
        this.analysisFrame = 0;
        this.lastAnalysisTime = 0;
        this.lastMotionOptions = {};
        this.timeDomainData = null;
        this.active = true;
        this.keepAnimating = false;
        this.resizeTimer = null;
        this.onPlay = () => {
            if (this.active && this.root.classList.contains('has-kawarp-background')) this.kawarp?.start?.();
            this.syncMotion();
        };
        this.onPause = () => this.syncMotion();
        this.resizeObserver =
            typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.scheduleResize());
        this.resizeObserver?.observe(root);
    }

    ensureKawarp() {
        if (!this.kawarp) {
            this.kawarp = new Kawarp(this.canvas, KAWARP_OPTIONS);
            this.resizeKawarp();
        }
        return this.kawarp;
    }

    scheduleResize() {
        if (!this.kawarp || this.disposed) return;
        window.clearTimeout(this.resizeTimer);
        // CSS stretches the live frame during a drag; avoid reallocating GPU buffers at every pixel.
        this.resizeTimer = window.setTimeout(() => {
            this.resizeTimer = null;
            this.resizeKawarp();
        }, 120);
        this.copyForeground();
    }

    resizeKawarp() {
        if (!this.kawarp || this.disposed) return;
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(this.root.clientWidth * ratio));
        const height = Math.max(1, Math.round(this.root.clientHeight * ratio));
        if (this.canvas.width === width && this.canvas.height === height) return;
        if (this.canvas.width !== width) this.canvas.width = width;
        if (this.canvas.height !== height) this.canvas.height = height;
        this.kawarp.resize?.();
        // Changing either canvas dimension clears it, even while its animation loop is running.
        this.kawarp.renderFrame?.();
        this.copyForeground();
    }

    // Mirror the actual WebGL frame above the content, without a second renderer or source.
    copyForeground() {
        if (
            !this.foregroundContext ||
            this.disposed ||
            (!this.foregroundActive && performance.now() > this.foregroundUntil) ||
            !this.root.classList.contains('has-kawarp-background')
        )
            return;
        const height = Math.max(
            1,
            Math.round((this.canvas.height * this.foreground.clientHeight) / Math.max(1, this.root.clientHeight))
        );
        if (this.foreground.width !== this.canvas.width) this.foreground.width = this.canvas.width;
        if (this.foreground.height !== height) this.foreground.height = height;
        this.foregroundContext.clearRect(0, 0, this.foreground.width, height);
        this.foregroundContext.drawImage(this.canvas, 0, 0, this.canvas.width, height, 0, 0, this.canvas.width, height);
    }

    setForegroundActive(active) {
        if (!this.foreground || active === this.foregroundActive) return;
        this.foregroundActive = active;
        this.foregroundUntil = active ? Infinity : performance.now() + 500;
        this.copyForeground();
        this.scheduleForeground();
    }

    scheduleForeground() {
        if (
            this.foregroundFrame ||
            !this.foreground ||
            this.disposed ||
            !this.active ||
            !this.kawarp?.isPlaying ||
            performance.now() > this.foregroundUntil
        )
            return;
        this.foregroundFrame = window.requestAnimationFrame(() => {
            this.foregroundFrame = 0;
            this.copyForeground();
            this.scheduleForeground();
        });
    }

    showFrame() {
        this.canvas.style.display = '';
        this.kawarp.renderFrame?.();
        this.root.classList.add('has-kawarp-background');
        if (this.active) this.kawarp.start();
        this.syncMotion(true);
        this.kawarp.setOptions({ transitionDuration: this.prefersReducedMotion() ? 0 : 1000 });
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
        const reducedMotion = this.prefersReducedMotion();
        const next = reducedMotion ? { animationSpeed, scale, transitionDuration: 0 } : { animationSpeed, scale };
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
        window.cancelAnimationFrame?.(this.foregroundFrame);
        this.foregroundFrame = 0;
        this.copyForeground();
        if (!this.kawarp || this.disposed || !this.active) return;

        if (this.prefersReducedMotion()) {
            this.applyMotionOptions(0, 1, force);
            this.kawarp.stop?.();
            return;
        }

        const paused = Boolean(this.playbackElement?.paused) && !this.keepAnimating;
        if (paused) {
            // Keep the exact current frame. Reconfiguring Kawarp here restarts its
            // transition and makes the entire panel appear to refresh on pause.
            this.kawarp.stop?.();
            return;
        }

        this.applyMotionOptions(PLAYING_SPEED, 1, force);
        if (this.keepAnimating && this.root.classList.contains('has-kawarp-background')) this.kawarp.start?.();
        this.scheduleForeground();
        if (this.playbackElement && !this.playbackElement.paused) this.scheduleAudioReaction();
    }

    // Lets the background keep moving while the music is paused (Canvas set to keep playing).
    setKeepAnimating(keep) {
        const next = Boolean(keep);
        if (next === this.keepAnimating) return;
        this.keepAnimating = next;
        this.syncMotion(true);
    }

    scheduleAudioReaction() {
        if (this.analysisFrame || this.disposed || !this.active || this.prefersReducedMotion()) return;
        this.analysisFrame = window.requestAnimationFrame?.((time) => {
            this.analysisFrame = 0;
            this.syncPlaybackElement();
            if (!this.kawarp || this.disposed || !this.active || this.playbackElement?.paused) {
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

    setActive(active) {
        const nextActive = Boolean(active);
        if (nextActive === this.active) return;
        this.active = nextActive;
        window.cancelAnimationFrame?.(this.analysisFrame);
        this.analysisFrame = 0;
        if (!this.kawarp) return;
        if (!nextActive) {
            window.cancelAnimationFrame?.(this.foregroundFrame);
            this.foregroundFrame = 0;
            this.kawarp.stop?.();
            return;
        }
        if (this.root.classList.contains('has-kawarp-background')) this.kawarp.start();
        this.syncMotion(true);
    }

    // The Canvas owner controls the source; the shared lyrics renderer only supplies its cover URL.
    followVideo(video) {
        const nextVideo = video || null;
        if (nextVideo === this.video) return;
        const wasFollowing = Boolean(this.video);
        this.video = nextVideo;
        if (this.disposed) return;
        if (nextVideo) {
            this.loadVideo();
        } else if (wasFollowing && this.kawarp) {
            this.kawarp.unloadVideo();
            if (this.deferToVideo || !this.source) {
                this.root.classList.remove('has-kawarp-background');
                return;
            }
            if (this.loadingSource) return;
            const generation = this.generation;
            void this.kawarp
                .loadImage(this.source)
                .then(() => {
                    if (!this.disposed && generation === this.generation && !this.video) this.showFrame();
                })
                .catch((error) => console.warn('Spicy Lyrics cover background could not load:', error));
        }
    }

    loadVideo() {
        const video = this.video;
        if (!video || video === this.failedVideo || this.disposed) return;
        const onError = (error) => {
            if (this.video !== video) return;
            this.failedVideo = video;
            this.root.classList.remove('has-kawarp-background');
            console.warn('Spicy Lyrics Canvas background could not read the video:', error);
        };
        try {
            this.ensureKawarp().loadVideo(video, { ...VIDEO_OPTIONS, onError });
            if (video.readyState >= 2 && this.failedVideo !== video) this.showFrame();
        } catch (error) {
            onError(error);
        }
    }

    setSource(source, { deferToVideo = this.deferToVideo } = {}) {
        const nextSource = String(source || '');
        const modeChanged = deferToVideo !== this.deferToVideo;
        this.deferToVideo = deferToVideo;
        if (!modeChanged && !this.disposed && nextSource === this.source) {
            if (this.root.classList.contains('has-kawarp-background')) return Promise.resolve(true);
            if (this.loadingSource === nextSource) return this.loadQueue;
        }
        const generation = ++this.generation;
        this.source = nextSource;
        this.disposed = false;
        // When Canvas supplies the background, its first decoded frame initializes Kawarp directly.
        if (deferToVideo) {
            this.loadingSource = '';
            return Promise.resolve(false);
        }
        if (!nextSource || isAnimatedSource(nextSource)) {
            this.loadingSource = '';
            this.root.classList.remove('has-kawarp-background');
            this.canvas.style.display = 'none';
            return Promise.resolve(false);
        }
        this.loadingSource = nextSource;
        this.loadQueue = this.loadQueue
            .catch(() => false)
            .then(async () => {
                if (this.disposed || generation !== this.generation) return false;
                try {
                    await this.ensureKawarp().loadImage(nextSource);
                    if (this.disposed || generation !== this.generation) return false;
                    this.showFrame();
                    this.loadVideo();
                    this.loadingSource = '';
                    return true;
                } catch (error) {
                    if (!this.disposed && generation === this.generation) {
                        this.loadingSource = '';
                        this.root.classList.remove('has-kawarp-background');
                        console.warn('Spicy Lyrics dynamic background could not load:', error);
                    }
                    return false;
                }
            });
        return this.loadQueue;
    }

    dispose() {
        this.disposed = true;
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = null;
        this.generation += 1;
        this.loadingSource = '';
        window.cancelAnimationFrame?.(this.analysisFrame);
        this.analysisFrame = 0;
        window.cancelAnimationFrame?.(this.foregroundFrame);
        this.foregroundFrame = 0;
        this.playbackElement?.removeEventListener('play', this.onPlay);
        this.playbackElement?.removeEventListener('pause', this.onPause);
        this.playbackElement = null;
        this.getPlaybackElement = null;
        this.getAnalyser = null;
        this.video = null;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.kawarp?.dispose();
        this.kawarp = null;
        this.root.classList.remove('has-kawarp-background');
        if (this.removeOnDispose) {
            this.root.remove();
            this.foreground?.remove();
        }
    }
}

export function mountSpicyDynamicBackground(
    target,
    { className = 'spicy-lyrics-external-bg', foregroundClassName } = {}
) {
    const existing = Array.from(target.children).find((child) => child.hasAttribute('data-spicy-background'));
    if (existing?.spicyDynamicBackground) return existing.spicyDynamicBackground;

    const root = document.createElement('div');
    root.className = className;
    root.dataset.spicyBackground = '';
    root.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    canvas.className = 'spicy-dynamic-bg';
    const shade = document.createElement('div');
    shade.className = 'spicy-dynamic-bg-shade';
    root.append(canvas, shade);
    target.prepend(root);

    const foreground = foregroundClassName ? document.createElement('canvas') : null;
    if (foreground) {
        foreground.className = foregroundClassName;
        foreground.setAttribute('aria-hidden', 'true');
        target.append(foreground);
    }
    const controller = new SpicyDynamicBackground({
        root,
        canvas,
        foreground,
        removeOnDispose: true,
    });
    root.spicyDynamicBackground = controller;
    return controller;
}
