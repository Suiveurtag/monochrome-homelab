// js/social.js — the Monochrome social surface: instance feed, direct messages,
// group chats, follows, mutes, pins, and presence. Data lives in PocketBase
// (social_* collections); realtime via subscriptions with a polling fallback.

import { pb } from './accounts/config.js';
import { authManager } from './accounts/auth.js';
import { escapeHtml, getTrackArtists } from './utils.js';
import { showNotification } from './downloads.js';
import { playSharedItem, shareCardHTML } from './share.js';
import { icon } from './social-icons.js';
import { SocialFeed } from './social-feed.js';
import { isMutualFriend, reconcileSentMessage } from './social-state.js';
import { shareSheet, bindShareSheetRecipientClicks } from './social-share-sheet.js';
import {
    avatarFor,
    dayKey,
    displayName,
    formatClock,
    formatDayLabel,
    formatDuration,
    formatListTime,
    formatRelativeTime,
    handleFor,
    itemTitle,
    parseJson,
    presenceState,
    profileHref,
    sharePayload,
} from './social-utils.js';

const PRESENCE_HEARTBEAT_MS = 30_000;
const PRESENCE_PROGRESS_MS = 15_000;
const SOCIAL_POLL_MS = 15_000;
const GROUP_MESSAGE_GAP_MS = 4 * 60_000;

function snippetPlayIcon(playing = false) {
    return `<span class="social-share-play"><svg class="social-share-morph-play-icon" viewBox="0 0 24 24" aria-hidden="true">${
        playing
            ? '<path d="M7 5.5H10.5V18.5H7Z"></path><path d="M13.5 5.5H17V18.5H13.5Z"></path>'
            : '<path d="M8 5.5L19 12L8 18.5Z"></path>'
    }</svg></span>`;
}

function messageFileUrl(record, filename, thumb = '') {
    if (!filename) return '';
    if (typeof filename === 'string' && (filename.startsWith('http') || filename.startsWith('blob:'))) return filename;
    const options = thumb ? { thumb } : {};
    if (pb.files?.getUrl) return pb.files.getUrl(record, filename, options);
    if (pb.files?.getURL) return pb.files.getURL(record, filename, options);
    const collection = record.collectionId || record.collectionName || 'social_messages';
    return `/api/files/${collection}/${record.id}/${filename}`;
}

function conversationTitle(conversation, profiles, meId) {
    if (conversation.type === 'group') return conversation.name || 'Group chat';
    const other = (conversation.members || []).find((member) => member !== meId);
    return displayName(profiles.get(other));
}

function conversationAvatar(conversation, profiles, meId) {
    if (conversation.type === 'group') return messageFileUrl(conversation, conversation.avatar, '160x160');
    const other = (conversation.members || []).find((member) => member !== meId);
    return avatarFor(profiles.get(other));
}

function groupAvatarHTML(conversation, profiles, size = '') {
    const avatar = conversationAvatar(conversation, null, null);
    const sizeClass = size ? ` is-${size}` : '';
    if (avatar) {
        return `<img class="social-group-avatar${sizeClass}" src="${escapeHtml(avatar)}" alt="" loading="lazy" />`;
    }
    const memberAvatars = (conversation.members || [])
        .map((member) => profiles?.get(member))
        .filter(Boolean)
        .slice(0, 4);
    if (memberAvatars.length) {
        return `<span class="social-group-collage${sizeClass} has-${memberAvatars.length}" aria-hidden="true">${memberAvatars
            .map((profile) => `<img src="${escapeHtml(avatarFor(profile))}" alt="" loading="lazy" />`)
            .join('')}</span>`;
    }
    return `<span class="social-group-tile${sizeClass}" aria-hidden="true">${icon.users(size === 'large' ? 24 : size === 'small' ? 14 : 18)}</span>`;
}

function previewFor(message) {
    if (!message) return 'Say hi with a track';
    if (message.body) return message.body;
    const kind = message.kind || 'text';
    if (kind === 'image') return 'Photo';
    if (kind === 'snippet') return `Snippet · ${parseJson(message.payload)?.title || ''}`;
    if (['track', 'album', 'artist'].includes(kind)) {
        const payload = parseJson(message.payload);
        return payload ? `${itemTitle(kind, payload)}` : kind;
    }
    return 'Message';
}

export class SocialManager {
    constructor() {
        this.api = null;
        this.player = null;
        this.feed = null;
        this.profiles = new Map();
        this.presence = new Map();
        this.following = new Set();
        this.followers = new Set();
        this.blocked = new Set();
        this.blockRecords = new Map();
        this.conversations = new Map();
        this.messagesByConversation = new Map();
        this.muted = new Set();
        this.muteRecords = new Map();
        this.readState = new Map();
        this.pins = [];
        this.activeId = null;
        this.tab = 'feed';
        this.infoOpen = false;
        this.shareItems = new Map();
        this.pendingShare = null;
        this.attachments = [];
        this.activeSnippet = null;
        this.unsubscribe = [];
        this.initialized = false;
        this.bound = false;
        this.realtimeEnabled = false;
        this.initializing = null;
        this.loadPromise = null;
        this.heartbeat = null;
        this.poller = null;
        this.clockTimer = null;
        this.lastPresenceProgress = 0;
        this.tempCounter = 0;
    }

    get userId() {
        return authManager.user?.$id || pb.authStore.model?.id || null;
    }

    get me() {
        return this.profiles.get(this.userId) || null;
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
        this.feed = new SocialFeed(this);
        if (!this.bound) this.bindUI();
        shareSheet.bind({
            getRecipients: () => this.shareRecipients(),
            ensureConversation: (userId) => this.ensureConversation(userId),
            sendToConversation: (conversationId, data) => this.sendToConversation(conversationId, data),
            resolveTrack: (trackId) => this.api.getTrackMetadata(trackId),
            toPayload: (kind, item) => sharePayload(kind, item),
            nowPlaying: () => {
                const track = this.player?.currentTrack;
                return track ? { raw: track, title: track.title, subtitle: getTrackArtists(track) } : null;
            },
            searchMusic: (query) => this.api.search(query),
        });
        bindShareSheetRecipientClicks();
        this.attachPlayerPresence();

        if (!this.userId) {
            this.renderSignedOut();
            return;
        }
        await this.syncCurrentProfile().catch((error) => console.warn('[Social] Profile sync failed:', error));
        await this.refreshAll();
        this.feed.bind();
        this.startHeartbeat();
        this.startPolling();
        this.startClock();
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
        this.profiles.set(uid, saved);
        return saved;
    }

    async refreshAll() {
        if (!this.userId) {
            this.renderSignedOut();
            return;
        }
        if (this.loadPromise) return this.loadPromise;
        this.loadPromise = this._loadEverything().finally(() => {
            this.loadPromise = null;
        });
        return this.loadPromise;
    }

    async _loadEverything() {
        const uid = this.userId;
        const [profiles, presence, follows, conversations, mutes, reads, pins, messages, blocks] = await Promise.all([
            pb.collection('social_profiles').getFullList({ sort: 'display_name,username' }),
            pb.collection('social_presence').getFullList({ sort: '-last_seen' }),
            pb.collection('social_follows').getFullList({ filter: `follower="${uid}" || following="${uid}"` }),
            pb.collection('social_conversations').getFullList({ sort: '-updated' }),
            pb.collection('social_mutes').getFullList({ filter: `user="${uid}"` }),
            pb.collection('social_reads').getFullList({ filter: `user="${uid}"` }),
            pb.collection('social_pins').getFullList({ filter: `user="${uid}"`, sort: '-created' }),
            pb.collection('social_messages').getFullList({ sort: 'created' }),
            pb
                .collection('social_blocks')
                .getFullList({ filter: `blocker="${uid}" || blocked="${uid}"` })
                .catch(() => []),
        ]);

        this.blocked = new Set();
        this.blockRecords = new Map();
        for (const block of blocks) {
            const other = block.blocker === uid ? block.blocked : block.blocker;
            if (other) this.blocked.add(other);
            if (block.blocker === uid) this.blockRecords.set(block.blocked, block.id);
        }

        this.profiles = new Map(
            profiles
                .filter((profile) => profile.user === uid || !this.blocked.has(profile.user))
                .map((profile) => [profile.user, profile])
        );
        if (!this.profiles.has(uid)) {
            await this.syncCurrentProfile().catch(() => {});
        }
        this.presence = new Map(
            presence.filter((item) => !this.blocked.has(item.user)).map((item) => [item.user, item])
        );
        this.following = new Set(
            follows.filter((f) => f.follower === uid && !this.blocked.has(f.following)).map((f) => f.following)
        );
        this.followers = new Set(
            follows.filter((f) => f.following === uid && !this.blocked.has(f.follower)).map((f) => f.follower)
        );
        this.conversations = new Map(
            conversations
                .filter((conversation) => {
                    if (conversation.type !== 'dm') return true;
                    const other = (conversation.members || []).find((member) => member !== uid);
                    return !this.blocked.has(other);
                })
                .map((conversation) => [conversation.id, conversation])
        );
        this.muteRecords = new Map(mutes.map((mute) => [mute.conversation, mute.id]));
        this.muted = new Set(this.muteRecords.keys());
        this.readState = new Map(reads.map((read) => [read.conversation, Date.parse(read.last_read || 0)]));
        this.pins = pins;
        this.messagesByConversation = new Map();
        for (const message of messages) {
            if (!message.conversation) continue;
            if (this.blocked.has(message.sender)) continue;
            if (!this.messagesByConversation.has(message.conversation)) {
                this.messagesByConversation.set(message.conversation, []);
            }
            this.messagesByConversation.get(message.conversation).push(message);
        }

        this.paint();
        this.refreshSidebarBadge();
    }

    paint() {
        this.renderRail();
        this.renderPresenceSummary();
        this.renderFeedRail();
        if (this.feed) this.feed.refresh().catch(() => {});
        if (this.activeId) {
            this.renderThread();
            if (this.infoOpen) this.renderInfoPanel();
        }
    }

    /* ---------------------------------- tabs --------------------------------- */

