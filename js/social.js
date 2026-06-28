import { pb } from './accounts/config.js';
import { authManager } from './accounts/auth.js';
import { escapeHtml, getTrackArtists } from './utils.js';
import { showNotification } from './downloads.js';

const ACTIVE_WINDOW_MS = 90_000;
const PRESENCE_HEARTBEAT_MS = 30_000;
const PRESENCE_PROGRESS_MS = 15_000;
const SOCIAL_POLL_MS = 15_000;

function parseJson(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function avatarFor(profile) {
    return profile?.avatar_url || '/assets/appicon.png';
}

function displayName(profile) {
    return profile?.display_name || profile?.username || 'Homelab member';
}

function cleanImage(value) {
    if (!value || typeof value !== 'string' || value.startsWith('blob:') || value.startsWith('data:')) return '';
    return value;
}

function profileHref(profile) {
    return profile?.username ? `/user/@${encodeURIComponent(profile.username)}` : '#';
}

function formatMessageTime(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function presenceState(presence) {
    const timestamp = Date.parse(presence?.last_seen || presence?.updated || 0);
    const online = Number.isFinite(timestamp) && Date.now() - timestamp < ACTIVE_WINDOW_MS;
    const track = parseJson(presence?.track);
    return { online, track: online ? track : null, playing: online && Boolean(presence?.is_playing) };
}

function itemTitle(kind, item) {
    return kind === 'artist' ? item.name : item.title || item.name;
}

function itemSubtitle(kind, item) {
    if (kind === 'track') return getTrackArtists(item) || item.artist?.name || 'Track';
    if (kind === 'album') return item.artist?.name || item.artists?.[0]?.name || 'Album';
    return 'Artist';
}

function itemImage(kind, item) {
    if (kind === 'track') return cleanImage(item.album?.cover || item.cover);
    if (kind === 'album') return cleanImage(item.cover);
    return cleanImage(item.picture || item.cover);
}

function sharePayload(kind, item) {
    const id = String(item.id || item.uuid || '');
    const title = itemTitle(kind, item) || `Shared ${kind}`;
    return {
        id,
        type: kind,
        title,
        subtitle: itemSubtitle(kind, item),
        image: itemImage(kind, item),
        href: `/${kind}/${encodeURIComponent(id)}`,
    };
}

export class SocialManager {
    constructor() {
        this.api = null;
        this.player = null;
        this.profiles = [];
        this.presence = new Map();
        this.selectedProfile = null;
        this.messages = [];
        this.shareItems = new Map();
        this.unsubscribe = [];
        this.initialized = false;
        this.lastPresenceProgress = 0;
        this.heartbeat = null;
        this.poller = null;
        this.searchTimer = null;
        this.bound = false;
        this.realtimeEnabled = false;
        this.initializing = null;
    }

    get userId() {
        return authManager.user?.$id || pb.authStore.model?.id || null;
    }

    async initialize(api, player) {
        if (this.initializing) return this.initializing;
        this.initializing = this._initialize(api, player);
        try {
            await this.initializing;
        } finally {
            this.initializing = null;
        }
    }

    async _initialize(api, player) {
        this.api = api;
        this.player = player;
        if (!this.bound) this.bindUI();
        this.attachPlayerPresence();

        if (!this.userId) return;
        await this.syncCurrentProfile().catch((error) => console.warn('[Social] Profile sync failed:', error));
        await Promise.all([this.refreshDirectory(), this.refreshUnreadCount()]);
        this.startHeartbeat();
        this.startPolling();
        this.subscribeRealtime().catch((error) => {
            this.realtimeEnabled = false;
            console.warn('[Social] Realtime unavailable, using polling:', error);
        });
        this.initialized = true;
    }

    async syncCurrentProfile(source = null) {
        const uid = this.userId;
        if (!uid) return null;

        let profile = source;
        if (!profile) {
            const result = await pb.collection('DB_users').getList(1, 1, {
                filter: `firebase_id="${uid}"`,
                fields: 'username,display_name,avatar_url,banner,status,about,website',
            });
            profile = result.items[0] || {};
        }

        const data = {
            user: uid,
            username: profile.username || pb.authStore.model?.name || pb.authStore.model?.email?.split('@')[0] || '',
            display_name: profile.display_name || profile.name || '',
            avatar_url: profile.avatar_url || '',
            banner: profile.banner || '',
            status: profile.status || '',
            about: profile.about || '',
            website: profile.website || '',
        };
        const existing = await pb.collection('social_profiles').getList(1, 1, { filter: `user="${uid}"` });
        const saved = existing.items[0]
            ? await pb.collection('social_profiles').update(existing.items[0].id, data)
            : await pb.collection('social_profiles').create(data);
        return saved;
    }

    async refreshDirectory() {
        if (!this.userId) {
            this.renderSignedOut();
            return;
        }
        const [profiles, presence] = await Promise.all([
            pb.collection('social_profiles').getFullList({ sort: 'display_name,username' }),
            pb.collection('social_presence').getFullList({ sort: '-last_seen' }),
        ]);
        this.profiles = profiles;
        this.presence = new Map(presence.map((item) => [item.user, item]));
        this.renderDirectory();
        this.updateThreadHeader();
    }

    renderSignedOut() {
        const list = document.getElementById('social-people-list');
        if (!list) return;
        list.innerHTML = `<div class="social-directory-empty"><strong>Sign in to use Social</strong><span>Your homelab conversations are private to signed-in members.</span></div>`;
        document.getElementById('social-people-count').textContent = '0';
    }

    renderDirectory(query = '') {
        const list = document.getElementById('social-people-list');
        if (!list) return;
        const normalized = query.trim().toLowerCase();
        const filtered = this.profiles.filter((profile) =>
            `${profile.display_name || ''} ${profile.username || ''}`.toLowerCase().includes(normalized)
        );
        document.getElementById('social-people-count').textContent = String(this.profiles.length);
        if (!filtered.length) {
            list.innerHTML = `<div class="social-directory-empty"><strong>No people found</strong><span>Try another name.</span></div>`;
            return;
        }

        list.innerHTML = filtered
            .map((profile) => {
                const state = presenceState(this.presence.get(profile.user));
                const isSelf = profile.user === this.userId;
                const selected = profile.user === this.selectedProfile?.user;
                const status = state.track
                    ? `${state.playing ? 'Listening' : 'Paused'} · ${state.track.title}`
                    : state.online
                      ? 'Online'
                      : 'Offline';
                return `<button class="social-person${selected ? ' is-active' : ''}${isSelf ? ' is-self' : ''}" type="button" data-social-user="${escapeHtml(profile.user)}" ${isSelf ? 'data-self="true"' : ''}>
                    <span class="social-avatar-wrap"><img src="${escapeHtml(avatarFor(profile))}" alt="" /><span class="social-presence-dot${state.online ? ' is-online' : ''}${state.playing ? ' is-listening' : ''}"></span></span>
                    <span class="social-person-copy"><span><strong>${escapeHtml(displayName(profile))}</strong>${isSelf ? '<em>You</em>' : ''}</span><small>${escapeHtml(status)}</small></span>
                    ${state.playing ? '<span class="social-equalizer" aria-label="Listening now"><i></i><i></i><i></i></span>' : ''}
                </button>`;
            })
            .join('');
    }

    async renderPage(username = '') {
        document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
        document.getElementById('page-social')?.classList.add('active');
        if (!this.userId) {
            this.renderSignedOut();
            return;
        }
        await this.refreshDirectory();
        if (username) {
            const clean = decodeURIComponent(username).replace(/^@/, '').toLowerCase();
            const profile = this.profiles.find((item) => item.username?.toLowerCase() === clean);
            if (profile && profile.user !== this.userId) await this.openConversation(profile.user);
        }
    }

    async openConversation(userId) {
        const profile = this.profiles.find((item) => item.user === userId);
        if (!profile) return;
        if (userId === this.userId) {
            window.location.assign(profileHref(profile));
            return;
        }
        this.selectedProfile = profile;
        this.renderDirectory(document.getElementById('social-user-search')?.value || '');
        document.getElementById('social-empty-state').hidden = true;
        document.getElementById('social-thread').hidden = false;
        document.querySelector('.social-shell')?.classList.add('has-thread');
        this.updateThreadHeader();
        await this.loadConversation();
        history.replaceState({}, '', `/social/@${encodeURIComponent(profile.username || '')}`);
    }

    updateThreadHeader() {
        if (!this.selectedProfile) return;
        const profile = this.selectedProfile;
        const state = presenceState(this.presence.get(profile.user));
        const avatar = document.getElementById('social-thread-avatar');
        if (avatar) avatar.src = avatarFor(profile);
        document.getElementById('social-thread-name').textContent = displayName(profile);
        document.getElementById('social-thread-status').textContent = state.track
            ? `${state.playing ? 'Listening to' : 'Paused'} ${state.track.title}`
            : state.online
              ? 'Online now'
              : 'Offline';
        document.getElementById('social-thread-presence-dot')?.classList.toggle('is-online', state.online);
        document.getElementById('social-thread-presence-dot')?.classList.toggle('is-listening', state.playing);
        for (const id of ['social-thread-profile', 'social-open-profile']) {
            const link = document.getElementById(id);
            if (link) link.href = profileHref(profile);
        }
    }

    async loadConversation() {
        if (!this.selectedProfile || !this.userId) return;
        const other = this.selectedProfile.user;
        this.messages = await pb.collection('social_messages').getFullList({
            filter: `(sender="${this.userId}" && recipient="${other}") || (sender="${other}" && recipient="${this.userId}")`,
            sort: 'created',
        });
        this.renderMessages();
        const unread = this.messages.filter((message) => message.recipient === this.userId && !message.read);
        await Promise.all(unread.map((message) => pb.collection('social_messages').update(message.id, { read: true })));
        await this.refreshUnreadCount();
    }

    renderMessages() {
        const container = document.getElementById('social-messages');
        if (!container) return;
        if (!this.messages.length) {
            container.innerHTML = `<div class="social-new-thread"><span>New conversation</span><strong>Share what you are listening to.</strong></div>`;
            return;
        }
        container.innerHTML = this.messages
            .map((message) => {
                const own = message.sender === this.userId;
                const payload = parseJson(message.payload);
                const shared = message.kind !== 'text' && payload ? this.renderSharedCard(payload) : '';
                return `<div class="social-message-row${own ? ' is-own' : ''}">
                    <div class="social-message-bubble${shared ? ' has-share' : ''}">
                        ${message.body ? `<p>${escapeHtml(message.body)}</p>` : ''}
                        ${shared}
                        <time>${escapeHtml(formatMessageTime(message.created))}</time>
                    </div>
                </div>`;
            })
            .join('');
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }

    renderSharedCard(payload) {
        const image = payload.image
            ? `<img src="${escapeHtml(payload.image)}" alt="" />`
            : `<span class="social-share-placeholder">${escapeHtml((payload.type || 'M').slice(0, 1).toUpperCase())}</span>`;
        return `<a class="social-message-share" href="${escapeHtml(payload.href || '#')}">
            ${image}<span><em>${escapeHtml(payload.type || 'Music')}</em><strong>${escapeHtml(payload.title || 'Shared music')}</strong><small>${escapeHtml(payload.subtitle || '')}</small></span>
            <span class="social-message-share-arrow">↗</span>
        </a>`;
    }

    async sendMessage(body = '', share = null) {
        if (!this.selectedProfile || !this.userId) return;
        const text = body.trim();
        if (!text && !share) return;
        await pb.collection('social_messages').create({
            sender: this.userId,
            recipient: this.selectedProfile.user,
            kind: share?.type || 'text',
            body: text,
            payload: share || null,
            read: false,
        });
        document.getElementById('social-message-input').value = '';
        await this.loadConversation();
    }

    async refreshUnreadCount() {
        const badge = document.getElementById('social-unread-badge');
        if (!badge || !this.userId) return;
        const result = await pb.collection('social_messages').getList(1, 1, {
            filter: `recipient="${this.userId}" && read=false`,
            fields: 'id',
        });
        const count = result.totalItems || 0;
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.hidden = count === 0;
    }

    async searchShares(query) {
        const container = document.getElementById('social-share-results');
        if (!container) return;
        if (!query.trim()) {
            container.innerHTML = '<div class="social-share-hint">Search by title or artist.</div>';
            return;
        }
        container.innerHTML = '<div class="social-share-hint">Searching…</div>';
        const result = await this.api.search(query.trim());
        const groups = [
            ['track', result.tracks?.items || result.tracks || []],
            ['album', result.albums?.items || result.albums || []],
            ['artist', result.artists?.items || result.artists || []],
        ];
        this.shareItems.clear();
        const html = groups
            .flatMap(([kind, items]) =>
                items.slice(0, 4).map((item) => {
                    const key = `${kind}:${item.id}`;
                    this.shareItems.set(key, { kind, item });
                    const image = itemImage(kind, item);
                    return `<button class="social-share-result" type="button" data-share-key="${escapeHtml(key)}">
                        ${image ? `<img src="${escapeHtml(image)}" alt="" />` : '<span class="social-share-placeholder">♪</span>'}
                        <span><em>${escapeHtml(kind)}</em><strong>${escapeHtml(itemTitle(kind, item) || 'Untitled')}</strong><small>${escapeHtml(itemSubtitle(kind, item))}</small></span>
                        <b>Send</b>
                    </button>`;
                })
            )
            .join('');
        container.innerHTML = html || '<div class="social-share-hint">No music found.</div>';
    }

    updateNowPlayingShare() {
        const button = document.getElementById('social-share-now-playing');
        const track = this.player?.currentTrack;
        if (!button) return;
        button.hidden = !track;
        if (!track) return;
        button.innerHTML = `<span>NOW PLAYING</span><strong>${escapeHtml(track.title || 'Untitled')}</strong><small>${escapeHtml(getTrackArtists(track))}</small><b>Send</b>`;
    }

    bindUI() {
        this.bound = true;
        document.getElementById('social-user-search')?.addEventListener('input', (event) =>
            this.renderDirectory(event.target.value)
        );
        document.getElementById('social-people-list')?.addEventListener('click', (event) => {
            const row = event.target.closest('[data-social-user]');
            if (row) this.openConversation(row.dataset.socialUser).catch(console.error);
        });
        document.getElementById('social-thread-back')?.addEventListener('click', () => {
            document.querySelector('.social-shell')?.classList.remove('has-thread');
        });
        document.getElementById('social-composer')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const input = document.getElementById('social-message-input');
            this.sendMessage(input.value).catch((error) => showNotification(error.message, 'error'));
        });
        document.getElementById('social-message-input')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
            }
        });
        document.getElementById('social-share-toggle')?.addEventListener('click', () => {
            const panel = document.getElementById('social-share-panel');
            panel.hidden = !panel.hidden;
            this.updateNowPlayingShare();
            if (!panel.hidden) document.getElementById('social-share-search')?.focus();
        });
        document.getElementById('social-share-close')?.addEventListener('click', () => {
            document.getElementById('social-share-panel').hidden = true;
        });
        document.getElementById('social-share-search')?.addEventListener('input', (event) => {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => this.searchShares(event.target.value).catch(console.error), 220);
        });
        document.getElementById('social-share-results')?.addEventListener('click', (event) => {
            const row = event.target.closest('[data-share-key]');
            const entry = row && this.shareItems.get(row.dataset.shareKey);
            if (!entry) return;
            this.sendMessage('', sharePayload(entry.kind, entry.item))
                .then(() => {
                    document.getElementById('social-share-panel').hidden = true;
                })
                .catch((error) => showNotification(error.message, 'error'));
        });
        document.getElementById('social-share-now-playing')?.addEventListener('click', () => {
            const track = this.player?.currentTrack;
            if (!track) return;
            this.sendMessage('', sharePayload('track', track))
                .then(() => {
                    document.getElementById('social-share-panel').hidden = true;
                })
                .catch((error) => showNotification(error.message, 'error'));
        });
    }

    attachPlayerPresence() {
        if (!this.player || this.player.__socialPresenceAttached) return;
        this.player.__socialPresenceAttached = true;
        for (const element of [this.player.audio, this.player.video].filter(Boolean)) {
            element.addEventListener('play', () => this.publishPresence().catch(console.error));
            element.addEventListener('pause', () => this.publishPresence().catch(console.error));
            element.addEventListener('ended', () => this.publishPresence(null).catch(console.error));
            element.addEventListener('timeupdate', () => {
                if (Date.now() - this.lastPresenceProgress < PRESENCE_PROGRESS_MS) return;
                this.lastPresenceProgress = Date.now();
                this.publishPresence().catch(console.error);
            });
        }
    }

    startHeartbeat() {
        clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => this.publishPresence().catch(console.error), PRESENCE_HEARTBEAT_MS);
        this.publishPresence().catch(console.error);
    }

    startPolling() {
        clearInterval(this.poller);
        this.poller = setInterval(() => this.pollSocialState().catch(console.error), SOCIAL_POLL_MS);
    }

    async pollSocialState() {
        if (!this.userId || this.realtimeEnabled) return;
        await Promise.allSettled([
            this.refreshDirectory(),
            this.refreshUnreadCount(),
            this.selectedProfile ? this.loadConversation() : Promise.resolve(),
        ]);
        const profilePage = document.getElementById('page-profile');
        const username = document.getElementById('profile-username')?.textContent?.replace(/^@/, '');
        if (profilePage?.classList.contains('active') && username) {
            await this.renderProfilePresence(username).catch(console.error);
        }
    }

    async publishPresence(forcedTrack = undefined) {
        const uid = this.userId;
        if (!uid) return;
        const track = forcedTrack === undefined ? this.player?.currentTrack : forcedTrack;
        const element = this.player?.activeElement;
        const payload = track ? sharePayload('track', track) : null;
        const data = {
            user: uid,
            track: payload,
            is_playing: Boolean(track && element && !element.paused),
            position: Number(element?.currentTime || 0),
            last_seen: new Date().toISOString(),
        };
        const existing = await pb.collection('social_presence').getList(1, 1, { filter: `user="${uid}"` });
        if (existing.items[0]) await pb.collection('social_presence').update(existing.items[0].id, data);
        else await pb.collection('social_presence').create(data);
    }

    async subscribeRealtime() {
        this.unsubscribe.forEach((callback) => callback());
        this.unsubscribe = [];
        const subscriptions = [];
        for (const collection of ['social_profiles', 'social_presence', 'social_messages']) {
            const unsubscribe = await pb.collection(collection).subscribe('*', async (event) => {
                if (collection === 'social_messages') {
                    const relevant = event.record.sender === this.userId || event.record.recipient === this.userId;
                    if (!relevant) return;
                    await this.refreshUnreadCount();
                    if (
                        this.selectedProfile &&
                        (event.record.sender === this.selectedProfile.user || event.record.recipient === this.selectedProfile.user)
                    ) {
                        await this.loadConversation();
                    }
                } else {
                    await this.refreshDirectory();
                    const profilePage = document.getElementById('page-profile');
                    const username = document.getElementById('profile-username')?.textContent?.replace(/^@/, '');
                    if (profilePage?.classList.contains('active') && username) {
                        await this.renderProfilePresence(username);
                    }
                }
            });
            subscriptions.push(unsubscribe);
        }
        this.unsubscribe = subscriptions;
        this.realtimeEnabled = true;
    }

    async renderProfilePresence(username) {
        const container = document.getElementById('profile-now-playing');
        if (!container) return;
        container.style.display = 'none';
        const profile = await pb
            .collection('social_profiles')
            .getFirstListItem(`username="${String(username).replaceAll('"', '\\"')}"`)
            .catch(() => null);
        if (!profile) return;
        const presence = await pb
            .collection('social_presence')
            .getFirstListItem(`user="${profile.user}"`)
            .catch(() => null);
        const state = presenceState(presence);
        if (!state.track) return;
        container.innerHTML = `<span class="social-equalizer"><i></i><i></i><i></i></span><span><em>${state.playing ? 'LISTENING NOW' : 'PAUSED'}</em><strong>${escapeHtml(state.track.title)}</strong><small>${escapeHtml(state.track.subtitle || '')}</small></span><a href="${escapeHtml(state.track.href || '#')}">Open</a>`;
        container.style.display = 'flex';
    }
}

export const socialManager = new SocialManager();

export function syncSocialProfile(profile) {
    return socialManager.syncCurrentProfile(profile);
}
