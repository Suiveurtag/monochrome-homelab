import { mountSpicyDynamicBackground } from './spicy-dynamic-background.js';
import { buildNowPlayingPanelModel, normalizeSourceContext } from './now-playing-panel-model.js';
import { clearLyricsContainerSync, renderLyricsInContainer, renderLyricsInNowPanel } from './lyrics.js';
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
import { keyboardShortcuts, matchesShortcut } from './keyboard-shortcuts.js';
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
import FULLSCREEN_EXIT_SVG from '../assets/fullscreen-exit-svgrepo-com.svg?raw';
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
const QUEUE_OPEN_DURATION = 360;
const QUEUE_CLOSE_DURATION = 360;
const QUEUE_COVER_DURATION = 360;
const QUEUE_ROW_EXIT_DURATION = 190;
const QUEUE_ROW_EXIT_STAGGER = 28;
const QUEUE_ROW_RECONCILE_DURATION = 240;
const QUEUE_ROW_RECONCILE_STAGGER = 18;
const QUEUE_ROW_ARTWORK_DURATION = 280;
const QUEUE_ROW_MAX_STAGGER = 8;
const QUEUE_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const QUEUE_EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
const MISSING_BIOGRAPHY = 'No biography is available for this artist yet.';
const QUEUE_REPEAT_ALL = 1;

