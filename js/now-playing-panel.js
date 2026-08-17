import { mountSpicyDynamicBackground } from './spicy-dynamic-background.js';
import { buildNowPlayingPanelModel, normalizeSourceContext } from './now-playing-panel-model.js';
import { clearLyricsContainerSync, renderLyricsInContainer } from './lyrics.js';
import { createTrackSaveIconHTML } from './track-save-ui.js';
import { escapeHtml, getShareUrl } from './utils.js';
import { isVideoArtwork, renderArtworkElement } from './animated-artwork.js';
import { navigate } from './router.js';
import { showNotification } from './downloads.js';
import { db } from './db.js';
import { syncManager } from './accounts/pocketbase.js';
import { audioContextManager } from './audio-context.js';
import { listeningTracker } from './listening-tracker.js';
import { canvasSettings } from './canvas-settings.js';
import { getTrackDisplayAlbum, getTrackPlayerArtwork } from './track-versions.js';
import ICON_CHEVRON_RIGHT from '!lucide/chevron-right.svg?svg&icon';
import ICON_CHEVRON_UP from '!lucide/chevron-up.svg?svg&icon';
import ICON_ELLIPSIS from '!lucide/ellipsis.svg?svg&icon';
import ICON_HEART from '!lucide/heart.svg?svg&icon';
import ICON_MAXIMIZE from '!lucide/maximize-2.svg?svg&icon';
import ICON_MONITOR_UP from '!lucide/monitor-up.svg?svg&icon';
import ICON_SHARE from '!lucide/share-2.svg?svg&icon';
import ICON_CLOSE from '!lucide/x.svg?svg&icon';

const DESKTOP_PANEL_QUERY = '(min-width: 769px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CANVAS_LOAD_TIMEOUT = 20000;
const CANVAS_RETRY_DELAY = 240;
const TRACK_FADE_OUT_DURATION = 180;
const MISSING_BIOGRAPHY = 'No biography is available for this artist yet.';

