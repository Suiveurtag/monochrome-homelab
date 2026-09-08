const SELECTOR = {
    overlay: '#album-cover-inspector',
    stage: '.album-cover-inspector-stage',
    arrival: '.album-cover-inspector-arrival',
    card: '.album-cover-inspector-card',
    mediaHost: '.album-cover-inspector-media-host',
    glare: '.album-cover-inspector-light',
    close: '.album-cover-inspector-close',
    download: '.album-cover-inspector-download',
    title: '#album-cover-inspector-title',
    artist: '#album-cover-inspector-artist',
};

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MIME_EXTENSION = {
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
};

const safeDownloadName = (title) =>
    String(title || 'album')
        .normalize('NFKD')
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim() || 'album';

export class AlbumCoverInspector {
    constructor(root = document) {
        this.root = root;
        this.overlay = root.querySelector(SELECTOR.overlay);
        this.stage = this.overlay?.querySelector(SELECTOR.stage);
        this.arrival = this.overlay?.querySelector(SELECTOR.arrival);
        this.card = this.overlay?.querySelector(SELECTOR.card);
        this.interactionSurface = this.card;
        this.mediaHost = this.overlay?.querySelector(SELECTOR.mediaHost);
        this.glare = this.overlay?.querySelector(SELECTOR.glare);
        this.closeButton = this.overlay?.querySelector(SELECTOR.close);
        this.downloadButton = this.overlay?.querySelector(SELECTOR.download);
        this.title = this.overlay?.querySelector(SELECTOR.title);
        this.artist = this.overlay?.querySelector(SELECTOR.artist);
        this.source = null;
        this.sourceParent = null;
        this.sourceNextSibling = null;
        this.trigger = null;
        this.previousBodyOverflow = '';
        this.springFrame = null;
        this.springLastTime = 0;
        this.springState = { rotateX: 0, rotateY: 0, glareX: 50, glareY: 50, opacity: 0 };
        this.springVelocity = { rotateX: 0, rotateY: 0, glareX: 0, glareY: 0, opacity: 0 };
        this.springTarget = { rotateX: 0, rotateY: 0, glareX: 50, glareY: 50, opacity: 0 };
        this.resetTimer = null;
        this.downloadResetTimer = null;
        this.downloadSource = null;
        this.downloadTitle = 'album';

        if (!this.overlay || !this.stage || !this.card || !this.mediaHost || !this.closeButton) return;

        this.onKeydown = (event) => this.handleKeydown(event);
        this.onMouseMove = (event) => this.updateTilt(event);
        this.onMouseLeave = () => this.resetTilt();

        this.closeButton.addEventListener('click', () => void this.close());
        this.downloadButton?.addEventListener('click', () => void this.download());
        this.overlay.addEventListener('click', (event) => {
            if (event.target === this.overlay || event.target === this.stage) void this.close();
        });
        this.interactionSurface.addEventListener('mousemove', this.onMouseMove);
        this.interactionSurface.addEventListener('mouseleave', this.onMouseLeave);
    }

    get isOpen() {
        return Boolean(this.overlay && !this.overlay.hidden);
    }

