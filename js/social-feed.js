// js/social-feed.js — the Feed tab: a composer plus a track log of posts from
// every account on this Monochrome instance. Music posts ride on strips that
// draw the track's real waveform once it scrolls into view.

import { pb } from './accounts/config.js';
import { escapeHtml } from './utils.js';
import { showNotification } from './downloads.js';
import { icon } from './social-icons.js';
import { splitFeedPosts } from './social-state.js';
import { canUsePermission } from './access-control.js';
import { applyTints, drawWave, patchKeyed, pulse, reducedMotion, trackPeaks } from './social-dom.js';
import {
    avatarFor,
    displayName,
    formatClock,
    formatDuration,
    handleFor,
    profileHref,
    sharePayload,
    formatCount,
    cleanImage,
    presenceState,
} from './social-utils.js';

const PLAY_ICON =
    '<span class="social-share-play"><svg class="social-share-morph-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5L19 12L8 18.5Z"></path></svg></span>';
const COVER_ERROR = `onerror="if(this.crossOrigin){this.removeAttribute('crossorigin');this.src=this.src}else{this.hidden=true}"`;

function dayLabel(dateLike) {
    const date = new Date(dateLike);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
    }).format(date);
}

export class SocialFeed {
    constructor(manager) {
        this.manager = manager;
        this.posts = [];
        this.myLikes = new Map();
        this.likeCounts = new Map();
        this.commentCounts = new Map();
        this.expandedComments = new Set();
        this.comments = new Map();
        this.attachment = null;
        this.searchTimer = null;
        this.peaks = new Map();
        this.albums = new Map();
        this.waveObserver = null;
        this.bound = false;
    }

    get userId() {
        return this.manager.userId;
    }

