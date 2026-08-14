import Kawarp from '@kawarp/core';

const KAWARP_OPTIONS = {
    warpIntensity: 1,
    blurPasses: 8,
    animationSpeed: 0.1,
    saturation: 1.5,
    dithering: 0.008,
    transitionDuration: 500,
    tintIntensity: 0,
    scale: 1,
};

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
                    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
                        this.kawarp.setOptions({ animationSpeed: 0, transitionDuration: 0 });
                    }
                    this.kawarp.start();
                    this.root.classList.add('has-kawarp-background');
                    window.clearTimeout(this.transitionTimer);
                    this.transitionTimer = window.setTimeout(() => {
                        if (!this.disposed && generation === this.generation) {
                            this.kawarp?.setOptions({ transitionDuration: 1000 });
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
