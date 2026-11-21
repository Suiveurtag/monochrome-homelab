// js/social-feed.js — the Feed tab: a composer plus the shared booklet of posts from every
// account on this Monochrome instance. A music post is laid open as a spread: the cover on
// the left page, the member's note and the record's credits on the right, with the album's
// tracklist or the track's real running groove printed in the cover's own ink.

import { pb } from './accounts/config.js';
import { escapeHtml, safeHref } from './utils.js';
import { showNotification } from './downloads.js';
import { icon } from './social-icons.js';
import { splitFeedPosts } from './social-state.js';
import { canUsePermission } from './access-control.js';
import {
    applyTints,
    cachedCoverColor,
    drawWave,
    patchKeyed,
    pulse,
    reducedMotion,
    trackPeaks,
} from './social-dom.js';
import {
    avatarFor,
    dayKey,
    displayName,
    formatClock,
    formatDayLabel,
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
const TRACKLIST_ROWS = 5;
const KIND_LABEL = { track: 'Track', album: 'Album', artist: 'Artist', userplaylist: 'Playlist' };

function fullDate(dateLike) {
    const date = new Date(dateLike);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(date);
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
        // Records whose running order already printed once; a rebuilt post shows them settled.
        this.revealed = new Set();
        this.loaded = false;
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
                : 'Posting is turned off by the instance administrator';
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
        const isImage = this.attachment.type === 'image';
        const thumb = isImage
            ? `<img src="${URL.createObjectURL(this.attachment.file)}" alt="" />`
            : this.attachment.payload.image
              ? `<img src="${escapeHtml(this.attachment.payload.image)}" alt="" />`
              : `<span class="social-attachment-placeholder">${icon.music(16)}</span>`;
        const label = isImage
            ? '<strong>Image</strong><small>Attached to your post</small>'
            : `<strong>${escapeHtml(this.attachment.payload.title)}</strong><small>${escapeHtml(this.attachment.payload.subtitle || KIND_LABEL[this.attachment.payload.type] || '')}</small>`;
        container.innerHTML = `<div class="social-attachment-chip${isImage ? ' is-image' : ''}">${thumb}<span class="social-attachment-copy">${label}</span>
            <button type="button" class="social-attachment-remove" aria-label="Remove attachment" title="Remove">${icon.x(14)}</button></div>`;
        container.querySelector('.social-attachment-remove')?.addEventListener('click', () => {
            this.setAttachment(null);
            document.getElementById('social-post-input')?.focus({ preventScroll: true });
        });
    }

    /** The band's shortcut: attach what you play and hand focus to the composer. */
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
        const cover = track ? cleanImage(track.album?.cover || track.cover) : '';
        picker.innerHTML = `
            <label class="social-picker-search">
                ${icon.search(15)}
                <input type="search" id="social-picker-search" placeholder="Search tracks and albums" autocomplete="off" aria-label="Search tracks and albums" />
            </label>
            <div class="social-picker-results" id="social-picker-results">
                ${
                    track
                        ? `<button class="social-picker-result is-now" type="button" data-picker-nowplaying>${cover ? `<img src="${escapeHtml(cover)}" alt="" />` : `<span class="social-picker-art">${icon.audioLines(16)}</span>`}<span class="social-picker-copy"><small>Playing now</small><strong>${escapeHtml(track.title || '')}</strong></span></button>`
                        : '<p class="social-picker-hint">Nothing is playing. Search the library instead.</p>'
                }
            </div>`;
        const search = picker.querySelector('#social-picker-search');
        search?.addEventListener('input', () => {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => this.searchMusic(search.value).catch(console.error), 220);
        });
        search?.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.toggleMusicPicker();
                toggle?.focus();
            }
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
            results.innerHTML = '<p class="social-picker-hint">Search tracks and albums.</p>';
            return;
        }
        results.innerHTML = '<p class="social-picker-hint is-busy" role="status">Searching the library</p>';
        const found = await this.manager.api.search(query.trim()).catch(() => undefined);
        if (found === undefined) {
            results.innerHTML = '<p class="social-picker-hint">The search failed. Check the connection and try again.</p>';
            return;
        }
        const groups = [
            ['track', found?.tracks?.items || found?.tracks || []],
            ['album', found?.albums?.items || found?.albums || []],
        ];
        const items = groups.flatMap(([kind, list]) => list.slice(0, 4).map((item) => [kind, item]));
        if (!items.length) {
            results.innerHTML = '<p class="social-picker-hint">Nothing in the library matches that.</p>';
            return;
        }
        results.innerHTML = items
            .map(([kind, item]) => {
                const key = `${kind}:${item.id}`;
                this.manager.shareItems.set(key, { kind, item });
                const image = kind === 'track' ? item.album?.cover || item.cover : item.cover;
                const by = kind === 'track' ? item.artist?.name || item.artists?.[0]?.name : item.artist?.name;
                return `<button class="social-picker-result" type="button" data-picker-kind="${kind}" data-picker-key="${escapeHtml(key)}">
                    ${image ? `<img src="${escapeHtml(cleanImage(image))}" alt="" />` : `<span class="social-picker-art">${icon.music(16)}</span>`}
                    <span class="social-picker-copy"><small>${escapeHtml(KIND_LABEL[kind] || kind)}${by ? `, ${escapeHtml(by)}` : ''}</small><strong>${escapeHtml(item.title || item.name || '')}</strong></span>
                </button>`;
            })
            .join('');
    }

    async submitPost() {
        if (!this.userId) return;
        if (!canUsePermission('create_social_posts')) {
            throw new Error('Posting is turned off by the instance administrator.');
        }
        const input = document.getElementById('social-post-input');
        const button = document.getElementById('social-post-submit');
        const body = input?.value.trim() || '';
        if (!body && !this.attachment) return;
        const data = { author: this.userId, body };
        if (this.attachment?.type === 'image') data.image = this.attachment.file;
        if (this.attachment?.payload) data.payload = this.attachment.payload;
        button?.classList.add('is-sending');
        button?.setAttribute('aria-busy', 'true');
        try {
            await pb.collection('social_posts').create(data);
        } finally {
            button?.classList.remove('is-sending');
            button?.removeAttribute('aria-busy');
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
        let posts, allLikes, myLikes, comments;
        try {
            [posts, allLikes, myLikes, comments] = await Promise.all([
                pb.collection('social_posts').getFullList({ sort: '-created' }),
                pb.collection('social_post_likes').getFullList({ fields: 'post,user' }),
                pb.collection('social_post_likes').getFullList({ filter: `user="${this.userId}"` }),
                pb.collection('social_post_comments').getFullList({ sort: 'created' }),
            ]);
        } catch (error) {
            // Keep what is already on the page; only an empty booklet says it failed.
            if (!this.loaded) this.renderError();
            throw error;
        }
        this.loaded = true;
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

    renderError() {
        const container = document.getElementById('social-feed');
        if (!container) return;
        patchKeyed(container, [
            {
                key: 'error',
                html: `<div class="social-feed-empty is-error" role="alert">
                    <strong>The feed didn't load</strong>
                    <span>The instance server didn't answer. Check that it is running, then try again.</span>
                    <button class="social-quiet-button" type="button" data-feed-retry>Try again</button>
                </div>`,
            },
        ]);
    }

    render() {
        const container = document.getElementById('social-feed');
        if (!container) return;
        if (!this.posts.length) {
            patchKeyed(container, [
                {
                    key: 'empty',
                    html: `<div class="social-feed-empty">
                        <span class="social-empty-mark" aria-hidden="true"><span class="social-empty-sleeve"></span><span class="social-empty-sleeve"></span><span class="social-empty-sleeve"></span></span>
                        <strong>Nothing posted yet</strong>
                        <span>Share what you're playing and it becomes the first page everyone here reads.</span>
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
                empty: 'Follow a few members from the band above and their posts collect here.',
            },
            {
                kind: 'instance',
                posts: instance,
                title: 'Across Monochrome',
                empty: "You've read everything else posted on this instance.",
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
            section.querySelector('[data-stream-count]').textContent =
                `${posts.length} post${posts.length === 1 ? '' : 's'}`;
            const items = [];
            let lastDay = '';
            for (const post of posts) {
                const day = dayKey(post.created);
                if (day && day !== lastDay) {
                    items.push({
                        key: `day:${day}`,
                        html: `<h3 class="social-day"><time datetime="${escapeHtml(post.created)}">${escapeHtml(formatDayLabel(post.created))}</time></h3>`,
                    });
                    lastDay = day;
                }
                items.push({ key: post.id, html: this.renderPost(post) });
            }
            patchKeyed(
                section.querySelector('[data-stream-posts]'),
                items.length
                    ? items
                    : [
                          {
                              key: 'empty',
                              html: `<p class="social-stream-empty">${escapeHtml(empty)}</p>`,
                          },
                      ],
                { animateNew }
            );
        }
        container.dataset.ready = '1';
        applyTints(container);
        this.observeWaves(container);
        this.markNowPlaying();
    }

    /** The right page of a spread: credits, the member's note, then the running order. */
    spreadHTML(payload, note) {
        const kind = payload.type || 'track';
        const title = payload.title || 'Shared music';
        const href = safeHref(payload.href, `/${kind}/${encodeURIComponent(payload.id || '')}`);
        const playable = ['track', 'album'].includes(kind) && payload.id;
        const art = payload.image
            ? `<img src="${escapeHtml(payload.image)}" alt="" loading="lazy" crossorigin="anonymous" data-tint ${COVER_ERROR} />`
            : `<span class="social-spread-placeholder" aria-hidden="true">${icon.music(28)}</span>`;
        const lane = kind === 'track' ? ' is-track' : kind === 'album' ? ' is-album' : ' is-other';
        const byline = [payload.subtitle, kind === 'track' ? '' : KIND_LABEL[kind]].filter(Boolean).join(', ');
        // A spread rebuilt after its ink is known is printed in it straight away, without a fade.
        const ink = cachedCoverColor(payload.image);
        const inkStyle = ink ? ` style="--tint:${escapeHtml(ink)}"` : '';
        let running = '';
        if (kind === 'track' && payload.id) {
            running = `<div class="social-groove">
                <div class="social-groove-wave is-loading" data-strip-wave="${escapeHtml(payload.id)}" title="Play from here"><canvas aria-hidden="true"></canvas><span class="social-groove-cue" aria-hidden="true"></span></div>
                <span class="social-groove-time" data-strip-duration="${escapeHtml(payload.id)}"></span>
            </div>`;
        } else if (kind === 'album' && payload.id) {
            running = `<ol class="social-tracklist is-loading" data-strip-album="${escapeHtml(payload.id)}" aria-label="Tracks of ${escapeHtml(title)}"></ol>
                <a class="social-tracklist-more" href="${escapeHtml(href)}" data-tracklist-more hidden></a>`;
        } else {
            running = `<a class="social-spread-open" href="${escapeHtml(href)}">${icon.open(15)}<span>Open ${escapeHtml((KIND_LABEL[kind] || 'page').toLowerCase())}</span></a>`;
        }
        return `<div class="social-spread${lane}${note ? ' has-note' : ''}" data-tint-target${inkStyle}>
            <div class="social-spread-cover">
                <a class="social-spread-art" href="${escapeHtml(href)}" aria-label="Open ${escapeHtml(title)}" tabindex="-1">${art}</a>
                ${playable ? `<button class="social-spread-play" type="button" data-play-kind="${escapeHtml(kind)}" data-play-id="${escapeHtml(payload.id)}" aria-label="Play ${escapeHtml(title)}">${PLAY_ICON}</button>` : ''}
            </div>
            <div class="social-spread-page">
                <div class="social-credits">
                    <a class="social-credits-title" href="${escapeHtml(href)}">${escapeHtml(title)}</a>
                    ${byline ? `<span class="social-credits-by">${escapeHtml(byline)}</span>` : ''}
                </div>
                ${note}
                ${running}
            </div>
        </div>`;
    }

    renderPost(post) {
        const author = this.manager.profiles.get(post.author);
        const name = displayName(author);
        const live = presenceState(this.manager.presence.get(post.author)).playing;
        const payload = post.payload && typeof post.payload === 'object' ? post.payload : null;
        const imageFile = post.image ? pb.files.getURL(post, post.image, { thumb: '640x0' }) : '';
        const imageFull = post.image ? pb.files.getURL(post, post.image) : '';
        const liked = this.myLikes.has(post.id);
        const likeCount = this.likeCounts.get(post.id) || 0;
        const commentCount = this.commentCounts.get(post.id) || 0;
        const expanded = this.expandedComments.has(post.id);
        const solo = !payload && !imageFile;
        const note = post.body
            ? `<p class="social-note${solo ? ' is-solo' : ''}${solo && post.body.length < 90 ? ' is-short' : ''}">${escapeHtml(post.body)}</p>`
            : '';

        let body = '';
        if (payload) {
            body = this.spreadHTML(payload, note);
            if (imageFile) {
                body += `<button class="social-post-photo is-extra" type="button" data-lightbox="${escapeHtml(imageFull)}" aria-label="Open the image"><img src="${escapeHtml(imageFile)}" alt="" loading="lazy" /></button>`;
            }
        } else if (imageFile) {
            body = `<div class="social-spread is-photo${note ? ' has-note' : ''}">
                <button class="social-post-photo" type="button" data-lightbox="${escapeHtml(imageFull)}" aria-label="Open the image"><img src="${escapeHtml(imageFile)}" alt="" loading="lazy" /></button>
                ${note ? `<div class="social-spread-page">${note}</div>` : ''}
            </div>`;
        } else {
            body = note;
        }

        return `<article class="social-post${solo ? ' is-text' : ''}" data-post-id="${escapeHtml(post.id)}">
            <header class="social-post-head">
                <a class="social-post-avatar" href="${escapeHtml(profileHref(author))}" tabindex="-1" aria-hidden="true">
                    <img src="${escapeHtml(avatarFor(author))}" alt="" loading="lazy" />
                </a>
                <span class="social-post-byline">
                    <a class="social-post-author" href="${escapeHtml(profileHref(author))}">${escapeHtml(name)}</a>
                    ${live ? '<i class="social-live-dot" title="Listening now"></i><span class="sr-only">, listening now</span>' : ''}
                    <span class="social-post-handle">${escapeHtml(handleFor(author))}</span>
                </span>
                <time class="social-post-time" datetime="${escapeHtml(post.created)}" title="${escapeHtml(fullDate(post.created))}">${escapeHtml(formatClock(post.created))}</time>
            </header>
            ${body}
            <footer class="social-post-actions">
                <button class="social-post-action social-post-like${liked ? ' is-liked' : ''}" type="button" data-post-like aria-pressed="${liked}" aria-label="${liked ? 'Unlike' : 'Like'}${likeCount ? `, ${likeCount} like${likeCount === 1 ? '' : 's'}` : ''}">
                    <span class="social-heart">${icon.heart(17)}</span><span class="social-post-count">${likeCount ? formatCount(likeCount) : ''}</span>
                </button>
                <button class="social-post-action${expanded ? ' is-open' : ''}" type="button" data-post-comment aria-expanded="${expanded}" aria-label="Comments${commentCount ? `, ${commentCount}` : ''}">
                    ${icon.messageCircle(17)}<span class="social-post-count">${commentCount ? formatCount(commentCount) : ''}</span>
                </button>
                ${payload ? `<button class="social-post-action is-send" type="button" data-post-share aria-label="Send to a friend">${icon.share(16)}<span>Send</span></button>` : ''}
            </footer>
            ${expanded ? this.renderComments(post) : ''}
        </article>`;
    }

    renderComments(post) {
        const list = this.comments.get(post.id) || [];
        const rows = list
            .map((comment) => {
                const author = this.manager.profiles.get(comment.author);
                return `<div class="social-comment" data-comment-id="${escapeHtml(comment.id)}">
                    <img src="${escapeHtml(avatarFor(author))}" alt="" loading="lazy" />
                    <p class="social-comment-copy"><a class="social-comment-author" href="${escapeHtml(profileHref(author))}">${escapeHtml(displayName(author))}</a><span class="social-comment-body">${escapeHtml(comment.body)}</span></p>
                    <time datetime="${escapeHtml(comment.created)}" title="${escapeHtml(fullDate(comment.created))}">${escapeHtml(formatClock(comment.created))}</time>
                </div>`;
            })
            .join('');
        const me = this.manager.me;
        return `<div class="social-post-comments"><div class="social-comments-inner">
            ${rows}
            <label class="social-comment-compose">
                <img src="${escapeHtml(avatarFor(me))}" alt="" />
                <input class="social-comment-input" type="text" data-post-id="${escapeHtml(post.id)}" placeholder="${rows ? 'Add a comment' : 'Be the first to comment'}" aria-label="Add a comment" maxlength="1024" />
            </label>
        </div></div>`;
    }

    /* ------------------------------ running order ------------------------------ */

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
                // Rooted on the page's scroller: with the viewport as root, the scroller's
                // clipping cancels the margin and every list loads only once already on screen.
                { root: container.closest('.main-content'), rootMargin: '240px 0px' }
            );
        }
        container.querySelectorAll('[data-strip-wave]').forEach((wave) => {
            if (this.peaks.has(wave.dataset.stripWave)) this.paintWave(wave);
            else this.waveObserver.observe(wave);
        });
        container.querySelectorAll('[data-strip-album]').forEach((list) => {
            if (this.albums.has(list.dataset.stripAlbum)) this.paintAlbum(list);
            else this.waveObserver.observe(list);
        });
    }

    loadAlbum(list) {
        const albumId = list.dataset.stripAlbum;
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

    /** The album's own running order, as printed on the back of the sleeve. */
    paintAlbum(list) {
        const tracks = this.albums.get(list.dataset.stripAlbum) || [];
        list.classList.remove('is-loading');
        if (!tracks.length) {
            list.classList.add('is-flat');
            return;
        }
        // A one-track album is that track: print its real groove rather than a single line.
        if (tracks.length === 1 && tracks[0].id) {
            const groove = document.createElement('div');
            groove.className = 'social-groove';
            groove.innerHTML = `<div class="social-groove-wave is-loading" data-strip-wave="${escapeHtml(tracks[0].id)}" title="Play from here"><canvas aria-hidden="true"></canvas><span class="social-groove-cue" aria-hidden="true"></span></div><span class="social-groove-time" data-strip-duration="${escapeHtml(tracks[0].id)}"></span>`;
            if (list.nextElementSibling?.matches('[data-tracklist-more]')) list.nextElementSibling.remove();
            list.replaceWith(groove);
            const wave = groove.querySelector('[data-strip-wave]');
            if (this.peaks.has(tracks[0].id)) this.paintWave(wave);
            else this.loadWave(wave);
            return;
        }
        if (list.dataset.painted === '1') return;
        list.dataset.painted = '1';
        const revealKey = `${list.closest('[data-post-id]')?.dataset.postId}:album:${list.dataset.stripAlbum}`;
        list.classList.toggle('is-settled', this.revealed.has(revealKey));
        this.revealed.add(revealKey);
        list.innerHTML = tracks
            .slice(0, TRACKLIST_ROWS)
            .map(
                (track, index) =>
                    `<li style="--row:${index}"><button class="social-tracklist-row" type="button" data-album-index="${index}" data-track-id="${escapeHtml(track.id)}" aria-label="Play ${escapeHtml(track.title)}, track ${index + 1}">
                        <span class="social-tracklist-no" aria-hidden="true"><span class="social-tracklist-digit">${index + 1}</span>${icon.play(12)}</span>
                        <span class="social-tracklist-title">${escapeHtml(track.title)}</span>
                        <span class="social-tracklist-time">${escapeHtml(formatDuration(track.duration))}</span>
                    </button></li>`
            )
            .join('');
        const more = list.nextElementSibling?.matches('[data-tracklist-more]') ? list.nextElementSibling : null;
        if (more) {
            const total = tracks.reduce((sum, track) => sum + track.duration, 0);
            more.textContent = `${tracks.length > TRACKLIST_ROWS ? `All ${tracks.length} tracks` : `${tracks.length} tracks`}${total ? `, ${formatDuration(total)}` : ''}`;
            more.hidden = false;
        }
        this.markNowPlaying();
    }

    /** The row of whatever you are hearing right now carries a small equalizer. */
    markNowPlaying() {
        const current = this.manager.player?.currentTrack;
        const playing = current && !this.manager.player?.activeElement?.paused;
        const id = current ? String(current.id) : '';
        document.querySelectorAll('#social-feed .social-tracklist-row').forEach((row) => {
            const on = Boolean(playing && id && row.dataset.trackId === id);
            row.classList.toggle('is-current', on);
            if (on) row.setAttribute('aria-current', 'true');
            else row.removeAttribute('aria-current');
        });
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
            this.markNowPlaying();
        } catch (error) {
            console.warn('[Social] Album playback failed:', error);
            showNotification('That album could not be played', 'error');
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
        const spread = wave.closest('.social-spread');
        const color = (spread && getComputedStyle(spread).getPropertyValue('--tint').trim()) || '';
        drawWave(wave.querySelector('canvas'), result.peaks, { color: color || '#a08f99', progress: 1, flat: true });
        if (!wave.classList.contains('is-drawn')) {
            const revealKey = `${wave.closest('[data-post-id]')?.dataset.postId}:wave:${wave.dataset.stripWave}`;
            wave.classList.toggle('is-settled', this.revealed.has(revealKey));
            this.revealed.add(revealKey);
            wave.classList.add('is-drawn');
        }
        const time = spread?.querySelector('[data-strip-duration]');
        if (time && result.duration) time.textContent = formatDuration(result.duration);
        // The spot ink may land after the first paint; repaint once it does.
        if (!color && spread && !wave.dataset.awaitingTint) {
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
        if (event.target.closest('[data-feed-retry]')) {
            this.refresh().catch(() => {});
            return;
        }
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
        const photo = event.target.closest('[data-lightbox]');
        if (photo) {
            this.manager.openLightbox(photo.dataset.lightbox);
            return;
        }
        const row = event.target.closest('[data-album-index]');
        if (row) {
            const list = row.closest('[data-strip-album]');
            pulse(row, 'is-cued');
            this.playAlbumFrom(list.dataset.stripAlbum, Number(row.dataset.albumIndex) || 0).catch(console.error);
            return;
        }
        const wave = event.target.closest('[data-strip-wave]');
        if (wave) {
            const rect = wave.getBoundingClientRect();
            const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            const duration = this.peaks.get(wave.dataset.stripWave)?.duration || 0;
            wave.style.setProperty('--cue', fraction.toFixed(4));
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
        const button = () =>
            document.querySelector(`#social-feed [data-post-id="${CSS.escape(postId)}"] [data-post-like]`);
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
        try {
            const record = await pb.collection('social_post_likes').create({ post: postId, user: this.userId });
            this.myLikes.set(postId, record.id);
        } catch (error) {
            // Roll the heart back so the page never claims a like the server refused.
            this.myLikes.delete(postId);
            this.likeCounts.set(postId, Math.max(0, (this.likeCounts.get(postId) || 1) - 1));
            this.render();
            showNotification('The like did not go through', 'error');
            throw error;
        }
    }

    async submitComment(postId, input) {
        const body = input.value.trim();
        if (!postId || !body || !this.userId) return;
        input.disabled = true;
        try {
            const record = await pb
                .collection('social_post_comments')
                .create({ post: postId, author: this.userId, body });
            input.value = '';
            await this.refresh();
            pulse(document.querySelector(`#social-feed [data-comment-id="${CSS.escape(record.id)}"]`), 'is-entering');
            document
                .querySelector(`#social-feed [data-post-id="${CSS.escape(postId)}"] .social-comment-input`)
                ?.focus({ preventScroll: true });
        } catch (error) {
            showNotification('The comment was not posted. Try again.', 'error');
            throw error;
        } finally {
            input.disabled = false;
        }
    }
}