    bind() {
        if (this.bound) return;
        this.bound = true;
        const composer = document.getElementById('social-post-composer');
        const input = document.getElementById('social-post-input');
        composer?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitPost().catch((error) => showNotification(error.message, 'error'));
        });
        input?.addEventListener('input', () => {
            this.autosize(input);
            this.updateSubmitState();
        });
        input?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                composer?.requestSubmit();
            }
        });
        document.getElementById('social-post-image')?.addEventListener('click', () => {
            document.getElementById('social-post-image-input')?.click();
        });
        document.getElementById('social-post-image-input')?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) this.setAttachment({ type: 'image', file });
            event.target.value = '';
        });
        document.getElementById('social-post-music')?.addEventListener('click', () => this.toggleMusicPicker());

        const feed = document.getElementById('social-feed');
        feed?.addEventListener('click', (event) => this.onFeedClick(event));
        feed?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.target.matches('.social-comment-input')) {
                event.preventDefault();
                this.submitComment(event.target.dataset.postId, event.target).catch(console.error);
            }
        });
        feed?.addEventListener('pointermove', (event) => {
            const wave = event.target.closest('[data-strip-wave]');
            if (!wave) return;
            const rect = wave.getBoundingClientRect();
            wave.style.setProperty('--hover', ((event.clientX - rect.left) / rect.width).toFixed(4));
        });
        if (feed) new ResizeObserver(() => this.redrawWaves()).observe(feed);
    }

    autosize(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(200, textarea.scrollHeight)}px`;
    }

    updateSubmitState() {
        const input = document.getElementById('social-post-input');
        const button = document.getElementById('social-post-submit');
        if (!button) return;
        const canPost = canUsePermission('create_social_posts');
        const disabled = !canPost || (!input?.value.trim() && !this.attachment);
        if (button.disabled !== disabled) {
            button.disabled = disabled;
            if (!disabled) pulse(button, 'is-arming');
        }
        if (input) {
            input.disabled = !canPost;
            input.placeholder = canPost
                ? 'What are you listening to?'
                : 'Posting is disabled by the instance administrator';
        }
    }

    setAttachment(attachment) {
        this.attachment = attachment;
        this.renderAttachment();
        this.updateSubmitState();
    }

    renderAttachment() {
        const container = document.getElementById('social-post-attachment');
        if (!container) return;
        if (!this.attachment) {
            container.hidden = true;
            container.innerHTML = '';
            return;
        }
        container.hidden = false;
        const thumb =
            this.attachment.type === 'image'
                ? `<img src="${URL.createObjectURL(this.attachment.file)}" alt="" />`
                : this.attachment.payload.image
                  ? `<img src="${escapeHtml(this.attachment.payload.image)}" alt="" />`
                  : `<span class="social-attachment-placeholder">${icon.music(16)}</span>`;
        const label =
            this.attachment.type === 'image'
                ? '<strong>Image</strong><small>Ready to post</small>'
                : `<strong>${escapeHtml(this.attachment.payload.title)}</strong><small>${escapeHtml(this.attachment.payload.subtitle || this.attachment.payload.type)}</small>`;
        container.innerHTML = `<div class="social-attachment-chip">${thumb}<span>${label}</span>
            <button type="button" class="social-attachment-remove" aria-label="Remove attachment">${icon.x(14)}</button></div>`;
        container.querySelector('.social-attachment-remove')?.addEventListener('click', () => this.setAttachment(null));
    }

    /** Your own deck's shortcut: attach what you play and hand focus to the composer. */
    postNowPlaying() {
        const current = this.manager.player?.currentTrack;
        if (this.manager.tab !== 'feed') this.manager.setTab('feed');
        if (current) this.setAttachment({ type: 'track', payload: sharePayload('track', current) });
        const composer = document.getElementById('social-post-composer');
        composer?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
        document.getElementById('social-post-input')?.focus({ preventScroll: true });
        pulse(composer, 'is-summoned');
    }

    toggleMusicPicker() {
        const picker = document.getElementById('social-post-music-picker');
        const toggle = document.getElementById('social-post-music');
        if (!picker) return;
        if (!picker.hidden) {
            picker.hidden = true;
            picker.innerHTML = '';
            toggle?.setAttribute('aria-expanded', 'false');
            return;
        }
        picker.hidden = false;
        toggle?.setAttribute('aria-expanded', 'true');
        const track = this.manager.player?.currentTrack;
        picker.innerHTML = `
            <div class="social-picker-search">
                ${icon.search(15)}
                <input type="search" id="social-picker-search" placeholder="Search tracks and albums" autocomplete="off" aria-label="Search tracks and albums" />
            </div>
            <div class="social-picker-results" id="social-picker-results">
                ${
                    track
                        ? `<button class="social-picker-result" type="button" data-picker-nowplaying>${icon.audioLines(16)}<span><em>Now playing</em><strong>${escapeHtml(track.title || '')}</strong></span></button>`
                        : '<div class="social-picker-hint">Nothing is playing. Search instead.</div>'
                }
            </div>`;
        const search = picker.querySelector('#social-picker-search');
        search?.addEventListener('input', () => {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => this.searchMusic(search.value).catch(console.error), 220);
        });
        picker.querySelector('[data-picker-nowplaying]')?.addEventListener('click', () => {
            const current = this.manager.player?.currentTrack;
            if (current) this.setAttachment({ type: 'track', payload: sharePayload('track', current) });
            this.toggleMusicPicker();
        });
        picker.querySelector('#social-picker-results')?.addEventListener('click', (event) => {
            const row = event.target.closest('[data-picker-kind]');
            if (!row) return;
            const item = this.manager.shareItems.get(row.dataset.pickerKey);
            if (!item) return;
            this.setAttachment({ type: item.kind, payload: sharePayload(item.kind, item.item) });
            this.toggleMusicPicker();
        });
        search?.focus();
    }

    async searchMusic(query) {
        const results = document.getElementById('social-picker-results');
        if (!results) return;
        if (!query.trim()) {
            results.innerHTML = '<div class="social-picker-hint">Search tracks and albums.</div>';
            return;
        }
        results.innerHTML = '<div class="social-picker-hint">Searching…</div>';
        const found = await this.manager.api.search(query.trim()).catch(() => null);
        const groups = [
            ['track', found?.tracks?.items || found?.tracks || []],
            ['album', found?.albums?.items || found?.albums || []],
        ];
        const items = groups.flatMap(([kind, list]) => list.slice(0, 4).map((item) => [kind, item]));
        if (!items.length) {
            results.innerHTML = '<div class="social-picker-hint">Nothing in the library matches that.</div>';
            return;
        }
        results.innerHTML = items
            .map(([kind, item]) => {
                const key = `${kind}:${item.id}`;
                this.manager.shareItems.set(key, { kind, item });
                const image = kind === 'track' ? item.album?.cover || item.cover : item.cover;
                return `<button class="social-picker-result" type="button" data-picker-kind="${kind}" data-picker-key="${escapeHtml(key)}">
                    ${image ? `<img src="${escapeHtml(cleanImage(image))}" alt="" />` : icon.music(16)}
                    <span><em>${escapeHtml(kind)}</em><strong>${escapeHtml(item.title || item.name || '')}</strong></span>
                </button>`;
            })
            .join('');
    }

    async submitPost() {
        if (!this.userId) return;
        if (!canUsePermission('create_social_posts')) {
            throw new Error('Posting is disabled by the instance administrator.');
        }
        const input = document.getElementById('social-post-input');
        const button = document.getElementById('social-post-submit');
        const body = input?.value.trim() || '';
        if (!body && !this.attachment) return;
        const data = { author: this.userId, body };
        if (this.attachment?.type === 'image') data.image = this.attachment.file;
        if (this.attachment?.payload) data.payload = this.attachment.payload;
        button?.classList.add('is-sending');
        try {
            await pb.collection('social_posts').create(data);
        } finally {
            button?.classList.remove('is-sending');
        }
        this.setAttachment(null);
        if (input) input.value = '';
        this.autosize(input);
        this.updateSubmitState();
        await this.refresh();
    }

    async refresh() {
        if (!this.userId) return;
        const container = document.getElementById('social-feed');
        if (!container) return;
        const [posts, allLikes, myLikes, comments] = await Promise.all([
            pb.collection('social_posts').getFullList({ sort: '-created' }),
            pb.collection('social_post_likes').getFullList({ fields: 'post,user' }),
            pb.collection('social_post_likes').getFullList({ filter: `user="${this.userId}"` }),
            pb.collection('social_post_comments').getFullList({ sort: 'created' }),
        ]);
        // Reposts were removed from the product. Keep historical records intact
        // in PocketBase, but do not let them leak back into the new feed.
        this.posts = posts.filter((post) => !post.repost_of && !this.manager.isBlocked(post.author));
        const visiblePostIds = new Set(this.posts.map((post) => post.id));
        this.myLikes = new Map(
            myLikes.filter((like) => visiblePostIds.has(like.post)).map((like) => [like.post, like.id])
        );
        this.likeCounts = new Map();
        this.commentCounts = new Map();
        this.comments = new Map();
        for (const like of allLikes) {
            if (!visiblePostIds.has(like.post) || this.manager.isBlocked(like.user)) continue;
            this.likeCounts.set(like.post, (this.likeCounts.get(like.post) || 0) + 1);
        }
        for (const comment of comments) {
            if (!visiblePostIds.has(comment.post) || this.manager.isBlocked(comment.author)) continue;
            this.commentCounts.set(comment.post, (this.commentCounts.get(comment.post) || 0) + 1);
            if (!this.comments.has(comment.post)) this.comments.set(comment.post, []);
            this.comments.get(comment.post).push(comment);
        }
        this.render();
    }

    render() {
        const container = document.getElementById('social-feed');
        if (!container) return;
        if (!this.posts.length) {
            patchKeyed(container, [
                {
                    key: 'empty',
                    html: `<div class="social-feed-empty">
                        <span class="social-feed-empty-mark" aria-hidden="true">${icon.disc(24)}</span>
                        <strong>Nothing posted yet</strong>
                        <span>Post what you're playing and it opens the log for everyone here.</span>
                    </div>`,
                },
            ]);
            return;
        }
        const { circle, instance } = splitFeedPosts(this.posts, this.manager.following);
        const streams = [
            {
                kind: 'circle',
                posts: circle,
                title: 'Your circle',
                empty: 'Follow a few members from their decks and their posts collect here.',
            },
            {
                kind: 'instance',
                posts: instance,
                title: 'Across Monochrome',
                empty: 'You are caught up with the rest of the instance.',
            },
        ];
        patchKeyed(
            container,
            streams.map(({ kind, title }) => ({
                key: `stream-${kind}`,
                html: `<section class="social-feed-stream" aria-labelledby="social-stream-${kind}">
                    <header class="social-stream-head"><h2 id="social-stream-${kind}" class="social-stream-title">${title}</h2><span class="social-stream-count" data-stream-count></span></header>
                    <div class="social-stream-posts" data-stream-posts></div>
                </section>`,
            })),
            { flip: false }
        );
        const animateNew = container.dataset.ready === '1';
        for (const { kind, posts, empty } of streams) {
            const section = container.querySelector(`[data-key="stream-${kind}"]`);
            section.querySelector('[data-stream-count]').textContent = `${posts.length} post${posts.length === 1 ? '' : 's'}`;
            patchKeyed(
                section.querySelector('[data-stream-posts]'),
                posts.length
                    ? posts.map((post) => ({ key: post.id, html: this.renderPost(post) }))
                    : [
                          {
                              key: 'empty',
                              html: `<div class="social-stream-empty"><span class="social-stream-empty-icon">${icon.audioLines(17)}</span><span>${escapeHtml(empty)}</span></div>`,
                          },
                      ],
                { animateNew }
            );
        }
        container.dataset.ready = '1';
        applyTints(container);
        this.observeWaves(container);
    }

    stripHTML(payload) {
        const kind = payload.type || 'track';
        const title = payload.title || 'Shared music';
        const href = payload.href || `/${kind}/${encodeURIComponent(payload.id || '')}`;
        const playable = ['track', 'album'].includes(kind) && payload.id;
        const art = payload.image
            ? `<img src="${escapeHtml(payload.image)}" alt="" loading="lazy" crossorigin="anonymous" data-tint ${COVER_ERROR} />`
            : `<span class="social-strip-placeholder">${icon.music(18)}</span>`;
        const typeLabel = { track: 'Track', album: 'Album', artist: 'Artist', userplaylist: 'Playlist' }[kind] || kind;
        const lane = kind === 'track' ? ' is-track' : kind === 'album' ? ' is-album' : '';
        return `<div class="social-strip${lane}" data-tint-target>
            <a class="social-strip-art" href="${escapeHtml(href)}" aria-label="Open ${escapeHtml(title)}">${art}</a>
            <a class="social-strip-meta" href="${escapeHtml(href)}"><strong>${escapeHtml(title)}</strong><small>${escapeHtml([payload.subtitle, kind === 'track' ? '' : typeLabel].filter(Boolean).join(' · '))}</small></a>
            ${playable ? `<button class="social-strip-play" type="button" data-play-kind="${escapeHtml(kind)}" data-play-id="${escapeHtml(payload.id)}" aria-label="Play ${escapeHtml(title)}">${PLAY_ICON}</button>` : ''}
            ${
                kind === 'track' && payload.id
                    ? `<div class="social-strip-wave is-loading" data-strip-wave="${escapeHtml(payload.id)}" title="Play from here"><canvas aria-hidden="true"></canvas></div><span class="social-strip-time" data-strip-duration="${escapeHtml(payload.id)}"></span>`
                    : kind === 'album' && payload.id
                      ? `<div class="social-strip-tracks is-loading" data-strip-album="${escapeHtml(payload.id)}" role="group" aria-label="Tracks of ${escapeHtml(title)}"></div><span class="social-strip-time" data-strip-album-time></span>`
                      : `<a class="social-strip-open" href="${escapeHtml(href)}" aria-label="Open ${escapeHtml(title)}">${icon.open(16)}</a>`
            }
        </div>`;
    }

    renderPost(post) {
        const author = this.manager.profiles.get(post.author);
        const name = displayName(author);
        const live = presenceState(this.manager.presence.get(post.author)).playing;
        const payload = post.payload && typeof post.payload === 'object' ? post.payload : null;
        const imageFile = post.image
            ? pb.files.getURL(post, post.image, { thumb: '640x0' })
            : '';
        const liked = this.myLikes.has(post.id);
        const likeCount = this.likeCounts.get(post.id) || 0;
        const commentCount = this.commentCounts.get(post.id) || 0;
        const expanded = this.expandedComments.has(post.id);
        const image = imageFile
            ? `<div class="social-post-image"><img src="${escapeHtml(imageFile)}" alt="" loading="lazy" /></div>`
            : '';
        return `<article class="social-post" data-post-id="${escapeHtml(post.id)}">
            <div class="social-post-gutter">
                <time datetime="${escapeHtml(post.created)}">${escapeHtml(formatClock(post.created))}</time>
                <span>${escapeHtml(dayLabel(post.created))}</span>
            </div>
            <a class="social-post-avatar" href="${escapeHtml(profileHref(author))}" aria-label="${escapeHtml(name)}">
                <img src="${escapeHtml(avatarFor(author))}" alt="" loading="lazy" />
            </a>
            <div class="social-post-main">
                <footer class="social-post-actions">
                    <button class="social-post-action social-post-like${liked ? ' is-liked' : ''}" type="button" data-post-like aria-pressed="${liked}" aria-label="${liked ? 'Unlike' : 'Like'}${likeCount ? `, ${likeCount}` : ''}">
                        ${icon.heart(17)}<span class="social-post-count">${likeCount ? formatCount(likeCount) : ''}</span>
                    </button>
                    <button class="social-post-action${expanded ? ' is-open' : ''}" type="button" data-post-comment aria-expanded="${expanded}" aria-label="Comments${commentCount ? `, ${commentCount}` : ''}">
                        ${icon.messageCircle(17)}<span class="social-post-count">${commentCount ? formatCount(commentCount) : ''}</span>
                    </button>
                    ${payload ? `<button class="social-post-action" type="button" data-post-share aria-label="Send to a friend" title="Send to a friend">${icon.share(16)}</button>` : ''}
                </footer>
                <header class="social-post-head">
                    <a class="social-post-author" href="${escapeHtml(profileHref(author))}"><strong>${escapeHtml(name)}</strong></a>
                    ${live ? '<i class="booth-live" title="Listening now" aria-label="Listening now"></i>' : ''}
                    <span class="social-post-handle">${escapeHtml(handleFor(author))}</span>
                </header>
                ${post.body ? `<p class="social-post-body">${escapeHtml(post.body)}</p>` : ''}
                ${payload ? this.stripHTML(payload) : ''}
                ${image}
                ${expanded ? this.renderComments(post) : ''}
            </div>
        </article>`;
    }

    renderComments(post) {
        const list = this.comments.get(post.id) || [];
        const rows = list
            .map((comment) => {
                const author = this.manager.profiles.get(comment.author);
                return `<div class="social-comment" data-comment-id="${escapeHtml(comment.id)}">
                    <img src="${escapeHtml(avatarFor(author))}" alt="" loading="lazy" />
                    <p class="social-comment-copy"><strong>${escapeHtml(displayName(author))}</strong> ${escapeHtml(comment.body)}</p>
                    <time>${escapeHtml(formatClock(comment.created))}</time>
                </div>`;
            })
            .join('');
        return `<div class="social-post-comments">
            ${rows}
            <div class="social-comment-compose">
                <input class="social-comment-input" type="text" data-post-id="${escapeHtml(post.id)}" placeholder="Add a comment" aria-label="Add a comment" maxlength="1024" />
            </div>
        </div>`;
    }

    /* -------------------------------- waveforms -------------------------------- */

    observeWaves(container) {
        if (!this.waveObserver) {
            this.waveObserver = new IntersectionObserver(
                (entries) => {
                    for (const entry of entries) {
                        if (!entry.isIntersecting) continue;
                        this.waveObserver.unobserve(entry.target);
                        if (entry.target.dataset.stripAlbum) this.loadAlbum(entry.target);
                        else this.loadWave(entry.target);
                    }
                },
                { rootMargin: '200px 0px' }
            );
        }
        container.querySelectorAll('[data-strip-wave]').forEach((wave) => {
            if (this.peaks.has(wave.dataset.stripWave)) this.paintWave(wave);
            else this.waveObserver.observe(wave);
        });
        container.querySelectorAll('[data-strip-album]').forEach((lane) => {
            if (this.albums.has(lane.dataset.stripAlbum)) this.paintAlbum(lane);
            else this.waveObserver.observe(lane);
        });
    }

    loadAlbum(lane) {
        const albumId = lane.dataset.stripAlbum;
        void Promise.resolve(this.manager.api.getAlbum(albumId))
            .then((result) => result?.tracks || [])
            .catch(() => [])
            .then((tracks) => {
                this.albums.set(
                    albumId,
                    tracks.map((track) => ({
                        id: String(track.id || ''),
                        title: track.title || '',
                        duration: Number(track.duration) || 0,
                    }))
                );
                document
                    .querySelectorAll(`#social-feed [data-strip-album="${CSS.escape(albumId)}"]`)
                    .forEach((node) => this.paintAlbum(node));
            });
    }

    /** One segment per track, as long as the track: the album's own running order. */
    paintAlbum(lane) {
        const tracks = this.albums.get(lane.dataset.stripAlbum) || [];
        lane.classList.remove('is-loading');
        if (!tracks.length) {
            lane.classList.add('is-flat');
            return;
        }
        const total = tracks.reduce((sum, track) => sum + track.duration, 0);
        const time = lane.closest('.social-strip')?.querySelector('[data-strip-album-time]');
        if (time && total) time.textContent = formatDuration(total);
        // A one-track album is that track: draw its real waveform rather than a lone bar.
        if (tracks.length === 1 && tracks[0].id) {
            lane.classList.add('social-strip-wave', 'is-loading');
            lane.dataset.stripWave = tracks[0].id;
            lane.title = 'Play from here';
            lane.innerHTML = '<canvas aria-hidden="true"></canvas>';
            if (this.peaks.has(tracks[0].id)) this.paintWave(lane);
            else this.loadWave(lane);
            return;
        }
        lane.innerHTML = tracks
            .map(
                (track, index) =>
                    `<button class="social-strip-segment" type="button" data-album-index="${index}" style="flex-grow:${Math.max(30, Math.round(track.duration || 180))}" title="${escapeHtml(`${index + 1}. ${track.title} · ${formatDuration(track.duration)}`)}" aria-label="Play ${escapeHtml(track.title)}"><i></i></button>`
            )
            .join('');
    }

    async playAlbumFrom(albumId, index) {
        const player = this.manager.player;
        try {
            const { album, tracks } = await this.manager.api.getAlbum(albumId);
            if (!tracks?.length || !player) return;
            this.manager.stopSnippetPlayback();
            await player.setQueue(tracks, index, false, {
                kind: 'album',
                id: String(albumId),
                label: album?.title || 'Shared album',
                href: `/album/${albumId}`,
            });
            player.enableAutoplay();
            await player.playTrackFromQueue();
        } catch (error) {
            console.warn('[Social] Album playback failed:', error);
        }
    }

    loadWave(wave) {
        const trackId = wave.dataset.stripWave;
        trackPeaks(trackId, (id) => this.manager.api.getTrackMetadata(id)).then((result) => {
            this.peaks.set(trackId, result);
            document
                .querySelectorAll(`#social-feed [data-strip-wave="${CSS.escape(trackId)}"]`)
                .forEach((node) => this.paintWave(node));
        });
    }

    paintWave(wave) {
        const result = this.peaks.get(wave.dataset.stripWave);
        wave.classList.remove('is-loading');
        if (!result) {
            wave.classList.add('is-flat');
            return;
        }
        const strip = wave.closest('.social-strip');
        const color = (strip && getComputedStyle(strip).getPropertyValue('--tint').trim()) || '#f5f5f5';
        drawWave(wave.querySelector('canvas'), result.peaks, { color, progress: 1 });
        wave.dataset.painted = color;
        const time = strip?.querySelector('[data-strip-duration]');
        if (time && result.duration) time.textContent = formatDuration(result.duration);
        // The tint may land after the first paint; repaint once it does.
        if (color === '#f5f5f5' && strip && !wave.dataset.awaitingTint) {
            wave.dataset.awaitingTint = '1';
            setTimeout(() => this.paintWave(wave), 600);
        }
    }

    redrawWaves() {
        document.querySelectorAll('#social-feed [data-strip-wave]').forEach((wave) => {
            if (this.peaks.has(wave.dataset.stripWave)) this.paintWave(wave);
        });
    }

    /* --------------------------------- actions --------------------------------- */

    onFeedClick(event) {
        const like = event.target.closest('[data-post-like]');
        if (like) {
            this.toggleLike(like.closest('[data-post-id]')?.dataset.postId).catch(console.error);
            return;
        }
        const commentToggle = event.target.closest('[data-post-comment]');
        if (commentToggle) {
            this.toggleComments(commentToggle.closest('[data-post-id]')?.dataset.postId);
            return;
        }
        const share = event.target.closest('[data-post-share]');
        if (share) {
            const post = this.posts.find((entry) => entry.id === share.closest('[data-post-id]')?.dataset.postId);
            if (post?.payload)
                this.manager.openShareSheet({ payload: post.payload, item: null, kind: post.payload.type });
            return;
        }
        const segment = event.target.closest('[data-album-index]');
        if (segment) {
            const lane = segment.closest('[data-strip-album]');
            pulse(segment, 'is-cued');
            this.playAlbumFrom(lane.dataset.stripAlbum, Number(segment.dataset.albumIndex) || 0).catch(console.error);
            return;
        }
        const wave = event.target.closest('[data-strip-wave]');
        if (wave) {
            const rect = wave.getBoundingClientRect();
            const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            const duration = this.peaks.get(wave.dataset.stripWave)?.duration || 0;
            this.manager.playTrackAt(wave.dataset.stripWave, fraction * duration).catch(console.error);
            pulse(wave, 'is-cued');
            return;
        }
        const play = event.target.closest('[data-play-kind][data-play-id]');
        if (play) {
            event.preventDefault();
            pulse(play, 'is-pressed');
            this.manager.playSnippetAware(play);
        }
    }

    toggleComments(postId) {
        if (!postId) return;
        const post = document.querySelector(`#social-feed [data-post-id="${CSS.escape(postId)}"]`);
        if (this.expandedComments.has(postId)) {
            const panel = post?.querySelector('.social-post-comments');
            const close = () => {
                this.expandedComments.delete(postId);
                this.render();
            };
            if (!panel || reducedMotion()) return close();
            panel.classList.add('is-closing');
            panel.addEventListener('animationend', close, { once: true });
            return;
        }
        this.expandedComments.add(postId);
        this.render();
        const panel = document.querySelector(`#social-feed [data-post-id="${CSS.escape(postId)}"] .social-post-comments`);
        pulse(panel, 'is-opening');
        panel?.querySelector('.social-comment-input')?.focus({ preventScroll: true });
    }

    async toggleLike(postId) {
        if (!postId || !this.userId) return;
        const button = () => document.querySelector(`#social-feed [data-post-id="${CSS.escape(postId)}"] [data-post-like]`);
        const existing = this.myLikes.get(postId);
        if (existing) {
            this.myLikes.delete(postId);
            this.likeCounts.set(postId, Math.max(0, (this.likeCounts.get(postId) || 1) - 1));
            this.render();
            pulse(button(), 'is-releasing');
            await pb.collection('social_post_likes').delete(existing).catch(console.error);
            return;
        }
        this.myLikes.set(postId, 'pending');
        this.likeCounts.set(postId, (this.likeCounts.get(postId) || 0) + 1);
        this.render();
        pulse(button(), 'is-popping');
        const record = await pb.collection('social_post_likes').create({ post: postId, user: this.userId });
        this.myLikes.set(postId, record.id);
    }

    async submitComment(postId, input) {
        const body = input.value.trim();
        if (!postId || !body || !this.userId) return;
        input.disabled = true;
        try {
            const record = await pb.collection('social_post_comments').create({ post: postId, author: this.userId, body });
            input.value = '';
            await this.refresh();
            pulse(document.querySelector(`#social-feed [data-comment-id="${CSS.escape(record.id)}"]`), 'is-entering');
            document
                .querySelector(`#social-feed [data-post-id="${CSS.escape(postId)}"] .social-comment-input`)
                ?.focus({ preventScroll: true });
        } finally {
            input.disabled = false;
        }
    }
}