function icon(name, size = 20) {
    const icons = {
        'chevron-right': ICON_CHEVRON_RIGHT,
        'chevron-up': ICON_CHEVRON_UP,
        ellipsis: ICON_ELLIPSIS,
        heart: ICON_HEART,
        'maximize-2': ICON_MAXIMIZE,
        'monitor-up': ICON_MONITOR_UP,
        'share-2': ICON_SHARE,
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
        this.sourceContext = normalizeSourceContext(player?.sourceContext);
        this.currentTrack = player?.currentTrack || null;
        this.model = null;
        this.renderController = null;
        this.expandedLyrics = false;
        this.collapsedLyrics = false;
        this.canvasExpanded = false;
        this.canvasEnabled = canvasSettings.isEnabled();
        this.scrollByTrack = new Map();
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
        this.canvasRetryTimer = null;
        this.canvasRetryCount = 0;
        this.canvasPlaybackElement = null;
        this.reducedMotionMedia = matchMedia(REDUCED_MOTION_QUERY);
        this.background?.connectPlayback?.({
            getElement: () => this.player?.activeElement,
            getAnalyser: () => audioContextManager.getAnalyser(),
        });
        this.boundTrackChanged = (event) => {
            this.currentTrack = event.detail?.track || null;
            this.canvasExpanded = false;
            void this.render();
        };
        this.boundCanvasChanged = (event) => {
            if (String(event.detail?.trackId) !== String(this.currentTrack?.id)) return;
            Object.assign(this.currentTrack, event.detail?.track || {});
            void this.render({ preserveScroll: true });
        };
        this.boundQueueChanged = (event) => {
            this.sourceContext = normalizeSourceContext(event.detail?.sourceContext || this.player?.sourceContext);
            void this.render({ preserveScroll: true });
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
            this.setOpen(event.matches ? this.desktopOpenState : false, {
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
        };
        this.boundVisibilityChanged = () => this.syncPanelActivity();
        this.boundReducedMotionChanged = () => void this.render({ preserveScroll: true });
        this.boundPlaybackChanged = (event) => {
            if (event?.type === 'play') this.canvasRetryCount = 0;
            this.syncCanvasPlayback();
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
        this.init();
    }

    init() {
        if (!this.root || !this.content) return;
        this.root.dataset.initialized = 'true';
        this.setOpen(this.isOpen, { restoreFocus: false, preserveDesktopState: true });
        this.root.addEventListener('click', (event) => this.handleClick(event));
        this.root.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
        this.root.addEventListener('keydown', (event) => this.handleKeydown(event));
        this.reopenButton?.addEventListener('click', () => this.setOpen(true));
        this.content.addEventListener('scroll', this.boundPanelScroll, { passive: true });
        this.setupResize();
        this.setupFullscreenVisibility();
        this.desktopMedia.addEventListener?.('change', this.boundDesktopViewportChanged);
        this.reducedMotionMedia.addEventListener?.('change', this.boundReducedMotionChanged);
        document.addEventListener('visibilitychange', this.boundVisibilityChanged);
        window.addEventListener('player-track-changed', this.boundTrackChanged);
        window.addEventListener('player-canvas-changed', this.boundCanvasChanged);
        window.addEventListener('canvas-playback-preference-changed', this.boundCanvasPreferenceChanged);
        window.addEventListener('player-queue-changed', this.boundQueueChanged);
        window.addEventListener('track-metadata-updated', this.boundMetadataChanged);
        window.addEventListener('artist-metadata-updated', this.boundMetadataChanged);
        window.addEventListener('listening-data-updated', this.boundListeningChanged);
        this.syncPlaybackElement();
        void this.render();
    }

    setOpen(open, { restoreFocus = true, preserveDesktopState = false } = {}) {
        const desktopAvailable = this.desktopMedia.matches;
        if (!preserveDesktopState && desktopAvailable) this.desktopOpenState = Boolean(open);
        this.isOpen = desktopAvailable && Boolean(open);
        this.root.classList.toggle('is-closed', !this.isOpen);
        this.root.setAttribute('aria-hidden', String(!this.isOpen));
        this.content.inert = !this.isOpen;
        this.resizer.inert = !this.isOpen;
        this.reopenButton?.classList.toggle('is-visible', desktopAvailable && !this.isOpen);
        this.reopenButton?.setAttribute('aria-expanded', String(this.isOpen));
        document.body.classList.toggle('now-playing-panel-closed', desktopAvailable && !this.isOpen);
        this.root.setAttribute('role', 'complementary');
        this.root.removeAttribute('aria-modal');
        this.syncFullscreenVisibility();
        this.syncPanelActivity();
        if (this.isOpen && restoreFocus) {
            requestAnimationFrame(() =>
                this.root.querySelector('.now-playing-panel-close')?.focus({ preventScroll: true })
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
        this.root.classList.toggle('is-fullscreen-hidden', fullscreenVisible);
        this.root.setAttribute('aria-hidden', String(!this.isOpen || fullscreenVisible));
        this.content.inert = !this.isOpen || fullscreenVisible;
        this.resizer.inert = !this.isOpen || fullscreenVisible;
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

    async render({ preserveScroll = false } = {}) {
        if (!this.root || !this.content) return;
        this.renderController?.abort();
        const controller = new AbortController();
        this.renderController = controller;
        const hadRenderedContent = Boolean(this.content.querySelector('.now-playing-panel-body'));
        const fadeOut = hadRenderedContent
            ? new Promise((resolve) => window.setTimeout(resolve, TRACK_FADE_OUT_DURATION))
            : Promise.resolve();
        const previousScroll = preserveScroll
            ? this.content.scrollTop
            : this.scrollByTrack.get(String(this.currentTrack?.id)) || 0;
        this.root.classList.toggle('is-track-transitioning', hadRenderedContent);
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
            this.cleanupMedia();
            clearLyricsContainerSync(this.content);
            this.content.innerHTML = this.renderMarkup(model);
            this.content.scrollTop = previousScroll;
            await this.mountMedia(model, controller.signal);
            await this.mountLyrics(model, controller.signal);
            this.applyLyricsMode();
            await this.syncArtistLikeState();
            this.syncArtistStreamCount();
            if (this.currentTrack?.id != null) {
                await this.ui?.refreshTrackSaveButtons?.(this.currentTrack.type || 'track', this.currentTrack.id);
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
                    <button type="button" class="now-playing-panel-icon now-playing-panel-menu" aria-label="More options">${icon('ellipsis')}</button>
                    <button type="button" class="now-playing-panel-icon now-playing-panel-fullscreen" aria-label="Open fullscreen player">${icon('maximize-2')}</button>
                </div>
            </header>
            <div class="now-playing-panel-body${canvasLayout ? ' has-video-artwork' : ''}${this.canvasExpanded ? ' is-canvas-expanded' : ''}${model.empty ? ' is-empty' : ''}">
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
                ${this.renderQueue(model)}
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

    renderQueue(model) {
        const track = model.nextTrack;
        const title = track?.title || 'Queue is empty';
        const artist =
            track?.artists
                ?.map((item) => item.name)
                .filter(Boolean)
                .join(', ') ||
            track?.artist?.name ||
            '';
        const coverId = track ? getTrackPlayerArtwork(track) : null;
        const cover = coverId ? this.api.getCoverUrl(coverId) : '/assets/appicon.png';
        const rowTag = track ? 'button' : 'div';
        return `<section class="now-playing-panel-card now-playing-panel-next" aria-labelledby="now-playing-panel-next-title">
            <header><h3 id="now-playing-panel-next-title">Next in queue</h3><button type="button" class="now-playing-panel-open-queue">Open queue</button></header>
            <${rowTag}${track ? ` type="button" data-play-next aria-label="Play ${escapeHtml(title)} next"` : ''} class="now-playing-panel-next-track${track ? ' is-clickable' : ''}"><img src="${escapeHtml(cover)}" alt="" loading="lazy" /><span><strong>${escapeHtml(title)}</strong>${artist ? `<small>${escapeHtml(artist)}</small>` : ''}</span></${rowTag}>
        </section>`;
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

        this.canvasLoadTimer = window.setTimeout(fail, CANVAS_LOAD_TIMEOUT);
        if (isHls && this.ui?.setupHlsVideo) {
            await this.ui.setupHlsVideo(video, { hlsUrl: model.artwork.animatedSrc }, poster);
        } else if (isVideoArtwork(model.artwork.animatedSrc)) {
            video.load?.();
        }
        this.syncCanvasPlayback();
    }

    failCanvasMedia(video = this.canvasMedia) {
        if (!video || video !== this.canvasMedia) return;
        const failedStage = this.canvasStage;
        window.clearTimeout(this.canvasLoadTimer);
        this.canvasLoadTimer = null;
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
        const url = getShareUrl(`/track/${this.currentTrack.id}`);
        const data = { title: this.currentTrack.title || 'Now playing', text: this.model?.artistLine || '', url };
        try {
            if (navigator.share) await navigator.share(data);
            else {
                await navigator.clipboard.writeText(url);
                showNotification('Link copied to clipboard!');
            }
        } catch (error) {
            if (error?.name !== 'AbortError') console.error('Failed to share current track:', error);
        }
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

    handleKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (this.expandedLyrics) {
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
        this.cleanupMedia();
        clearLyricsContainerSync(this.content);
        this.background?.dispose();
        this.fullscreenObserver?.disconnect();
        this.canvasPlaybackElement?.removeEventListener('play', this.boundPlaybackChanged);
        this.canvasPlaybackElement?.removeEventListener('pause', this.boundPlaybackChanged);
        this.canvasPlaybackElement = null;
        this.content?.removeEventListener('scroll', this.boundPanelScroll);
        this.desktopMedia.removeEventListener?.('change', this.boundDesktopViewportChanged);
        this.reducedMotionMedia.removeEventListener?.('change', this.boundReducedMotionChanged);
        document.removeEventListener('visibilitychange', this.boundVisibilityChanged);
        window.removeEventListener('player-track-changed', this.boundTrackChanged);
        window.removeEventListener('player-canvas-changed', this.boundCanvasChanged);
        window.removeEventListener('canvas-playback-preference-changed', this.boundCanvasPreferenceChanged);
        window.removeEventListener('player-queue-changed', this.boundQueueChanged);
        window.removeEventListener('track-metadata-updated', this.boundMetadataChanged);
        window.removeEventListener('artist-metadata-updated', this.boundMetadataChanged);
        window.removeEventListener('listening-data-updated', this.boundListeningChanged);
    }
}