    async open({ media, trigger, title = 'Album cover', artist = '', downloadSource = null } = {}) {
        if (!this.overlay || !this.card || !this.mediaHost || !media || this.isOpen) return false;

        this.source = media;
        this.sourceParent = media.parentNode;
        this.sourceNextSibling = media.nextSibling;
        this.trigger = trigger || this.sourceParent;
        this.downloadSource = downloadSource || media.currentSrc || media.src || null;
        this.downloadTitle = safeDownloadName(title);
        const sourceRect = media.getBoundingClientRect();

        this.title.textContent = title;
        this.artist.textContent = artist;
        this.artist.hidden = !artist;
        if (this.downloadButton) {
            this.downloadButton.disabled = !this.downloadSource;
            this.downloadButton.classList.remove('is-loading', 'is-complete', 'is-error');
            this.downloadButton.setAttribute('aria-label', 'Download album cover');
            this.downloadButton.title = 'Download cover';
        }
        this.mediaHost.appendChild(media);
        media.classList.add('album-cover-inspector-media');

        this.previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        this.overlay.hidden = false;
        this.overlay.classList.add('is-open');
        this.card.classList.add('is-entering');
        this.resetTilt(false);
        document.addEventListener('keydown', this.onKeydown);

        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        this.closeButton.focus({ preventScroll: true });

        if (!reduceMotion() && this.arrival && sourceRect.width > 0) {
            const targetRect = this.arrival.getBoundingClientRect();
            const scale = Math.max(0.08, Math.min(1, sourceRect.width / targetRect.width));
            const sourceX = sourceRect.left + sourceRect.width / 2;
            const sourceY = sourceRect.top + sourceRect.height / 2;
            const targetX = targetRect.left + targetRect.width / 2;
            const targetY = targetRect.top + targetRect.height / 2;
            await this.arrival
                .animate(
                    [
                        {
                            transform: `translate3d(${sourceX - targetX}px, ${sourceY - targetY}px, 0) scale(${scale})`,
                            borderRadius: '12px',
                        },
                        { transform: 'translate3d(0, 0, 0) scale(1)', borderRadius: '0px' },
                    ],
                    { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
                )
                .finished.catch(() => {});
        }

        this.card.classList.remove('is-entering');
        return true;
    }

    async close() {
        if (!this.isOpen) return false;

        this.resetTilt(false);
        const triggerRect = this.trigger?.isConnected ? this.trigger.getBoundingClientRect() : null;

        if (!reduceMotion() && this.arrival && triggerRect?.width > 0) {
            const sourceRect = this.arrival.getBoundingClientRect();
            const scale = Math.max(0.08, Math.min(1, triggerRect.width / sourceRect.width));
            const sourceX = sourceRect.left + sourceRect.width / 2;
            const sourceY = sourceRect.top + sourceRect.height / 2;
            const targetX = triggerRect.left + triggerRect.width / 2;
            const targetY = triggerRect.top + triggerRect.height / 2;
            this.overlay.classList.add('is-closing');
            await this.arrival
                .animate(
                    [
                        { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
                        {
                            transform: `translate3d(${targetX - sourceX}px, ${targetY - sourceY}px, 0) scale(${scale})`,
                            opacity: 0.4,
                        },
                    ],
                    { duration: 240, easing: 'cubic-bezier(0.4, 0, 1, 1)' }
                )
                .finished.catch(() => {});
        }

        this.restoreMedia();
        this.overlay.hidden = true;
        this.overlay.classList.remove('is-open', 'is-closing');
        document.body.style.overflow = this.previousBodyOverflow;
        document.removeEventListener('keydown', this.onKeydown);
        this.trigger?.focus?.({ preventScroll: true });
        this.trigger = null;
        this.downloadSource = null;
        return true;
    }

    restoreMedia() {
        if (!this.source || !this.sourceParent) return;
        this.source.classList.remove('album-cover-inspector-media');
        if (this.sourceNextSibling?.parentNode === this.sourceParent) {
            this.sourceParent.insertBefore(this.source, this.sourceNextSibling);
        } else {
            this.sourceParent.appendChild(this.source);
        }
        this.source = null;
        this.sourceParent = null;
        this.sourceNextSibling = null;
    }

    handleKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            void this.close();
            return;
        }
        if (event.key === 'Tab') {
            event.preventDefault();
            const focusable = [...this.overlay.querySelectorAll('button:not(:disabled)')];
            const currentIndex = focusable.indexOf(document.activeElement);
            const direction = event.shiftKey ? -1 : 1;
            const nextIndex = (currentIndex + direction + focusable.length) % focusable.length;
            focusable[nextIndex]?.focus();
        }
    }

    async download() {
        if (!this.downloadSource || !this.downloadButton || this.downloadButton.disabled) return false;

        window.clearTimeout(this.downloadResetTimer);
        this.downloadButton.disabled = true;
        this.downloadButton.classList.remove('is-complete', 'is-error');
        this.downloadButton.classList.add('is-loading');
        this.downloadButton.setAttribute('aria-label', 'Downloading album cover');

        try {
            const blob =
                typeof this.downloadSource === 'function'
                    ? await this.downloadSource()
                    : await fetch(this.downloadSource).then((response) => {
                          if (!response.ok) throw new Error(`Cover download failed (${response.status})`);
                          return response.blob();
                      });
            if (!(blob instanceof Blob)) throw new Error('Album cover is unavailable');

            const extension = MIME_EXTENSION[blob.type] || 'jpg';
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = `${this.downloadTitle}-cover.${extension}`;
            anchor.hidden = true;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

            this.downloadButton.classList.remove('is-loading');
            this.downloadButton.classList.add('is-complete');
            this.downloadButton.setAttribute('aria-label', 'Album cover downloaded');
            this.downloadButton.title = 'Downloaded';
            this.downloadResetTimer = window.setTimeout(() => this.resetDownloadButton(), 1600);
            return true;
        } catch (error) {
            console.error('Failed to download album cover:', error);
            this.downloadButton.classList.remove('is-loading');
            this.downloadButton.classList.add('is-error');
            this.downloadButton.setAttribute('aria-label', 'Could not download album cover');
            this.downloadButton.title = 'Download failed — try again';
            this.downloadResetTimer = window.setTimeout(() => this.resetDownloadButton(), 2200);
            return false;
        }
    }

