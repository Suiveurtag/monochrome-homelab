import Kawarp from '@kawarp/core';

const KAWARP_OPTIONS = {
    warpIntensity: 1,
    blurPasses: 8,
    animationSpeed: 0.04,
    saturation: 1.5,
    dithering: 0.008,
    transitionDuration: 1200,
    tintIntensity: 0,
    scale: 1,
};

const PLAYING_SPEED = 0.35;
const BEAT_THRESHOLD = 0.75;
const BEAT_SPEED = 0.55;
const BEAT_SCALE = 1.008;
const ANALYSIS_INTERVAL = 100;
const FALLBACK_TRANSITION_DURATION = 850;
// The Canvas video, blurred and stretched, continues below its bottom edge so the two read as one surface.
const AMBIENT_WIDTH = 64;
const AMBIENT_PAD = 24;
const AMBIENT_INTERVAL = 1000 / 30;
// Upstream NpvCanvasBackground: Canvas loops are 9:16, and smoothing eases hard cuts.
const VIDEO_OPTIONS = { sampleWidth: 72, sampleHeight: 128, smoothing: 100 };

function safeBackgroundUrl(source) {
    return String(source || '').replaceAll('"', '%22');
}

function isAnimatedSource(source) {
    return /^(?:data:video\/)|\.(?:m3u8|mp4)(?:$|[?#])/i.test(String(source || ''));
}

export class SpicyDynamicBackground {
    constructor({ root, canvas, fallback, fallbacks, removeOnDispose = false }) {
        this.root = root;
        this.canvas = canvas;
        this.fallback = fallback;
        this.fallbacks = fallbacks?.length ? fallbacks : [fallback];
        this.activeFallbackIndex = 0;
        this.fallbackSource = '';
        this.fallbackTransitionTimer = null;
        this.removeOnDispose = removeOnDispose;
        this.kawarp = null;
        this.generation = 0;
        this.source = '';
        this.loadingSource = '';
        this.transitionTimer = null;
        this.disposed = false;
        this.loadQueue = Promise.resolve(false);
        this.video = null;
        this.ambient = null;
        this.ambientFrame = 0;
        this.lastAmbientDraw = 0;
        this.playbackElement = null;
        this.getPlaybackElement = null;
        this.getAnalyser = null;
        this.analysisFrame = 0;
        this.lastAnalysisTime = 0;
        this.lastMotionOptions = {};
        this.timeDomainData = null;
        this.active = true;
        this.keepAnimating = false;
        this.onPlay = () => {
            if (this.active && this.root.classList.contains('has-kawarp-background')) this.kawarp?.start?.();
            this.syncMotion();
        };
        this.onPause = () => this.syncMotion();
        this.resizeObserver =
            typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resizeKawarp());
        this.resizeObserver?.observe(root);
    }

    resizeKawarp() {
        this.kawarp?.resize?.();
        // resize() reallocates Kawarp's output framebuffer. When playback is
        // paused the animation loop is stopped, so draw the preserved frame
        // immediately instead of briefly exposing the static cover fallback.
        if (this.kawarp && !this.kawarp.isPlaying) this.kawarp.renderFrame?.();
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
        this.syncAmbient();
        if (!this.kawarp) return;
        if (!nextActive) {
            this.kawarp.stop?.();
            return;
        }
        if (this.root.classList.contains('has-kawarp-background')) this.kawarp.start();
        this.syncMotion(true);
    }

    // Drive the fluid background from the playing Canvas video instead of the cover.
    // Only the Canvas owner detaches it: the lyrics renderer also calls setSource on this host.
    followVideo(video) {
        const nextVideo = video || null;
        if (nextVideo === this.video) return;
        const wasFollowing = this.video && this.root.classList.contains('has-kawarp-background');
        this.video = nextVideo;
        this.syncAmbient();
        if (!this.kawarp || this.disposed) return;
        if (nextVideo) {
            this.loadVideo();
        } else if (wasFollowing) {
            this.kawarp.unloadVideo();
            // The last video frame stays until something replaces it.
            const generation = this.generation;
            void this.kawarp
                .loadImage(this.source)
                .then(() => {
                    if (!this.disposed && generation === this.generation && !this.kawarp.isPlaying) {
                        this.kawarp.renderFrame?.();
                    }
                })
                .catch(() => {});
        }
    }

    loadVideo() {
        const video = this.video;
        if (!video || !this.kawarp || !this.root.classList.contains('has-kawarp-background')) return;
        try {
            this.kawarp.loadVideo(video, {
                ...VIDEO_OPTIONS,
                // Cross-origin or undecodable frames: Kawarp has already unloaded the video.
                onError: () => {
                    if (this.video === video) this.followVideo(null);
                },
            });
        } catch (error) {
            console.warn('Spicy Lyrics Canvas background fell back to cover:', error);
            this.followVideo(null);
        }
    }

    syncAmbient() {
        window.cancelAnimationFrame?.(this.ambientFrame);
        this.ambientFrame = 0;
        const following = Boolean(this.video) && !this.disposed;
        this.root.classList.toggle('is-following-video', following);
        if (!following || !this.active || this.prefersReducedMotion()) return;
        if (!this.ambient) {
            const canvas = document.createElement('canvas');
            canvas.className = 'spicy-dynamic-bg-ambient';
            this.root.querySelector('.spicy-dynamic-bg-shade')?.before(canvas);
            if (!canvas.isConnected) this.root.append(canvas);
            this.ambient = { canvas, ctx: canvas.getContext('2d', { alpha: false }) };
        }
        const tick = (time) => {
            this.ambientFrame = 0;
            if (!this.video || this.disposed || !this.active) return;
            if (time - this.lastAmbientDraw >= AMBIENT_INTERVAL && !document.hidden) {
                this.lastAmbientDraw = time;
                this.paintAmbient();
            }
            this.ambientFrame = window.requestAnimationFrame(tick);
        };
        this.ambientFrame = window.requestAnimationFrame(tick);
    }

    paintAmbient() {
        const { video } = this;
        const ctx = this.ambient?.ctx;
        if (!ctx || !video || video.readyState < 2 || !video.videoWidth) return;
        const root = this.root.getBoundingClientRect();
        const box = video.getBoundingClientRect();
        if (!root.width || !root.height || !box.width || !box.height) return;
        const { canvas } = this.ambient;
        const k = AMBIENT_WIDTH / (root.width + AMBIENT_PAD * 2);
        const width = AMBIENT_WIDTH;
        const height = Math.max(1, Math.round((root.height + AMBIENT_PAD * 2) * k));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        // object-fit: cover, centered: the part of the video that is actually on screen.
        const scale = Math.max(box.width / video.videoWidth, box.height / video.videoHeight);
        const sw = box.width / scale;
        const sh = box.height / scale;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;
        const strip = Math.max(1, sh * 0.02);
        const top = (box.top - root.top + AMBIENT_PAD) * k;
        const bottom = top + box.height * k;
        ctx.drawImage(video, sx, sy, sw, sh, 0, top, width, bottom - top);
        if (bottom < height) ctx.drawImage(video, sx, sy + sh - strip, sw, strip, 0, bottom, width, height - bottom);
        if (top > 0) ctx.drawImage(video, sx, sy, sw, strip, 0, 0, width, top);
        canvas.style.setProperty('--ambient-from', `${box.bottom - root.top + AMBIENT_PAD}px`);
    }

    setFallbackSource(source) {
        const nextSource = String(source || '');
        if (nextSource === this.fallbackSource) return;
        this.fallbackSource = nextSource;
        const safeUrl = safeBackgroundUrl(nextSource);
        const current = this.fallbacks[this.activeFallbackIndex];

        if (this.fallbacks.length < 2 || !current?.style.backgroundImage) {
            const fallback = current || this.fallbacks[0];
            fallback.style.backgroundImage = safeUrl ? `url("${safeUrl}")` : '';
            fallback.classList.add('is-visible');
            this.fallback = fallback;
            return;
        }

        const nextIndex = (this.activeFallbackIndex + 1) % this.fallbacks.length;
        const incoming = this.fallbacks[nextIndex];
        incoming.style.backgroundImage = safeUrl ? `url("${safeUrl}")` : '';
        incoming.classList.add('is-visible');
        current.classList.remove('is-visible');
        this.activeFallbackIndex = nextIndex;
        this.fallback = incoming;

        window.clearTimeout(this.fallbackTransitionTimer);
        this.fallbackTransitionTimer = window.setTimeout(() => {
            if (current !== this.fallback) current.style.backgroundImage = '';
        }, FALLBACK_TRANSITION_DURATION + 50);
    }

    setSource(source) {
        const nextSource = String(source || '');
        if (!this.disposed && nextSource === this.source) {
            if (this.root.classList.contains('has-kawarp-background')) return Promise.resolve(true);
            if (this.loadingSource === nextSource) return this.loadQueue;
        }
        const generation = ++this.generation;
        this.source = nextSource;
        this.disposed = false;

        this.setFallbackSource(isAnimatedSource(nextSource) ? '' : nextSource);

        if (!nextSource || isAnimatedSource(nextSource)) {
            this.loadingSource = '';
            this.root.classList.remove('has-kawarp-background');
            this.canvas.style.display = 'none';
            return Promise.resolve(false);
        }

        this.loadingSource = nextSource;
        this.root.classList.remove('has-kawarp-background');
        this.canvas.style.display = '';
        this.loadQueue = this.loadQueue
            .catch(() => false)
            .then(async () => {
                if (this.disposed || generation !== this.generation) return false;
                try {
                    if (!this.kawarp) this.kawarp = new Kawarp(this.canvas, KAWARP_OPTIONS);
                    await this.kawarp.loadImage(nextSource);
                    if (this.disposed || generation !== this.generation) return false;
                    if (this.active) this.kawarp.start();
                    else this.kawarp.renderFrame?.();
                    this.syncMotion(true);
                    this.root.classList.add('has-kawarp-background');
                    this.loadVideo();
                    this.loadingSource = '';
                    window.clearTimeout(this.transitionTimer);
                    this.transitionTimer = window.setTimeout(() => {
                        if (!this.disposed && generation === this.generation) {
                            this.kawarp?.setOptions({ transitionDuration: this.prefersReducedMotion() ? 0 : 1000 });
                        }
                    }, 1000);
                    return true;
                } catch (error) {
                    if (!this.disposed && generation === this.generation) {
                        this.loadingSource = '';
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
        this.loadingSource = '';
        window.clearTimeout(this.transitionTimer);
        this.transitionTimer = null;
        window.clearTimeout(this.fallbackTransitionTimer);
        this.fallbackTransitionTimer = null;
        window.cancelAnimationFrame?.(this.analysisFrame);
        this.analysisFrame = 0;
        window.cancelAnimationFrame?.(this.ambientFrame);
        this.ambientFrame = 0;
        this.ambient?.canvas.remove();
        this.ambient = null;
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
    fallback.className = 'spicy-dynamic-bg-fallback is-visible';
    const alternateFallback = document.createElement('div');
    alternateFallback.className = 'spicy-dynamic-bg-fallback';
    const canvas = document.createElement('canvas');
    canvas.className = 'spicy-dynamic-bg';
    const shade = document.createElement('div');
    shade.className = 'spicy-dynamic-bg-shade';
    root.append(fallback, alternateFallback, canvas, shade);
    target.prepend(root);

    const controller = new SpicyDynamicBackground({
        root,
        canvas,
        fallback,
        fallbacks: [fallback, alternateFallback],
        removeOnDispose: true,
    });
    root.spicyDynamicBackground = controller;
    return controller;
}
