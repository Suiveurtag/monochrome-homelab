import { mountSpicyDynamicBackground } from './spicy-dynamic-background.js';
import { buildNowPlayingPanelModel, normalizeSourceContext } from './now-playing-panel-model.js';
import { clearLyricsContainerSync, renderLyricsInContainer } from './lyrics.js';
import { createTrackSaveIconHTML } from './track-save-ui.js';
import { escapeHtml, getTrackArtists, getTrackTitle } from './utils.js';
import { copyShareLink } from './share.js';
import { isVideoArtwork, renderArtworkElement } from './animated-artwork.js';
import { navigate } from './router.js';
import { showNotification } from './downloads.js';
import { db } from './db.js';
import { syncManager } from './accounts/pocketbase.js';
import { audioContextManager } from './audio-context.js';
import { listeningTracker } from './listening-tracker.js';
import { canvasSettings } from './canvas-settings.js';
import { getTrackDisplayAlbum, getTrackPlayerArtwork } from './track-versions.js';
import { crossfadeSettings, gaplessPlaybackSettings } from './storage.js';
import ICON_CHEVRON_RIGHT from '!lucide/chevron-right.svg?svg&icon';
import ICON_CHEVRON_UP from '!lucide/chevron-up.svg?svg&icon';
import ICON_ELLIPSIS from '!lucide/ellipsis.svg?svg&icon';
import ICON_GRIP_VERTICAL from '!lucide/grip-vertical.svg?svg&icon';
import ICON_HEART from '!lucide/heart.svg?svg&icon';
import ICON_HISTORY from '!lucide/history.svg?svg&icon';
import ICON_INFINITY from '!lucide/infinity.svg?svg&icon';
import ICON_LIST_MUSIC from '!lucide/list-music.svg?svg&icon';
import ICON_MAXIMIZE from '!lucide/maximize-2.svg?svg&icon';
import ICON_MONITOR_UP from '!lucide/monitor-up.svg?svg&icon';
import ICON_PAUSE from '!lucide/pause.svg?svg&icon';
import ICON_PLAY from '!lucide/play.svg?svg&icon';
import ICON_REPEAT from '!lucide/repeat.svg?svg&icon';
import ICON_SHARE from '!lucide/share-2.svg?svg&icon';
import ICON_SKIP_BACK from '!lucide/skip-back.svg?svg&icon';
import ICON_SKIP_FORWARD from '!lucide/skip-forward.svg?svg&icon';
import ICON_SPARKLES from '!lucide/sparkles.svg?svg&icon';
import ICON_SLIDERS_HORIZONTAL from '!lucide/sliders-horizontal.svg?svg&icon';
import ICON_TRASH from '!lucide/trash-2.svg?svg&icon';
import ICON_CLOSE from '!lucide/x.svg?svg&icon';

const DESKTOP_PANEL_QUERY = '(min-width: 769px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CANVAS_LOAD_TIMEOUT = 20000;
const CANVAS_LOAD_RETRY_LIMIT = 2;
const CANVAS_RETRY_DELAY = 240;
const TRACK_FADE_OUT_DURATION = 180;
const MISSING_BIOGRAPHY = 'No biography is available for this artist yet.';
const QUEUE_REPEAT_ALL = 1;

function icon(name, size = 20) {
    const icons = {
        'chevron-right': ICON_CHEVRON_RIGHT,
        'chevron-up': ICON_CHEVRON_UP,
        ellipsis: ICON_ELLIPSIS,
        grip: ICON_GRIP_VERTICAL,
        heart: ICON_HEART,
        history: ICON_HISTORY,
        infinity: ICON_INFINITY,
        'list-music': ICON_LIST_MUSIC,
        'maximize-2': ICON_MAXIMIZE,
        'monitor-up': ICON_MONITOR_UP,
        pause: ICON_PAUSE,
        play: ICON_PLAY,
        repeat: ICON_REPEAT,
        'share-2': ICON_SHARE,
        'skip-back': ICON_SKIP_BACK,
        'skip-forward': ICON_SKIP_FORWARD,
        sparkles: ICON_SPARKLES,
        sliders: ICON_SLIDERS_HORIZONTAL,
        trash: ICON_TRASH,
        x: ICON_CLOSE,
    };
    return icons[name]?.(size) || '';
}

function formatStreams(value) {
    const streams = Math.max(0, Number(value) || 0);
    return `${new Intl.NumberFormat().format(streams)} total ${streams === 1 ? 'stream' : 'streams'} in Monochrome`;
}

function formatTourDate(value) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return { month: '', day: value };
    return {
        month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date),
        day: new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(date),
    };
}

export class NowPlayingPanel {
    constructor({ player, api, ui, lyricsManager }) {
        this.player = player;
        this.api = api;
        this.ui = ui;
        this.lyricsManager = lyricsManager;
        this.root = document.getElementById('now-playing-panel');
        this.content = this.root?.querySelector('.now-playing-panel-scroll');
        this.reopenButton = document.getElementById('now-playing-panel-reopen');
        this.resizer = this.root?.querySelector('.now-playing-panel-resizer');
        this.scrollbar = this.root?.querySelector('.now-playing-panel-scrollbar');
        this.scrollbarThumb = this.root?.querySelector('.now-playing-panel-scrollbar-thumb');
        this.sourceContext = normalizeSourceContext(player?.sourceContext);
        this.queueRenderSignature = this.getQueueRenderSignature();
        this.currentTrack = player?.currentTrack || null;
        this.model = null;
        this.renderController = null;
        this.expandedLyrics = false;
        this.collapsedLyrics = false;
        this.canvasExpanded = false;
        this.canvasEnabled = canvasSettings.isEnabled();
        this.canvasCoverOverlayEnabled = canvasSettings.isCoverOverlayEnabled();
        this.scrollByTrack = new Map();
        this.activeView = 'now-playing';
        this.queueView = 'up-next';
        this.queueHistory = [];
        this.queueSessionKey = this.getQueueSessionKey();
        this.transitionMenuOpen = false;
        this.endlessPreviewEnabled = false;
        this.manuallyQueuedTracks = new Map();
        this.queueMotionReason = null;
        this.queueDragIndex = null;
        this.queueDropTarget = null;
        this.queueVisualizerFrame = null;
        this.queueViewTimer = null;
        this.background = this.root
            ? mountSpicyDynamicBackground(this.root, { className: 'now-playing-panel-spicy-bg' })
            : null;
        this.desktopMedia = matchMedia(DESKTOP_PANEL_QUERY);
        this.desktopOpenState = true;
        this.isOpen = this.desktopMedia.matches;
        this.fullscreenOverlay = document.getElementById('fullscreen-cover-overlay');
        this.fullscreenObserver = null;
        this.fullscreenVisible = false;
        this.canvasMedia = null;
        this.canvasStage = null;
        this.canvasVisibilityObserver = null;
        this.canvasLoadTimer = null;
        this.canvasLoadRetryCount = 0;
        this.canvasRetryTimer = null;
        this.canvasRetryCount = 0;
        this.canvasPlaybackElement = null;
        this.scrollResizeObserver = null;
        this.reducedMotionMedia = matchMedia(REDUCED_MOTION_QUERY);
        this.background?.connectPlayback?.({
            getElement: () => this.player?.activeElement,
            getAnalyser: () => audioContextManager.getAnalyser(),
        });
        this.boundTrackChanged = (event) => {
            const nextTrack = event.detail?.track || null;
            const sameTrack =
                nextTrack?.id != null &&
                this.currentTrack?.id != null &&
                String(nextTrack.id) === String(this.currentTrack.id);
            if (!sameTrack && this.currentTrack) this.recordQueueHistory(this.currentTrack);
            if (!sameTrack && nextTrack?.id != null) this.manuallyQueuedTracks.delete(String(nextTrack.id));
            this.currentTrack = nextTrack;
            if (sameTrack) {
                this.syncPlaybackElement();
                this.syncCanvasPlayback();
                return;
            }
            this.queueRenderSignature = this.getQueueRenderSignature();
            if (this.activeView === 'queue') this.queueMotionReason = 'advance';
            this.canvasExpanded = false;
            const coverId = getTrackPlayerArtwork(nextTrack);
            if (coverId) this.background?.setFallbackSource?.(this.api.getCoverUrl(coverId));
            void this.render();
        };
        this.boundCanvasChanged = (event) => {
            if (String(event.detail?.trackId) !== String(this.currentTrack?.id)) return;
            Object.assign(this.currentTrack, event.detail?.track || {});
            void this.render({ preserveScroll: true });
        };
        this.boundQueueChanged = (event) => {
            const nextSourceContext = normalizeSourceContext(event.detail?.sourceContext || this.player?.sourceContext);
            const nextQueueSessionKey = this.getQueueSessionKey(event.detail, nextSourceContext);
            if (nextQueueSessionKey !== this.queueSessionKey) {
                this.queueSessionKey = nextQueueSessionKey;
                this.queueHistory = [];
                this.manuallyQueuedTracks.clear();
            }
            const nextSignature = this.getQueueRenderSignature(event.detail, nextSourceContext);
            if (nextSignature === this.queueRenderSignature) return;
            this.queueRenderSignature = nextSignature;
            this.sourceContext = nextSourceContext;
            void this.render({ preserveScroll: true });
        };
        this.boundQueueTracksAdded = (event) => {
            const mode = event.detail?.mode === 'next' ? 'next' : 'queue';
            for (const track of event.detail?.tracks || []) {
                if (track?.id != null) this.manuallyQueuedTracks.set(String(track.id), mode);
            }
            this.queueMotionReason = 'insert';
        };
        this.boundMetadataChanged = (event) => {
            const currentTrackChanged =
                event.type === 'track-metadata-updated' &&
                String(event.detail?.trackId) === String(this.currentTrack?.id);
            const currentArtistChanged =
                event.type === 'artist-metadata-updated' &&
                this.model?.artists?.some((artist) => String(artist.id) === String(event.detail?.artistId));
            if (!currentTrackChanged && !currentArtistChanged) return;
            if (currentTrackChanged) {
                Object.assign(this.currentTrack, event.detail.track || {});
            }
            void this.render({ preserveScroll: true });
        };
        this.boundDesktopViewportChanged = (event) => {
            this.setOpen(this.activeView === 'queue' ? true : event.matches ? this.desktopOpenState : false, {
                restoreFocus: false,
                preserveDesktopState: true,
            });
        };
        this.boundListeningChanged = () => {
            queueMicrotask(() => this.syncArtistStreamCount());
        };
        this.boundPanelScroll = () => {
            if (this.currentTrack?.id != null)
                this.scrollByTrack.set(String(this.currentTrack.id), this.content.scrollTop);
            this.root.classList.toggle('is-scrolled', this.content.scrollTop > 8);
            this.updateScrollbar();
        };
        this.boundVisibilityChanged = () => this.syncPanelActivity();
        this.boundReducedMotionChanged = () => void this.render({ preserveScroll: true });
        this.boundPlaybackChanged = (event) => {
            if (event?.type === 'play') this.canvasRetryCount = 0;
            this.syncCanvasPlayback();
            this.syncQueuePlaybackButtons();
        };
        this.boundCanvasPlaybackInterrupted = () => {
            if (!this.shouldCanvasPlay()) return;
            window.clearTimeout(this.canvasRetryTimer);
            const delay = CANVAS_RETRY_DELAY * 2 ** Math.min(this.canvasRetryCount, 4);
            this.canvasRetryCount += 1;
            this.canvasRetryTimer = window.setTimeout(() => this.syncCanvasPlayback(), delay);
        };
        this.boundCanvasPlaybackStarted = () => {
            window.clearTimeout(this.canvasRetryTimer);
            this.canvasRetryTimer = null;
            this.canvasRetryCount = 0;
            this.syncCanvasPlayback();
        };
        this.boundCanvasPreferenceChanged = (event) => {
            this.canvasEnabled = event.detail?.enabled ?? canvasSettings.isEnabled();
            this.canvasExpanded = false;
            void this.render({ preserveScroll: true });
        };
        this.boundCanvasCoverOverlayPreferenceChanged = (event) => {
            this.canvasCoverOverlayEnabled = event.detail?.enabled ?? canvasSettings.isCoverOverlayEnabled();
            void this.render({ preserveScroll: true });
        };
        this.init();
    }