    setTab(tab) {
        this.tab = tab === 'messages' ? 'messages' : 'feed';
        const feedView = document.getElementById('social-feed-view');
        const messagesView = document.getElementById('social-messages-view');
        const feedTab = document.getElementById('social-tab-feed');
        const messagesTab = document.getElementById('social-tab-messages');
        const isMessages = this.tab === 'messages';
        if (feedView) feedView.hidden = isMessages;
        if (messagesView) messagesView.hidden = !isMessages;
        feedTab?.setAttribute('aria-selected', String(!isMessages));
        messagesTab?.setAttribute('aria-selected', String(isMessages));
        document.getElementById('page-social')?.classList.toggle('is-messages', isMessages);
        this.syncTabsThumb(isMessages ? messagesTab : feedTab);
        if (isMessages) {
            this.renderRail();
            if (this.activeId) this.scrollMessagesToBottom();
        } else if (this.feed) {
            this.feed.refresh().catch(() => {});
        }
        history.replaceState({}, '', '/social');
    }

    syncTabsThumb(activeTab) {
        const thumb = document.getElementById('social-tabs-thumb');
        if (!thumb || !activeTab) return;
        const place = () => {
            thumb.style.width = `${activeTab.offsetWidth}px`;
            thumb.style.transform = `translateX(${activeTab.offsetLeft - 3}px)`;
        };
        place();
        if (document.fonts?.ready) document.fonts.ready.then(place).catch(() => {});
    }

    /* ------------------------------- rail render ----------------------------- */

