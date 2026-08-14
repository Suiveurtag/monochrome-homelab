import { mountSpicyDynamicBackground } from './spicy-dynamic-background.js';
import { buildNowPlayingPanelModel, normalizeSourceContext } from './now-playing-panel-model.js';
import { clearLyricsContainerSync, renderLyricsInContainer } from './lyrics.js';
import { createTrackSaveIconHTML } from './track-save-ui.js';
import { escapeHtml, getShareUrl } from './utils.js';
import { isVideoArtwork } from './animated-artwork.js';
import { navigate } from './router.js';
import { showNotification } from './downloads.js';
import { db } from './db.js';
import { syncManager } from './accounts/pocketbase.js';
import ICON_CHEVRON_RIGHT from '!lucide/chevron-right.svg?svg&icon';
import ICON_CHEVRON_UP from '!lucide/chevron-up.svg?svg&icon';
import ICON_ELLIPSIS from '!lucide/ellipsis.svg?svg&icon';
import ICON_MAXIMIZE from '!lucide/maximize-2.svg?svg&icon';
import ICON_MONITOR_UP from '!lucide/monitor-up.svg?svg&icon';
import ICON_SHARE from '!lucide/share-2.svg?svg&icon';
import ICON_CLOSE from '!lucide/x.svg?svg&icon';

const MOBILE_QUERY = '(max-width: 768px)';

function icon(name, size = 20) {
    const icons = {
        'chevron-right': ICON_CHEVRON_RIGHT,
        'chevron-up': ICON_CHEVRON_UP,
        ellipsis: ICON_ELLIPSIS,
        'maximize-2': ICON_MAXIMIZE,
        'monitor-up': ICON_MONITOR_UP,
        'share-2': ICON_SHARE,
        x: ICON_CLOSE,
    };
    return icons[name]?.(size) || '';
}