    init() {
        if (!this.root || !this.content) return;
        this.root.dataset.initialized = 'true';
        this.setOpen(this.isOpen, { restoreFocus: false, preserveDesktopState: true });
        this.root.addEventListener('click', (event) => this.handleClick(event));
        this.root.addEventListener('input', (event) => this.handleInput(event));
        this.root.addEventListener('dragstart', (event) => {
            const row = event.target.closest('.queue-track-row[data-queue-index]');
            if (!row || row.dataset.draggable !== 'true') return;
            this.queueDragIndex = Number(row.dataset.queueIndex);
            row.classList.add('is-dragging');
            this.root.classList.add('is-queue-dragging');
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer?.setData('text/plain', String(this.queueDragIndex));
            event.dataTransfer?.setDragImage(row, row.clientWidth - 20, row.clientHeight / 2);
        });
        this.root.addEventListener('dragover', (event) => {
            const row = event.target.closest('.queue-track-row[data-queue-index]');
            if (!row || this.queueDragIndex == null) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            if (this.queueDropTarget && this.queueDropTarget !== row) {
                this.queueDropTarget.classList.remove('is-drop-target');
                delete this.queueDropTarget.dataset.dropPosition;
            }
            const rect = row.getBoundingClientRect();
            row.dataset.dropPosition = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            row.classList.add('is-drop-target');
            this.queueDropTarget = row;
        });
        this.root.addEventListener('drop', async (event) => {
            const row = event.target.closest('.queue-track-row[data-queue-index]');
            if (!row || this.queueDragIndex == null) return;
            event.preventDefault();
            const fromIndex = this.queueDragIndex;
            const queueLength = this.player?.getCurrentQueue?.().length || 0;
            let toIndex = Number(row.dataset.queueIndex) + (row.dataset.dropPosition === 'after' ? 1 : 0);
            if (fromIndex < toIndex) toIndex -= 1;
            toIndex = Math.max(0, Math.min(queueLength - 1, toIndex));
            this.queueMotionReason = 'reorder';
            this.cleanupQueueDrag();
            if (fromIndex !== toIndex) await this.player?.moveInQueue?.(fromIndex, toIndex);
        });
        this.root.addEventListener('dragend', () => this.cleanupQueueDrag());
        this.root.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
        this.root.addEventListener('keydown', (event) => this.handleKeydown(event));
        this.reopenButton?.addEventListener('click', () => this.setOpen(true));
        this.content.addEventListener('scroll', this.boundPanelScroll, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            this.scrollResizeObserver = new ResizeObserver(() => this.updateScrollbar());
            this.scrollResizeObserver.observe(this.content);
        }
        this.setupResize();
        this.setupFullscreenVisibility();
        this.desktopMedia.addEventListener?.('change', this.boundDesktopViewportChanged);
        this.reducedMotionMedia.addEventListener?.('change', this.boundReducedMotionChanged);
        document.addEventListener('visibilitychange', this.boundVisibilityChanged);
        window.addEventListener('player-track-changed', this.boundTrackChanged);
        window.addEventListener('player-canvas-changed', this.boundCanvasChanged);
        window.addEventListener('canvas-playback-preference-changed', this.boundCanvasPreferenceChanged);
        window.addEventListener(
            'canvas-cover-overlay-preference-changed',
            this.boundCanvasCoverOverlayPreferenceChanged
        );
        window.addEventListener('player-queue-changed', this.boundQueueChanged);
        window.addEventListener('queue-tracks-added', this.boundQueueTracksAdded);
        window.addEventListener('track-metadata-updated', this.boundMetadataChanged);
        window.addEventListener('artist-metadata-updated', this.boundMetadataChanged);
        window.addEventListener('listening-data-updated', this.boundListeningChanged);
        this.syncPlaybackElement();
        void this.render();
    }

    setOpen(open, { restoreFocus = true, preserveDesktopState = false } = {}) {
        const desktopAvailable = this.desktopMedia.matches;
        const queueAvailable = this.activeView === 'queue';
        const panelAvailable = desktopAvailable || queueAvailable;
        if (!preserveDesktopState && desktopAvailable) this.desktopOpenState = Boolean(open);
        this.isOpen = panelAvailable && Boolean(open);
        this.root.classList.toggle('is-closed', !this.isOpen);
        this.root.setAttribute('aria-hidden', String(!this.isOpen));
        this.content.inert = !this.isOpen;
        this.resizer.inert = !this.isOpen;
        this.reopenButton?.classList.toggle('is-visible', desktopAvailable && !this.isOpen && !queueAvailable);
        this.reopenButton?.setAttribute('aria-expanded', String(this.isOpen));
        document.body.classList.toggle('now-playing-panel-closed', desktopAvailable && !this.isOpen);
        this.root.setAttribute('role', queueAvailable ? 'dialog' : 'complementary');
        if (queueAvailable) this.root.setAttribute('aria-modal', 'true');
        else this.root.removeAttribute('aria-modal');
        this.syncFullscreenVisibility();
        this.syncPanelActivity();
        if (this.isOpen && restoreFocus) {
            requestAnimationFrame(() =>
                this.root
                    .querySelector(this.activeView === 'queue' ? '.queue-back-button' : '.now-playing-panel-close')
                    ?.focus({ preventScroll: true })
            );
        } else if (desktopAvailable && restoreFocus) {
            requestAnimationFrame(() => this.reopenButton?.focus({ preventScroll: true }));
        }
    }