    renderRail(query = '') {
        const list = document.getElementById('social-conversation-list');
        if (!list) return;
        const previousActive = list.querySelector('.social-chat-row.is-active');
        const previousConversation = previousActive?.dataset.conversation || '';
        const previousTop = previousActive?.offsetTop ?? 0;
        const previousHeight = previousActive?.offsetHeight ?? 0;
        const normalized = query.trim().toLowerCase();
        const entries = [...this.conversations.values()]
            .map((conversation) => {
                const messages = this.messagesByConversation.get(conversation.id) || [];
                const last = messages[messages.length - 1];
                return { conversation, last, unread: this.unreadCount(conversation, messages) };
            })
            .filter((entry) =>
                normalized
                    ? conversationTitle(entry.conversation, this.profiles, this.userId)
                          .toLowerCase()
                          .includes(normalized)
                    : true
            )
            .sort(
                (a, b) =>
                    Date.parse(b.last?.created || b.conversation.updated) -
                    Date.parse(a.last?.created || a.conversation.updated)
            );

        if (!entries.length) {
            const emptyHtml = `<div class="social-rail-empty">${
                normalized ? 'No chats match.' : 'No chats yet — follow someone from their profile, then say hi.'
            }</div>`;
            if (list.innerHTML !== emptyHtml) list.innerHTML = emptyHtml;
        } else {
            const html = `<span class="social-conversation-indicator" aria-hidden="true"></span>${entries
                .map((entry) => this.renderConversationRow(entry))
                .join('')}`;
            if (list.innerHTML !== html) list.innerHTML = html;
            const indicator = list.querySelector('.social-conversation-indicator');
            const nextActive = list.querySelector('.social-chat-row.is-active');
            if (indicator && nextActive) {
                indicator.style.height = `${nextActive.offsetHeight}px`;
                indicator.style.transform = `translateY(${nextActive.offsetTop}px)`;
                if (
                    previousConversation &&
                    previousConversation !== nextActive.dataset.conversation &&
                    !matchMedia('(prefers-reduced-motion: reduce)').matches
                ) {
                    indicator.animate(
                        [
                            { height: `${previousHeight}px`, transform: `translateY(${previousTop}px)` },
                            {
                                height: `${nextActive.offsetHeight}px`,
                                transform: `translateY(${nextActive.offsetTop}px)`,
                            },
                        ],
                        { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
                    );
                }
            }
        }
        this.renderPeople(query);
    }

    renderConversationRow({ conversation, last, unread }) {
        const isGroup = conversation.type === 'group';
        const active = conversation.id === this.activeId;
        const muted = this.muted.has(conversation.id);
        const title = conversationTitle(conversation, this.profiles, this.userId);
        const avatar = conversationAvatar(conversation, this.profiles, this.userId);
        const state = isGroup ? { online: false, playing: false } : this.presenceStateFor(conversation);
        const art = isGroup
            ? groupAvatarHTML(conversation, this.profiles)
            : `<img src="${escapeHtml(avatar)}" alt="" loading="lazy" />`;
        const mine = last && last.sender === this.userId;
        const prefix = mine ? 'You: ' : '';
        return `<button class="social-chat-row${active ? ' is-active' : ''}${muted ? ' is-muted' : ''}" type="button" data-conversation="${escapeHtml(conversation.id)}">
            <span class="social-avatar-wrap">${art}${isGroup ? '' : `<span class="social-presence-dot${state.online ? ' is-online' : ''}${state.playing ? ' is-listening' : ''}"></span>`}</span>
            <span class="social-chat-copy">
                <span class="social-chat-top"><strong>${escapeHtml(title)}</strong><time>${escapeHtml(last ? formatListTime(last.created) : '')}</time></span>
                <span class="social-chat-bottom"><small>${escapeHtml(prefix + previewFor(last))}</small>
                ${muted ? `<span class="social-chat-muted" title="Muted">${icon.bellOff(13)}</span>` : ''}
                ${unread && !muted ? `<span class="social-chat-unread">${unread > 99 ? '99+' : unread}</span>` : ''}
                </span>
            </span>
        </button>`;
    }

    presenceStateFor(conversation) {
        const other = (conversation.members || []).find((member) => member !== this.userId);
        return presenceState(this.presence.get(other));
    }

    renderPeople(query = '') {
        const container = document.getElementById('social-people-list');
        const count = document.getElementById('social-people-count');
        const toolbar = document.getElementById('social-people-toolbar');
        if (!container) return;
        const hidePeople = this.conversations.size > 6;
        container.hidden = hidePeople;
        if (toolbar) toolbar.hidden = hidePeople;
        if (hidePeople) return;
        const normalized = query.trim().toLowerCase();
        const peopleAlreadyInChats = new Set();
        for (const conversation of this.conversations.values()) {
            if (conversation.type !== 'dm') continue;
            const other = (conversation.members || []).find((member) => member !== this.userId);
            if (other) peopleAlreadyInChats.add(other);
        }
        const others = [...this.profiles.values()].filter(
            (profile) => profile.user !== this.userId && !peopleAlreadyInChats.has(profile.user)
        );
        if (count) count.textContent = String(others.length);
        const filtered = others.filter((profile) =>
            `${profile.display_name || ''} ${profile.username || ''}`.toLowerCase().includes(normalized)
        );
        if (!filtered.length) {
            container.innerHTML = `<div class="social-rail-empty">${
                others.length
                    ? 'No people match.'
                    : this.profiles.size > 1
                      ? 'Everyone you already chat with is listed above.'
                      : 'Invite people to your instance to see them here.'
            }</div>`;
            return;
        }
        const sorted = filtered.sort((a, b) => {
            const aFollow = this.following.has(a.user) ? 0 : 1;
            const bFollow = this.following.has(b.user) ? 0 : 1;
            if (aFollow !== bFollow) return aFollow - bFollow;
            const aState = presenceState(this.presence.get(a.user));
            const bState = presenceState(this.presence.get(b.user));
            return (bState.online ? 1 : 0) - (aState.online ? 1 : 0);
        });
        const html = sorted
            .map((profile) => {
                const state = presenceState(this.presence.get(profile.user));
                const isFollowing = this.following.has(profile.user);
                const isFriend = this.canChatWith(profile.user);
                const status = state.track
                    ? `${state.playing ? 'Listening' : 'Paused'} · ${state.track.title}`
                    : state.online
                      ? 'Online'
                      : 'Offline';
                return `<div class="social-person${isFollowing ? ' is-followed' : ''}${isFriend ? ' is-friend' : ''}" data-person="${escapeHtml(profile.user)}">
                    <button class="social-person-main" type="button" data-open-person="${escapeHtml(profile.user)}" title="${escapeHtml(displayName(profile))}">
                        <span class="social-avatar-wrap social-live-avatar"><img src="${escapeHtml(avatarFor(profile))}" alt="" loading="lazy" /><span class="social-presence-dot${state.online ? ' is-online' : ''}${state.playing ? ' is-listening' : ''}"></span></span>
                        <span class="social-person-copy">
                            <span><strong>${escapeHtml(displayName(profile))}</strong>${isFriend ? '<em>Friend</em>' : ''}</span>
                            <small>${escapeHtml(status)}</small>
                        </span>
                        ${state.playing ? `<span class="social-equalizer" aria-label="Listening now"><i></i><i></i><i></i></span>` : ''}
                    </button>
                    <button class="social-person-follow${isFollowing ? ' is-following' : ''}" type="button" data-follow-user="${escapeHtml(profile.user)}" aria-pressed="${isFollowing}" title="${isFollowing ? 'Following' : 'Follow'}">
                        ${isFollowing ? icon.check(14) : icon.userPlus(14)}
                    </button>
                </div>`;
            })
            .join('');
        if (container.innerHTML !== html) container.innerHTML = html;
    }

    renderPresenceSummary() {
        const summary = document.getElementById('social-presence-summary');
        const popover = document.getElementById('social-presence-popover');
        if (!summary) return;
        const people = [...this.profiles.values()];
        const onlineProfiles = people
            .map((profile) => ({ profile, state: presenceState(this.presence.get(profile.user)) }))
            .filter(({ state }) => state.online || state.playing)
            .sort((a, b) => {
                if (a.state.playing !== b.state.playing) return a.state.playing ? -1 : 1;
                return displayName(a.profile).localeCompare(displayName(b.profile));
            });
        const peopleLabel = `${people.length} ${people.length === 1 ? 'person' : 'people'}`;
        const onlineLabel = `${onlineProfiles.length} online`;
        summary.innerHTML = `${onlineProfiles.length ? '<span class="social-presence-pulse" aria-hidden="true"></span>' : ''}<span>${peopleLabel} · ${onlineLabel}</span>`;
        summary.setAttribute('aria-label', `${peopleLabel} on this instance. ${onlineLabel}.`);
        if (!popover) return;
        const visible = onlineProfiles.slice(0, 8);
        const remaining = onlineProfiles.length - visible.length;
        popover.innerHTML = visible.length
            ? `<strong>Online now</strong>${visible
                  .map(
                      ({ profile, state }) => `<a href="${escapeHtml(profileHref(profile))}">
                        <span class="social-avatar-wrap"><img src="${escapeHtml(avatarFor(profile))}" alt="" loading="lazy" /><span class="social-presence-dot is-online${state.playing ? ' is-listening' : ''}"></span></span>
                        <span><b>${escapeHtml(displayName(profile))}</b><small>${escapeHtml(state.track ? `${state.playing ? 'Listening to' : 'Paused'} ${state.track.title}` : 'Online')}</small></span>
                    </a>`
                  )
                  .join('')}${remaining > 0 ? `<p>+${remaining} more online</p>` : ''}`
            : '<p>Nobody is online right now.</p>';
    }

    renderFeedRail() {
        const liveList = document.getElementById('social-live-list');
        const liveCount = document.getElementById('social-live-count');
        const groupsList = document.getElementById('social-feed-groups');
        if (!liveList || !groupsList) return;

        const liveProfiles = [...this.profiles.values()]
            .filter((profile) => profile.user !== this.userId)
            .map((profile) => ({
                profile,
                state: presenceState(this.presence.get(profile.user)),
                friend: this.canChatWith(profile.user),
            }))
            .filter(({ state }) => state.online || state.playing)
            .sort((a, b) => {
                if (a.state.playing !== b.state.playing) return a.state.playing ? -1 : 1;
                if (a.friend !== b.friend) return a.friend ? -1 : 1;
                return displayName(a.profile).localeCompare(displayName(b.profile));
            });

        if (liveCount) liveCount.textContent = String(liveProfiles.length);
        liveList.innerHTML = liveProfiles.length
            ? liveProfiles
                  .slice(0, 6)
                  .map(({ profile, state, friend }) => {
                      const status = state.track
                          ? `${state.playing ? 'Listening to' : 'Paused'} ${state.track.title}`
                          : 'Online now';
                      return `<a class="social-live-row" href="${escapeHtml(profileHref(profile))}">
                        <span class="social-avatar-wrap"><img src="${escapeHtml(avatarFor(profile))}" alt="" loading="lazy" /><span class="social-presence-dot${state.online ? ' is-online' : ''}${state.playing ? ' is-listening' : ''}"></span></span>
                        <span class="social-live-copy"><strong>${escapeHtml(displayName(profile))}</strong><small>${escapeHtml(status)}</small></span>
                        ${friend ? '<span class="social-live-friend">Friend</span>' : ''}
                        ${state.playing ? '<span class="social-equalizer" aria-label="Listening now"><i></i><i></i><i></i></span>' : ''}
                    </a>`;
                  })
                  .join('')
            : `<div class="social-feed-rail-empty"><strong>Quiet right now</strong><span>Listening activity will appear here.</span></div>`;

        const groups = [...this.conversations.values()]
            .filter((conversation) => conversation.type === 'group')
            .sort((a, b) => Date.parse(b.updated || b.created || 0) - Date.parse(a.updated || a.created || 0));
        groupsList.innerHTML = groups.length
            ? groups
                  .slice(0, 4)
                  .map(
                      (
                          conversation
                      ) => `<button class="social-feed-group-row" type="button" data-feed-conversation="${escapeHtml(conversation.id)}">
                        ${groupAvatarHTML(conversation, this.profiles, 'small')}
                        <span class="social-feed-group-copy"><strong>${escapeHtml(conversationTitle(conversation, this.profiles, this.userId))}</strong><small>${(conversation.members || []).length} members</small></span>
                    </button>`
                  )
                  .join('')
            : `<div class="social-feed-rail-empty"><strong>No groups yet</strong><span>Create one with friends you both follow.</span></div>`;
    }

    /* ----------------------------- unread handling --------------------------- */

    unreadCount(conversation, messages = null) {
        const list = messages || this.messagesByConversation.get(conversation.id) || [];
        const lastRead = this.readState.get(conversation.id) || 0;
        let count = 0;
        for (const message of list) {
            if (message.sender === this.userId) continue;
            if (message.created && Date.parse(message.created) <= lastRead) continue;
            if (!lastRead && conversation.type === 'dm' && message.recipient === this.userId && message.read) continue;
            count += 1;
        }
        return count;
    }

    refreshSidebarBadge() {
        let total = 0;
        for (const conversation of this.conversations.values()) {
            if (this.muted.has(conversation.id)) continue;
            total += this.unreadCount(conversation);
        }
        const badge = document.getElementById('social-unread-badge');
        if (badge) {
            badge.textContent = total > 99 ? '99+' : String(total);
            badge.hidden = total === 0;
        }
        const tabBadge = document.getElementById('social-tab-unread');
        if (tabBadge) {
            tabBadge.textContent = total > 99 ? '99+' : String(total);
            tabBadge.hidden = total === 0;
        }
    }

    async markConversationRead(conversation) {
        const now = new Date().toISOString();
        this.readState.set(conversation.id, Date.parse(now));
        const existing = await pb
            .collection('social_reads')
            .getFirstListItem(`user="${this.userId}" && conversation="${conversation.id}"`)
            .catch(() => null);
        if (existing) {
            if (existing.last_read && Date.parse(existing.last_read) >= Date.parse(now)) return;
            await pb
                .collection('social_reads')
                .update(existing.id, { last_read: now })
                .catch(() => {});
        } else {
            await pb
                .collection('social_reads')
                .create({ user: this.userId, conversation: conversation.id, last_read: now })
                .catch(() => {});
        }
        if (conversation.type === 'dm') {
            const stale = (this.messagesByConversation.get(conversation.id) || []).filter(
                (message) => message.recipient === this.userId && !message.read
            );
            await Promise.all(
                stale.map((message) =>
                    pb
                        .collection('social_messages')
                        .update(message.id, { read: true })
                        .catch(() => {})
                )
            );
        }
        this.refreshSidebarBadge();
        this.renderRail(document.getElementById('social-conversation-search')?.value || '');
    }

    /* --------------------------- conversation actions ------------------------ */

    async ensureConversation(userId) {
        if (userId === this.userId) return null;
        const existing = [...this.conversations.values()].find(
            (conversation) =>
                conversation.type === 'dm' &&
                (conversation.members || []).length === 2 &&
                (conversation.members || []).includes(userId) &&
                (conversation.members || []).includes(this.userId)
        );
        if (existing) return existing.id;
        if (!this.canChatWith(userId)) {
            throw new Error('You need to follow each other before starting a conversation.');
        }
        const record = await pb.collection('social_conversations').create({
            type: 'dm',
            created_by: this.userId,
            members: [this.userId, userId],
        });
        this.conversations.set(record.id, record);
        return record.id;
    }

    async openConversation(conversationId) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) return;
        this.activeId = conversationId;
        document.getElementById('social-empty-state').hidden = true;
        document.getElementById('social-follow-gate').hidden = true;
        document.getElementById('social-thread').hidden = false;
        document.querySelector('.social-messages-view')?.classList.add('has-thread');
        this.setTab('messages');
        this.renderRail(document.getElementById('social-conversation-search')?.value || '');
        this.renderThread();
        await this.loadConversationMessages(conversationId);
        this.renderThread();
        this.scrollMessagesToBottom();
        await this.markConversationRead(conversation);
        const other = (conversation.members || []).find((member) => member !== this.userId);
        const profile = this.profiles.get(other);
        history.replaceState(
            {},
            '',
            profile?.username ? `/social/@${encodeURIComponent(profile.username)}` : '/social'
        );
        if (this.pendingShare) {
            const payload = this.pendingShare;
            this.pendingShare = null;
            await this.sendToConversation(conversationId, { body: '', share: payload }).catch((error) =>
                showNotification(error.message, 'error')
            );
        }
    }

    async openConversationForUser(userId) {
        if (this.isBlocked(userId)) return;
        if (userId === this.userId) {
            const profile = this.profiles.get(userId);
            if (profile) window.location.assign(profileHref(profile));
            return;
        }
        try {
            const conversationId = await this.ensureConversation(userId);
            if (conversationId) await this.openConversation(conversationId);
        } catch (error) {
            const profile = this.profiles.get(userId);
            showNotification(error.message, 'error');
            if (profile) {
                void import('./router.js').then(({ navigate }) => navigate(profileHref(profile)));
            }
        }
    }

    closeConversation() {
        this.activeId = null;
        this.infoOpen = false;
        document.getElementById('social-thread').hidden = true;
        document.getElementById('social-empty-state').hidden = false;
        document.querySelector('.social-messages-view')?.classList.remove('has-thread');
        document.querySelector('.social-messages-view')?.classList.remove('has-info');
        const info = document.getElementById('social-info-panel');
        if (info) info.hidden = true;
        this.renderRail(document.getElementById('social-conversation-search')?.value || '');
        history.replaceState({}, '', '/social');
    }

    canChatWith(userId) {
        return !this.isBlocked(userId) && isMutualFriend(this.following, this.followers, userId);
    }

    /* ------------------------------ thread render ---------------------------- */

    activeConversation() {
        return this.activeId ? this.conversations.get(this.activeId) : null;
    }

    renderThread() {
        const conversation = this.activeConversation();
        if (!conversation) return;
        const isGroup = conversation.type === 'group';
        const other = (conversation.members || []).find((member) => member !== this.userId);
        const otherProfile = this.profiles.get(other);
        const state = isGroup
            ? { online: false, playing: false, track: null }
            : presenceState(this.presence.get(other));

        const avatar = document.getElementById('social-thread-avatar');
        const name = document.getElementById('social-thread-name');
        const status = document.getElementById('social-thread-status');
        const dot = document.getElementById('social-thread-presence-dot');
        const personButton = document.getElementById('social-thread-person');
        const groupAvatar = document.getElementById('social-thread-group-avatar');
        if (isGroup) {
            if (avatar) avatar.hidden = true;
            if (groupAvatar) {
                groupAvatar.hidden = false;
                groupAvatar.innerHTML = groupAvatarHTML(conversation, this.profiles);
            }
            if (name) name.textContent = conversationTitle(conversation, this.profiles, this.userId);
            if (status) status.textContent = `${(conversation.members || []).length} members`;
            if (dot) dot.hidden = true;
            if (personButton) personButton.disabled = false;
        } else {
            if (avatar) avatar.hidden = false;
            if (groupAvatar) groupAvatar.hidden = true;
            if (avatar) avatar.src = avatarFor(otherProfile);
            if (name) name.textContent = displayName(otherProfile);
            if (status) {
                status.textContent = state.track
                    ? `${state.playing ? 'Listening to' : 'Paused'} · ${state.track.title}`
                    : state.online
                      ? 'Online now'
                      : 'Offline';
            }
            if (dot) {
                dot.hidden = false;
                dot.classList.toggle('is-online', state.online);
                dot.classList.toggle('is-listening', state.playing);
            }
        }

        const muteButton = document.getElementById('social-thread-mute');
        if (muteButton) {
            const muted = this.muted.has(conversation.id);
            muteButton.innerHTML = muted ? icon.bellOff(18) : icon.bell(18);
            muteButton.title = muted ? 'Unmute' : 'Mute';
            muteButton.setAttribute('aria-pressed', String(muted));
        }

        const gate = document.getElementById('social-follow-gate');
        const composer = document.getElementById('social-composer');
        const needsGate = !isGroup && other && !this.canChatWith(other);
        if (gate) {
            gate.hidden = !needsGate;
            if (needsGate) {
                const avatar = document.getElementById('social-gate-avatar');
                if (avatar) avatar.src = avatarFor(otherProfile);
                const copy = document.getElementById('social-gate-copy');
                const target = handleFor(otherProfile) || displayName(otherProfile);
                const iFollow = this.following.has(other);
                const followsMe = this.followers.has(other);
                if (copy) {
                    copy.textContent = iFollow
                        ? `Waiting for ${target} to follow you back. Messages unlock when you are friends.`
                        : followsMe
                          ? `Follow ${target} back to become friends and start chatting.`
                          : `You both need to follow each other before you can message ${target}.`;
                }
                const button = document.getElementById('social-gate-follow');
                if (button) {
                    button.hidden = iFollow;
                    button.innerHTML = `${icon.userPlus(15)}<span>${followsMe ? 'Follow back' : 'Follow'}</span>`;
                    button.dataset.followUser = other || '';
                }
            }
        }
        if (composer) composer.hidden = Boolean(needsGate);
        document.getElementById('social-thread')?.classList.toggle('is-gated', Boolean(needsGate));

        this.renderMessages();
        if (this.infoOpen) this.renderInfoPanel();
    }

    async loadConversationMessages(conversationId) {
        const fresh = await pb.collection('social_messages').getFullList({
            filter: `conversation="${conversationId}"`,
            sort: 'created',
        });
        this.messagesByConversation.set(conversationId, fresh);
    }

    renderMessages() {
        const container = document.getElementById('social-messages');
        if (!container) return;
        const conversation = this.activeConversation();
        if (!conversation) return;
        const messages = this.messagesByConversation.get(conversation.id) || [];
        if (!messages.length) {
            const emptyHtml = `<div class="social-new-thread"><strong>No messages yet</strong><span>Share what you're listening to.</span></div>`;
            if (container.innerHTML !== emptyHtml) container.innerHTML = emptyHtml;
            return;
        }
        const isGroup = conversation.type === 'group';
        const parts = [];
        let lastDay = '';
        let previous = null;
        for (const message of messages) {
            const key = dayKey(message.created);
            if (key && key !== lastDay) {
                parts.push(
                    `<div class="social-day-spacer" role="separator"><span>${escapeHtml(formatDayLabel(message.created))}</span></div>`
                );
                lastDay = key;
                previous = null;
            }
            const own = message.sender === this.userId;
            const grouped =
                previous &&
                previous.sender === message.sender &&
                Date.parse(message.created) - Date.parse(previous.created) < GROUP_MESSAGE_GAP_MS &&
                dayKey(previous.created) === key;
            parts.push(this.renderMessage(message, { own, grouped, isGroup }));
            previous = message;
        }
        const html = parts.join('');
        if (container.innerHTML !== html) container.innerHTML = html;
        this.updateSnippetButtons();
    }

    renderMessage(message, { own, grouped, isGroup }) {
        const payload = parseJson(message.payload);
        const kind = message.kind || 'text';
        const sender = this.profiles.get(message.sender);
        const showAuthor = !grouped;
        const authorRow =
            !own && isGroup && showAuthor
                ? `<a class="social-message-author" href="${escapeHtml(profileHref(sender))}">${escapeHtml(displayName(sender))}</a>`
                : '';
        const avatar =
            !own && !grouped
                ? `<a class="social-message-avatar" href="${escapeHtml(profileHref(sender))}" aria-hidden="true" tabindex="-1"><img src="${escapeHtml(avatarFor(sender))}" alt="" loading="lazy" /></a>`
                : !own
                  ? '<span class="social-message-avatar" aria-hidden="true"></span>'
                  : '';

        let content = '';
        if (message.body) content += `<p>${escapeHtml(message.body)}</p>`;
        if (kind === 'image' && message.image) {
            const url = messageFileUrl(message, message.image, '800x0');
            const full = messageFileUrl(message, message.image);
            content += `<button class="social-message-image" type="button" data-lightbox="${escapeHtml(full)}"><img src="${escapeHtml(url)}" alt="${escapeHtml(message.body || 'Shared image')}" loading="lazy" /></button>`;
        }
        if (['track', 'album', 'artist', 'userplaylist'].includes(kind) && payload) {
            content += shareCardHTML(payload);
        }
        if (kind === 'snippet' && payload?.snippet) {
            content += this.renderSnippetCard(payload);
        }

        const ticks = own ? this.renderTicks(message) : '';
        const pinRecord = this.pins.find((pin) => pin.ref === message.id);
        const pinned = Boolean(pinRecord);
        return `<div class="social-message-row${own ? ' is-own' : ''}${grouped ? ' is-grouped' : ''}" data-message-id="${escapeHtml(message.id)}">
            ${avatar}
            <div class="social-message-stack">
                ${authorRow}
                <div class="social-message-bubble${content.includes('social-message-share') || content.includes('social-snippet') ? ' has-card' : ''}${kind === 'image' && !message.body ? ' is-image-only' : ''}">
                    ${content}
                    <span class="social-message-foot"><time>${escapeHtml(formatClock(message.created))}</time>${ticks}</span>
                </div>
            </div>
            <span class="social-message-pin${pinned ? ' is-pinned' : ''}">${message.id.startsWith('tmp') ? '' : `<button type="button" data-pin-message="${escapeHtml(message.id)}" title="${pinned ? 'Unpin' : 'Pin'}" aria-pressed="${pinned}">${icon.pin(14)}</button>`}</span>
        </div>`;
    }

    renderTicks(message) {
        if (message.pending) {
            return `<span class="social-message-ticks is-pending" title="Sending…">${icon.clock(13)}</span>`;
        }
        if (message.read) {
            return `<span class="social-message-ticks is-read" title="Read">${icon.checkCheck(14)}</span>`;
        }
        return `<span class="social-message-ticks" title="Delivered">${icon.checkCheck(14)}</span>`;
    }

    renderSnippetCard(payload) {
        const snippet = payload.snippet || {};
        const rawPeaks = Array.isArray(snippet.peaks) ? snippet.peaks : [];
        const maxBars = 56;
        const sampleSize = Math.max(1, Math.ceil(rawPeaks.length / maxBars));
        const peaks = rawPeaks.length
            ? Array.from({ length: Math.ceil(rawPeaks.length / sampleSize) }, (_, index) =>
                  Math.max(...rawPeaks.slice(index * sampleSize, (index + 1) * sampleSize))
              )
            : Array.from({ length: 40 }, (_, index) => 0.18 + Math.abs(Math.sin(index * 0.62)) * 0.35);
        const duration = Number(snippet.duration) || 1;
        const selectionStart = Math.max(0, Math.min(100, ((Number(snippet.start) || 0) / duration) * 100));
        const selectionEnd = Math.max(
            selectionStart,
            Math.min(100, ((Number(snippet.end) || duration) / duration) * 100)
        );
        const bars = peaks
            .map((peak) => `<i style="height:${Math.max(12, Math.min(82, Math.round((peak || 0.08) * 72)))}%"></i>`)
            .join('');
        const playable = Boolean(payload.id);
        return `<div class="social-snippet" data-snippet-id="${escapeHtml(payload.id || '')}">
            ${payload.image ? `<img class="social-snippet-backdrop" src="${escapeHtml(payload.image)}" alt="" loading="lazy" />` : ''}
            <span class="social-snippet-shade" aria-hidden="true"></span>
            <div class="social-snippet-content">
            <div class="social-snippet-head">
                ${playable ? `<button class="social-snippet-play" type="button" data-snippet-play="${escapeHtml(payload.id)}" data-snippet-start="${Number(snippet.start) || 0}" data-snippet-end="${Number(snippet.end) || 0}" aria-label="Play snippet">${snippetPlayIcon()}</button>` : ''}
                <div class="social-snippet-copy">
                    <strong>${escapeHtml(payload.title || 'Snippet')}</strong>
                    <small>${escapeHtml(payload.subtitle || '')}</small>
                </div>
            </div>
            <div class="social-snippet-wave-wrap" style="--selection-start:${selectionStart}%;--selection-end:${selectionEnd}%">
                <div class="social-snippet-wave" aria-hidden="true">${bars}</div>
                <div class="social-snippet-wave is-selected" aria-hidden="true">${bars}</div>
                <span class="social-snippet-selection" style="--selection-start:${selectionStart}%;--selection-end:${selectionEnd}%" role="img" aria-label="Selected excerpt from ${escapeHtml(formatDuration(snippet.start || 0))} to ${escapeHtml(formatDuration(snippet.end || 0))}"></span>
            </div>
            <span class="social-snippet-range">${escapeHtml(formatDuration(snippet.start || 0))} – ${escapeHtml(formatDuration(snippet.end || 0))}</span>
            </div>
        </div>`;
    }

    scrollMessagesToBottom() {
        const container = document.getElementById('social-messages');
        if (!container) return;
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }

    /* ------------------------------- composer -------------------------------- */

    async sendToConversation(conversationId, { body = '', share = null, image = null } = {}) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation || !this.userId) return;
        const recipient =
            conversation.type === 'dm' ? (conversation.members || []).find((member) => member !== this.userId) : null;
        if (recipient && !this.canChatWith(recipient)) {
            throw new Error('You need to follow each other before sending messages.');
        }
        const text = String(body || '').trim();
        if (!text && !share && !image) return;
        const payload = share ? { ...share } : null;
        const kind = image ? 'image' : payload ? (payload.snippet ? 'snippet' : payload.type || 'track') : 'text';
        const tempId = `tmp-${++this.tempCounter}`;
        const data = {
            sender: this.userId,
            conversation: conversationId,
            kind,
            body: text,
            payload,
            read: false,
            client_nonce: tempId,
        };
        if (recipient) data.recipient = recipient;

        const temp = {
            id: tempId,
            client_nonce: tempId,
            sender: this.userId,
            conversation: conversationId,
            kind,
            body: text,
            payload,
            read: false,
            pending: true,
            created: new Date().toISOString(),
            recipient: data.recipient || '',
        };
        if (!this.messagesByConversation.has(conversationId)) this.messagesByConversation.set(conversationId, []);
        this.messagesByConversation.get(conversationId).push(temp);
        if (conversationId === this.activeId) {
            this.renderMessages();
            this.scrollMessagesToBottom();
        }
        this.renderRail(document.getElementById('social-conversation-search')?.value || '');

        if (image) data.image = image;
        const record = await pb.collection('social_messages').create(data);
        const list = this.messagesByConversation.get(conversationId) || [];
        reconcileSentMessage(list, tempId, record);
        if (conversationId === this.activeId) {
            this.renderMessages();
            this.scrollMessagesToBottom();
        }
        this.renderRail(document.getElementById('social-conversation-search')?.value || '');
        return record;
    }

    async submitComposer() {
        const conversation = this.activeConversation();
        const input = document.getElementById('social-message-input');
        if (!conversation || !input) return;
        const body = input.value.trim();
        const image = this.attachments[0] || null;
        if (!body && !image) return;
        input.value = '';
        input.style.height = 'auto';
        this.setAttachments([]);
        try {
            await this.sendToConversation(conversation.id, { body, image });
        } catch (error) {
            showNotification(error.message, 'error');
        }
    }

    setAttachments(files) {
        this.attachments = files.slice(0, 1);
        const strip = document.getElementById('social-attach-strip');
        if (!strip) return;
        if (!this.attachments.length) {
            strip.hidden = true;
            strip.innerHTML = '';
            return;
        }
        const file = this.attachments[0];
        strip.hidden = false;
        strip.innerHTML = `<div class="social-attach-chip"><img src="${URL.createObjectURL(file)}" alt="" /><span>Image ready</span>
            <button type="button" class="social-attach-remove" aria-label="Remove image">${icon.x(14)}</button></div>`;
        strip.querySelector('.social-attach-remove')?.addEventListener('click', () => this.setAttachments([]));
    }

    /* ------------------------------ info panel ------------------------------- */

    toggleInfoPanel(force = null) {
        this.infoOpen = force === null ? !this.infoOpen : force;
        const panel = document.getElementById('social-info-panel');
        if (!panel) return;
        panel.hidden = !this.infoOpen;
        document.getElementById('social-thread-info')?.setAttribute('aria-pressed', String(this.infoOpen));
        document.querySelector('.social-messages-view')?.classList.toggle('has-info', this.infoOpen);
        if (this.infoOpen) this.renderInfoPanel();
    }

    renderInfoPanel() {
        const panel = document.getElementById('social-info-panel');
        const conversation = this.activeConversation();
        if (!panel || !conversation) return;
        const messages = this.messagesByConversation.get(conversation.id) || [];
        const isGroup = conversation.type === 'group';
        const other = (conversation.members || []).find((member) => member !== this.userId);
        const otherProfile = this.profiles.get(other);
        const sections = [];

        if (isGroup) {
            sections.push(this.renderGroupHeader(conversation));
            sections.push(this.renderMembers(conversation));
        } else {
            sections.push(this.renderMiniProfile(conversation, otherProfile));
            sections.push(this.renderCurrentlyListening(other));
        }
        sections.push(this.renderSharedTracks(messages));
        sections.push(this.renderSharedAlbums(messages));
        if (!isGroup) sections.push(this.renderMutual(other));
        sections.push(this.renderPinned(conversation));

        panel.innerHTML = `<button class="social-info-close btn-icon" type="button" data-close-info aria-label="Close details">${icon.x(17)}</button>${sections.filter(Boolean).join('')}`;
    }

    renderGroupHeader(conversation) {
        const isMuted = this.muted.has(conversation.id);
        return `<header class="social-info-hero">
            <label class="social-group-avatar-editor" title="Change group picture">
                ${groupAvatarHTML(conversation, this.profiles, 'large')}
                <span class="social-group-avatar-action">${icon.imagePlus(15)}</span>
                <input type="file" accept="image/*" data-group-avatar-input="${escapeHtml(conversation.id)}" hidden />
            </label>
            <strong>${escapeHtml(conversationTitle(conversation, this.profiles, this.userId))}</strong>
            <small>${(conversation.members || []).length} members</small>
            <div class="social-info-actions">
                <button type="button" data-toggle-mute="${escapeHtml(conversation.id)}">${isMuted ? icon.bell(15) : icon.bellOff(15)}<span>${isMuted ? 'Unmute' : 'Mute'}</span></button>
                <button type="button" data-leave-group="${escapeHtml(conversation.id)}">${icon.doorOpen(15)}<span>Leave</span></button>
            </div>
        </header>`;
    }

    renderMembers(conversation) {
        const rows = (conversation.members || [])
            .map((member) => this.profiles.get(member))
            .filter(Boolean)
            .map((profile) => {
                const state = presenceState(this.presence.get(profile.user));
                const status = state.track ? state.track.title : state.online ? 'Online' : 'Offline';
                return `<a class="social-info-member" href="${escapeHtml(profileHref(profile))}">
                    <span class="social-avatar-wrap"><img src="${escapeHtml(avatarFor(profile))}" alt="" loading="lazy" /><span class="social-presence-dot${state.online ? ' is-online' : ''}${state.playing ? ' is-listening' : ''}"></span></span>
                    <span class="social-info-member-copy"><strong>${escapeHtml(displayName(profile))}</strong><small>${escapeHtml(status)}</small></span>
                    ${state.playing ? `<span class="social-equalizer"><i></i><i></i><i></i></span>` : ''}
                </a>`;
            })
            .join('');
        return `<section class="social-info-section"><h3>Members</h3>${rows}</section>`;
    }

    renderMiniProfile(conversation, profile) {
        if (!profile) return '';
        const isFollowing = this.following.has(profile.user);
        const isMuted = this.muted.has(conversation.id);
        const about = profile.about || profile.status || '';
        return `<header class="social-info-hero">
            <img src="${escapeHtml(avatarFor(profile))}" alt="" />
            <strong>${escapeHtml(displayName(profile))}</strong>
            <small>${escapeHtml(handleFor(profile))}</small>
            ${about ? `<p>${escapeHtml(about)}</p>` : ''}
            <div class="social-info-actions">
                <a href="${escapeHtml(profileHref(profile))}">${icon.user(15)}<span>Profile</span></a>
                <button type="button" data-toggle-mute="${escapeHtml(conversation.id)}">${isMuted ? icon.bell(15) : icon.bellOff(15)}<span>${isMuted ? 'Unmute' : 'Mute'}</span></button>
                <button type="button" data-toggle-follow="${escapeHtml(profile.user)}" class="${isFollowing ? 'is-following' : ''}">${isFollowing ? icon.check(15) : icon.userPlus(15)}<span>${isFollowing ? 'Following' : 'Follow'}</span></button>
                <button type="button" data-block-user="${escapeHtml(profile.user)}">${icon.x(15)}<span>Block</span></button>
            </div>
        </header>`;
    }

    renderCurrentlyListening(userId) {
        const state = presenceState(this.presence.get(userId));
        if (!state.track) return '';
        const track = state.track;
        return `<section class="social-info-section">
            <h3>${state.playing ? 'Currently listening' : 'Paused on'}</h3>
            <div class="social-info-track${track.image ? ' has-track-backdrop' : ''}">
                ${track.image ? `<img class="social-track-backdrop" src="${escapeHtml(track.image)}" alt="" loading="lazy" /><span class="social-track-shade" aria-hidden="true"></span>` : ''}
                ${track.image ? `<img src="${escapeHtml(track.image)}" alt="" />` : ''}
                <div class="social-info-track-copy">
                    ${state.playing ? '<span class="social-equalizer"><i></i><i></i><i></i></span>' : '<em>PAUSED</em>'}
                    <a href="${escapeHtml(track.href || '#')}"><strong>${escapeHtml(track.title || '')}</strong></a>
                    <small>${escapeHtml(track.subtitle || '')}</small>
                </div>
                <button type="button" data-play-share="${escapeHtml(track.id || '')}" data-play-kind="track" aria-label="Play">${icon.play(15)}</button>
            </div>
        </section>`;
    }

    sharedFromMessages(messages, kind) {
        const seen = new Set();
        const out = [];
        for (let i = messages.length - 1; i >= 0 && out.length < 4; i--) {
            const message = messages[i];
            if ((message.kind || '') !== kind) continue;
            const payload = parseJson(message.payload);
            if (!payload?.id || seen.has(payload.id)) continue;
            seen.add(payload.id);
            out.push({ payload, created: message.created });
        }
        return out;
    }

    renderSharedTracks(messages) {
        const tracks = this.sharedFromMessages(messages, 'track');
        const rows = tracks
            .map(
                (
                    entry,
                    index
                ) => `<div class="social-info-row is-shared-track${entry.payload.image ? ' has-track-backdrop' : ''}">
                ${entry.payload.image ? `<img class="social-track-backdrop" src="${escapeHtml(entry.payload.image)}" alt="" loading="lazy" /><span class="social-track-shade" aria-hidden="true"></span>` : ''}
                <span class="social-info-index">${index + 1}</span>
                <span class="social-info-art">
                    ${entry.payload.image ? `<img src="${escapeHtml(entry.payload.image)}" alt="" />` : '<span class="social-info-art-placeholder" aria-hidden="true">T</span>'}
                    <button class="social-info-art-play" type="button" data-play-share="${escapeHtml(entry.payload.id)}" data-play-kind="track" aria-label="Play ${escapeHtml(entry.payload.title || 'track')}"><span class="social-share-play"><svg class="social-share-morph-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5L19 12L8 18.5Z"></path></svg></span></button>
                </span>
                <span class="social-info-row-copy"><strong>${escapeHtml(entry.payload.title || '')}</strong><small>${escapeHtml(entry.payload.subtitle || '')}</small></span>
            </div>`
            )
            .join('');
        return `<section class="social-info-section is-shared-tracks"><h3>Shared tracks</h3>${rows || '<p class="social-info-hint">Nothing shared yet — drop a track in the chat.</p>'}</section>`;
    }

    renderSharedAlbums(messages) {
        const albums = this.sharedFromMessages(messages, 'album');
        const rows = albums
            .map(
                (
                    entry
                ) => `<a class="social-info-row is-shared-album${entry.payload.image ? ' has-track-backdrop' : ''}" href="${escapeHtml(entry.payload.href || '#')}">
                ${entry.payload.image ? `<img class="social-track-backdrop" src="${escapeHtml(entry.payload.image)}" alt="" loading="lazy" /><span class="social-track-shade" aria-hidden="true"></span>` : ''}
                ${entry.payload.image ? `<img src="${escapeHtml(entry.payload.image)}" alt="" />` : ''}
                <span class="social-info-row-copy"><strong>${escapeHtml(entry.payload.title || '')}</strong><small>${escapeHtml(entry.payload.subtitle || '')}</small></span>
            </a>`
            )
            .join('');
        return `<section class="social-info-section is-shared-albums"><h3>Shared albums</h3>${rows || '<p class="social-info-hint">No albums shared yet.</p>'}</section>`;
    }

    renderMutual(other) {
        if (!other) return '';
        const otherProfile = this.profiles.get(other);
        const theirFollows = [...this.profiles.values()].filter(
            (profile) => profile.user !== this.userId && profile.user !== other && this.following.has(profile.user)
        );
        const mutualFriends = theirFollows.filter((profile) => this.followers.has(profile.user));
        const commonGroups = [...this.conversations.values()].filter(
            (entry) =>
                entry.type === 'group' &&
                (entry.members || []).includes(other) &&
                (entry.members || []).includes(this.userId)
        );
        if (!mutualFriends.length && !commonGroups.length && !theirFollows.length) return '';
        const friendFaces = (mutualFriends.length ? mutualFriends : theirFollows)
            .slice(0, 6)
            .map(
                (profile) =>
                    `<a class="social-info-mutual-person" href="${escapeHtml(profileHref(profile))}" title="View ${escapeHtml(displayName(profile))}"><img src="${escapeHtml(avatarFor(profile))}" alt="${escapeHtml(displayName(profile))}" loading="lazy" /></a>`
            )
            .join('');
        const groupRows = commonGroups
            .slice(0, 3)
            .map(
                (
                    entry
                ) => `<button class="social-info-row is-conversation" type="button" data-info-conversation="${escapeHtml(entry.id)}">${groupAvatarHTML(entry, this.profiles, 'small')}
                <span class="social-info-row-copy"><strong>${escapeHtml(conversationTitle(entry, this.profiles, this.userId))}</strong><small>${(entry.members || []).length} members</small></span>${icon.chevronLeft(14)}</button>`
            )
            .join('');
        const label = mutualFriends.length
            ? `${mutualFriends.length} mutual friend${mutualFriends.length === 1 ? '' : 's'}`
            : `${otherProfile ? displayName(otherProfile) : 'They'} follows ${theirFollows.length} you know`;
        return `<section class="social-info-section"><h3>Mutuals &amp; groups</h3>
            <div class="social-info-mutual">${friendFaces}<span>${escapeHtml(label)}</span></div>
            ${groupRows}
        </section>`;
    }

    renderPinned(conversation) {
        const pins = this.pins.filter((pin) => parseJson(pin.payload)?.conversationId === conversation.id);
        if (!pins.length) {
            return `<section class="social-info-section"><h3>Pinned</h3><p class="social-info-hint">Hover a message and hit the pin to keep it here.</p></section>`;
        }
        const rows = pins
            .map((pin) => {
                const payload = parseJson(pin.payload) || {};
                const preview =
                    payload.kind === 'snippet'
                        ? `Snippet · ${payload.title || ''}`
                        : payload.kind === 'image'
                          ? 'Photo'
                          : payload.body || payload.title || 'Pinned message';
                return `<div class="social-info-row is-pin">
                <span class="social-info-pin-icon">${icon.pin(13)}</span>
                <span class="social-info-row-copy"><strong>${escapeHtml(String(preview).slice(0, 90))}</strong><small>${escapeHtml(payload.senderName || '')} · ${escapeHtml(formatRelativeTime(payload.created))}</small></span>
                <button type="button" data-unpin="${escapeHtml(pin.id)}" aria-label="Unpin">${icon.pinOff(14)}</button>
            </div>`;
            })
            .join('');
        return `<section class="social-info-section"><h3>Pinned</h3>${rows}</section>`;
    }

    async pinMessage(messageId) {
        const conversation = this.activeConversation();
        if (!conversation) return;
        const existing = this.pins.find((pin) => pin.ref === messageId);
        if (existing) {
            await this.unpin(existing.id);
            return;
        }
        const message = (this.messagesByConversation.get(conversation.id) || []).find(
            (entry) => entry.id === messageId
        );
        if (!message) return;
        const sender = this.profiles.get(message.sender);
        const payload = parseJson(message.payload) || {};
        await pb.collection('social_pins').create({
            user: this.userId,
            kind: 'message',
            ref: messageId,
            payload: {
                conversationId: conversation.id,
                kind: message.kind || 'text',
                body: message.body || '',
                title: payload.title || '',
                image: payload.image || '',
                senderName: displayName(sender),
                created: message.created,
            },
        });
        this.pins = await pb
            .collection('social_pins')
            .getFullList({ filter: `user="${this.userId}"`, sort: '-created' });
        showNotification('Pinned');
        this.renderMessages();
        if (this.infoOpen) this.renderInfoPanel();
    }

    async unpin(pinId) {
        await pb
            .collection('social_pins')
            .delete(pinId)
            .catch(() => {});
        this.pins = this.pins.filter((pin) => pin.id !== pinId);
        this.renderMessages();
        if (this.infoOpen) this.renderInfoPanel();
    }

    /* -------------------------------- mutes ---------------------------------- */

    async toggleMute(conversationId) {
        const existing = this.muteRecords.get(conversationId);
        if (existing) {
            await pb
                .collection('social_mutes')
                .delete(existing)
                .catch(() => {});
            this.muteRecords.delete(conversationId);
            this.muted.delete(conversationId);
        } else {
            const record = await pb
                .collection('social_mutes')
                .create({ user: this.userId, conversation: conversationId });
            this.muteRecords.set(conversationId, record.id);
            this.muted.add(conversationId);
        }
        this.refreshSidebarBadge();
        this.renderRail(document.getElementById('social-conversation-search')?.value || '');
        this.renderThread();
        if (this.infoOpen) this.renderInfoPanel();
    }

    /* -------------------------------- groups --------------------------------- */

    openGroupModal() {
        const existing = document.getElementById('social-group-modal');
        if (existing) existing.remove();
        const friends = [...this.profiles.values()].filter(
            (profile) => profile.user !== this.userId && this.canChatWith(profile.user)
        );
        const overlay = document.createElement('div');
        overlay.id = 'social-group-modal';
        overlay.className = 'social-group-modal';
        overlay.innerHTML = `<div class="social-group-modal-card" role="dialog" aria-modal="true" aria-label="New group">
            <header><strong>New group</strong>
                <button type="button" class="btn-icon" data-group-close aria-label="Close">${icon.x(18)}</button>
            </header>
            <label class="social-group-picture-picker">
                <span class="social-group-picture-preview" data-group-picture-preview>${icon.imagePlus(20)}</span>
                <span class="social-group-picture-copy"><strong class="social-group-picture-title">Group picture</strong><small class="social-group-picture-hint">Choose a square image or add one later</small></span>
                <span class="social-group-picture-choose">Choose</span>
                <input id="social-group-avatar" type="file" accept="image/*" hidden />
            </label>
            <input id="social-group-name" type="text" placeholder="Group name" maxlength="128" />
            <div class="social-group-people">
                ${
                    friends.length
                        ? friends
                              .map(
                                  (profile) => `<label class="social-group-person">
                    <input type="checkbox" value="${escapeHtml(profile.user)}" />
                    <img src="${escapeHtml(avatarFor(profile))}" alt="" />
                    <span>${escapeHtml(displayName(profile))}</span>
                </label>`
                              )
                              .join('')
                        : '<p class="social-group-hint">Groups are for friends — you both need to follow each other first.</p>'
                }
            </div>
            <button id="social-group-create" class="social-group-create" ${friends.length ? '' : 'disabled'}>Create group</button>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-group-close]')) overlay.remove();
        });
        overlay.querySelector('#social-group-avatar')?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            const preview = overlay.querySelector('[data-group-picture-preview]');
            if (!file || !preview) return;
            preview.innerHTML = `<img class="social-group-picture-image" src="${escapeHtml(URL.createObjectURL(file))}" alt="" />`;
        });
        overlay.querySelector('#social-group-create')?.addEventListener('click', () => {
            const name = overlay.querySelector('#social-group-name')?.value.trim();
            const members = [...overlay.querySelectorAll('.social-group-person input:checked')].map((box) => box.value);
            const avatar = overlay.querySelector('#social-group-avatar')?.files?.[0] || null;
            if (!name || !members.length) {
                showNotification('Pick a name and at least one person');
                return;
            }
            this.createGroup(name, members, avatar)
                .then(() => overlay.remove())
                .catch((error) => showNotification(error.message, 'error'));
        });
        overlay.querySelector('#social-group-name')?.focus();
    }

    async createGroup(name, memberIds, avatar = null) {
        const data = {
            type: 'group',
            name,
            created_by: this.userId,
            members: [this.userId, ...memberIds],
        };
        if (avatar) data.avatar = avatar;
        const record = await pb.collection('social_conversations').create(data);
        this.conversations.set(record.id, record);
        showNotification(`Group “${name}” created`);
        await this.openConversation(record.id);
    }

    async updateGroupAvatar(conversationId, file) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation || conversation.type !== 'group' || !file) return;
        const record = await pb.collection('social_conversations').update(conversationId, { avatar: file });
        this.conversations.set(record.id, record);
        this.renderRail(document.getElementById('social-conversation-search')?.value || '');
        this.renderThread();
        if (this.infoOpen) this.renderInfoPanel();
        showNotification('Group picture updated');
    }

    isBlocked(userId) {
        return Boolean(userId && this.blocked.has(userId));
    }

    async blockUser(userId) {
        if (!userId || userId === this.userId || this.blocked.has(userId)) return;
        await pb.collection('social_blocks').create({ blocker: this.userId, blocked: userId });
        if (this.activeConversation()?.type === 'dm') this.closeConversation();
        showNotification('Account blocked');
        await this.refreshAll();
        if (document.getElementById('page-profile')?.classList.contains('active')) {
            void import('./router.js').then(({ navigate }) => navigate('/social'));
        }
    }

    async leaveGroup(conversationId) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) return;
        const members = (conversation.members || []).filter((member) => member !== this.userId);
        if (!members.length) {
            await pb
                .collection('social_conversations')
                .delete(conversationId)
                .catch(() => {});
        } else {
            await pb.collection('social_conversations').update(conversationId, { members });
        }
        this.conversations.delete(conversationId);
        if (this.activeId === conversationId) this.closeConversation();
        showNotification('You left the group');
        this.renderRail(document.getElementById('social-conversation-search')?.value || '');
    }

    /* -------------------------------- follows -------------------------------- */

    async toggleFollow(userId) {
        if (!userId || userId === this.userId) return;
        if (this.following.has(userId)) {
            const record = await pb
                .collection('social_follows')
                .getFirstListItem(`follower="${this.userId}" && following="${userId}"`)
                .catch(() => null);
            if (record)
                await pb
                    .collection('social_follows')
                    .delete(record.id)
                    .catch(() => {});
            this.following.delete(userId);
            showNotification('Unfollowed');
        } else {
            await pb.collection('social_follows').create({ follower: this.userId, following: userId });
            this.following.add(userId);
            showNotification('Following');
        }
        this.renderRail(document.getElementById('social-conversation-search')?.value || '');
        this.renderThread();
        if (this.infoOpen) this.renderInfoPanel();
        document.dispatchEvent(new CustomEvent('monochrome-follow-changed', { detail: { userId } }));
    }

    /* ------------------------------- snippets -------------------------------- */

    async playSnippet(trackId, start, end) {
        try {
            const current = this.activeSnippet;
            const activeElement = this.player?.activeElement;
            if (current?.trackId === trackId && activeElement && !activeElement.paused) {
                this.stopSnippetPlayback();
                return;
            }
            this.stopSnippetPlayback();
            const meta = await this.api.getTrackMetadata(trackId);
            if (!meta || !this.player) throw new Error('Track unavailable');
            await this.player.setQueue([meta], 0, false, {
                kind: 'single',
                id: String(trackId),
                label: meta.title || 'Shared snippet',
                href: `/track/${trackId}`,
            });
            this.player.enableAutoplay();
            await this.player.playTrackFromQueue(Math.max(0, start));
            const element = this.player.activeElement;
            if (!element) return;
            const stopAtEnd = () => {
                if (Number(end) > Number(start) && element.currentTime >= Number(end)) this.stopSnippetPlayback();
            };
            const reflectStopped = () => this.clearSnippetPlayback(element);
            element.addEventListener('timeupdate', stopAtEnd);
            element.addEventListener('pause', reflectStopped, { once: true });
            element.addEventListener('ended', reflectStopped, { once: true });
            this.activeSnippet = { trackId, element, stopAtEnd, reflectStopped };
            this.updateSnippetButtons();
        } catch (error) {
            console.warn('[Social] Snippet playback failed:', error);
            this.stopSnippetPlayback(false);
            playSharedItem('track', trackId);
        }
    }

    clearSnippetPlayback(element = null) {
        const active = this.activeSnippet;
        if (!active || (element && active.element !== element)) return;
        active.element.removeEventListener('timeupdate', active.stopAtEnd);
        active.element.removeEventListener('pause', active.reflectStopped);
        active.element.removeEventListener('ended', active.reflectStopped);
        this.activeSnippet = null;
        this.updateSnippetButtons();
    }

    stopSnippetPlayback(pause = true) {
        const active = this.activeSnippet;
        if (!active) return;
        this.clearSnippetPlayback();
        if (pause && !active.element.paused) active.element.pause();
    }

    updateSnippetButtons() {
        document.querySelectorAll('[data-snippet-play]').forEach((button) => {
            const playing = this.activeSnippet?.trackId === button.dataset.snippetPlay;
            button.classList.toggle('is-playing', playing);
            button.setAttribute('aria-label', playing ? 'Pause snippet' : 'Play snippet');
            button.innerHTML = snippetPlayIcon(playing);
        });
    }

    playSnippetAware(element) {
        const kind = element.dataset.playKind;
        const id = element.dataset.playId;
        if (!kind || !id) return;
        const start = element.dataset.snippetStart;
        const end = element.dataset.snippetEnd;
        if (start !== undefined && end !== undefined && kind === 'track') {
            this.playSnippet(id, Number(start) || 0, Number(end) || 0).catch(console.error);
            return;
        }
        this.stopSnippetPlayback();
        playSharedItem(kind, id);
    }

    /* ------------------------------- lightbox -------------------------------- */

    openLightbox(src) {
        let box = document.getElementById('social-lightbox');
        if (!box) {
            box = document.createElement('div');
            box.id = 'social-lightbox';
            box.className = 'social-lightbox';
            box.innerHTML = `<img alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" /><button type="button" class="social-lightbox-close" aria-label="Close">${icon.x(20)}</button>`;
            document.body.appendChild(box);
            box.addEventListener('click', (event) => {
                if (event.target === box || event.target.closest('.social-lightbox-close'))
                    box.classList.remove('is-open');
            });
            window.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') box.classList.remove('is-open');
            });
        }
        box.querySelector('img').src = src;
        box.classList.add('is-open');
    }

    handleSocialEscape() {
        if (shareSheet.opened || document.getElementById('social-lightbox')?.classList.contains('is-open'))
            return false;
        if (this.infoOpen) {
            this.toggleInfoPanel(false);
            return true;
        }
        return false;
    }

    /* -------------------------------- sharing -------------------------------- */

    openShareSheet({
        payload = null,
        kind = 'track',
        item = null,
        preselectUser = null,
        preselectConversation = null,
    } = {}) {
        const share = payload || (item ? sharePayload(kind, item) : null);
        shareSheet.open({
            payload: share,
            item: share ? item : null,
            kind,
            preselectUser,
            preselectConversation,
        });
    }

    prepareShare(kind, item) {
        this.pendingShare = null;
        this.openShareSheet({ kind, item });
    }

    async shareRecipients() {
        const out = [];
        for (const profile of this.profiles.values()) {
            if (profile.user === this.userId || !this.canChatWith(profile.user)) continue;
            out.push({
                key: `user:${profile.user}`,
                type: 'user',
                id: profile.user,
                name: displayName(profile),
                meta: handleFor(profile),
                image: avatarFor(profile),
            });
        }
        for (const conversation of this.conversations.values()) {
            if (conversation.type !== 'group') continue;
            out.push({
                key: `conversation:${conversation.id}`,
                type: 'conversation',
                id: conversation.id,
                name: conversationTitle(conversation, this.profiles, this.userId),
                meta: `${(conversation.members || []).length} members`,
                image: conversationAvatar(conversation, this.profiles, this.userId),
            });
        }
        return out;
    }

    /* -------------------------------- presence ------------------------------- */

    attachPlayerPresence() {
        if (!this.player || this.player.__socialPresenceAttached) return;
        this.player.__socialPresenceAttached = true;
        for (const element of [...this.player.getAudioElements(), this.player.video].filter(Boolean)) {
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

    startClock() {
        clearInterval(this.clockTimer);
        this.clockTimer = setInterval(() => {
            if (document.getElementById('page-social')?.classList.contains('active')) {
                this.renderRail(document.getElementById('social-conversation-search')?.value || '');
            }
        }, 30_000);
    }

    async pollSocialState() {
        if (!this.userId || this.realtimeEnabled) return;
        await this.refreshAll();
        if (this.activeId) await this.loadConversationMessages(this.activeId).catch(() => {});
        this.renderThread();
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

        const unsubscribeMessages = await pb.collection('social_messages').subscribe('*', async (event) => {
            const record = event.record;
            if (this.isBlocked(record.sender)) return;
            const conversationId = record.conversation;
            if (!conversationId || !this.conversations.has(conversationId)) return;
            const list = this.messagesByConversation.get(conversationId) || [];
            const index = list.findIndex((message) => message.id === record.id);
            const pendingIndex = record.client_nonce
                ? list.findIndex((message) => message.id === record.client_nonce)
                : -1;
            if (event.action === 'delete') {
                if (index >= 0) list.splice(index, 1);
            } else if (index >= 0) list[index] = record;
            else if (pendingIndex >= 0) list.splice(pendingIndex, 1, record);
            else list.push(record);
            list.sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
            if (conversationId === this.activeId) {
                this.renderMessages();
                this.scrollMessagesToBottom();
                if (record.recipient === this.userId && !record.read && event.action === 'create') {
                    pb.collection('social_messages')
                        .update(record.id, { read: true })
                        .catch(() => {});
                }
            }
            this.renderRail(document.getElementById('social-conversation-search')?.value || '');
            this.refreshSidebarBadge();
        });
        subscriptions.push(unsubscribeMessages);

        for (const collection of [
            'social_conversations',
            'social_profiles',
            'social_presence',
            'social_follows',
            'social_blocks',
        ]) {
            const unsubscribe = await pb.collection(collection).subscribe('*', async () => {
                await this.refreshAll();
            });
            subscriptions.push(unsubscribe);
        }

        let feedThrottle = 0;
        for (const collection of ['social_posts', 'social_post_likes', 'social_post_comments']) {
            const unsubscribe = await pb.collection(collection).subscribe('*', async () => {
                const now = Date.now();
                if (now - feedThrottle < 1200) return;
                feedThrottle = now;
                if (this.feed) this.feed.refresh().catch(() => {});
            });
            subscriptions.push(unsubscribe);
        }

        this.unsubscribe = subscriptions;
        this.realtimeEnabled = true;
    }

    /* ----------------------------- profile page ------------------------------ */

    async renderProfilePresence(username) {
        const container = document.getElementById('profile-now-playing');
        if (!container) return;
        container.style.display = 'none';
        const profile = await pb
            .collection('social_profiles')
            .getFirstListItem(`username="${String(username).replaceAll('"', '\\"')}"`)
            .catch(() => null);
        if (!profile) return;
        if (this.isBlocked(profile.user)) return;
        const presence = await pb
            .collection('social_presence')
            .getFirstListItem(`user="${profile.user}"`)
            .catch(() => null);
        const state = presenceState(presence);
        if (!state.track) return;
        container.innerHTML = `<span class="social-equalizer"><i></i><i></i><i></i></span><span><em>${state.playing ? 'LISTENING NOW' : 'PAUSED'}</em><strong>${escapeHtml(state.track.title)}</strong><small>${escapeHtml(state.track.subtitle || '')}</small></span><a href="${escapeHtml(state.track.href || '#')}">Open</a>`;
        container.style.display = 'flex';
    }

    async renderProfileSocial(username) {
        const button = document.getElementById('profile-follow-btn');
        const stats = document.getElementById('profile-social-stats');
        const messageButton = document.getElementById('profile-message-btn');
        const blockButton = document.getElementById('profile-block-btn');
        if (!button) return;
        const profile = await pb
            .collection('social_profiles')
            .getFirstListItem(`username="${String(username).replaceAll('"', '\\"')}"`)
            .catch(() => null);
        button.dataset.followUser = '';
        button.style.display = 'none';
        if (blockButton) {
            blockButton.dataset.blockUser = '';
            blockButton.style.display = 'none';
        }
        if (stats) stats.style.display = 'none';
        if (!profile || profile.user === this.userId || this.isBlocked(profile.user)) return;

        const [followers, following] = await Promise.all([
            pb.collection('social_follows').getList(1, 1, { filter: `following="${profile.user}"` }),
            pb.collection('social_follows').getList(1, 1, { filter: `follower="${profile.user}"` }),
        ]);
        const isFollowing = this.following.has(profile.user);
        button.dataset.followUser = profile.user;
        button.innerHTML = isFollowing
            ? `${icon.check(15)}<span>Following</span>`
            : `${icon.userPlus(15)}<span>Follow</span>`;
        button.classList.toggle('is-following', isFollowing);
        button.style.display = 'inline-flex';
        if (blockButton) {
            blockButton.dataset.blockUser = profile.user;
            blockButton.style.display = 'inline-flex';
        }
        if (stats) {
            stats.textContent = `${followers.totalItems} followers · ${following.totalItems} following`;
            stats.style.display = 'block';
        }
        if (messageButton) messageButton.style.display = this.canChatWith(profile.user) ? '' : 'none';
    }

    /* ------------------------------ page render ------------------------------ */

    async renderPage(username = '') {
        document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
        document.getElementById('page-social')?.classList.add('active');
        if (!this.userId) {
            this.renderSignedOut();
            return;
        }
        await this.refreshAll();
        const composer = document.getElementById('social-post-composer');
        if (composer) composer.hidden = false;
        const me = this.me;
        const composerAvatar = document.getElementById('social-composer-avatar');
        if (composerAvatar && me) composerAvatar.src = avatarFor(me);
        if (username) {
            const clean = decodeURIComponent(username).replace(/^@/, '').toLowerCase();
            const profile = [...this.profiles.values()].find((item) => item.username?.toLowerCase() === clean);
            if (profile) {
                await this.openConversationForUser(profile.user);
                return;
            }
        }
        this.setTab(this.tab);
        if (this.activeId) {
            document.getElementById('social-empty-state').hidden = true;
            document.getElementById('social-thread').hidden = false;
            this.renderThread();
        }
    }

    renderSignedOut() {
        const feed = document.getElementById('social-feed');
        const list = document.getElementById('social-conversation-list');
        if (list) {
            list.innerHTML = `<div class="social-rail-empty"><strong>Sign in to use Social</strong><span>Your homelab conversations are private to signed-in members.</span></div>`;
        }
        if (feed) {
            feed.innerHTML = `<div class="social-feed-empty"><strong>Sign in to join in</strong><span>The feed and chats are for instance members.</span></div>`;
        }
        const composer = document.getElementById('social-post-composer');
        if (composer) composer.hidden = true;
        const count = document.getElementById('social-people-count');
        if (count) count.textContent = '0';
        const live = document.getElementById('social-live-list');
        const groups = document.getElementById('social-feed-groups');
        if (live) live.innerHTML = '<div class="social-feed-rail-empty">Sign in to see who is around.</div>';
        if (groups) groups.innerHTML = '<div class="social-feed-rail-empty">Sign in to see your groups.</div>';
    }

    /* --------------------------------- bind ---------------------------------- */

    bindUI() {
        this.bound = true;
        document.getElementById('social-tabs')?.addEventListener('click', (event) => {
            const tab = event.target.closest('.social-tab');
            if (tab) this.setTab(tab.id === 'social-tab-messages' ? 'messages' : 'feed');
        });
        document.getElementById('social-conversation-search')?.addEventListener('input', (event) => {
            this.renderRail(event.target.value);
        });
        document.getElementById('social-new-group')?.addEventListener('click', () => this.openGroupModal());
        document.getElementById('social-feed-new-group')?.addEventListener('click', () => this.openGroupModal());

        document.getElementById('social-feed-groups')?.addEventListener('click', (event) => {
            const row = event.target.closest('[data-feed-conversation]');
            if (row) this.openConversation(row.dataset.feedConversation).catch(console.error);
        });

        document.getElementById('social-conversation-list')?.addEventListener('click', (event) => {
            const row = event.target.closest('[data-conversation]');
            if (row) this.openConversation(row.dataset.conversation).catch(console.error);
        });

        document.getElementById('social-people-list')?.addEventListener('click', (event) => {
            const follow = event.target.closest('[data-follow-user]');
            if (follow) {
                event.stopPropagation();
                this.toggleFollow(follow.dataset.followUser).catch(console.error);
                return;
            }
            const person = event.target.closest('[data-open-person]');
            if (person) this.openConversationForUser(person.dataset.openPerson).catch(console.error);
        });

        document.getElementById('social-thread-back')?.addEventListener('click', () => this.closeConversation());
        document.getElementById('social-thread-person')?.addEventListener('click', () => this.toggleInfoPanel());
        document.getElementById('social-thread-info')?.addEventListener('click', () => this.toggleInfoPanel());
        document.getElementById('social-thread-mute')?.addEventListener('click', () => {
            const conversation = this.activeConversation();
            if (conversation) this.toggleMute(conversation.id).catch(console.error);
        });
        document.getElementById('social-gate-follow')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-follow-user]');
            if (button) this.toggleFollow(button.dataset.followUser).catch(console.error);
        });

        document.getElementById('social-messages')?.addEventListener('click', (event) => {
            const snippet = event.target.closest('[data-snippet-play]');
            if (snippet) {
                this.playSnippet(
                    snippet.dataset.snippetPlay,
                    Number(snippet.dataset.snippetStart) || 0,
                    Number(snippet.dataset.snippetEnd) || 0
                ).catch(console.error);
                return;
            }
            const lightbox = event.target.closest('[data-lightbox]');
            if (lightbox) {
                this.openLightbox(lightbox.dataset.lightbox);
                return;
            }
            const pin = event.target.closest('[data-pin-message]');
            if (pin) {
                this.pinMessage(pin.dataset.pinMessage).catch(console.error);
                return;
            }
            const play = event.target.closest('[data-play-kind][data-play-id]');
            if (play) {
                event.preventDefault();
                this.playSnippetAware(play);
                return;
            }
            const card = event.target.closest('.social-message-share');
            if (!card) return;
            const kind = card.dataset.shareKind;
            const id = card.dataset.shareId;
            if (kind && id) {
                event.preventDefault();
                void import('./router.js').then(({ navigate }) => navigate(`/${kind}/${encodeURIComponent(id)}`));
            }
        });

        document.getElementById('social-info-panel')?.addEventListener('click', (event) => {
            if (event.target.closest('[data-close-info]')) {
                this.toggleInfoPanel(false);
                return;
            }
            const mute = event.target.closest('[data-toggle-mute]');
            if (mute) {
                this.toggleMute(mute.dataset.toggleMute).catch(console.error);
                return;
            }
            const leave = event.target.closest('[data-leave-group]');
            if (leave) {
                leave.disabled = true;
                this.leaveGroup(leave.dataset.leaveGroup).catch((error) => {
                    leave.disabled = false;
                    showNotification(error?.message || 'Could not leave the group', 'error');
                });
                return;
            }
            const follow = event.target.closest('[data-toggle-follow]');
            if (follow) {
                this.toggleFollow(follow.dataset.toggleFollow).catch(console.error);
                return;
            }
            const block = event.target.closest('[data-block-user]');
            if (block) {
                block.disabled = true;
                this.blockUser(block.dataset.blockUser).catch((error) => {
                    block.disabled = false;
                    showNotification(error?.message || 'Could not block this account', 'error');
                });
                return;
            }
            const unpin = event.target.closest('[data-unpin]');
            if (unpin) {
                this.unpin(unpin.dataset.unpin).catch(console.error);
                return;
            }
            const play = event.target.closest('[data-play-share]');
            if (play) {
                playSharedItem(play.dataset.playKind || 'track', play.dataset.playShare);
                return;
            }
            const conversation = event.target.closest('[data-info-conversation]');
            if (conversation) {
                this.toggleInfoPanel(false);
                this.openConversation(conversation.dataset.infoConversation).catch(console.error);
                return;
            }
        });
        document.getElementById('social-info-panel')?.addEventListener('change', (event) => {
            const input = event.target.closest('[data-group-avatar-input]');
            const file = input?.files?.[0];
            if (input && file) {
                this.updateGroupAvatar(input.dataset.groupAvatarInput, file).catch((error) =>
                    showNotification(error.message, 'error')
                );
                return;
            }
        });

        const composer = document.getElementById('social-composer');
        composer?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitComposer().catch(console.error);
        });
        const input = document.getElementById('social-message-input');
        input?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                composer?.requestSubmit();
            }
        });
        input?.addEventListener('paste', (event) => {
            const file = [...(event.clipboardData?.files || [])].find((entry) => entry.type.startsWith('image/'));
            if (file) {
                event.preventDefault();
                this.setAttachments([file]);
            }
        });
        input?.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = `${Math.min(140, input.scrollHeight)}px`;
        });
        document.getElementById('social-attach-image')?.addEventListener('click', () => {
            document.getElementById('social-image-input')?.click();
        });
        document.getElementById('social-image-input')?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) this.setAttachments([file]);
            event.target.value = '';
        });
        document.getElementById('social-share-toggle')?.addEventListener('click', () => {
            const conversation = this.activeConversation();
            this.openShareSheet({ preselectConversation: conversation?.id || null });
        });

        document.addEventListener('monochrome-follow-changed', () => {
            const button = document.getElementById('profile-follow-btn');
            if (button?.dataset.followUser && document.getElementById('page-profile')?.classList.contains('active')) {
                const username = document.getElementById('profile-username')?.textContent?.replace(/^@/, '');
                if (username) this.renderProfileSocial(username).catch(console.error);
            }
        });
        window.addEventListener('resize', () => {
            const activeTab = document.getElementById(
                this.tab === 'messages' ? 'social-tab-messages' : 'social-tab-feed'
            );
            this.syncTabsThumb(activeTab);
        });
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && document.getElementById('page-social')?.classList.contains('active')) {
                this.handleSocialEscape();
            }
        });
        document.getElementById('profile-follow-btn')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-follow-user]');
            if (button) this.toggleFollow(button.dataset.followUser).catch(console.error);
        });
        document.getElementById('profile-block-btn')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-block-user]');
            if (!button) return;
            button.disabled = true;
            this.blockUser(button.dataset.blockUser).catch((error) => {
                button.disabled = false;
                showNotification(error?.message || 'Could not block this account', 'error');
            });
        });
    }
}

export const socialManager = new SocialManager();

export function syncSocialProfile(profile) {
    return socialManager.syncCurrentProfile(profile);
}