function formatListeners(value) {
    return value == null ? '' : `${new Intl.NumberFormat().format(value)} monthly listeners`;
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
        this.scrollByTrack = new Map();
        this.background = this.root ? mountSpicyDynamicBackground(this.root, { className: 'now-playing-panel-spicy-bg' }) : null;
        this.isOpen = !matchMedia(MOBILE_QUERY).matches;
        this.boundTrackChanged = (event) => {
            this.currentTrack = event.detail?.track || null;
            void this.render();
        };
        this.boundQueueChanged = (event) => {
            this.sourceContext = normalizeSourceContext(event.detail?.sourceContext || this.player?.sourceContext);
            void this.render({ preserveScroll: true });
        };
        this.boundMetadataChanged = (event) => {
            if (
                event.type === 'track-metadata-updated' &&
                String(event.detail?.trackId) === String(this.currentTrack?.id)
            ) {
                Object.assign(this.currentTrack, event.detail.track || {});
            }
            void this.render({ preserveScroll: true });
        };
        this.init();
    }

    init() {
        if (!this.root || !this.content) return;
        this.root.dataset.initialized = 'true';
        this.setOpen(this.isOpen, { restoreFocus: false });
        this.root.addEventListener('click', (event) => this.handleClick(event));
        this.root.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
        this.root.addEventListener('keydown', (event) => this.handleKeydown(event));
        this.reopenButton?.addEventListener('click', () => this.setOpen(true));
        this.content.addEventListener('scroll', () => {
            if (this.currentTrack?.id != null) this.scrollByTrack.set(String(this.currentTrack.id), this.content.scrollTop);
        });
        this.setupResize();
        window.addEventListener('player-track-changed', this.boundTrackChanged);
        window.addEventListener('player-queue-changed', this.boundQueueChanged);
        window.addEventListener('track-metadata-updated', this.boundMetadataChanged);
        window.addEventListener('artist-metadata-updated', this.boundMetadataChanged);
        void this.render();
    }

    setOpen(open, { restoreFocus = true } = {}) {
        this.isOpen = Boolean(open);
        this.root.classList.toggle('is-closed', !this.isOpen);
        this.root.setAttribute('aria-hidden', String(!this.isOpen));
        this.reopenButton?.classList.toggle('is-visible', !this.isOpen);
        this.reopenButton?.setAttribute('aria-expanded', String(this.isOpen));
        document.body.classList.toggle('now-playing-panel-closed', !this.isOpen);
        if (matchMedia(MOBILE_QUERY).matches) {
            this.root.setAttribute('role', 'dialog');
            this.root.setAttribute('aria-modal', 'true');
            for (const element of document.querySelectorAll('.sidebar, .main-content, .now-playing-bar')) {
                element.inert = this.isOpen;
            }
        } else {
            this.root.setAttribute('role', 'complementary');
            this.root.removeAttribute('aria-modal');
            for (const element of document.querySelectorAll('.sidebar, .main-content, .now-playing-bar')) {
                element.inert = false;
            }
        }
        if (this.isOpen) {
            requestAnimationFrame(() => this.root.querySelector('.now-playing-panel-close')?.focus({ preventScroll: true }));
        } else if (restoreFocus) {
            requestAnimationFrame(() => this.reopenButton?.focus({ preventScroll: true }));
        }
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
            if (matchMedia(MOBILE_QUERY).matches) return;
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
        const previousScroll = preserveScroll ? this.content.scrollTop : this.scrollByTrack.get(String(this.currentTrack?.id)) || 0;
        this.cleanupMedia();
        clearLyricsContainerSync(this.content);
        this.content.innerHTML = '<div class="now-playing-panel-loading" role="status">Loading now playing…</div>';
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
            this.content.innerHTML = this.renderMarkup(model);
            this.content.scrollTop = previousScroll;
            await this.mountMedia(model, controller.signal);
            await this.mountLyrics(model, controller.signal);
            this.applyLyricsMode();
            await this.syncArtistFollowState();
            if (this.currentTrack?.id != null) {
                await this.ui?.refreshTrackSaveButtons?.(this.currentTrack.type || 'track', this.currentTrack.id);
            }
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Failed to render Now Playing panel:', error);
            this.content.innerHTML = '<div class="now-playing-panel-error">Now Playing could not be loaded.</div>';
        }
    }

    renderMarkup(model) {
        const context = escapeHtml(model.source.label);
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
            <div class="now-playing-panel-body${model.artwork.isVideo ? ' has-video-artwork' : ''}${model.empty ? ' is-empty' : ''}">
                <div class="now-playing-panel-media" aria-label="${escapeHtml(`${model.title} artwork`)}">
                    <img src="${escapeHtml(model.artwork.staticSrc)}" alt="" fetchpriority="high" />
                </div>
                <section class="now-playing-panel-metadata" aria-label="Current track">
                    <div class="now-playing-panel-track-copy">
                        <h2>${escapeHtml(model.title)}</h2>
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
                    (video) => `<button type="button" class="now-playing-panel-video" ${video.trackId ? `data-track-id="${escapeHtml(video.trackId)}"` : ''} ${video.href ? `data-href="${escapeHtml(video.href)}"` : ''}>
                        <img src="${escapeHtml(video.thumbnail || '/assets/appicon.png')}" alt="" loading="lazy" />
                        <strong>${escapeHtml(video.title)}</strong><span>${escapeHtml(video.subtitle)}</span>
                    </button>`
                )
                .join('')}</div>
        </section>`;
    }

    renderArtist(model) {
        if (!model.artist) return '';
        const listeners = formatListeners(model.artist.monthlyListeners);
        return `<section class="now-playing-panel-card now-playing-panel-artist" aria-labelledby="now-playing-panel-artist-title">
            <button type="button" class="now-playing-panel-artist-visual" data-artist-id="${escapeHtml(model.artist.id || '')}">
                <img src="${escapeHtml(model.artist.banner || model.artwork.staticSrc)}" alt="" loading="lazy" />
                <span>About the artist</span>
            </button>
            <div class="now-playing-panel-artist-copy">
                <div><h3 id="now-playing-panel-artist-title">${escapeHtml(model.artist.name)}</h3>
                    <button type="button" class="now-playing-panel-follow" data-artist-id="${escapeHtml(model.artist.id || '')}">Follow</button>
                </div>
                ${listeners ? `<p class="now-playing-panel-listeners">${escapeHtml(listeners)}</p>` : ''}
                ${model.artist.biography ? `<p class="now-playing-panel-biography">${escapeHtml(model.artist.biography)}</p>` : ''}
            </div>
        </section>`;
    }

    renderCredits(model) {
        if (!model.credits.length) return '';
        return `<section class="now-playing-panel-card now-playing-panel-credits" aria-labelledby="now-playing-panel-credits-title">
            <header><h3 id="now-playing-panel-credits-title">Credits</h3>${model.credits.length > 3 ? '<button type="button" class="now-playing-panel-show-credits">Show all</button>' : ''}</header>
            <div class="now-playing-panel-credit-list">${model.credits
                .slice(0, 3)
                .map((credit) => `<div><strong>${escapeHtml(credit.name)}</strong><span>${escapeHtml(credit.role)}</span></div>`)
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
        const artist = track?.artists?.map((item) => item.name).filter(Boolean).join(', ') || track?.artist?.name || '';
        const cover = track?.album?.cover ? this.api.getCoverUrl(track.album.cover) : '/assets/appicon.png';
        return `<section class="now-playing-panel-card now-playing-panel-next" aria-labelledby="now-playing-panel-next-title">
            <header><h3 id="now-playing-panel-next-title">Next in queue</h3><button type="button" class="now-playing-panel-open-queue">Open queue</button></header>
            <div class="now-playing-panel-next-track"><img src="${escapeHtml(cover)}" alt="" loading="lazy" /><span><strong>${escapeHtml(title)}</strong>${artist ? `<small>${escapeHtml(artist)}</small>` : ''}</span></div>
        </section>`;
    }

    async mountMedia(model, signal) {
        if (!model.artwork.isVideo || !model.artwork.animatedSrc) return;
        const image = this.content.querySelector('.now-playing-panel-media img');
        if (!image || signal.aborted) return;
        const video = document.createElement('video');
        video.className = image.className;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.poster = model.artwork.staticSrc;
        video.setAttribute('role', 'img');
        video.setAttribute('aria-label', `${model.title} animated artwork`);
        image.replaceWith(video);
        if (/\.m3u8(?:$|[?#])/i.test(model.artwork.animatedSrc) && this.ui?.setupHlsVideo) {
            await this.ui.setupHlsVideo(video, { hlsUrl: model.artwork.animatedSrc }, image);
        } else if (isVideoArtwork(model.artwork.animatedSrc)) {
            video.src = model.artwork.animatedSrc;
            await video.play().catch(() => {});
        }
    }

    cleanupMedia() {
        this.content?.querySelectorAll('video').forEach((video) => {
            video._hls?.destroy?.();
            video.pause();
            video.removeAttribute('src');
            video.load?.();
        });
    }

    async mountLyrics(model, signal) {
        const host = this.content.querySelector('.now-playing-panel-lyrics-host');
        if (!host || model.empty) return;
        const element = await renderLyricsInContainer(this.currentTrack, this.player.activeElement, this.lyricsManager, host, {
            signal,
        });
        if (!element && !signal.aborted) host.innerHTML = '<p class="now-playing-panel-lyrics-empty">Lyrics are not available.</p>';
    }

    applyLyricsMode() {
        this.root.classList.toggle('lyrics-expanded', this.expandedLyrics);
        this.root.querySelector('.now-playing-panel-lyrics')?.classList.toggle('is-collapsed', this.collapsedLyrics);
        const expand = this.root.querySelector('.now-playing-panel-lyrics-expand');
        expand?.setAttribute('aria-expanded', String(this.expandedLyrics));
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
            .map((credit) => `<p><strong>${escapeHtml(credit.name)}</strong><span>${escapeHtml(credit.role)}</span></p>`)
            .join('')}</div>`;
        document.body.appendChild(dialog);
        dialog.querySelector('button').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => dialog.remove());
        dialog.showModal();
    }

    async syncArtistFollowState() {
        const button = this.root.querySelector('.now-playing-panel-follow');
        if (!button || !this.model?.artist?.id) return;
        const following = await db.isFavorite('artist', this.model.artist.id);
        button.textContent = following ? 'Following' : 'Follow';
        button.setAttribute('aria-pressed', String(following));
    }

    handleContextMenu(event) {
        const button = event.target.closest('.now-playing-panel-save');
        if (!button || !this.currentTrack) return;
        event.preventDefault();
        document.dispatchEvent(new CustomEvent('track-save-panel-open', { detail: { button } }));
    }

    async handleClick(event) {
        const button = event.target.closest('button, a');
        if (!button) return;
        if (button.matches('.now-playing-panel-close')) return this.setOpen(false);
        if (button.matches('.now-playing-panel-context') && button.dataset.href) return navigate(button.dataset.href);
        if (button.matches('.now-playing-panel-menu') && this.currentTrack) {
            document.dispatchEvent(new CustomEvent('open-current-track-context-menu', { detail: { track: this.currentTrack, anchor: button } }));
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
        if (button.matches('.now-playing-panel-open-queue')) return document.getElementById('queue-btn')?.click();
        if (button.matches('.now-playing-panel-show-credits')) return this.showCredits();
        if (button.matches('.now-playing-panel-show-tour')) {
            const list = this.root.querySelector('.now-playing-panel-tour-list');
            list.innerHTML = this.model.tourDates.map((item) => this.renderTourEvent(item)).join('');
            button.remove();
            return;
        }
        if (button.matches('.now-playing-panel-follow') && this.model?.artist?.id) {
            const artist = { ...this.model.artist, type: 'artist' };
            const following = await db.toggleFavorite('artist', artist);
            await syncManager.syncLibraryItem('artist', artist, following);
            await this.syncArtistFollowState();
            showNotification(`${following ? 'Following' : 'Unfollowed'} ${artist.name}`);
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
        if (!matchMedia(MOBILE_QUERY).matches || event.key !== 'Tab') return;
        const focusable = [...this.root.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    destroy() {
        this.renderController?.abort();
        this.cleanupMedia();
        clearLyricsContainerSync(this.content);
        this.background?.dispose();
        window.removeEventListener('player-track-changed', this.boundTrackChanged);
        window.removeEventListener('player-queue-changed', this.boundQueueChanged);
        window.removeEventListener('track-metadata-updated', this.boundMetadataChanged);
        window.removeEventListener('artist-metadata-updated', this.boundMetadataChanged);
    }
}