    setupFullscreenVisibility() {
        if (!this.fullscreenOverlay) return;
        this.fullscreenObserver = new MutationObserver(() => this.syncFullscreenVisibility());
        this.fullscreenObserver.observe(this.fullscreenOverlay, {
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
        this.syncFullscreenVisibility();
    }

    syncFullscreenVisibility() {
        const fullscreenVisible = Boolean(
            this.fullscreenOverlay && getComputedStyle(this.fullscreenOverlay).display !== 'none'
        );
        this.fullscreenVisible = fullscreenVisible;
        const fullscreenBlocksPanel = fullscreenVisible && this.activeView !== 'queue';
        this.root.classList.toggle('is-fullscreen-hidden', fullscreenBlocksPanel);
        this.root.setAttribute('aria-hidden', String(!this.isOpen || fullscreenBlocksPanel));
        this.content.inert = !this.isOpen || fullscreenBlocksPanel;
        this.resizer.inert = !this.isOpen || fullscreenBlocksPanel;
        if (this.reopenButton) this.reopenButton.hidden = fullscreenVisible || !this.desktopMedia.matches;
        this.syncPanelActivity();
    }

    syncPlaybackElement() {
        const nextElement = this.player?.activeElement || null;
        if (nextElement === this.canvasPlaybackElement) return;
        this.canvasPlaybackElement?.removeEventListener('play', this.boundPlaybackChanged);
        this.canvasPlaybackElement?.removeEventListener('pause', this.boundPlaybackChanged);
        this.canvasPlaybackElement = nextElement;
        this.canvasPlaybackElement?.addEventListener('play', this.boundPlaybackChanged);
        this.canvasPlaybackElement?.addEventListener('pause', this.boundPlaybackChanged);
    }

    syncPanelActivity() {
        const active = this.isOpen && this.activeView !== 'queue' && !this.fullscreenVisible && !document.hidden;
        this.background?.setActive?.(active);
        this.syncCanvasPlayback();
    }

    setupResize() {
        if (!this.resizer) return;
        let resizing = false;
        const setWidth = (width) => {
            const safeWidth = Math.max(360, Math.min(520, width));
            document.documentElement.style.setProperty('--now-playing-panel-width', `${safeWidth}px`);
            this.resizer.setAttribute('aria-valuenow', String(Math.round(safeWidth)));
        };
        const move = (event) => {
            if (!resizing) return;
            setWidth(window.innerWidth - event.clientX);
        };
        const stop = () => {
            if (!resizing) return;
            resizing = false;
            document.body.classList.remove('now-playing-panel-resizing');
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };
        this.resizer.addEventListener('pointerdown', (event) => {
            if (!this.desktopMedia.matches) return;
            event.preventDefault();
            resizing = true;
            this.resizer.setPointerCapture?.(event.pointerId);
            document.body.classList.add('now-playing-panel-resizing');
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', stop);
        });
        this.resizer.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const current = Number.parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--now-playing-panel-width')
            );
            if (event.key === 'Home') setWidth(360);
            else if (event.key === 'End') setWidth(520);
            else setWidth((Number.isFinite(current) ? current : 420) + (event.key === 'ArrowLeft' ? 12 : -12));
        });
    }

    getQueueRenderSignature(detail = {}, sourceContext = this.sourceContext) {
        const queue = detail.queue || this.player?.getCurrentQueue?.() || [];
        const currentIndex = Number(detail.currentIndex ?? this.player?.currentQueueIndex ?? -1);
        const nextTrack = queue[currentIndex + 1] || null;
        return JSON.stringify({
            currentIndex,
            queueIds: queue.map((track) => String(track?.id ?? '')).join(','),
            nextTrackId: nextTrack?.id == null ? null : String(nextTrack.id),
            sourceLabel: sourceContext?.label || '',
            sourceHref: sourceContext?.href || '',
        });
    }

    getQueueSessionKey(detail = {}, sourceContext = this.sourceContext) {
        const queue = detail.queue || this.player?.getCurrentQueue?.() || [];
        const source = normalizeSourceContext(sourceContext);
        return [source.kind, source.id || '', queue[0]?.id || ''].join(':');
    }

    recordQueueHistory(track) {
        if (!track?.id) return;
        if (this.queueHistory.at(-1)?.id === track.id) return;
        this.queueHistory.push({ ...track, playedAt: Date.now() });
        if (this.queueHistory.length > 50) this.queueHistory.shift();
    }

    openQueue() {
        this.activeView = 'queue';
        this.queueView = 'up-next';
        this.transitionMenuOpen = false;
        this.queueMotionReason = 'open';
        window.clearTimeout(this.queueViewTimer);
        this.root.classList.remove('is-queue-closing');
        this.root.classList.add('is-queue-view', 'is-queue-opening');
        document.body.classList.add('queue-panel-open');
        this.setOpen(true);
        void this.render({ preserveScroll: false });
        this.queueViewTimer = window.setTimeout(() => this.root.classList.remove('is-queue-opening'), 620);
    }

    closeQueue() {
        if (this.activeView !== 'queue') return;
        const finish = () => {
            window.clearTimeout(this.queueViewTimer);
            this.stopQueueVisualizer();
            this.cleanupQueueDrag();
            this.activeView = 'now-playing';
            this.transitionMenuOpen = false;
            this.root.classList.remove('is-queue-view', 'is-queue-opening', 'is-queue-closing');
            document.body.classList.remove('queue-panel-open');
            this.setOpen(this.desktopMedia.matches && this.desktopOpenState, { restoreFocus: false });
            void this.render({ preserveScroll: false });
        };
        if (this.reducedMotionMedia.matches) {
            finish();
            return;
        }
        this.root.classList.remove('is-queue-opening');
        this.root.classList.add('is-queue-closing');
        this.queueViewTimer = window.setTimeout(finish, 420);
    }

    updateScrollbar() {
        if (!this.scrollbar || !this.scrollbarThumb || !this.content) return;
        const trackHeight = this.scrollbar.clientHeight;
        const maxScroll = Math.max(0, this.content.scrollHeight - this.content.clientHeight);
        const hasOverflow = maxScroll > 1 && trackHeight > 0;
        this.scrollbar.classList.toggle('has-overflow', hasOverflow);
        if (!hasOverflow) return;
        const thumbHeight = Math.max(34, (this.content.clientHeight / this.content.scrollHeight) * trackHeight);
        const travel = Math.max(0, trackHeight - thumbHeight);
        const top = maxScroll > 0 ? (this.content.scrollTop / maxScroll) * travel : 0;
        this.scrollbarThumb.style.height = `${thumbHeight}px`;
        this.scrollbarThumb.style.transform = `translateY(${top}px)`;
    }

    async render({ preserveScroll = false } = {}) {
        if (!this.root || !this.content) return;
        this.renderController?.abort();
        const controller = new AbortController();
        this.renderController = controller;
        const hadRenderedNowPlaying = Boolean(this.content.querySelector('.now-playing-panel-body'));
        const hadRenderedContent = hadRenderedNowPlaying || Boolean(this.content.querySelector('.now-playing-panel-queue-view'));
        const fadeOut = hadRenderedNowPlaying && this.activeView !== 'queue'
            ? new Promise((resolve) => window.setTimeout(resolve, TRACK_FADE_OUT_DURATION))
            : Promise.resolve();
        const previousScroll =
            this.activeView === 'queue'
                ? preserveScroll
                    ? this.content.scrollTop
                    : 0
                : preserveScroll
                  ? this.content.scrollTop
                  : this.scrollByTrack.get(String(this.currentTrack?.id)) || 0;
        this.root.classList.toggle('is-track-transitioning', hadRenderedNowPlaying && this.activeView !== 'queue');
        if (!hadRenderedContent) {
            this.content.innerHTML = '<div class="now-playing-panel-loading" role="status">Loading now playing…</div>';
        }
        try {
            const model = await buildNowPlayingPanelModel({
                track: this.currentTrack,
                player: this.player,
                api: this.api,
                sourceContext: this.sourceContext,
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            this.model = model;
            await this.background?.setSource(model.artwork.staticSrc);
            if (controller.signal.aborted) return;
            await fadeOut;
            if (controller.signal.aborted) return;
            this.stopQueueVisualizer();
            this.cleanupMedia();
            clearLyricsContainerSync(this.content);
            this.content.innerHTML = this.renderMarkup(model);
            this.content.scrollTop = previousScroll;
            this.updateScrollbar();
            if (this.activeView === 'queue') {
                this.syncQueueLoopButton();
                this.startQueueVisualizer();
            } else {
                await this.mountMedia(model, controller.signal);
                await this.mountLyrics(model, controller.signal);
                this.applyLyricsMode();
                await this.syncArtistLikeState();
                this.syncArtistStreamCount();
                if (this.currentTrack?.id != null) {
                    await this.ui?.refreshTrackSaveButtons?.(this.currentTrack.type || 'track', this.currentTrack.id);
                }
            }
            requestAnimationFrame(() => {
                if (!controller.signal.aborted) this.root.classList.remove('is-track-transitioning');
            });
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Failed to render Now Playing panel:', error);
            this.cleanupMedia();
            clearLyricsContainerSync(this.content);
            this.root.classList.remove('is-track-transitioning');
            this.content.innerHTML = '<div class="now-playing-panel-error">Now Playing could not be loaded.</div>';
        }
    }

    renderMarkup(model) {
        if (this.activeView === 'queue') return this.renderQueueView();
        const context = escapeHtml(model.source.label);
        const canvasLayout = this.canvasEnabled && model.artwork.isVideo && !this.reducedMotionMedia.matches;
        const artistLinks = model.artists
            .map((artist) =>
                artist.id
                    ? `<button type="button" class="now-playing-panel-artist-link" data-artist-id="${escapeHtml(artist.id)}">${escapeHtml(artist.name)}</button>`
                    : `<span>${escapeHtml(artist.name)}</span>`
            )
            .join(', ');
        return `
            <header class="now-playing-panel-header">
                <button type="button" class="now-playing-panel-icon now-playing-panel-close panel-hover-action" aria-label="Close Now Playing">${icon('chevron-right')}</button>
                <button type="button" class="now-playing-panel-context" ${model.source.href ? `data-href="${escapeHtml(model.source.href)}"` : ''}>${context}</button>
                <div class="now-playing-panel-header-actions panel-hover-action">
                    <button type="button" class="now-playing-panel-icon now-playing-panel-open-queue" aria-label="Open queue" title="Queue">${icon('list-music')}</button>
                    <button type="button" class="now-playing-panel-icon now-playing-panel-menu" aria-label="More options">${icon('ellipsis')}</button>
                    <button type="button" class="now-playing-panel-icon now-playing-panel-fullscreen" aria-label="Open fullscreen player">${icon('maximize-2')}</button>
                </div>
            </header>
            <div class="now-playing-panel-body${canvasLayout ? ' has-video-artwork' : ''}${canvasLayout && !this.canvasCoverOverlayEnabled ? ' is-canvas-cover-overlay-disabled' : ''}${this.canvasExpanded ? ' is-canvas-expanded' : ''}${model.empty ? ' is-empty' : ''}">
                <div class="now-playing-panel-media-row">
                    <${canvasLayout ? `button type="button" data-canvas-toggle aria-expanded="${String(this.canvasExpanded)}"` : 'div'} class="now-playing-panel-media" aria-label="${escapeHtml(canvasLayout ? `${this.canvasExpanded ? 'Collapse' : 'Expand'} ${model.title} Canvas artwork` : `${model.title} artwork`)}">
                        <img class="now-playing-panel-poster" src="${escapeHtml(model.artwork.staticSrc)}" alt="" fetchpriority="high" />
                    </${canvasLayout ? 'button' : 'div'}>
                </div>
                <section class="now-playing-panel-metadata" aria-label="Current track">
                    <div class="now-playing-panel-track-copy">
                        <h2>${getTrackDisplayAlbum(this.currentTrack)?.id ? `<button type="button" class="now-playing-panel-track-title" data-album-id="${escapeHtml(getTrackDisplayAlbum(this.currentTrack).id)}" aria-label="Open ${escapeHtml(getTrackDisplayAlbum(this.currentTrack).title || model.title)} album">${escapeHtml(model.title)}</button>` : escapeHtml(model.title)}</h2>
                        <p>${artistLinks || escapeHtml(model.artistLine)}${model.releaseYear ? `<span aria-hidden="true"> · </span><span>${escapeHtml(model.releaseYear)}</span>` : ''}${model.explicit ? '<span class="now-playing-panel-explicit" aria-label="Explicit">E</span>' : ''}</p>
                    </div>
                    <div class="now-playing-panel-track-actions">
                        <button type="button" class="now-playing-panel-icon now-playing-panel-share panel-hover-action" aria-label="Share current track">${icon('share-2')}</button>
                        <button type="button" class="now-playing-panel-icon now-playing-panel-save track-save-btn" data-action="toggle-like" data-track-save-id="${escapeHtml(String(this.currentTrack?.id || ''))}" aria-label="Add to playlist" title="Add to playlist">${createTrackSaveIconHTML(false)}</button>
                    </div>
                </section>
                <section class="now-playing-panel-card now-playing-panel-lyrics" aria-labelledby="now-playing-panel-lyrics-title">
                    <header>
                        <h3 id="now-playing-panel-lyrics-title">Lyrics</h3>
                        <div class="now-playing-panel-lyrics-actions">
                            <button type="button" class="now-playing-panel-icon now-playing-panel-lyrics-fullscreen" aria-label="Open fullscreen lyrics">${icon('monitor-up')}</button>
                            <button type="button" class="now-playing-panel-icon now-playing-panel-lyrics-expand" aria-label="Expand lyrics in panel">${icon('maximize-2')}</button>
                            <button type="button" class="now-playing-panel-icon now-playing-panel-lyrics-collapse" aria-label="Collapse lyrics preview">${icon('chevron-up')}</button>
                        </div>
                    </header>
                    <div class="now-playing-panel-lyrics-host"></div>
                </section>
                ${this.renderRelatedVideos(model)}
                ${this.renderArtist(model)}
                ${this.renderCredits(model)}
                ${this.renderTour(model)}
            </div>`;
    }

    renderRelatedVideos(model) {
        if (!model.relatedVideos.length) return '';
        return `<section class="now-playing-panel-section now-playing-panel-related" aria-labelledby="now-playing-panel-related-title">
            <h3 id="now-playing-panel-related-title">Related music videos</h3>
            <div class="now-playing-panel-video-grid">${model.relatedVideos
                .slice(0, 4)
                .map(
                    (
                        video
                    ) => `<button type="button" class="now-playing-panel-video" ${video.trackId ? `data-track-id="${escapeHtml(video.trackId)}"` : ''} ${video.href ? `data-href="${escapeHtml(video.href)}"` : ''}>
                        <img src="${escapeHtml(video.thumbnail || '/assets/appicon.png')}" alt="" loading="lazy" />
                        <strong>${escapeHtml(video.title)}</strong><span>${escapeHtml(video.subtitle)}</span>
                    </button>`
                )
                .join('')}</div>
        </section>`;
    }

    renderArtist(model) {
        if (!model.artist) return '';
        const streams = listeningTracker.getArtistSignal(model.artist.id)?.playCount || 0;
        const biography = model.artist.biography.trim() || MISSING_BIOGRAPHY;
        const heartIcon = this.ui?.createHeartIcon?.(false) || icon('heart');
        return `<section class="now-playing-panel-card now-playing-panel-artist" aria-labelledby="now-playing-panel-artist-title">
            <button type="button" class="now-playing-panel-artist-visual" data-artist-id="${escapeHtml(model.artist.id || '')}">
                <img src="${escapeHtml(model.artist.banner || model.artwork.staticSrc)}" alt="" loading="lazy" />
                <span>About the artist</span>
            </button>
            <div class="now-playing-panel-artist-copy">
                <div><h3 id="now-playing-panel-artist-title">${escapeHtml(model.artist.name)}</h3>
                    <button type="button" class="now-playing-panel-artist-like" data-artist-id="${escapeHtml(model.artist.id || '')}" aria-label="Like ${escapeHtml(model.artist.name)}" aria-pressed="false" title="Like artist">${heartIcon}</button>
                </div>
                <p class="now-playing-panel-streams" data-artist-streams>${escapeHtml(formatStreams(streams))}</p>
                <p class="now-playing-panel-biography${model.artist.biography ? '' : ' is-placeholder'}">${escapeHtml(biography)}</p>
            </div>
        </section>`;
    }

    renderCredits(model) {
        if (!model.credits.length) return '';
        return `<section class="now-playing-panel-card now-playing-panel-credits" aria-labelledby="now-playing-panel-credits-title">
            <header><h3 id="now-playing-panel-credits-title">Credits</h3>${model.credits.length > 3 ? '<button type="button" class="now-playing-panel-show-credits">Show all</button>' : ''}</header>
            <div class="now-playing-panel-credit-list">${model.credits
                .slice(0, 3)
                .map(
                    (credit) =>
                        `<div><strong>${escapeHtml(credit.name)}</strong><span>${escapeHtml(credit.role)}</span></div>`
                )
                .join('')}</div>
        </section>`;
    }

    renderTour(model) {
        if (!model.tourDates.length) return '';
        return `<section class="now-playing-panel-card now-playing-panel-tour" aria-labelledby="now-playing-panel-tour-title">
            <header><h3 id="now-playing-panel-tour-title">On tour</h3>${model.tourDates.length > 2 ? '<button type="button" class="now-playing-panel-show-tour">Show all</button>' : ''}</header>
            <div class="now-playing-panel-tour-list">${model.tourDates
                .slice(0, 2)
                .map((event) => this.renderTourEvent(event))
                .join('')}</div>
        </section>`;
    }

    renderTourEvent(event) {
        const date = formatTourDate(event.date);
        const tag = event.href ? 'a' : 'div';
        return `<${tag} class="now-playing-panel-tour-event" ${event.href ? `href="${escapeHtml(event.href)}" target="_blank" rel="noreferrer"` : ''}>
            <time datetime="${escapeHtml(event.date)}"><span>${escapeHtml(date.month)}</span><strong>${escapeHtml(date.day)}</strong></time>
            <span><strong>${escapeHtml(event.city || event.venue)}</strong><small>${escapeHtml([event.venue, event.time].filter(Boolean).join(' · '))}</small></span>
        </${tag}>`;
    }

    renderQueue(model = {}) {
        const queue = this.player?.getCurrentQueue?.() || [];
        const currentIndex = Number(this.player?.currentQueueIndex ?? -1);
        const currentTrack = this.currentTrack || queue[currentIndex] || null;
        const fallbackNext = model.nextTrack && !queue.length ? [model.nextTrack] : [];
        const upNext = (queue.length ? queue.slice(Math.max(0, currentIndex + 1)) : fallbackNext).filter(Boolean);
        const queueDuration = upNext.reduce((total, track) => total + (Number(track.duration) || 0), 0);
        const durationLabel = queueDuration > 0 ? this.formatQueueTime(queueDuration) : upNext.length ? 'duration unavailable' : '0 min';
        const isLooping = this.player?.repeatMode === QUEUE_REPEAT_ALL;
        const transitionMode = this.getTransitionMode();
        const media = this.player?.activeElement;
        const mediaDuration = Number.isFinite(media?.duration) ? media.duration : Number(currentTrack?.duration) || 0;
        const mediaTime = Number.isFinite(media?.currentTime) ? media.currentTime : 0;
        const isPaused = media?.paused !== false;
        const motionReason = this.queueMotionReason || 'refresh';
        this.queueMotionReason = null;
        const imageFor = (track) => {
            const source = getTrackPlayerArtwork(track);
            if (!source) return '/assets/appicon.png';
            return /^(?:data:|blob:|https?:|\/)/i.test(String(source))
                ? String(source)
                : this.api?.getCoverUrl?.(source) || String(source);
        };
        const titleFor = (track) => getTrackTitle(track, { fallback: 'Unknown title' });
        const artistFor = (track) => getTrackArtists(track, { fallback: 'Unknown artist' });
        const durationFor = (track) => this.formatTrackTime(track?.duration);
        const sourceLabel = this.sourceContext?.label && this.sourceContext.label !== 'Now playing'
            ? this.sourceContext.label
            : 'current queue';
        const sourceContext = this.sourceContext?.kind === 'album'
            ? `Continuing ${sourceLabel}`
            : this.sourceContext?.kind === 'playlist'
              ? `From ${sourceLabel}`
              : sourceLabel;
        const emptyQueueCopy = isLooping
            ? `Loop queue will restart ${sourceLabel}.`
            : this.sourceContext?.kind === 'album'
              ? `End of ${sourceLabel}. Playback stops here.`
              : 'Playback stops when this queue ends.';
        const currentMarkup = currentTrack
            ? `<section class="queue-current-card" aria-labelledby="queue-current-title">
                <div class="queue-current-artwork"><img src="${escapeHtml(imageFor(currentTrack))}" alt="" loading="eager" /></div>
                <div class="queue-current-copy"><span class="queue-current-label">Now playing</span><h2 id="queue-current-title">${escapeHtml(titleFor(currentTrack))}</h2><p>${escapeHtml(artistFor(currentTrack))}</p><canvas class="queue-waveform-canvas" width="520" height="54" aria-hidden="true"></canvas><div class="queue-current-times"><span data-queue-current-time>${escapeHtml(this.formatTrackTime(mediaTime, '0:00'))}</span><span data-queue-duration>${escapeHtml(this.formatTrackTime(mediaDuration))}</span></div></div>
                <button type="button" class="queue-current-state" data-queue-playback-toggle aria-label="${isPaused ? 'Play' : 'Pause'}" aria-pressed="${String(!isPaused)}">${icon(isPaused ? 'play' : 'pause', 17)}</button>
            </section>`
            : `<section class="queue-current-card queue-current-card-empty"><div class="queue-empty-artwork">${icon('list-music', 22)}</div><div class="queue-current-copy"><span class="queue-current-label">Now playing</span><h2 id="queue-current-title">Nothing playing</h2><p>Start a track to build your queue.</p></div></section>`;
        const rows = upNext.length
            ? upNext
                  .map((track, offset) => {
                      const index = currentIndex + offset + 1;
                      const queuedMode = this.manuallyQueuedTracks.get(String(track.id));
                      const isPinnedNext = queuedMode === 'next';
                      const isManualQueue = queuedMode === 'queue';
                      const rowClass = `queue-track-row${isPinnedNext ? ' is-pinned-next' : ''}${isManualQueue ? ' is-manually-queued' : ''}`;
                      const badge = isPinnedNext
                          ? `<span class="queue-track-badge">${icon('sparkles', 11)} Pinned next</span>`
                          : isManualQueue
                            ? '<span class="queue-track-badge">Added to queue</span>'
                            : '';
                      return `<div class="${rowClass}" style="--queue-order:${offset};--queue-delay:${Math.min(offset, 12) * 34}ms" data-queue-index="${index}" data-draggable="${String(Boolean(queue.length))}" draggable="${String(Boolean(queue.length))}"><span class="queue-track-position">${index - currentIndex}</span><button type="button" class="queue-track-main" data-queue-index="${index}" ${queue.length ? '' : 'data-play-next'} aria-label="Play ${escapeHtml(titleFor(track))}"><img src="${escapeHtml(imageFor(track))}" alt="" loading="lazy" /><span class="queue-track-copy">${badge}<strong>${escapeHtml(titleFor(track))}</strong><small>${escapeHtml(artistFor(track))}</small></span></button><time>${escapeHtml(durationFor(track))}</time><button type="button" class="queue-track-remove" data-remove-queue-index="${index}" aria-label="Remove ${escapeHtml(titleFor(track))} from queue">${icon('trash', 15)}</button><span class="queue-drag-handle" aria-label="Drag ${escapeHtml(titleFor(track))} to reorder" title="Drag to reorder">${icon('grip', 17)}</span></div>`;
                  })
                  .join('')
            : `<div class="queue-list-empty"><span>${icon('list-music', 18)}</span><strong>Nothing else is lined up</strong><p>${escapeHtml(emptyQueueCopy)}</p></div>`;
        const historyRows = this.queueHistory.length
            ? [...this.queueHistory]
                  .reverse()
                  .map(
                      (track, offset) => `<div class="queue-track-row queue-history-row" style="--queue-order:${offset};--queue-delay:${Math.min(offset, 12) * 34}ms"><span class="queue-track-position">${icon('play', 12)}</span><div class="queue-track-main queue-history-main"><img src="${escapeHtml(imageFor(track))}" alt="" loading="lazy" /><span><strong>${escapeHtml(titleFor(track))}</strong><small>${escapeHtml(artistFor(track))}</small></span></div><time>${escapeHtml(durationFor(track))}</time></div>`
                  )
                  .join('')
            : `<div class="queue-list-empty"><span>${icon('history', 18)}</span><strong>No history yet</strong><p>Only tracks played in this queue appear here.</p></div>`;
        const listMarkup =
            this.queueView === 'history'
                ? `<section class="queue-list-section" aria-labelledby="queue-history-title"><div class="queue-list-heading"><div><h3 id="queue-history-title">History</h3><p>${this.queueHistory.length} ${this.queueHistory.length === 1 ? 'track' : 'tracks'} · this queue only</p></div><button type="button" class="queue-history-toggle queue-inline-toggle">${icon('list-music', 14)}<span>Up next</span></button></div><div class="queue-track-list queue-history-list">${historyRows}</div></section>`
                : `<section class="queue-list-section" aria-labelledby="queue-up-next-title"><div class="queue-list-heading"><div class="queue-up-next-heading"><span class="queue-list-icon">${icon('list-music', 17)}</span><div><h3 id="queue-up-next-title">Up next</h3><p>${upNext.length} ${upNext.length === 1 ? 'track' : 'tracks'} <span aria-hidden="true">·</span> ${escapeHtml(durationLabel)} <span class="queue-source-context">· ${escapeHtml(sourceContext)}</span></p></div></div><button type="button" class="queue-loop-button${isLooping ? ' is-active' : ''}" aria-pressed="${String(isLooping)}">${icon('repeat', 14)}<span>${isLooping ? 'Looping' : 'Loop queue'}</span></button></div><div class="queue-track-list">${rows}</div></section>`;
        const endlessUnavailable = isLooping;
        const endlessPressed = this.endlessPreviewEnabled && !endlessUnavailable;
        const playerDock = currentTrack
            ? `<footer class="queue-player-dock"><img src="${escapeHtml(imageFor(currentTrack))}" alt="" /><div><strong>${escapeHtml(titleFor(currentTrack))}</strong><small>${escapeHtml(artistFor(currentTrack))}</small></div><div class="queue-player-controls"><button type="button" data-queue-player-previous aria-label="Previous track">${icon('skip-back', 16)}</button><button type="button" class="queue-player-play" data-queue-playback-toggle aria-label="${isPaused ? 'Play' : 'Pause'}" aria-pressed="${String(!isPaused)}">${icon(isPaused ? 'play' : 'pause', 17)}</button><button type="button" data-queue-player-next aria-label="Next track">${icon('skip-forward', 16)}</button></div></footer>`
            : '';
        return `<div class="now-playing-panel-queue-view queue-motion-${motionReason}" aria-labelledby="queue-panel-title"><header class="queue-panel-header"><button type="button" class="queue-back-button" aria-label="Back to Now Playing">${icon('chevron-right', 20)}</button><h1 id="queue-panel-title">Queue</h1><button type="button" class="queue-history-toggle queue-header-history" aria-pressed="${String(this.queueView === 'history')}" aria-label="${this.queueView === 'history' ? 'Show up next' : 'Show queue history'}">${icon('history', 17)}<span>${this.queueView === 'history' ? 'Up next' : 'History'}</span></button></header><main class="queue-panel-body">${currentMarkup}<div class="queue-control-grid"><button type="button" class="queue-setting-card queue-endless-card${endlessPressed ? ' is-preview-enabled' : ''}${endlessUnavailable ? ' is-unavailable' : ''}" data-endless-preview aria-pressed="${String(endlessPressed)}"><span class="queue-setting-icon">${icon('infinity', 18)}</span><span class="queue-setting-copy"><strong>Endless playback</strong><small>${isLooping ? 'Unavailable while Loop queue is on' : endlessPressed ? 'Preview on · queue still stops at the end' : 'Preview only · coming later'}</small></span><span class="queue-disabled-switch" aria-hidden="true"><span></span></span></button><div class="queue-setting-card queue-transition-card${this.transitionMenuOpen ? ' is-open' : ''}"><button type="button" class="queue-transition-trigger" aria-expanded="${String(this.transitionMenuOpen)}" aria-controls="queue-transition-menu"><span class="queue-setting-icon">${icon('sliders', 17)}</span><span class="queue-setting-copy"><strong>Transition</strong><small>${this.getTransitionSummary(transitionMode)}</small></span><span class="queue-transition-chevron">${icon('chevron-right', 16)}</span></button>${this.renderTransitionMenu(transitionMode)}</div></div>${listMarkup}</main>${playerDock}</div>`;
    }

    renderQueueView(model = {}) {
        return this.renderQueue(model);
    }

    formatTrackTime(seconds, fallback = '--:--') {
        const value = Number(seconds);
        if (!Number.isFinite(value) || value < 0) return fallback;
        return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
    }

    formatQueueTime(seconds) {
        const value = Math.max(0, Number(seconds) || 0);
        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        return hours ? `${hours}h ${minutes}m` : `${minutes} min`;
    }

    getTransitionMode() {
        if (crossfadeSettings.isEnabled()) return 'crossfade';
        if (gaplessPlaybackSettings.isEnabled()) return 'gapless';
        return 'standard';
    }

    getTransitionSummary(mode) {
        if (mode === 'crossfade') return `Crossfade · ${crossfadeSettings.getDuration()} sec`;
        if (mode === 'gapless') return 'Gapless · no delay';
        return 'Standard · short delay';
    }

    renderTransitionMenu(selectedMode) {
        const option = (mode, label, detail) => `<button type="button" class="queue-transition-option${selectedMode === mode ? ' is-selected' : ''}" data-transition-mode="${mode}" aria-pressed="${String(selectedMode === mode)}"><span>${label}</span><small>${detail}</small>${selectedMode === mode ? '<span class="queue-option-check" aria-hidden="true"></span>' : ''}</button>`;
        return `<div id="queue-transition-menu" class="queue-transition-menu"${this.transitionMenuOpen ? '' : ' hidden'}><div class="queue-transition-options">${option('gapless', 'Gapless', 'No space between tracks')}${option('standard', 'Standard', 'A short second of delay')}${option('crossfade', 'Crossfade', `${crossfadeSettings.getDuration()} second blend`)}</div>${selectedMode === 'crossfade' ? `<label class="queue-crossfade-control"><span>Crossfade length</span><output id="queue-crossfade-value" for="queue-crossfade-duration">${crossfadeSettings.getDuration()} s</output><input id="queue-crossfade-duration" type="range" min="1" max="12" step="1" value="${crossfadeSettings.getDuration()}" aria-label="Crossfade length" /></label>` : ''}</div>`;
    }

    startQueueVisualizer() {
        const canvas = this.root.querySelector('.queue-waveform-canvas');
        if (!canvas || this.activeView !== 'queue') return;
        const context = canvas.getContext('2d');
        if (!context) return;
        const analyser = audioContextManager.getAnalyser();
        const frequencyData = analyser?.frequencyBinCount ? new Uint8Array(analyser.frequencyBinCount) : null;
        const seed = String(this.currentTrack?.id || 'queue').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const draw = () => {
            if (this.activeView !== 'queue' || !canvas.isConnected) return;
            const width = Math.max(1, canvas.clientWidth);
            const height = Math.max(1, canvas.clientHeight);
            const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
            const renderWidth = Math.round(width * pixelRatio);
            const renderHeight = Math.round(height * pixelRatio);
            if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
                canvas.width = renderWidth;
                canvas.height = renderHeight;
            }
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            context.clearRect(0, 0, width, height);
            let hasLiveSignal = false;
            if (analyser && frequencyData) {
                analyser.getByteFrequencyData(frequencyData);
                hasLiveSignal = frequencyData.some((value) => value > 4);
            }
            const media = this.player?.activeElement;
            const duration = Number.isFinite(media?.duration) ? media.duration : Number(this.currentTrack?.duration) || 0;
            const currentTime = Number.isFinite(media?.currentTime) ? media.currentTime : 0;
            const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
            const barCount = Math.max(32, Math.floor(width / 4.6));
            const gap = 1.6;
            const barWidth = Math.max(1.2, (width - gap * (barCount - 1)) / barCount);
            for (let index = 0; index < barCount; index += 1) {
                const spectrumIndex = frequencyData
                    ? Math.min(frequencyData.length - 1, Math.floor((index / barCount) * frequencyData.length * 0.58))
                    : 0;
                const liveValue = hasLiveSignal ? frequencyData[spectrumIndex] / 255 : 0;
                const fallbackValue = 0.2 + ((Math.sin((index + seed) * 1.73) + 1) / 2) * 0.55;
                const amplitude = hasLiveSignal ? Math.max(0.12, liveValue) : fallbackValue;
                const barHeight = Math.max(3, amplitude * (height - 4));
                const x = index * (barWidth + gap);
                const y = (height - barHeight) / 2;
                context.fillStyle = index / Math.max(1, barCount - 1) <= progress ? '#d7ed57' : 'rgba(255,255,255,.18)';
                context.beginPath();
                context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
                context.fill();
            }
            const elapsed = this.root.querySelector('[data-queue-current-time]');
            const total = this.root.querySelector('[data-queue-duration]');
            if (elapsed) elapsed.textContent = this.formatTrackTime(currentTime, '0:00');
            if (total) total.textContent = this.formatTrackTime(duration);
            this.queueVisualizerFrame = requestAnimationFrame(draw);
        };
        draw();
    }

    stopQueueVisualizer() {
        if (this.queueVisualizerFrame != null) cancelAnimationFrame(this.queueVisualizerFrame);
        this.queueVisualizerFrame = null;
    }

    cleanupQueueDrag() {
        this.queueDragIndex = null;
        this.queueDropTarget = null;
        this.root?.classList.remove('is-queue-dragging');
        this.root?.querySelectorAll('.queue-track-row').forEach((row) => {
            row.classList.remove('is-dragging', 'is-drop-target');
            delete row.dataset.dropPosition;
        });
    }

    async mountMedia(model, signal) {
        if (!this.canvasEnabled || !model.artwork.isVideo || !model.artwork.animatedSrc) return;
        const stage = this.content.querySelector('.now-playing-panel-media');
        const poster = stage?.querySelector('.now-playing-panel-poster');
        if (!stage || !poster || signal.aborted || this.reducedMotionMedia.matches) return;

        const isHls = /\.m3u8(?:$|[?#])/i.test(model.artwork.animatedSrc);
        let video;
        if (isHls) {
            video = document.createElement('video');
            video.className = 'now-playing-panel-canvas';
            video.autoplay = false;
            video.loop = true;
            video.muted = true;
            video.defaultMuted = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.poster = model.artwork.staticSrc;
            stage.append(video);
        } else {
            const candidate = document.createElement('img');
            candidate.className = 'now-playing-panel-canvas';
            stage.append(candidate);
            video = renderArtworkElement(candidate, model.artwork.animatedSrc, {
                video: true,
                autoplay: false,
                preload: 'auto',
                poster: model.artwork.staticSrc,
            });
        }

        video.setAttribute('role', 'img');
        video.setAttribute('aria-label', `${model.title} animated artwork`);
        this.canvasMedia = video;
        this.canvasStage = stage;

        const markReady = () => {
            if (
                signal.aborted ||
                video !== this.canvasMedia ||
                !video.isConnected ||
                video.dataset.canvasReady === 'true'
            )
                return;
            requestAnimationFrame(() => {
                if (
                    signal.aborted ||
                    video !== this.canvasMedia ||
                    !video.isConnected ||
                    video.dataset.canvasReady === 'true'
                )
                    return;
                window.clearTimeout(this.canvasLoadTimer);
                this.canvasLoadTimer = null;
                this.canvasLoadRetryCount = 0;
                video.dataset.canvasReady = 'true';
                this.syncCanvasPlayback();
            });
        };
        const fail = () => this.failCanvasMedia(video);
        video.addEventListener('loadeddata', markReady, { once: true });
        video.addEventListener('canplay', markReady, { once: true });
        video.addEventListener('playing', markReady, { once: true });
        video.addEventListener('error', fail, { once: true });
        video.addEventListener('play', this.boundCanvasPlaybackStarted);
        video.addEventListener('pause', this.boundCanvasPlaybackInterrupted);
        video.addEventListener('stalled', this.boundCanvasPlaybackInterrupted);
        video.addEventListener('waiting', this.boundCanvasPlaybackInterrupted);
        if (video.readyState >= 2) markReady();

        if (typeof IntersectionObserver !== 'undefined') {
            this.canvasVisibilityObserver = new IntersectionObserver(
                () => {
                    // The player can swap to a preloaded audio deck after the
                    // panel has mounted. Re-sync after layout so Canvas follows
                    // that new active element. Visibility no longer disables it.
                    this.syncCanvasPlayback();
                },
                { root: this.content, threshold: [0, 0.01] }
            );
            this.canvasVisibilityObserver.observe(stage);
        }

        this.armCanvasLoadTimeout(video);
        if (isHls && this.ui?.setupHlsVideo) {
            await this.ui.setupHlsVideo(video, { hlsUrl: model.artwork.animatedSrc }, poster);
        } else if (isVideoArtwork(model.artwork.animatedSrc)) {
            video.load?.();
        }
        this.syncCanvasPlayback();
    }

    armCanvasLoadTimeout(video) {
        window.clearTimeout(this.canvasLoadTimer);
        this.canvasLoadTimer = window.setTimeout(() => {
            if (video !== this.canvasMedia || video.dataset.canvasReady === 'true') return;
            if (this.canvasLoadRetryCount < CANVAS_LOAD_RETRY_LIMIT) {
                this.canvasLoadRetryCount += 1;
                video.load?.();
                this.armCanvasLoadTimeout(video);
                return;
            }
            this.failCanvasMedia(video);
        }, CANVAS_LOAD_TIMEOUT);
    }

    failCanvasMedia(video = this.canvasMedia) {
        if (!video || video !== this.canvasMedia) return;
        const failedStage = this.canvasStage;
        window.clearTimeout(this.canvasLoadTimer);
        this.canvasLoadTimer = null;
        this.canvasLoadRetryCount = 0;
        window.clearTimeout(this.canvasRetryTimer);
        this.canvasRetryTimer = null;
        this.canvasRetryCount = 0;
        failedStage?.closest('.now-playing-panel-body')?.classList.remove('has-video-artwork', 'is-canvas-expanded');
        this.canvasExpanded = false;
        this.canvasVisibilityObserver?.disconnect();
        this.canvasVisibilityObserver = null;
        video._hls?.destroy?.();
        video.pause();
        video.removeAttribute('src');
        video.load?.();
        video.remove();
        this.canvasMedia = null;
        if (failedStage) {
            const fallbackStage = document.createElement('div');
            fallbackStage.className = 'now-playing-panel-media is-canvas-failed';
            fallbackStage.setAttribute('aria-label', `${this.model?.title || 'Track'} artwork`);
            const poster = failedStage.querySelector('.now-playing-panel-poster');
            if (poster) fallbackStage.append(poster);
            failedStage.replaceWith(fallbackStage);
            this.canvasStage = fallbackStage;
        }
    }

    syncCanvasPlayback() {
        const video = this.canvasMedia;
        const stage = this.canvasStage;
        if (!video || !stage) return;
        this.syncPlaybackElement();
        const reducedMotion = this.reducedMotionMedia.matches;
        const shouldPlay = this.shouldCanvasPlay();
        stage.classList.toggle(
            'is-canvas-ready',
            this.canvasEnabled && video.dataset.canvasReady === 'true' && !reducedMotion
        );
        if (shouldPlay) {
            void video.play().catch(() => this.boundCanvasPlaybackInterrupted());
        } else {
            video.pause();
        }
    }

    shouldCanvasPlay() {
        this.syncPlaybackElement();
        const audioPlaying = Boolean(this.canvasPlaybackElement && !this.canvasPlaybackElement.paused);
        const visible = this.isOpen && !this.fullscreenVisible && !this.expandedLyrics && !document.hidden;
        return this.canvasEnabled && visible && audioPlaying && !this.reducedMotionMedia.matches;
    }

    cleanupMedia() {
        window.clearTimeout(this.canvasLoadTimer);
        this.canvasLoadTimer = null;
        this.canvasLoadRetryCount = 0;
        window.clearTimeout(this.canvasRetryTimer);
        this.canvasRetryTimer = null;
        this.canvasVisibilityObserver?.disconnect();
        this.canvasVisibilityObserver = null;
        this.content?.querySelectorAll('video').forEach((video) => {
            video.removeEventListener('play', this.boundCanvasPlaybackStarted);
            video.removeEventListener('pause', this.boundCanvasPlaybackInterrupted);
            video.removeEventListener('stalled', this.boundCanvasPlaybackInterrupted);
            video.removeEventListener('waiting', this.boundCanvasPlaybackInterrupted);
            video._hls?.destroy?.();
            video.pause();
            video.removeAttribute('src');
            video.load?.();
        });
        this.canvasMedia = null;
        this.canvasStage = null;
        this.canvasRetryCount = 0;
    }

    async mountLyrics(model, signal) {
        const host = this.content.querySelector('.now-playing-panel-lyrics-host');
        if (!host || model.empty) return;
        const element = await renderLyricsInContainer(
            this.currentTrack,
            this.player.activeElement,
            this.lyricsManager,
            host,
            {
                signal,
            }
        );
        if (!element && !signal.aborted)
            host.innerHTML = '<p class="now-playing-panel-lyrics-empty">Lyrics are not available.</p>';
    }

    applyLyricsMode() {
        this.root.classList.toggle('lyrics-expanded', this.expandedLyrics);
        this.root.querySelector('.now-playing-panel-lyrics')?.classList.toggle('is-collapsed', this.collapsedLyrics);
        const lyricsHost = this.root.querySelector('.now-playing-panel-lyrics-host');
        lyricsHost?.setAttribute('aria-hidden', String(this.collapsedLyrics));
        if (lyricsHost) lyricsHost.inert = this.collapsedLyrics;
        const expand = this.root.querySelector('.now-playing-panel-lyrics-expand');
        expand?.setAttribute('aria-expanded', String(this.expandedLyrics));
        const collapse = this.root.querySelector('.now-playing-panel-lyrics-collapse');
        collapse?.setAttribute('aria-expanded', String(!this.collapsedLyrics));
        collapse?.setAttribute('aria-label', this.collapsedLyrics ? 'Show lyrics preview' : 'Hide lyrics preview');
        this.applyCanvasMode();
        this.syncCanvasPlayback();
    }

    applyCanvasMode() {
        const body = this.root.querySelector('.now-playing-panel-body');
        const toggle = this.root.querySelector('[data-canvas-toggle]');
        body?.classList.toggle('is-canvas-expanded', this.canvasExpanded);
        toggle?.setAttribute('aria-expanded', String(this.canvasExpanded));
        toggle?.setAttribute(
            'aria-label',
            `${this.canvasExpanded ? 'Collapse' : 'Expand'} ${this.model?.title || 'track'} Canvas artwork`
        );
    }

    async shareTrack() {
        if (!this.currentTrack) return;
        await copyShareLink('track', this.currentTrack);
    }

    showCredits() {
        const dialog = document.createElement('dialog');
        dialog.className = 'now-playing-panel-dialog';
        dialog.innerHTML = `<div><header><h2>Credits</h2><button type="button" aria-label="Close">${icon('x')}</button></header>${this.model.credits
            .map(
                (credit) => `<p><strong>${escapeHtml(credit.name)}</strong><span>${escapeHtml(credit.role)}</span></p>`
            )
            .join('')}</div>`;
        document.body.appendChild(dialog);
        dialog.querySelector('button').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => dialog.remove());
        dialog.showModal();
    }

    async syncArtistLikeState() {
        const button = this.root.querySelector('.now-playing-panel-artist-like');
        if (!button || !this.model?.artist?.id) return;
        const liked = await db.isFavorite('artist', this.model.artist.id);
        button.innerHTML = this.ui?.createHeartIcon?.(liked) || icon('heart');
        button.classList.toggle('active', liked);
        button.setAttribute('aria-pressed', String(liked));
        button.setAttribute('aria-label', `${liked ? 'Unlike' : 'Like'} ${this.model.artist.name}`);
        button.title = liked ? 'Unlike artist' : 'Like artist';
    }

    syncArtistStreamCount() {
        const element = this.root.querySelector('[data-artist-streams]');
        if (!element || !this.model?.artist?.id) return;
        const streams = listeningTracker.getArtistSignal(this.model.artist.id)?.playCount || 0;
        element.textContent = formatStreams(streams);
    }

    handleContextMenu(event) {
        const button = event.target.closest('.now-playing-panel-save');
        if (!button || !this.currentTrack) return;
        event.preventDefault();
        document.dispatchEvent(new CustomEvent('track-save-panel-open', { detail: { button } }));
    }

    async handleClick(event) {
        const canvasToggle = event.target.closest('[data-canvas-toggle]');
        if (canvasToggle) {
            this.canvasExpanded = !this.canvasExpanded;
            this.applyCanvasMode();
            return;
        }
        const button = event.target.closest('button, a');
        if (!button) return;
        if (button.matches('.now-playing-panel-close')) return this.setOpen(false);
        if (button.matches('.now-playing-panel-context') && button.dataset.href) return navigate(button.dataset.href);
        if (button.matches('.now-playing-panel-track-title') && button.dataset.albumId)
            return navigate(`/album/${button.dataset.albumId}`);
        if (button.matches('.now-playing-panel-menu') && this.currentTrack) {
            document.dispatchEvent(
                new CustomEvent('open-current-track-context-menu', {
                    detail: { track: this.currentTrack, anchor: button },
                })
            );
            return;
        }
        if (button.matches('.now-playing-panel-fullscreen')) return void this.ui?.openCurrentTrackFullscreen?.();
        if (button.matches('.now-playing-panel-share')) return void this.shareTrack();
        if (button.matches('.now-playing-panel-save')) {
            document.getElementById('now-playing-like-btn')?.click();
            return;
        }
        if (button.matches('.now-playing-panel-lyrics-fullscreen')) {
            void Promise.resolve(this.ui?.openCurrentTrackFullscreen?.()).then(() => {
                const overlay = document.getElementById('fullscreen-cover-overlay');
                if (overlay && !this.ui.fullscreenLyricsVisible) this.ui.toggleFullscreenLyrics(overlay);
            });
            return;
        }
        if (button.matches('.now-playing-panel-lyrics-expand')) {
            this.expandedLyrics = true;
            this.collapsedLyrics = false;
            this.applyLyricsMode();
            this.root.querySelector('.now-playing-panel-lyrics-collapse')?.focus();
            return;
        }
        if (button.matches('.now-playing-panel-lyrics-collapse')) {
            if (this.expandedLyrics) this.expandedLyrics = false;
            else this.collapsedLyrics = !this.collapsedLyrics;
            this.applyLyricsMode();
            return;
        }
        if (button.matches('.queue-back-button')) return this.closeQueue();
        if (button.matches('.queue-history-toggle')) {
            this.queueView = this.queueView === 'history' ? 'up-next' : 'history';
            this.queueMotionReason = 'view';
            return void this.render({ preserveScroll: true });
        }
        if (button.matches('[data-queue-playback-toggle]')) {
            const primaryControl = document.querySelector('.now-playing-bar .play-pause-btn');
            if (primaryControl) primaryControl.click();
            else if (this.player?.activeElement?.paused) await this.player.activeElement.play?.();
            else this.player?.activeElement?.pause?.();
            this.syncQueuePlaybackButtons();
            return;
        }
        if (button.matches('[data-queue-player-previous]')) {
            const primaryControl = document.getElementById('prev-btn');
            if (primaryControl) primaryControl.click();
            else await this.player?.playPrev?.();
            return;
        }
        if (button.matches('[data-queue-player-next]')) {
            const primaryControl = document.getElementById('next-btn');
            if (primaryControl) primaryControl.click();
            else await this.player?.playNext?.();
            return;
        }
        if (button.matches('[data-endless-preview]')) {
            if (this.isQueueLooping()) {
                showNotification('Endless playback is unavailable while Loop queue is on');
                return;
            }
            this.endlessPreviewEnabled = !this.endlessPreviewEnabled;
            button.classList.toggle('is-preview-enabled', this.endlessPreviewEnabled);
            button.setAttribute('aria-pressed', String(this.endlessPreviewEnabled));
            const detail = button.querySelector('small');
            if (detail) {
                detail.textContent = this.endlessPreviewEnabled
                    ? 'Preview on · queue still stops at the end'
                    : 'Preview only · coming later';
            }
            showNotification('Endless playback is a preview only · the queue still stops at the end');
            return;
        }
        if (button.matches('.queue-transition-trigger')) {
            this.transitionMenuOpen = !this.transitionMenuOpen;
            return void this.render({ preserveScroll: true });
        }
        if (button.matches('.queue-transition-option')) {
            await this.setQueueTransition(button.dataset.transitionMode);
            return;
        }
        if (button.matches('.queue-loop-button')) {
            await this.setQueueLoop(!this.isQueueLooping());
            return;
        }
        if (button.matches('.queue-track-remove')) {
            event.stopPropagation();
            await this.player?.removeFromQueue?.(Number(button.dataset.removeQueueIndex));
            return;
        }
        if (button.matches('.queue-track-main[data-queue-index]') && !button.matches('[data-play-next]')) {
            await this.player?.playAtIndex?.(Number(button.dataset.queueIndex));
            return;
        }
        if (button.matches('[data-play-next]')) {
            await this.player?.playAtIndex?.(this.player.currentQueueIndex + 1);
            return;
        }
        if (button.matches('.now-playing-panel-open-queue')) return document.getElementById('queue-btn')?.click();
        if (button.matches('.now-playing-panel-show-credits')) return this.showCredits();
        if (button.matches('.now-playing-panel-show-tour')) {
            const list = this.root.querySelector('.now-playing-panel-tour-list');
            list.innerHTML = this.model.tourDates.map((item) => this.renderTourEvent(item)).join('');
            button.remove();
            return;
        }
        if (button.matches('.now-playing-panel-artist-like') && this.model?.artist?.id) {
            const artist = { ...this.model.artist, type: 'artist' };
            const liked = await db.toggleFavorite('artist', artist);
            await syncManager.syncLibraryItem('artist', artist, liked);
            await this.syncArtistLikeState();
            showNotification(`${liked ? 'Liked' : 'Unliked'} ${artist.name}`);
            return;
        }
        const artistButton = button.closest('[data-artist-id]');
        if (artistButton?.dataset.artistId) return navigate(`/artist/${artistButton.dataset.artistId}`);
        if (button.matches('.now-playing-panel-video')) {
            if (button.dataset.trackId) return navigate(`/track/${button.dataset.trackId}`);
            if (button.dataset.href) window.open(button.dataset.href, '_blank', 'noopener,noreferrer');
        }
    }

    handleInput(event) {
        if (!event.target.matches('#queue-crossfade-duration')) return;
        const duration = crossfadeSettings.setDuration(event.target.value);
        const output = this.root.querySelector('#queue-crossfade-value');
        if (output) output.textContent = `${duration} s`;
    }

    syncQueuePlaybackButtons() {
        if (this.activeView !== 'queue') return;
        const paused = this.player?.activeElement?.paused !== false;
        for (const button of this.root.querySelectorAll('[data-queue-playback-toggle]')) {
            button.innerHTML = icon(paused ? 'play' : 'pause', 17);
            button.setAttribute('aria-label', paused ? 'Play' : 'Pause');
            button.setAttribute('aria-pressed', String(!paused));
        }
    }

    isQueueLooping() {
        return this.player?.repeatMode === QUEUE_REPEAT_ALL;
    }

    syncQueueLoopButton() {
        const looping = this.isQueueLooping();
        const repeatButtons = [document.getElementById('repeat-btn'), document.getElementById('fs-repeat-btn')];
        for (const button of repeatButtons) {
            if (!button) continue;
            button.classList.toggle('active', looping);
            button.classList.remove('repeat-one');
            button.setAttribute('aria-pressed', String(looping));
            button.title = looping ? 'Repeat queue · Loop queue enabled' : 'Repeat off';
            button.setAttribute('aria-label', looping ? 'Repeat queue enabled' : 'Turn repeat on');
        }
    }

    async setQueueLoop(enabled) {
        if (typeof this.player?.toggleRepeat === 'function') {
            let attempts = 0;
            while (this.isQueueLooping() !== enabled && attempts < 3) {
                await this.player.toggleRepeat();
                attempts += 1;
            }
        }
        const looping = this.isQueueLooping();
        if (looping) this.endlessPreviewEnabled = false;
        this.syncQueueLoopButton();
        showNotification(looping ? 'Loop queue enabled · Endless playback paused' : 'Loop queue disabled');
        await this.render({ preserveScroll: true });
    }

    async setQueueTransition(mode) {
        this.transitionMenuOpen = true;
        if (mode === 'crossfade') {
            gaplessPlaybackSettings.setEnabled(false);
            crossfadeSettings.setEnabled(true);
        } else if (mode === 'gapless') {
            crossfadeSettings.setEnabled(false);
            gaplessPlaybackSettings.setEnabled(true);
        } else {
            crossfadeSettings.setEnabled(false);
            gaplessPlaybackSettings.setEnabled(false);
        }
        await this.render({ preserveScroll: true });
    }

    handleKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (this.activeView === 'queue') {
                this.closeQueue();
            } else if (this.expandedLyrics) {
                this.expandedLyrics = false;
                this.applyLyricsMode();
            } else {
                this.setOpen(false);
            }
            return;
        }
    }

    destroy() {
        this.renderController?.abort();
        window.clearTimeout(this.queueViewTimer);
        this.stopQueueVisualizer();
        this.cleanupQueueDrag();
        document.body.classList.remove('queue-panel-open');
        this.cleanupMedia();
        clearLyricsContainerSync(this.content);
        this.background?.dispose();
        this.fullscreenObserver?.disconnect();
        this.canvasPlaybackElement?.removeEventListener('play', this.boundPlaybackChanged);
        this.canvasPlaybackElement?.removeEventListener('pause', this.boundPlaybackChanged);
        this.canvasPlaybackElement = null;
        this.content?.removeEventListener('scroll', this.boundPanelScroll);
        this.scrollResizeObserver?.disconnect();
        this.scrollResizeObserver = null;
        this.desktopMedia.removeEventListener?.('change', this.boundDesktopViewportChanged);
        this.reducedMotionMedia.removeEventListener?.('change', this.boundReducedMotionChanged);
        document.removeEventListener('visibilitychange', this.boundVisibilityChanged);
        window.removeEventListener('player-track-changed', this.boundTrackChanged);
        window.removeEventListener('player-canvas-changed', this.boundCanvasChanged);
        window.removeEventListener('canvas-playback-preference-changed', this.boundCanvasPreferenceChanged);
        window.removeEventListener(
            'canvas-cover-overlay-preference-changed',
            this.boundCanvasCoverOverlayPreferenceChanged
        );
        window.removeEventListener('player-queue-changed', this.boundQueueChanged);
        window.removeEventListener('queue-tracks-added', this.boundQueueTracksAdded);
        window.removeEventListener('track-metadata-updated', this.boundMetadataChanged);
        window.removeEventListener('artist-metadata-updated', this.boundMetadataChanged);
        window.removeEventListener('listening-data-updated', this.boundListeningChanged);
    }
}