const ICON_FULLSCREEN_EXIT = (size = 20) =>
    FULLSCREEN_EXIT_SVG.replace('width="800px" height="800px"', `width="${size}" height="${size}"`);

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
        'fullscreen-exit': ICON_FULLSCREEN_EXIT,
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
        this.queueLayer = this.root?.querySelector('.now-playing-panel-queue-layer') || null;
        if (this.root && !this.queueLayer) {
            this.queueLayer = document.createElement('div');
            this.queueLayer.className = 'now-playing-panel-queue-layer';
            this.queueLayer.hidden = true;
            this.queueLayer.setAttribute('aria-hidden', 'true');
            this.root.append(this.queueLayer);
        }
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
        this.lyricsTransitionToken = 0;
        this.canvasExpanded = false;
        this.canvasEnabled = canvasSettings.isEnabled();
        this.canvasCoverOverlayEnabled = canvasSettings.isCoverOverlayEnabled();
        this.scrollByTrack = new Map();
        this.activeView = 'now-playing';
        this.queueView = 'up-next';
        this.queueHistory = [];
        this.queueSessionKey = this.getQueueSessionKey();
        this.transitionMenuOpen = false;
        this.manuallyQueuedTracks = new Map();
        this.queueMotionReason = null;
        this.queueDragIndex = null;
        this.queueDropTarget = null;
        this.queueViewTimer = null;
        this.queueTransitionCloseTimer = null;
        this.queueTransitionChangeTimer = null;
        this.queueCrossfadeAnimationTimer = null;
        this.queueTransitionToken = 0;
        this.queueTransition = null;
        this.queueCoverAnimation = null;
        this.queueCoverMorph = null;
        this.queueCoverTarget = null;
        this.queueCoverClosingTarget = null;
        this.queueCoverSourceElement = null;
        this.queueLayerAnimation = null;
        this.queueOpeningScheduled = false;
        this.queueLayerRefreshPending = false;
        this.queueOpeningSignature = null;
        this.queueRowsStatic = false;
        this.queueRenderedCurrentIndex = Number(player?.currentQueueIndex ?? -1);
        this.queueListAnimation = null;
        this.queueListAnimationToken = 0;
        this.queueAdvanceArtworkAnimation = null;
        this.queueAdvanceArtworkTarget = null;
        this.queueAdvanceArtworkMorph = null;
        this.queueAdvanceArtworkPreview = null;
        this.queueAdvanceArtworkContainer = null;
        this.nowPlayingNeedsRender = false;
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
            if (this.activeView === 'queue') this.nowPlayingNeedsRender = true;
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
            if (this.activeView === 'queue') this.nowPlayingNeedsRender = true;
            void this.render({ preserveScroll: true });
        };
        this.boundQueueChanged = (event) => {
            const nextSourceContext = normalizeSourceContext(event.detail?.sourceContext || this.player?.sourceContext);
            const nextCurrentIndex = Number(event.detail?.currentIndex ?? this.player?.currentQueueIndex ?? -1);
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
            if (this.activeView === 'queue') {
                const currentIndexChanged = nextQueueSessionKey === this.queueSessionKey && nextCurrentIndex !== this.queueRenderedCurrentIndex;
                const nextCurrentTrack =
                    event.detail?.queue?.[nextCurrentIndex] || this.player?.getCurrentQueue?.()?.[nextCurrentIndex];
                const currentTrackChanged =
                    nextCurrentTrack?.id != null &&
                    this.currentTrack?.id != null &&
                    String(nextCurrentTrack.id) !== String(this.currentTrack.id);
                if (!this.queueMotionReason) this.queueMotionReason = currentIndexChanged || currentTrackChanged ? 'advance' : 'refresh';
                this.queueRenderedCurrentIndex = nextCurrentIndex;
                if (currentTrackChanged) {
                    return;
                }
                this.renderQueueControls({ preserveScroll: true });
                return;
            }
            void this.render({ preserveScroll: true });
        };
        this.boundRepeatChanged = () => {
            this.syncQueueLoopButton({ animate: true });
            this.syncEndlessButton();
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
                if (this.activeView === 'queue') this.nowPlayingNeedsRender = true;
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
        window.addEventListener('player-repeat-changed', this.boundRepeatChanged);
        window.addEventListener('autoplay-state-changed', this.boundTransitionChanged);
        window.addEventListener('radio-state-changed', this.boundTransitionChanged);
        window.addEventListener('queue-tracks-added', this.boundQueueTracksAdded);
        window.addEventListener('track-metadata-updated', this.boundMetadataChanged);
        window.addEventListener('artist-metadata-updated', this.boundMetadataChanged);
        window.addEventListener('listening-data-updated', this.boundListeningChanged);
        this.syncPlaybackElement();
        void this.render();
    }

    setOpen(open, { restoreFocus = true, preserveDesktopState = false } = {}) {
        if (!open && this.activeView === 'queue') {
            this.closeQueue();
            return;
        }
        const desktopAvailable = this.desktopMedia.matches;
        const queueAvailable = this.activeView === 'queue';
        const panelAvailable = desktopAvailable || queueAvailable;
        if (!preserveDesktopState && desktopAvailable) this.desktopOpenState = Boolean(open);
        this.isOpen = panelAvailable && Boolean(open);
        this.root.classList.toggle('is-closed', !this.isOpen);
        this.root.setAttribute('aria-hidden', String(!this.isOpen));
        this.content.inert = !this.isOpen;
        this.resizer.inert = !this.isOpen;
        this.syncQueueLayerState();
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
                    .querySelector(this.activeView === 'queue' ? '.queue-close-button' : '.now-playing-panel-close')
                    ?.focus({ preventScroll: true })
            );
        } else if (desktopAvailable && restoreFocus) {
            requestAnimationFrame(() => this.reopenButton?.focus({ preventScroll: true }));
        }
    }

    syncQueueLayerState() {
        if (!this.queueLayer) return;
        const isQueue = this.activeView === 'queue';
        const isVisible = isQueue && this.queueLayer.classList.contains('is-visible');
        this.queueLayer.inert = !isVisible;
        this.queueLayer.setAttribute('aria-hidden', String(!isQueue));
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
        const active = this.isOpen && !this.fullscreenVisible && !document.hidden;
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
            repeatMode: this.player?.repeatMode ?? 0,
            endless: !!(this.player?.autoplayEnabled || this.player?.radioEnabled),
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
        if (this.activeView === 'queue') {
            this.reopenQueueTransition();
            return;
        }
        const source = this.captureQueueCover(this.getNowPlayingCoverElement());
        this.cancelQueueCoverAnimation();
        const transitionToken = ++this.queueTransitionToken;
        this.queueOpeningScheduled = false;
        this.queueLayerRefreshPending = false;
        this.activeView = 'queue';
        this.queueView = 'up-next';
        this.queueRenderedCurrentIndex = Number(this.player?.currentQueueIndex ?? -1);
        this.transitionMenuOpen = false;
        this.queueMotionReason = 'open';
        this.queueOpeningSignature = this.getQueueRenderSignature();
        this.queueTransition = { type: 'opening', source, token: transitionToken };
        window.clearTimeout(this.queueViewTimer);
        this.queueLayer.hidden = false;
        this.queueLayer.classList.remove('is-visible', 'is-closing', 'is-measuring');
        this.root.classList.add('is-queue-view', 'is-queue-opening');
        document.body.classList.add('queue-panel-open');
        this.setOpen(true);
        this.queueRowsStatic = false;
        this.renderQueueLayer(this.model || {}, 0, { startTransition: false });
        this.queueRowsStatic = false;
        this.startQueueOpening(this.queueTransition);
        void this.render({ preserveScroll: false });
    }

    closeQueue() {
        if (this.activeView !== 'queue') return;
        this.cancelQueueListAnimation();
        this.clearQueueAdvanceArtworkAnimation();
        const source = this.captureQueueCover(this.queueCoverMorph || this.getQueueCoverElement());
        const target = this.captureQueueCover(this.getNowPlayingCoverElement());
        const transitionToken = ++this.queueTransitionToken;
        this.queueOpeningScheduled = false;
        const layerState = this.freezeQueueMotion();
        this.queueTransition = { type: 'closing', source, target, token: transitionToken };
        source?.element?.style.setProperty('opacity', '0');
        target?.element?.style.setProperty('opacity', '0');
        this.queueCoverTarget = target?.element || null;
        this.queueCoverClosingTarget = target?.element || null;
        const finish = () => {
            if (transitionToken !== this.queueTransitionToken) return;
            const complete = () => {
                if (transitionToken !== this.queueTransitionToken) return;
                window.clearTimeout(this.queueViewTimer);
                this.cleanupQueueDrag();
                this.activeView = 'now-playing';
                this.transitionMenuOpen = false;
                this.root.classList.remove('is-queue-view', 'is-queue-opening', 'is-queue-closing');
                document.body.classList.remove('queue-panel-open');
                this.clearQueueCoverAnimation();
                this.restoreQueueCoverSource();
                this.queueLayer.classList.remove('is-visible', 'is-closing', 'is-measuring');
                this.queueLayer.hidden = true;
                this.queueLayer.innerHTML = '';
                this.queueLayer.inert = true;
                this.queueLayer.setAttribute('aria-hidden', 'true');
                this.queueTransition = null;
                this.queueCoverTarget = null;
                this.queueCoverClosingTarget = null;
                this.queueLayerRefreshPending = false;
                this.queueOpeningSignature = null;
                this.setOpen(this.desktopMedia.matches && this.desktopOpenState, { restoreFocus: false });
                if (this.nowPlayingNeedsRender) void this.render({ preserveScroll: false });
            };
            const coverAnimation = this.queueCoverAnimation;
            if (coverAnimation?.finished?.then) {
                coverAnimation.finished.then(complete, complete);
                return;
            }
            complete();
        };
        if (this.reducedMotionMedia.matches) {
            finish();
            return;
        }
        this.root.classList.remove('is-queue-opening');
        this.root.classList.add('is-queue-closing');
        this.queueLayer.classList.remove('is-visible', 'is-entering');
        this.queueLayer.classList.add('is-closing');
        this.syncQueueLayerState();
        this.animateQueueCover(source, target, transitionToken, 'closing');
        this.animateQueueLayer(layerState.offsetY, layerState.opacity, QUEUE_CLOSE_DURATION, transitionToken, finish, 'closing');
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
        const isQueueView = this.activeView === 'queue';
        const hadRenderedNowPlaying = Boolean(this.content.querySelector('.now-playing-panel-body'));
        const hadRenderedQueue = Boolean(this.queueLayer?.querySelector('.now-playing-panel-queue-view'));
        const hadRenderedContent = hadRenderedNowPlaying || hadRenderedQueue;
        const shouldRenderNowPlaying = !isQueueView || !hadRenderedNowPlaying || this.nowPlayingNeedsRender;
        const scrollContainer = isQueueView
            ? this.queueLayer?.querySelector('.now-playing-panel-queue-view') || this.queueLayer
            : this.content;
        const fadeOut =
            hadRenderedNowPlaying && !isQueueView
                ? new Promise((resolve) => window.setTimeout(resolve, TRACK_FADE_OUT_DURATION))
                : Promise.resolve();
        const previousScroll =
            isQueueView
                ? preserveScroll
                    ? scrollContainer?.scrollTop || 0
                    : 0
                : preserveScroll
                  ? this.content.scrollTop
                  : this.scrollByTrack.get(String(this.currentTrack?.id)) || 0;
        this.root.classList.toggle('is-track-transitioning', hadRenderedNowPlaying && shouldRenderNowPlaying && !isQueueView);
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
            if (shouldRenderNowPlaying) {
                this.cleanupMedia();
                clearLyricsContainerSync(this.content);
                this.content.innerHTML = this.renderNowPlayingMarkup(model);
                this.content.scrollTop = previousScroll;
                this.nowPlayingNeedsRender = false;
            }
            if (isQueueView) {
                const queueChangedDuringOpening =
                    this.queueOpeningSignature !== null &&
                    this.queueOpeningSignature !== this.getQueueRenderSignature();
                const queueIsStableAfterOpening =
                    this.queueOpeningSignature !== null &&
                    !queueChangedDuringOpening &&
                    this.queueTransition?.type !== 'closing' &&
                    !this.nowPlayingNeedsRender;
                if (!queueIsStableAfterOpening) {
                    if (
                        (this.queueCoverAnimation || this.queueOpeningScheduled || this.queueTransition?.type === 'closing') &&
                        (this.queueTransition?.type !== 'opening' || queueChangedDuringOpening || this.nowPlayingNeedsRender)
                    ) {
                        this.queueLayerRefreshPending = true;
                    } else {
                        this.renderQueueLayer(model, previousScroll);
                    }
                }
                this.syncQueueLoopButton();
                if (this.root.classList.contains('is-queue-opening')) {
                    requestAnimationFrame(() => this.root.querySelector('.queue-close-button')?.focus({ preventScroll: true }));
                }
            }
            this.updateScrollbar();
            if (!isQueueView) {
                await this.mountMedia(model, controller.signal);
                await this.mountLyrics(model, controller.signal);
                this.applyLyricsMode();
                await this.syncArtistLikeState();
                this.syncArtistStreamCount();
                if (this.currentTrack?.id != null) {
                    await this.ui?.refreshTrackSaveButtons?.(this.currentTrack.type || 'track', this.currentTrack.id);
                }
            }
            if (isQueueView && shouldRenderNowPlaying) {
                await this.mountMedia(model, controller.signal);
                await this.mountLyrics(model, controller.signal);
                this.applyLyricsMode();
            }
            requestAnimationFrame(() => {
                if (!controller.signal.aborted) this.root.classList.remove('is-track-transitioning');
            });
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Failed to render Now Playing panel:', error);
            if (!isQueueView || shouldRenderNowPlaying) {
                this.cleanupMedia();
                clearLyricsContainerSync(this.content);
            }
            this.root.classList.remove('is-track-transitioning');
            const errorTarget = isQueueView && this.queueLayer ? this.queueLayer : this.content;
            errorTarget.innerHTML = '<div class="now-playing-panel-error">Now Playing could not be loaded.</div>';
        }
    }

    renderMarkup(model) {
        if (this.activeView === 'queue') return this.renderQueueView(model);
        return this.renderNowPlayingMarkup(model);
    }

    renderNowPlayingMarkup(model) {
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
                            <button type="button" class="now-playing-panel-icon now-playing-panel-lyrics-collapse" aria-label="Collapse lyrics preview">${this.expandedLyrics ? icon('fullscreen-exit') : icon('chevron-up')}</button>
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

    getNowPlayingCoverElement() {
        return (
            this.content?.querySelector('.now-playing-panel-poster') ||
            this.content?.querySelector('.now-playing-panel-media') ||
            null
        );
    }

    getNowPlayingCoverVisualElement() {
        const element = this.getNowPlayingCoverElement();
        return element?.closest('.now-playing-panel-media') || element || null;
    }

    hideQueueCoverSource() {
        const element = this.getNowPlayingCoverVisualElement();
        if (!element) return;
        this.queueCoverSourceElement = element;
        element.style.setProperty('opacity', '0');
    }

    restoreQueueCoverSource() {
        this.queueCoverSourceElement?.style.removeProperty('opacity');
        this.queueCoverSourceElement = null;
    }

    getQueueCoverElement() {
        return this.queueLayer?.querySelector('.queue-current-artwork img') || null;
    }

    captureQueueCover(element) {
        if (!element?.getBoundingClientRect) return null;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const computed = getComputedStyle(element);
        return {
            element,
            rect,
            src: element.currentSrc || element.src || element.poster || '',
            borderRadius: computed.borderRadius || '4px',
        };
    }

    measureQueueCoverTarget() {
        const target = this.getQueueCoverElement();
        if (!target || !this.queueLayer) return null;
        const previousTransform = this.queueLayer.style.transform;
        const previousOpacity = this.queueLayer.style.opacity;
        this.queueLayer.classList.add('is-measuring');
        this.queueLayer.style.setProperty('transform', 'translate3d(0, 0, 0)');
        this.queueLayer.style.setProperty('opacity', '1');
        const snapshot = this.captureQueueCover(target);
        this.queueLayer.classList.remove('is-measuring');
        if (previousTransform) this.queueLayer.style.setProperty('transform', previousTransform);
        else this.queueLayer.style.removeProperty('transform');
        if (previousOpacity) this.queueLayer.style.setProperty('opacity', previousOpacity);
        else this.queueLayer.style.removeProperty('opacity');
        return snapshot;
    }

    renderQueueLayer(model, previousScroll = 0, { startTransition = true, skipRowExit = false } = {}) {
        if (!this.queueLayer) return;
        if (this.queueCoverAnimation || this.queueOpeningScheduled || this.queueTransition?.type === 'closing') {
            this.queueLayerRefreshPending = true;
            return;
        }
        if (this.queueListAnimation) {
            this.queueListAnimation.pending = { model, previousScroll, startTransition, skipRowExit };
            return;
        }
        const pendingTransition = this.queueTransition;
        if (!pendingTransition) this.cancelQueueCoverAnimation();
        const motionReason = this.queueMotionReason || 'refresh';
        const markup = this.renderQueueView(model);
        const previousView = this.queueLayer.querySelector('.now-playing-panel-queue-view');
        const previousRows = this.getQueueTrackRows(previousView);
        const nextMarkupRoot = document.createElement('div');
        nextMarkupRoot.innerHTML = markup;
        const nextRows = this.getQueueTrackRows(nextMarkupRoot.querySelector('.now-playing-panel-queue-view'));
        const nextTrackIds = new Set(nextRows.map((row) => row.dataset.trackId));
        const removedRows = previousRows.filter((row) => !nextTrackIds.has(row.dataset.trackId));
        const shouldExitRows =
            !skipRowExit &&
            !this.reducedMotionMedia.matches &&
            removedRows.length > 0 &&
            (motionReason === 'remove' || motionReason === 'clear');

        if (shouldExitRows) {
            this.startQueueRowExit(removedRows, () => {
                this.commitQueueLayerMarkup(markup, previousScroll, {
                    motionReason,
                    startTransition,
                    pendingTransition,
                });
            }, motionReason);
            return;
        }

        this.commitQueueLayerMarkup(markup, previousScroll, { motionReason, startTransition, pendingTransition });
    }

    getQueueTrackRows(container) {
        return [...(container?.querySelectorAll('.queue-track-row[data-track-id]') || [])];
    }

    startQueueRowExit(rows, onfinish, motionReason = 'remove') {
        const token = ++this.queueListAnimationToken;
        const maxDelay = Math.min(Math.max(0, rows.length - 1), QUEUE_ROW_MAX_STAGGER) * QUEUE_ROW_EXIT_STAGGER;
        const animationState = { token, pending: null, motionReason, timer: null };
        this.queueListAnimation = animationState;
        rows.forEach((row, index) => {
            row.style.setProperty(
                '--queue-exit-delay',
                `${Math.min(index, QUEUE_ROW_MAX_STAGGER) * QUEUE_ROW_EXIT_STAGGER}ms`
            );
            row.classList.add('is-exiting');
        });
        animationState.timer = window.setTimeout(() => {
            if (this.queueListAnimation?.token !== token) return;
            const pending = this.queueListAnimation.pending;
            this.queueListAnimation = null;
            if (pending) {
                this.queueMotionReason = this.queueMotionReason || animationState.motionReason;
                this.renderQueueLayer(pending.model, pending.previousScroll, {
                    startTransition: pending.startTransition,
                    skipRowExit: true,
                });
                return;
            }
            onfinish?.();
        }, QUEUE_ROW_EXIT_DURATION + maxDelay);
    }

    cancelQueueListAnimation() {
        if (this.queueListAnimation?.timer) window.clearTimeout(this.queueListAnimation.timer);
        this.queueListAnimationToken += 1;
        this.queueListAnimation = null;
        this.queueLayer?.querySelectorAll('.queue-track-row.is-exiting').forEach((row) => {
            row.classList.remove('is-exiting');
            row.style.removeProperty('--queue-exit-delay');
        });
    }

    commitQueueLayerMarkup(
        markup,
        previousScroll,
        { motionReason = 'refresh', startTransition = true, pendingTransition = this.queueTransition } = {}
    ) {
        const previousView = this.queueLayer.querySelector('.now-playing-panel-queue-view');
        const previousRows = this.getQueueTrackRows(previousView);
        const previousRects = new Map(
            previousRows.map((row) => [row.dataset.trackId, { row, rect: row.getBoundingClientRect() }])
        );
        const advanceTrackId = String(this.currentTrack?.id ?? '');
        const advanceSourceRow =
            motionReason === 'advance'
                ? previousRows.find((row) => row.dataset.trackId === advanceTrackId) || previousRows[0]
                : null;
        const advanceSource = this.captureQueueCover(advanceSourceRow?.querySelector('img'));

        this.queueLayer.hidden = false;
        this.queueLayer.innerHTML = markup;
        const nextView = this.queueLayer.querySelector('.now-playing-panel-queue-view');
        if (!nextView) return;
        nextView.scrollTop = previousScroll;
        this.syncQueueLayerState();
        this.animateQueueRowReflow(previousRects, nextView, motionReason);
        // The advance morph belongs to the queue's Now Playing slot. The underlying
        // Now Playing cover must stay untouched while the queue remains open.
        if (advanceSource) this.animateQueueAdvanceArtwork(advanceSource, nextView.querySelector('.queue-current-artwork img'));
        if (startTransition && pendingTransition?.type === 'opening') this.startQueueOpening(pendingTransition);
    }

    animateQueueRowReflow(previousRects, nextView, motionReason) {
        if (this.reducedMotionMedia.matches || !['advance', 'insert', 'remove', 'reorder'].includes(motionReason))
            return;
        for (const row of this.getQueueTrackRows(nextView)) {
            const previous = previousRects.get(row.dataset.trackId);
            if (!previous) continue;
            const nextRect = row.getBoundingClientRect();
            const deltaX = previous.rect.left - nextRect.left;
            const deltaY = previous.rect.top - nextRect.top;
            if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;
            row.classList.add('is-reconciling');
            if (typeof row.animate !== 'function') {
                row.classList.remove('is-reconciling');
                continue;
            }
            const animation = row.animate(
                [
                    { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
                    { transform: 'translate3d(0, 0, 0)' },
                ],
                {
                    duration: QUEUE_ROW_RECONCILE_DURATION,
                    delay: Math.min(Number(row.style.getPropertyValue('--queue-order')) || 0, QUEUE_ROW_MAX_STAGGER) * QUEUE_ROW_RECONCILE_STAGGER,
                    easing: QUEUE_EASE_OUT,
                    fill: 'both',
                }
            );
            animation.onfinish = () => {
                row.classList.remove('is-reconciling');
                animation.cancel();
            };
        }
    }

    animateQueueAdvanceArtwork(source, targetElement) {
        this.clearQueueAdvanceArtworkAnimation();
        if (this.reducedMotionMedia.matches || !source?.src) return;
        const target = this.captureQueueCover(targetElement);
        if (!target || !target.src) return;
        const rootRect = this.root.getBoundingClientRect();
        const fromX = source.rect.left - rootRect.left;
        const fromY = source.rect.top - rootRect.top;
        const toX = target.rect.left - rootRect.left;
        const toY = target.rect.top - rootRect.top;
        const morph = document.createElement('img');
        morph.className = 'now-playing-panel-queue-cover-morph queue-track-advance-morph';
        morph.src = source.src;
        morph.alt = '';
        morph.setAttribute('aria-hidden', 'true');
        morph.draggable = false;
        morph.style.left = `${fromX}px`;
        morph.style.top = `${fromY}px`;
        morph.style.width = `${source.rect.width}px`;
        morph.style.height = `${source.rect.height}px`;
        morph.style.borderRadius = source.borderRadius;
        this.root.append(morph);
        this.queueAdvanceArtworkMorph = morph;
        const targetContainer = target.element.closest('.queue-current-artwork');
        if (targetContainer) {
            const preview = document.createElement('img');
            preview.className = 'queue-advance-artwork-preview';
            preview.src = source.src;
            preview.alt = '';
            preview.setAttribute('aria-hidden', 'true');
            preview.draggable = false;
            targetContainer.classList.add('is-morphing');
            targetContainer.append(preview);
            this.queueAdvanceArtworkPreview = preview;
            this.queueAdvanceArtworkContainer = targetContainer;
        }
        target.element.style.opacity = '0';
        this.queueAdvanceArtworkTarget = target.element;
        if (typeof morph.animate !== 'function') {
            target.element.style.removeProperty('opacity');
            morph.remove();
            this.queueAdvanceArtworkMorph = null;
            this.queueAdvanceArtworkTarget = null;
            this.queueAdvanceArtworkPreview?.remove();
            this.queueAdvanceArtworkContainer?.classList.remove('is-morphing');
            this.queueAdvanceArtworkPreview = null;
            this.queueAdvanceArtworkContainer = null;
            return;
        }
        const destination = `translate3d(${toX - fromX}px, ${toY - fromY}px, 0) scale(${target.rect.width / source.rect.width}, ${target.rect.height / source.rect.height})`;
        const animation = morph.animate(
            [
                { transform: 'translate3d(0, 0, 0) scale(1, 1)', opacity: 1 },
                { transform: destination, opacity: 1 },
            ],
            { duration: QUEUE_ROW_ARTWORK_DURATION, easing: QUEUE_EASE_IN_OUT, fill: 'both' }
        );
        this.queueAdvanceArtworkAnimation = animation;
        animation.onfinish = () => {
            if (this.queueAdvanceArtworkAnimation !== animation) return;
            target.element.style.removeProperty('opacity');
            morph.remove();
            this.queueAdvanceArtworkAnimation = null;
            this.queueAdvanceArtworkTarget = null;
            this.queueAdvanceArtworkMorph = null;
            this.queueAdvanceArtworkPreview?.remove();
            this.queueAdvanceArtworkContainer?.classList.remove('is-morphing');
            this.queueAdvanceArtworkPreview = null;
            this.queueAdvanceArtworkContainer = null;
            animation.cancel();
        };
    }

    clearQueueAdvanceArtworkAnimation() {
        this.queueAdvanceArtworkAnimation?.cancel?.();
        this.queueAdvanceArtworkMorph?.remove();
        this.queueAdvanceArtworkPreview?.remove();
        this.queueAdvanceArtworkAnimation = null;
        this.queueAdvanceArtworkTarget?.style.removeProperty('opacity');
        this.queueAdvanceArtworkTarget = null;
        this.queueAdvanceArtworkMorph = null;
        this.queueAdvanceArtworkContainer?.classList.remove('is-morphing');
        this.queueAdvanceArtworkPreview = null;
        this.queueAdvanceArtworkContainer = null;
    }

    renderQueueOpeningShell() {
        if (!this.queueLayer) return;
        const queue = this.player?.getCurrentQueue?.() || [];
        const currentIndex = Number(this.player?.currentQueueIndex ?? -1);
        const currentTrack = this.currentTrack || queue[currentIndex] || null;
        const artwork = getTrackPlayerArtwork(currentTrack);
        const image = artwork
            ? /^(?:data:|blob:|https?:|\/)/i.test(String(artwork))
                ? String(artwork)
                : this.api?.getCoverUrl?.(artwork) || String(artwork)
            : '/assets/appicon.png';
        const title = getTrackTitle(currentTrack, { fallback: 'Unknown title' });
        const artist = getTrackArtists(currentTrack, { fallback: 'Unknown artist' });
        const sourceLabel = this.sourceContext?.label || 'current queue';
        const source = this.sourceContext?.href
            ? `<button type="button" class="queue-source-link" data-queue-source-href="${escapeHtml(this.sourceContext.href)}">${escapeHtml(sourceLabel)}</button>`
            : `<span class="queue-source-link">${escapeHtml(sourceLabel)}</span>`;
        const currentMarkup = currentTrack
            ? `<div class="queue-playing-row">
                <div class="queue-current-artwork"><img src="${escapeHtml(image)}" alt="" loading="eager" /></div>
                <div class="queue-current-copy"><span class="queue-current-label">Now playing</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(artist)}</p></div>
            </div>`
            : '<div class="queue-playing-row queue-playing-row-empty"><div class="queue-current-artwork queue-empty-artwork">—</div><div class="queue-current-copy"><span class="queue-current-label">Now playing</span><strong>Nothing is playing</strong></div></div>';
        this.queueLayer.innerHTML = `<div class="now-playing-panel-queue-view queue-motion-open" aria-labelledby="queue-panel-title"><header class="queue-panel-header"><div class="queue-header-title"><h1 id="queue-panel-title">Play queue</h1></div><button type="button" class="queue-close-button" aria-label="Close queue">${icon('x', 18)}</button></header><main class="queue-panel-body"><section class="queue-playing-section" aria-labelledby="queue-playing-title"><div class="queue-section-heading"><h2 id="queue-playing-title">Playing from: ${source}</h2><button type="button" class="queue-clear-button" disabled>Clear</button></div>${currentMarkup}</section></main></div>`;
        this.queueLayer.hidden = false;
    }

    startQueueOpening(transition) {
        if (!this.queueLayer || !transition || transition.token !== this.queueTransitionToken) return;
        if (this.queueOpeningScheduled) return;
        const target = this.measureQueueCoverTarget();
        const source = transition.source;
        if (!target || this.reducedMotionMedia.matches) {
            this.queueTransition = null;
            this.queueLayer.classList.add('is-visible');
            this.queueLayer.style.setProperty('transform', 'translate3d(0, 0, 0)');
            this.queueLayer.style.setProperty('opacity', '1');
            this.syncQueueLayerState();
            this.restoreQueueCoverSource();
            this.root.classList.remove('is-queue-opening');
            return;
        }
        target.element.style.opacity = '0';
        this.queueCoverTarget = target.element;
        this.queueOpeningScheduled = true;
        requestAnimationFrame(() => {
            if (
                transition.token !== this.queueTransitionToken ||
                this.activeView !== 'queue' ||
                this.root.classList.contains('is-queue-closing')
            ) {
                this.queueOpeningScheduled = false;
                this.cancelQueueCoverAnimation();
                return;
            }
            this.queueTransition = null;
            this.queueOpeningScheduled = false;
            this.hideQueueCoverSource();
            this.queueLayer.classList.add('is-visible');
            this.syncQueueLayerState();
            this.animateQueueLayer(
                this.getQueueLayerHeight(),
                0,
                QUEUE_OPEN_DURATION,
                transition.token,
                () => this.finishQueueOpening(transition.token),
                'opening'
            );
            this.animateQueueCover(source, target, transition.token, 'opening');
        });
    }

    reopenQueueTransition() {
        if (!this.queueLayer || !this.root.classList.contains('is-queue-closing')) return;
        const source = this.captureQueueCover(this.queueCoverMorph || this.getQueueCoverElement());
        const layerState = this.freezeQueueMotion();
        const transitionToken = ++this.queueTransitionToken;
        this.queueOpeningScheduled = true;
        const target = this.measureQueueCoverTarget();
        this.queueTransition = { type: 'opening', source, token: transitionToken };
        this.root.classList.remove('is-queue-closing');
        this.root.classList.add('is-queue-opening');
        this.queueLayer.classList.remove('is-closing');
        this.queueLayer.classList.add('is-visible');
        this.syncQueueLayerState();
        if (target && !this.reducedMotionMedia.matches) {
            target.element.style.opacity = '0';
            this.queueCoverTarget = target.element;
            requestAnimationFrame(() => {
                if (transitionToken !== this.queueTransitionToken || this.activeView !== 'queue') {
                    this.queueOpeningScheduled = false;
                    return;
                }
                this.queueTransition = null;
                this.queueOpeningScheduled = false;
                this.hideQueueCoverSource();
                this.animateQueueLayer(
                    layerState.offsetY,
                    layerState.opacity,
                    QUEUE_OPEN_DURATION,
                    transitionToken,
                    () => this.finishQueueOpening(transitionToken),
                    'opening'
                );
                this.animateQueueCover(source, target, transitionToken, 'opening');
            });
        } else {
            this.queueTransition = null;
            this.queueOpeningScheduled = false;
            this.queueLayer.style.setProperty('transform', 'translate3d(0, 0, 0)');
            this.queueLayer.style.setProperty('opacity', '1');
        }
    }

    getQueueLayerHeight() {
        return this.root?.getBoundingClientRect().height || this.queueLayer?.getBoundingClientRect().height || 0;
    }

    getQueueLayerOffset() {
        if (!this.root || !this.queueLayer) return { offsetY: this.getQueueLayerHeight(), opacity: 0 };
        const rootRect = this.root.getBoundingClientRect();
        const layerRect = this.queueLayer.getBoundingClientRect();
        return {
            offsetY: Math.max(0, Math.min(this.getQueueLayerHeight(), layerRect.top - rootRect.top)),
            opacity: Number(getComputedStyle(this.queueLayer).opacity) || 0,
        };
    }

    animateQueueLayer(fromY, fromOpacity, duration, token, onfinish, direction) {
        if (!this.queueLayer || token !== this.queueTransitionToken) return;
        const toY = direction === 'closing' ? this.getQueueLayerHeight() : 0;
        const toOpacity = direction === 'closing' ? 0 : 1;
        const animation = this.queueLayer.animate(
            [
                { transform: `translate3d(0, ${fromY}px, 0)`, opacity: fromOpacity },
                { transform: `translate3d(0, ${toY}px, 0)`, opacity: toOpacity },
            ],
            { duration, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'both' }
        );
        this.queueLayerAnimation = animation;
        animation.onfinish = () => {
            if (token !== this.queueTransitionToken) return;
            this.queueLayer.style.setProperty('transform', `translate3d(0, ${toY}px, 0)`);
            this.queueLayer.style.setProperty('opacity', String(toOpacity));
            animation.cancel();
            this.queueLayerAnimation = null;
            onfinish?.();
        };
    }

    finishQueueOpening(token) {
        if (token !== this.queueTransitionToken || this.activeView !== 'queue') return;
        this.root.classList.remove('is-queue-opening');
        this.queueTransition = null;
        const finish = () => {
            if (token !== this.queueTransitionToken || this.activeView !== 'queue') return;
            if (this.queueLayerRefreshPending) {
                this.queueLayerRefreshPending = false;
                const scrollTop = this.queueLayer.querySelector('.now-playing-panel-queue-view')?.scrollTop || 0;
                requestAnimationFrame(() => {
                    if (token === this.queueTransitionToken && this.activeView === 'queue') {
                        this.renderQueueLayer(this.model || {}, scrollTop);
                    }
                });
            }
        };
        const coverAnimation = this.queueCoverAnimation;
        if (coverAnimation?.finished?.then) {
            coverAnimation.finished.then(finish, finish);
            return;
        }
        finish();
    }

    freezeQueueMotion() {
        const state = this.getQueueLayerOffset();
        if (this.queueLayerAnimation) {
            this.queueLayerAnimation.onfinish = null;
            this.queueLayerAnimation.cancel();
            this.queueLayerAnimation = null;
        }
        this.queueLayer.style.setProperty('transform', `translate3d(0, ${state.offsetY}px, 0)`);
        this.queueLayer.style.setProperty('opacity', String(state.opacity));
        this.clearQueueCoverAnimation();
        return state;
    }

    animateQueueCover(source, target, token, direction) {
        if (!this.root || !target?.element || token !== this.queueTransitionToken) return;
        const finish = () => {
            if (token !== this.queueTransitionToken) return;
            target.element.style.removeProperty('opacity');
            if (this.queueCoverMorph) this.queueCoverMorph.remove();
            this.queueCoverMorph = null;
            this.queueCoverAnimation = null;
            this.queueCoverTarget = null;
        };
        if (!source || !source.src || this.reducedMotionMedia.matches) {
            finish();
            if (direction === 'opening') this.restoreQueueCoverSource();
            return;
        }
        const rootRect = this.root.getBoundingClientRect();
        const fromX = source.rect.left - rootRect.left;
        const fromY = source.rect.top - rootRect.top;
        const toX = target.rect.left - rootRect.left;
        const toY = target.rect.top - rootRect.top;
        const scaleX = target.rect.width / source.rect.width;
        const scaleY = target.rect.height / source.rect.height;
        const morph = document.createElement('img');
        morph.className = 'now-playing-panel-queue-cover-morph';
        morph.src = source.src;
        morph.alt = '';
        morph.setAttribute('aria-hidden', 'true');
        morph.draggable = false;
        morph.style.left = `${fromX}px`;
        morph.style.top = `${fromY}px`;
        morph.style.width = `${source.rect.width}px`;
        morph.style.height = `${source.rect.height}px`;
        morph.style.borderRadius = source.borderRadius;
        this.root.append(morph);
        this.queueCoverMorph = morph;
        const destination = `translate3d(${toX - fromX}px, ${toY - fromY}px, 0) scale(${scaleX}, ${scaleY})`;
        const duration = direction === 'closing' ? QUEUE_CLOSE_DURATION : QUEUE_COVER_DURATION;
        if (typeof morph.animate !== 'function') {
            morph.style.transform = destination;
            window.setTimeout(finish, duration);
            return;
        }
        this.queueCoverAnimation = morph.animate(
            [
                { transform: 'translate3d(0, 0, 0) scale(1, 1)', opacity: 1 },
                { transform: destination, opacity: 1 },
            ],
            {
                duration,
                easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
                fill: 'both',
            }
        );
        this.queueCoverAnimation.onfinish = finish;
    }

    clearQueueLayerAnimation() {
        this.queueLayerAnimation?.cancel?.();
        this.queueLayerAnimation = null;
    }

    clearQueueCoverAnimation() {
        this.queueCoverAnimation?.cancel?.();
        this.queueCoverAnimation = null;
        this.queueCoverMorph?.remove();
        this.queueCoverMorph = null;
        this.queueCoverTarget?.style.removeProperty('opacity');
        this.queueCoverTarget = null;
        this.queueCoverClosingTarget?.style.removeProperty('opacity');
        this.queueCoverClosingTarget = null;
    }

    cancelQueueCoverAnimation() {
        this.clearQueueCoverAnimation();
    }

    renderQueue(model = {}) {
        const queue = this.player?.getCurrentQueue?.() || [];
        const currentIndex = Number(this.player?.currentQueueIndex ?? -1);
        const currentTrack = this.currentTrack || queue[currentIndex] || null;
        const fallbackNext = model.nextTrack && !queue.length ? [model.nextTrack] : [];
        const upNext = (queue.length ? queue.slice(Math.max(0, currentIndex + 1)) : fallbackNext).filter(Boolean);
        const queueDuration = upNext.reduce((total, track) => total + (Number(track.duration) || 0), 0);
        const durationLabel =
            queueDuration > 0 ? this.formatQueueTime(queueDuration) : upNext.length ? 'duration unavailable' : '0 min';
        const isLooping = this.player?.repeatMode === QUEUE_REPEAT_ALL;
        const transitionMode = this.getTransitionMode();
        const media = this.player?.activeElement;
        const isPaused = media?.paused !== false;
        const motionReason = this.queueMotionReason || 'refresh';
        // A model refresh (for example playback state or metadata) must not
        // replay the list entrance. Only a structural queue change owns row motion.
        const rowMotionStyle = '';
        const staticRowClass = this.queueRowsStatic || motionReason === 'refresh' ? ' queue-track-row-static' : '';
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
        const sourceLabel =
            this.sourceContext?.label && this.sourceContext.label !== 'Now playing'
                ? this.sourceContext.label
                : 'current queue';
        const sourceContext =
            this.sourceContext?.kind === 'album'
                ? `Continuing ${sourceLabel}`
                : this.sourceContext?.kind === 'playlist'
                  ? `From ${sourceLabel}`
                  : sourceLabel;
        const sourceLink = this.sourceContext?.href
            ? `<button type="button" class="queue-source-link" data-queue-source-href="${escapeHtml(this.sourceContext.href)}">${escapeHtml(sourceLabel)}</button>`
            : `<span class="queue-source-link">${escapeHtml(sourceLabel)}</span>`;
        const emptyQueueCopy =
            (this.player?.repeatMode ?? 0) === 0 && (this.player?.autoplayEnabled || this.player?.radioEnabled)
                ? 'Related songs will be added when available.'
                : isLooping
                  ? `Loop queue will restart ${sourceLabel}.`
                  : this.sourceContext?.kind === 'album'
                    ? `End of ${sourceLabel}. Playback stops here.`
                    : 'Playback stops when this queue ends.';
        const currentMarkup = currentTrack
            ? `<div class="queue-playing-row">
                <div class="queue-current-artwork"><img src="${escapeHtml(imageFor(currentTrack))}" alt="" loading="eager" /></div>
                <div class="queue-current-copy"><span class="queue-current-label">Now playing</span><strong id="queue-current-title">${escapeHtml(titleFor(currentTrack))}</strong><p>${escapeHtml(artistFor(currentTrack))}</p></div>
                <button type="button" class="queue-current-state" data-queue-playback-toggle aria-label="${isPaused ? 'Play' : 'Pause'}" aria-pressed="${String(!isPaused)}">${icon(isPaused ? 'play' : 'pause', 17)}</button>
            </div>`
            : `<div class="queue-playing-row queue-playing-row-empty"><div class="queue-empty-artwork">${icon('list-music', 20)}</div><div class="queue-current-copy"><span class="queue-current-label">Now playing</span><strong id="queue-current-title">Nothing playing</strong><p>Start a track to build your queue.</p></div></div>`;
        const rows = upNext.length
            ? upNext
                  .map((track, offset) => {
                      const index = currentIndex + offset + 1;
                      const queuedMode = this.manuallyQueuedTracks.get(String(track.id));
                      const isPinnedNext = queuedMode === 'next';
                      const isManualQueue = queuedMode === 'queue';
                      const rowClass = `queue-track-row${staticRowClass}${isPinnedNext ? ' is-pinned-next' : ''}${isManualQueue ? ' is-manually-queued' : ''}`;
                      const badge = isPinnedNext
                          ? `<span class="queue-track-badge">${icon('sparkles', 11)} Pinned next</span>`
                          : isManualQueue
                            ? '<span class="queue-track-badge">Added to queue</span>'
                            : '';
                      return `<div class="${rowClass}" style="--queue-order:${offset};--queue-delay:${Math.min(offset, 12) * 34}ms;${rowMotionStyle}" data-track-id="${escapeHtml(String(track.id))}" data-queue-index="${index}" data-draggable="${String(Boolean(queue.length))}" draggable="${String(Boolean(queue.length))}"><button type="button" class="queue-track-main" data-queue-index="${index}" ${queue.length ? '' : 'data-play-next'} aria-label="Play ${escapeHtml(titleFor(track))}"><img src="${escapeHtml(imageFor(track))}" alt="" loading="lazy" /><span class="queue-track-copy">${badge}<strong>${escapeHtml(titleFor(track))}</strong><small>${escapeHtml(artistFor(track))}</small></span></button><button type="button" class="queue-track-remove" data-remove-queue-index="${index}" aria-label="Remove ${escapeHtml(titleFor(track))} from queue">${icon('x', 16)}</button><span class="queue-drag-handle" aria-label="Drag ${escapeHtml(titleFor(track))} to reorder" title="Drag to reorder">${icon('grip', 16)}</span></div>`;
                  })
                  .join('')
            : `<div class="queue-list-empty"><span>${icon('list-music', 18)}</span><strong>Nothing else is lined up</strong><p>${escapeHtml(emptyQueueCopy)}</p></div>`;
        const historyRows = this.queueHistory.length
            ? [...this.queueHistory]
                  .reverse()
                  .map(
                      (track, offset) =>
                          `<div class="queue-track-row queue-history-row${staticRowClass}" data-track-id="${escapeHtml(String(track.id))}" style="--queue-order:${offset};--queue-delay:${Math.min(offset, 12) * 34}ms;${rowMotionStyle}"><div class="queue-track-main queue-history-main"><img src="${escapeHtml(imageFor(track))}" alt="" loading="lazy" /><span><strong>${escapeHtml(titleFor(track))}</strong><small>${escapeHtml(artistFor(track))}</small></span></div></div>`
                  )
                  .join('')
            : `<div class="queue-list-empty"><span>${icon('history', 18)}</span><strong>No history yet</strong><p>Only tracks played in this queue appear here.</p></div>`;
        const listMarkup =
            this.queueView === 'history'
                ? `<section class="queue-list-section" aria-labelledby="queue-history-title"><div class="queue-list-heading"><div><h2 id="queue-history-title">History</h2><p>${this.queueHistory.length} ${this.queueHistory.length === 1 ? 'track' : 'tracks'} · this queue only</p></div></div><div class="queue-track-list queue-history-list">${historyRows}</div></section>`
                : `<section class="queue-list-section" aria-labelledby="queue-up-next-title"><div class="queue-list-heading"><div><h2 id="queue-up-next-title">Next Up from ${sourceLink}</h2><p>${upNext.length} ${upNext.length === 1 ? 'track' : 'tracks'} <span aria-hidden="true">·</span> ${escapeHtml(durationLabel)} <span class="queue-source-context">· ${escapeHtml(sourceContext)}</span></p></div><button type="button" class="queue-loop-button queue-list-loop-button${isLooping ? ' is-active' : ''}" aria-pressed="${String(isLooping)}" aria-label="${isLooping ? 'Disable loop queue' : 'Loop queue'}" title="${isLooping ? 'Disable loop queue' : 'Loop queue'}">${icon('repeat', 15)}</button></div><div class="queue-track-list">${rows}</div></section>`;
        const endlessUnavailable = (this.player?.repeatMode ?? 0) !== 0;
        const endlessPressed = !!(this.player?.autoplayEnabled || this.player?.radioEnabled) && !endlessUnavailable;
        const viewLabel = this.queueView === 'history' ? 'Back to queue' : 'Recently played';
        const viewIcon = this.queueView === 'history' ? 'list-music' : 'history';
        return `<div class="now-playing-panel-queue-view queue-motion-${motionReason}" aria-labelledby="queue-panel-title"><header class="queue-panel-header"><div class="queue-header-title"><h1 id="queue-panel-title">${this.queueView === 'history' ? 'Recently played' : 'Play queue'}</h1><button type="button" class="queue-view-switch" data-queue-view="${this.queueView === 'history' ? 'up-next' : 'history'}" aria-label="${viewLabel}" title="${viewLabel}">${icon(viewIcon, 17)}</button></div><button type="button" class="queue-close-button" aria-label="Close queue">${icon('x', 18)}</button></header><main class="queue-panel-body">${this.queueView === 'history' ? '' : `<section class="queue-playing-section" aria-labelledby="queue-playing-title"><div class="queue-section-heading"><h2 id="queue-playing-title">Playing from: ${sourceLink}</h2><button type="button" class="queue-clear-button" data-queue-clear${upNext.length ? '' : ' disabled'}>Clear</button></div>${currentMarkup}</section><div class="queue-quick-actions" aria-label="Queue settings"><button type="button" role="switch" class="queue-quick-action queue-endless-card${endlessPressed ? ' is-enabled' : ''}${endlessUnavailable ? ' is-unavailable' : ''}" data-endless-toggle aria-pressed="${String(endlessPressed)}" aria-checked="${String(endlessPressed)}"><span class="queue-setting-copy"><span class="queue-setting-icon">${icon('infinity', 19)}</span><span><span class="queue-quick-label">Endless playback</span>${endlessUnavailable ? '<span class="queue-quick-status">Paused while repeat is on</span>' : ''}</span></span><span class="queue-switch" aria-hidden="true"><span class="queue-switch-thumb"></span></span></button>${this.renderQueueTransitionCard(transitionMode)}</div>`}${listMarkup}</main></div>`;
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
        const option = (mode, label, detail) =>
            `<button type="button" class="queue-transition-option${selectedMode === mode ? ' is-selected' : ''}" data-transition-mode="${mode}" aria-pressed="${String(selectedMode === mode)}"><span>${label}</span><small>${detail}</small>${selectedMode === mode ? '<span class="queue-option-check" aria-hidden="true"></span>' : ''}</button>`;
        return `<div id="queue-transition-menu" class="queue-transition-menu"${this.transitionMenuOpen ? '' : ' hidden'}><div class="queue-transition-options">${option('gapless', 'Gapless', 'No space between tracks')}${option('standard', 'Standard', 'A short second of delay')}${option('crossfade', 'Crossfade', `${crossfadeSettings.getDuration()} second blend`)}</div>${selectedMode === 'crossfade' ? `<label class="queue-crossfade-control"><span>Crossfade length</span><output id="queue-crossfade-value" for="queue-crossfade-duration">${crossfadeSettings.getDuration()} s</output><input id="queue-crossfade-duration" type="range" min="1" max="12" step="1" value="${crossfadeSettings.getDuration()}" aria-label="Crossfade length" /></label>` : ''}</div>`;
    }

    renderQueueTransitionCard(transitionMode = this.getTransitionMode()) {
        return `<div class="queue-transition-card${this.transitionMenuOpen ? ' is-open' : ''}"><button type="button" class="queue-quick-action queue-transition-trigger" aria-expanded="${String(this.transitionMenuOpen)}" aria-controls="queue-transition-menu"><span class="queue-setting-icon">${icon('sliders', 17)}</span><span class="queue-transition-copy"><span class="queue-quick-label">Transition</span><small class="queue-transition-summary">${this.getTransitionSummary(transitionMode)}</small></span>${icon('chevron-right', 15)}</button>${this.renderTransitionMenu(transitionMode)}</div>`;
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
        stage.classList.toggle(
            'is-canvas-playing',
            this.canvasEnabled && video.dataset.canvasReady === 'true' && !reducedMotion && !video.paused
        );
        if (shouldPlay) {
            void video
                .play()
                .then(() => {
                    if (video === this.canvasMedia && video.isConnected) stage.classList.add('is-canvas-playing');
                })
                .catch(() => this.boundCanvasPlaybackInterrupted());
        } else {
            video.pause();
            stage.classList.remove('is-canvas-playing');
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
        const renderLyrics = this.expandedLyrics ? renderLyricsInNowPanel : renderLyricsInContainer;
        const element = await renderLyrics(this.currentTrack, this.player.activeElement, this.lyricsManager, host, {
            signal,
        });
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
        expand?.setAttribute('aria-label', this.expandedLyrics ? 'Collapse lyrics panel' : 'Expand lyrics in panel');
        const collapse = this.root.querySelector('.now-playing-panel-lyrics-collapse');
        collapse?.setAttribute('aria-expanded', String(!this.collapsedLyrics));
        collapse?.setAttribute(
            'aria-label',
            this.expandedLyrics
                ? 'Return to lyrics preview'
                : this.collapsedLyrics
                  ? 'Show lyrics preview'
                  : 'Hide lyrics preview'
        );
        this.applyCanvasMode();
        this.syncCanvasPlayback();
    }

    beginLyricsTransition(direction) {
        const token = ++this.lyricsTransitionToken;
        this.root.classList.remove('lyrics-expanding', 'lyrics-collapsing');
        this.root.classList.add(
            'lyrics-transitioning',
            direction === 'expand' ? 'lyrics-expanding' : 'lyrics-collapsing'
        );
        return token;
    }

    finishLyricsTransition(token) {
        if (token !== this.lyricsTransitionToken) return;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (token !== this.lyricsTransitionToken) return;
                this.root.classList.remove('lyrics-transitioning', 'lyrics-expanding', 'lyrics-collapsing');
            });
        });
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
            const transitionToken = this.beginLyricsTransition('expand');
            void this.render({ preserveScroll: true }).then(() => {
                this.finishLyricsTransition(transitionToken);
                this.root.querySelector('.now-playing-panel-lyrics-collapse')?.focus();
            });
            return;
        }
        if (button.matches('.now-playing-panel-lyrics-collapse')) {
            if (this.expandedLyrics) {
                this.expandedLyrics = false;
                this.collapsedLyrics = false;
                const transitionToken = this.beginLyricsTransition('collapse');
                void this.render({ preserveScroll: true }).then(() => {
                    this.finishLyricsTransition(transitionToken);
                    this.root.querySelector('.now-playing-panel-lyrics-expand')?.focus();
                });
            } else {
                this.collapsedLyrics = !this.collapsedLyrics;
                this.applyLyricsMode();
            }
            return;
        }
        if (button.matches('.queue-close-button')) return this.closeQueue();
        if (button.matches('.queue-view-switch')) {
            const nextView = button.dataset.queueView || 'up-next';
            if (nextView === this.queueView) return;
            this.queueView = nextView;
            this.queueMotionReason = 'view';
            return void this.renderQueueControls({ preserveScroll: true });
        }
        if (button.matches('.queue-source-link') && button.dataset.queueSourceHref)
            return navigate(button.dataset.queueSourceHref);
        if (button.matches('[data-queue-clear]')) {
            if (!this.player?.clearQueue || !this.player.getCurrentQueue?.().length) return;
            this.queueMotionReason = 'clear';
            await this.player.clearQueue();
            showNotification('Queue cleared');
            return;
        }
        if (button.matches('[data-queue-playback-toggle]')) {
            const primaryControl = document.querySelector('.now-playing-bar .play-pause-btn');
            if (primaryControl) primaryControl.click();
            else if (this.player?.activeElement?.paused) await this.player.activeElement.play?.();
            else this.player?.activeElement?.pause?.();
            this.syncQueuePlaybackButtons();
            return;
        }
        if (button.matches('[data-endless-toggle]')) {
            if ((this.player?.repeatMode ?? 0) !== 0) {
                return;
            }
            if (this.player.autoplayEnabled || this.player.radioEnabled) {
                this.player.disableRadio();
                this.player.disableAutoplay();
            } else {
                this.player.enableAutoplay();
                const queue = this.player.getCurrentQueue();
                if (this.player.currentQueueIndex >= queue.length - 3 && queue.length) {
                    void this.player.fetchAutoplayRecommendations();
                }
            }
            this.syncEndlessButton();
            this.root.querySelector('[data-endless-toggle]')?.focus({ preventScroll: true });
            return;
        }
        if (button.matches('.queue-transition-trigger')) {
            this.transitionMenuOpen = !this.transitionMenuOpen;
            const transitionCard = button.closest('.queue-transition-card');
            const transitionMenu = transitionCard?.querySelector('.queue-transition-menu');
            window.clearTimeout(this.queueTransitionCloseTimer);
            if (this.transitionMenuOpen) transitionMenu?.removeAttribute('hidden');
            transitionCard?.classList.toggle('is-open', this.transitionMenuOpen);
            button.setAttribute('aria-expanded', String(this.transitionMenuOpen));
            if (!this.transitionMenuOpen) {
                this.queueTransitionCloseTimer = window.setTimeout(() => {
                    if (!this.transitionMenuOpen) transitionMenu?.setAttribute('hidden', '');
                }, 240);
            }
            return;
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
            this.queueMotionReason = 'remove';
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
        if (button.matches('.now-playing-panel-open-queue')) return this.openQueue();
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
        const control = event.target.closest('.queue-crossfade-control');
        control?.classList.add('is-adjusting');
        window.clearTimeout(this.queueCrossfadeAnimationTimer);
        this.queueCrossfadeAnimationTimer = window.setTimeout(() => control?.classList.remove('is-adjusting'), 180);
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

    syncEndlessButton() {
        const button = this.root?.querySelector('[data-endless-toggle]');
        if (!button) return;
        const unavailable = (this.player?.repeatMode ?? 0) !== 0;
        const enabled = Boolean(this.player?.autoplayEnabled || this.player?.radioEnabled) && !unavailable;
        button.classList.toggle('is-enabled', enabled);
        button.classList.toggle('is-unavailable', unavailable);
        button.setAttribute('aria-pressed', String(enabled));
        button.setAttribute('aria-checked', String(enabled));
        const status = button.querySelector('.queue-quick-status');
        if (unavailable && !status) {
            const copy = button.querySelector('.queue-setting-copy > span:last-child');
            copy?.insertAdjacentHTML('beforeend', '<span class="queue-quick-status">Paused while repeat is on</span>');
        } else if (!unavailable) {
            status?.remove();
        }
    }

    renderQueueControls({ preserveScroll = true } = {}) {
        if (this.activeView !== 'queue' || !this.queueLayer) return;
        const queueView = this.queueLayer.querySelector('.now-playing-panel-queue-view');
        const previousScroll = preserveScroll ? queueView?.scrollTop || 0 : 0;
        const motionReason = this.queueMotionReason || 'refresh';
        this.queueRowsStatic = !['advance', 'insert', 'remove', 'clear', 'reorder'].includes(motionReason);
        if (queueView) {
            this.renderQueueLayer(this.model || {}, previousScroll, { startTransition: false });
        } else if (this.content?.querySelector('.now-playing-panel-queue-view')) {
            this.content.innerHTML = this.renderQueueView(this.model || {});
            this.content.querySelector('.now-playing-panel-queue-view').scrollTop = previousScroll;
        }
        this.queueRowsStatic = false;
        this.syncQueueLoopButton();
    }

    isQueueLooping() {
        return this.player?.repeatMode === QUEUE_REPEAT_ALL;
    }

    syncQueueLoopButton({ animate = false } = {}) {
        const looping = this.isQueueLooping();
        const repeatButtons = [
            document.getElementById('repeat-btn'),
            document.getElementById('fs-repeat-btn'),
            this.root?.querySelector('.queue-list-loop-button'),
        ];
        for (const button of repeatButtons) {
            if (!button) continue;
            button.classList.toggle('active', looping);
            button.classList.toggle('is-active', looping);
            button.classList.remove('repeat-one');
            button.setAttribute('aria-pressed', String(looping));
            if (button.matches('.queue-list-loop-button')) {
                button.title = looping ? 'Disable loop queue' : 'Loop queue';
                button.setAttribute('aria-label', looping ? 'Disable loop queue' : 'Loop queue');
            } else {
                button.title = looping ? 'Repeat queue · Loop queue enabled' : 'Repeat off';
                button.setAttribute('aria-label', looping ? 'Repeat queue enabled' : 'Turn repeat on');
            }
            if (animate) {
                button.classList.remove('icon-activated');
                void button.offsetWidth;
                button.classList.add('icon-activated');
            }
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
        this.syncQueueLoopButton({ animate: true });
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
        const transitionCard = this.root?.querySelector('.queue-transition-card');
        const triggerHadFocus = document.activeElement === transitionCard?.querySelector('.queue-transition-trigger');
        if (!transitionCard) return;
        transitionCard.outerHTML = this.renderQueueTransitionCard(this.getTransitionMode());
        const nextCard = this.root?.querySelector('.queue-transition-card');
        const nextSelectedOption = nextCard?.querySelector(`[data-transition-mode="${mode}"]`);
        nextCard?.classList.add('is-changing');
        nextSelectedOption?.classList.add('is-changing');
        window.clearTimeout(this.queueTransitionChangeTimer);
        this.queueTransitionChangeTimer = window.setTimeout(() => {
            nextCard?.classList.remove('is-changing');
            nextSelectedOption?.classList.remove('is-changing');
        }, 280);
        if (triggerHadFocus) nextCard?.querySelector('.queue-transition-trigger')?.focus({ preventScroll: true });
    }

    handleKeydown(event) {
        if (event.defaultPrevented || event.isComposing) return;
        const row = event.target.closest('.queue-track-row[data-queue-index]');
        if (row && !event.target.closest('input, textarea, select, [contenteditable="true"]')) {
            const direction = matchesShortcut(event, keyboardShortcuts.getShortcutForAction('moveTrackUp'))
                ? -1
                : matchesShortcut(event, keyboardShortcuts.getShortcutForAction('moveTrackDown'))
                  ? 1
                  : 0;
            if (direction) {
                event.preventDefault();
                event.stopPropagation();
                const from = Number(row.dataset.queueIndex);
                const to = from + direction;
                if (event.repeat || to <= this.player.currentQueueIndex || to >= this.player.getCurrentQueue().length)
                    return;
                void (async () => {
                    this.queueMotionReason = 'reorder';
                    await this.player.moveInQueue(from, to);
                    await this.render({ preserveScroll: true });
                    this.root
                        .querySelector(`.queue-track-main[data-queue-index="${to}"]`)
                        ?.focus({ preventScroll: true });
                })().catch(() => showNotification('Could not reorder the queue. Try again.'));
                return;
            }
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            if (this.activeView === 'queue') {
                this.closeQueue();
            } else if (this.expandedLyrics) {
                this.expandedLyrics = false;
                this.collapsedLyrics = false;
                const transitionToken = this.beginLyricsTransition('collapse');
                void this.render({ preserveScroll: true }).then(() => this.finishLyricsTransition(transitionToken));
            } else {
                this.setOpen(false);
            }
            return;
        }
    }

    destroy() {
        this.renderController?.abort();
        window.clearTimeout(this.queueViewTimer);
        window.clearTimeout(this.queueTransitionCloseTimer);
        window.clearTimeout(this.queueTransitionChangeTimer);
        window.clearTimeout(this.queueCrossfadeAnimationTimer);
        ++this.queueTransitionToken;
        this.queueOpeningScheduled = false;
        this.clearQueueLayerAnimation();
        this.cancelQueueListAnimation();
        this.clearQueueAdvanceArtworkAnimation();
        this.cancelQueueCoverAnimation();
        this.restoreQueueCoverSource();
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
        this.queueLayer?.remove();
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
        window.removeEventListener('player-repeat-changed', this.boundRepeatChanged);
        window.removeEventListener('autoplay-state-changed', this.boundTransitionChanged);
        window.removeEventListener('radio-state-changed', this.boundTransitionChanged);
        window.removeEventListener('queue-tracks-added', this.boundQueueTracksAdded);
        window.removeEventListener('track-metadata-updated', this.boundMetadataChanged);
        window.removeEventListener('artist-metadata-updated', this.boundMetadataChanged);
        window.removeEventListener('listening-data-updated', this.boundListeningChanged);
    }
}