    resetDownloadButton() {
        if (!this.downloadButton) return;
        this.downloadButton.disabled = !this.downloadSource;
        this.downloadButton.classList.remove('is-loading', 'is-complete', 'is-error');
        this.downloadButton.setAttribute('aria-label', 'Download album cover');
        this.downloadButton.title = 'Download cover';
    }

    updateTilt(event) {
        if (reduceMotion()) return;
        window.clearTimeout(this.resetTimer);
        const rect = this.interactionSurface.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        const edgeDistance = Math.min(x, 1 - x, y, 1 - y);
        const edgeFactor = Math.min(1, Math.max(0, edgeDistance / 0.15));

        this.springTarget.rotateX = (0.5 - y) * 12 * 2 * edgeFactor;
        this.springTarget.rotateY = (x - 0.5) * 12 * 2 * edgeFactor;
        this.springTarget.glareX = (1 - x) * 100;
        this.springTarget.glareY = (1 - y) * 100;
        this.springTarget.opacity = edgeFactor;
        this.startSpring();
    }

    startSpring() {
        if (this.springFrame !== null) return;
        const step = (timestamp = performance.now()) => {
            const { springState: state, springTarget: target, springVelocity: velocity } = this;
            const dt = this.springLastTime ? Math.min(0.032, Math.max(0.001, (timestamp - this.springLastTime) / 1000)) : 1 / 60;
            this.springLastTime = timestamp;
            Object.keys(state).forEach((key) => {
                velocity[key] += (200 * (target[key] - state[key])) * dt;
                velocity[key] *= Math.exp(-30 * dt);
                state[key] += velocity[key] * dt;
            });
            this.applyTilt(state);

            const settled = Object.keys(state).every((key) =>
                Math.abs(target[key] - state[key]) < 0.01 && Math.abs(velocity[key]) < 0.01
            );
            if (settled) {
                Object.assign(state, target);
                Object.keys(velocity).forEach((key) => { velocity[key] = 0; });
                this.applyTilt(state);
                this.springFrame = null;
                this.springLastTime = 0;
                return;
            }
            this.springFrame = -1;
            const frame = requestAnimationFrame(step);
            if (this.springFrame === -1) this.springFrame = frame;
        };
        this.springFrame = -1;
        const frame = requestAnimationFrame(step);
        if (this.springFrame === -1) this.springFrame = frame;
    }

    applyTilt(state) {
        this.card.style.transform =
            `perspective(1000px) rotateX(${state.rotateX.toFixed(3)}deg) rotateY(${state.rotateY.toFixed(3)}deg)`;
        if (this.glare) {
            this.glare.style.background =
                `radial-gradient(circle at ${state.glareX.toFixed(2)}% ${state.glareY.toFixed(2)}%, ` +
                'rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.12) 10%, ' +
                'rgba(255, 255, 255, 0.08) 20%, rgba(255, 255, 255, 0.04) 35%, ' +
                'rgba(255, 255, 255, 0.02) 50%, rgba(255, 255, 255, 0.005) 65%, transparent 80%)';
            this.glare.style.opacity = state.opacity.toFixed(4);
        }
    }

    resetTilt(animate = true) {
        cancelAnimationFrame(this.springFrame);
        this.springFrame = null;
        this.springLastTime = 0;
        this.springState = { rotateX: 0, rotateY: 0, glareX: 50, glareY: 50, opacity: 0 };
        this.springVelocity = { rotateX: 0, rotateY: 0, glareX: 0, glareY: 0, opacity: 0 };
        this.springTarget = { rotateX: 0, rotateY: 0, glareX: 50, glareY: 50, opacity: 0 };
        window.clearTimeout(this.resetTimer);
        if (this.card) this.applyTilt(this.springState);
        if (animate && !reduceMotion()) {
            this.card?.classList.add('is-resetting');
            this.resetTimer = window.setTimeout(() => this.card?.classList.remove('is-resetting'), 420);
        }
    }
}
