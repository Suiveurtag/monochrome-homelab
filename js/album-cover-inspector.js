const SELECTOR = {
    overlay: '#album-cover-inspector',
    stage: '.album-cover-inspector-stage',
    arrival: '.album-cover-inspector-arrival',
    card: '.album-cover-inspector-card',
    mediaHost: '.album-cover-inspector-media-host',
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
        this.interactionSurface = this.arrival || this.card;
        this.mediaHost = this.overlay?.querySelector(SELECTOR.mediaHost);
        this.closeButton = this.overlay?.querySelector(SELECTOR.close);
        this.downloadButton = this.overlay?.querySelector(SELECTOR.download);
        this.title = this.overlay?.querySelector(SELECTOR.title);
        this.artist = this.overlay?.querySelector(SELECTOR.artist);
        this.source = null;
        this.sourceParent = null;
        this.sourceNextSibling = null;
        this.trigger = null;
        this.previousBodyOverflow = '';
        this.pointerFrame = null;
        this.resetTimer = null;
        this.downloadResetTimer = null;
        this.downloadSource = null;
        this.downloadTitle = 'album';
        this.isDragging = false;

        if (!this.overlay || !this.stage || !this.card || !this.mediaHost || !this.closeButton) return;

        this.onKeydown = (event) => this.handleKeydown(event);
        this.onPointerMove = (event) => this.handlePointerMove(event);
        this.onPointerLeave = (event) => this.handlePointerLeave(event);
        this.onPointerDown = (event) => this.handlePointerDown(event);
        this.onPointerUp = (event) => this.handlePointerUp(event);

        this.closeButton.addEventListener('click', () => void this.close());
        this.downloadButton?.addEventListener('click', () => void this.download());
        this.overlay.addEventListener('click', (event) => {
            if (event.target === this.overlay || event.target === this.stage) void this.close();
        });
        this.interactionSurface.addEventListener('pointermove', this.onPointerMove);
        this.interactionSurface.addEventListener('pointerleave', this.onPointerLeave);
        this.interactionSurface.addEventListener('pointerdown', this.onPointerDown);
        this.interactionSurface.addEventListener('pointerup', this.onPointerUp);
        this.interactionSurface.addEventListener('pointercancel', this.onPointerUp);
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

        this.card.classList.remove('is-interacting');
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

    handlePointerDown(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        this.isDragging = true;
        this.card.classList.add('is-interacting');
        this.interactionSurface.setPointerCapture?.(event.pointerId);
        this.updateTilt(event);
    }

    handlePointerMove(event) {
        if (event.pointerType !== 'mouse' && !this.isDragging) return;
        this.updateTilt(event);
    }

    handlePointerUp(event) {
        this.isDragging = false;
        this.card.classList.remove('is-interacting');
        if (this.interactionSurface.hasPointerCapture?.(event.pointerId)) {
            this.interactionSurface.releasePointerCapture(event.pointerId);
        }
        this.resetTilt();
    }

    handlePointerLeave(event) {
        if (event.pointerType === 'mouse' && !this.isDragging) this.resetTilt();
    }

    updateTilt(event) {
        if (reduceMotion()) return;
        window.clearTimeout(this.resetTimer);
        this.card.classList.remove('is-resetting');
        this.card.classList.add('is-tilting');
        const rect = this.interactionSurface.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        const rotateY = (x - 0.5) * 28;
        const rotateX = (0.5 - y) * 28;
        const frontlightX = 50 + (x - 0.5) * 16;
        const frontlightY = 36 + (y - 0.5) * 12;
        const frontlightAngle = 132 + (x - 0.5) * 16 - (y - 0.5) * 10;
        const depthX = (0.5 - x) * 24;
        const depthY = (0.5 - y) * 24;

        cancelAnimationFrame(this.pointerFrame);
        this.pointerFrame = requestAnimationFrame(() => {
            this.card.style.setProperty('--cover-rotate-x', `${rotateX.toFixed(2)}deg`);
            this.card.style.setProperty('--cover-rotate-y', `${rotateY.toFixed(2)}deg`);
            this.card.style.setProperty('--cover-light-x', `${frontlightX.toFixed(1)}%`);
            this.card.style.setProperty('--cover-light-y', `${frontlightY.toFixed(1)}%`);
            this.card.style.setProperty('--cover-light-angle', `${frontlightAngle.toFixed(1)}deg`);
            this.card.style.setProperty('--cover-depth-x', `${depthX.toFixed(1)}px`);
            this.card.style.setProperty('--cover-depth-y', `${depthY.toFixed(1)}px`);
            this.card.style.setProperty('--cover-shadow-x', `${((0.5 - x) * 32).toFixed(1)}px`);
            this.card.style.setProperty('--cover-shadow-y', `${((0.5 - y) * 24 + 30).toFixed(1)}px`);
        });
    }

    resetTilt(animate = true) {
        cancelAnimationFrame(this.pointerFrame);
        window.clearTimeout(this.resetTimer);
        this.card?.classList.remove('is-tilting');
        this.card?.classList.toggle('is-resetting', animate && !reduceMotion());
        this.card?.style.setProperty('--cover-rotate-x', '0deg');
        this.card?.style.setProperty('--cover-rotate-y', '0deg');
        this.card?.style.setProperty('--cover-light-x', '50%');
        this.card?.style.setProperty('--cover-light-y', '36%');
        this.card?.style.setProperty('--cover-light-angle', '132deg');
        this.card?.style.setProperty('--cover-depth-x', '0px');
        this.card?.style.setProperty('--cover-depth-y', '0px');
        this.card?.style.setProperty('--cover-shadow-x', '0px');
        this.card?.style.setProperty('--cover-shadow-y', '30px');
        this.resetTimer = window.setTimeout(() => this.card?.classList.remove('is-resetting'), 420);
    }
}
