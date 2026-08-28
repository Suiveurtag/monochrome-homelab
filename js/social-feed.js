// js/social-feed.js — the instance-wide feed tab: a composer plus a thread of
// posts from every account on this Monochrome instance.

import { pb } from './accounts/config.js';
import { escapeHtml } from './utils.js';
import { showNotification } from './downloads.js';
import { shareCardHTML } from './share.js';
import { icon } from './social-icons.js';
import { splitFeedPosts } from './social-state.js';
import { canUsePermission } from './access-control.js';
import {
    avatarFor,
    displayName,
    handleFor,
    profileHref,
    sharePayload,
    formatRelativeTime,
    formatCount,
    cleanImage,
    presenceState,
} from './social-utils.js';

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
        button.disabled = !canPost || (!input?.value.trim() && !this.attachment);
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
                  : '';
        const label =
            this.attachment.type === 'image'
                ? 'Image attached'
                : `${this.attachment.payload.type} · ${this.attachment.payload.title}`;
        container.innerHTML = `<div class="social-attachment-chip">${thumb}<span>${escapeHtml(label)}</span>
            <button type="button" class="social-attachment-remove" aria-label="Remove attachment">${icon.x(14)}</button></div>`;
        container.querySelector('.social-attachment-remove')?.addEventListener('click', () => this.setAttachment(null));
    }

    toggleMusicPicker() {
        const picker = document.getElementById('social-post-music-picker');
        if (!picker) return;
        if (!picker.hidden) {
            picker.hidden = true;
            picker.innerHTML = '';
            return;
        }
        picker.hidden = false;
        const track = this.manager.player?.currentTrack;
        picker.innerHTML = `
            <div class="social-picker-search">
                ${icon.search(15)}
                <input type="search" id="social-picker-search" placeholder="Search tracks and albums" autocomplete="off" />
            </div>
            <div class="social-picker-results" id="social-picker-results">
                ${
                    track
                        ? `<button class="social-picker-result" type="button" data-picker-nowplaying>${icon.audioLines(16)}<span><em>Now playing</em><strong>${escapeHtml(track.title || '')}</strong></span></button>`
                        : '<div class="social-picker-hint">Nothing is playing — search instead.</div>'
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
            results.innerHTML = '<div class="social-picker-hint">Nothing found.</div>';
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
        const body = input?.value.trim() || '';
        if (!body && !this.attachment) return;
        const data = { author: this.userId, body };
        if (this.attachment?.type === 'image') data.image = this.attachment.file;
        if (this.attachment?.payload) data.payload = this.attachment.payload;
        await pb.collection('social_posts').create(data);
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
            container.innerHTML = `<div class="social-feed-empty">
                ${icon.audioLines(22)}
                <strong>Nothing has been posted yet</strong>
                <span>Be the first — share what you're playing above.</span>
            </div>`;
            return;
        }
        const { circle, instance } = splitFeedPosts(this.posts, this.manager.following);
        container.innerHTML = [
            this.renderStream({
                posts: circle,
                title: 'Your circle',
                description: 'New music and notes from people you follow.',
                empty: 'Follow a few members and their posts will collect here.',
                kind: 'circle',
            }),
            this.renderStream({
                posts: instance,
                title: 'Across Monochrome',
                description: 'The rest of this instance, from newest to oldest.',
                empty: 'You are all caught up with the rest of the instance.',
                kind: 'instance',
            }),
        ].join('');
    }

    renderStream({ posts, title, description, empty, kind }) {
        const authors = [];
        const seen = new Set();
        for (const post of posts) {
            if (seen.has(post.author)) continue;
            seen.add(post.author);
            const profile = this.manager.profiles.get(post.author);
            if (profile) authors.push(profile);
            if (authors.length === 5) break;
        }
        const faces = authors
            .map((profile) => {
                const state = presenceState(this.manager.presence.get(profile.user));
                return `<span class="social-stream-face" title="${escapeHtml(displayName(profile))}">
                    <img class="social-stream-face-image" src="${escapeHtml(avatarFor(profile))}" alt="" loading="lazy" />
                    ${state.online ? `<span class="social-stream-face-dot${state.playing ? ' is-listening' : ''}" aria-hidden="true"></span>` : ''}
                </span>`;
            })
            .join('');
        const countLabel = `${posts.length} post${posts.length === 1 ? '' : 's'}`;
        const body = posts.length
            ? posts.map((post) => this.renderPost(post)).join('')
            : `<div class="social-stream-empty"><span class="social-stream-empty-icon">${icon.audioLines(17)}</span><span>${escapeHtml(empty)}</span></div>`;
        return `<section class="social-feed-stream is-${escapeHtml(kind)}" aria-labelledby="social-stream-${escapeHtml(kind)}">
            <header class="social-stream-head">
                <div><h2 id="social-stream-${escapeHtml(kind)}" class="social-stream-title">${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>
                <div class="social-stream-presence" aria-label="${escapeHtml(countLabel)}">${faces}<span class="social-stream-count">${escapeHtml(countLabel)}</span></div>
            </header>
            <div class="social-stream-posts">${body}</div>
        </section>`;
    }

    renderPost(post) {
        const author = this.manager.profiles.get(post.author);
        const name = displayName(author);
        const payload = post.payload && typeof post.payload === 'object' ? post.payload : null;
        const imageFile = post.image
            ? pb.files.getUrl(post, post.image, { thumb: '640x0' }) || pb.files.getUrl(post, post.image)
            : '';
        const liked = this.myLikes.has(post.id);
        const likeCount = this.likeCounts.get(post.id) || 0;
        const commentCount = this.commentCounts.get(post.id) || 0;
        const card = payload ? `<div class="social-post-card">${shareCardHTML(payload)}</div>` : '';
        const image = imageFile
            ? `<div class="social-post-image"><img src="${escapeHtml(imageFile)}" alt="" loading="lazy" /></div>`
            : '';
        const comments = this.expandedComments.has(post.id) ? this.renderComments(post) : '';
        return `<article class="social-post" data-post-id="${escapeHtml(post.id)}">
            <a class="social-post-avatar" href="${escapeHtml(profileHref(author))}" aria-label="${escapeHtml(name)}">
                <img src="${escapeHtml(avatarFor(author))}" alt="" loading="lazy" />
            </a>
            <div class="social-post-main">
                <header class="social-post-head">
                    <a class="social-post-author" href="${escapeHtml(profileHref(author))}"><strong>${escapeHtml(name)}</strong></a>
                    <span class="social-post-handle">${escapeHtml(handleFor(author))}</span>
                    <span class="social-post-dot" aria-hidden="true"></span>
                    <time datetime="${escapeHtml(post.created)}" title="${escapeHtml(post.created)}">${escapeHtml(formatRelativeTime(post.created))}</time>
                </header>
                ${post.body ? `<p class="social-post-body">${escapeHtml(post.body)}</p>` : ''}
                ${card}
                ${image}
                <footer class="social-post-actions">
                    <button class="social-post-action social-post-like${liked ? ' is-liked' : ''}" type="button" data-post-like aria-pressed="${liked}">
                        ${icon.heart(16)}<span>${likeCount ? formatCount(likeCount) : ''}</span>
                    </button>
                    <button class="social-post-action" type="button" data-post-comment aria-expanded="${this.expandedComments.has(post.id)}">
                        ${icon.messageCircle(16)}<span>${commentCount ? formatCount(commentCount) : ''}</span>
                    </button>
                    ${payload ? `<button class="social-post-action" type="button" data-post-share aria-label="Send to a friend">${icon.share(16)}</button>` : ''}
                </footer>
                ${comments}
            </div>
        </article>`;
    }

    renderComments(post) {
        const list = this.comments.get(post.id) || [];
        const rows = list
            .map((comment) => {
                const author = this.manager.profiles.get(comment.author);
                return `<div class="social-comment">
                    <img src="${escapeHtml(avatarFor(author))}" alt="" loading="lazy" />
                    <div class="social-comment-copy">
                        <strong>${escapeHtml(displayName(author))}</strong>
                        <p>${escapeHtml(comment.body)}</p>
                    </div>
                    <time>${escapeHtml(formatRelativeTime(comment.created))}</time>
                </div>`;
            })
            .join('');
        return `<div class="social-post-comments">
            ${rows}
            <div class="social-comment-compose">
                <input class="social-comment-input" type="text" data-post-id="${escapeHtml(post.id)}" placeholder="Add a comment…" maxlength="1024" />
            </div>
        </div>`;
    }

    onFeedClick(event) {
        const like = event.target.closest('[data-post-like]');
        if (like) {
            this.toggleLike(like.closest('[data-post-id]')?.dataset.postId).catch(console.error);
            return;
        }
        const commentToggle = event.target.closest('[data-post-comment]');
        if (commentToggle) {
            const postId = commentToggle.closest('[data-post-id]')?.dataset.postId;
            if (!postId) return;
            if (this.expandedComments.has(postId)) this.expandedComments.delete(postId);
            else this.expandedComments.add(postId);
            this.render();
            return;
        }
        const share = event.target.closest('[data-post-share]');
        if (share) {
            const post = this.posts.find((entry) => entry.id === share.closest('[data-post-id]')?.dataset.postId);
            if (post?.payload)
                this.manager.openShareSheet({ payload: post.payload, item: null, kind: post.payload.type });
            return;
        }
        const play = event.target.closest('[data-play-kind][data-play-id]');
        if (play) {
            event.preventDefault();
            this.manager.playSnippetAware(play);
        }
    }

    async toggleLike(postId) {
        if (!postId || !this.userId) return;
        const existing = this.myLikes.get(postId);
        if (existing) {
            this.myLikes.delete(postId);
            this.likeCounts.set(postId, Math.max(0, (this.likeCounts.get(postId) || 1) - 1));
            this.render();
            await pb.collection('social_post_likes').delete(existing).catch(console.error);
            return;
        }
        this.myLikes.set(postId, 'pending');
        this.likeCounts.set(postId, (this.likeCounts.get(postId) || 0) + 1);
        this.render();
        const record = await pb.collection('social_post_likes').create({ post: postId, user: this.userId });
        this.myLikes.set(postId, record.id);
    }

    async submitComment(postId, input) {
        const body = input.value.trim();
        if (!postId || !body || !this.userId) return;
        await pb.collection('social_post_comments').create({ post: postId, author: this.userId, body });
        input.value = '';
        await this.refresh();
    }
}
