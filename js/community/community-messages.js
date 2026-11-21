// Messages live in a drawer beside the music, never as a page of their own. Existing
// conversations, groups and history in social_conversations/social_messages are reused.
import I_X from '!lucide/x.svg?svg&icon';
import I_ARROW_LEFT from '!lucide/arrow-left.svg?svg&icon';
import I_ARROW_UP from '!lucide/arrow-up.svg?svg&icon';
import I_PLAY from '!lucide/play.svg?svg&icon';
import I_MUSIC from '!lucide/music.svg?svg&icon';
import { pb } from '../accounts/config.js';
import { api, getState } from './community-store.js';
import { attachmentHref, avatar, coverUrl, esc, firstName, profileHref, timeAgo } from './community-format.js';
import { playSharedItem } from '../share.js';
import { navigate } from '../router.js';
import { showNotification } from '../downloads.js';

const state = {
    started: false,
    profiles: new Map(),
    conversations: [],
    last: new Map(),
    reads: new Map(),
    readIds: new Map(),
    open: false,
    active: null,
    messages: [],
    pendingShare: null,
    unsubscribe: null,
};
let drawer = null;
let returnFocus = null;

const me = () => pb.authStore.record?.id;

function profileOf(id) {
    const fromHome = getState().data?.users?.[id];
    return fromHome || state.profiles.get(id) || { id, name: 'Member', avatar: '', username: '' };
}

function otherMembers(conversation) {
    return (conversation.members || []).filter((id) => id !== me());
}

function conversationTitle(conversation) {
    if (conversation.type === 'group') return conversation.name || otherMembers(conversation).map((id) => firstName(profileOf(id))).join(', ') || 'Group';
    return profileOf(otherMembers(conversation)[0]).name;
}

function isUnread(conversation) {
    const last = state.last.get(conversation.id);
    if (!last || last.sender === me()) return false;
    const read = state.reads.get(conversation.id) || 0;
    return Date.parse(last.created) > read;
}

export function unreadCount() {
    return state.conversations.filter(isUnread).length;
}

function announceUnread() {
    window.dispatchEvent(new CustomEvent('community-unread', { detail: { count: unreadCount() } }));
}

async function loadProfiles() {
    const list = await pb.collection('social_profiles').getFullList({ fields: 'user,username,display_name,avatar_url', requestKey: null });
    for (const p of list) state.profiles.set(p.user, { id: p.user, username: p.username, name: p.display_name || p.username || 'Member', avatar: p.avatar_url });
}

async function loadList() {
    const [conversations, recent, reads] = await Promise.all([
        pb.collection('social_conversations').getFullList({ sort: '-updated', requestKey: null }),
        pb.collection('social_messages').getList(1, 300, { sort: '-created', fields: 'id,conversation,sender,kind,body,created,payload', requestKey: null }),
        pb.collection('social_reads').getFullList({ requestKey: null }),
    ]);
    state.conversations = conversations;
    state.last.clear();
    for (const message of recent.items) if (message.conversation && !state.last.has(message.conversation)) state.last.set(message.conversation, message);
    state.reads.clear();
    for (const read of reads) {
        state.reads.set(read.conversation, Date.parse(read.last_read) || 0);
        state.readIds.set(read.conversation, read.id);
    }
    state.conversations.sort((a, b) => Date.parse(state.last.get(b.id)?.created || b.updated) - Date.parse(state.last.get(a.id)?.created || a.updated));
    announceUnread();
}

async function markRead(conversationId) {
    const now = new Date().toISOString();
    state.reads.set(conversationId, Date.now());
    announceUnread();
    try {
        const id = state.readIds.get(conversationId);
        if (id) await pb.collection('social_reads').update(id, { last_read: now }, { requestKey: null });
        else {
            const record = await pb.collection('social_reads').create({ user: me(), conversation: conversationId, last_read: now }, { requestKey: null });
            state.readIds.set(conversationId, record.id);
        }
    } catch {
        // Read state is a convenience; the next open retries.
    }
}

async function onMessageEvent(event) {
    const message = event.record;
    if (event.action !== 'create' || !message?.conversation) return;
    state.last.set(message.conversation, message);
    if (!state.conversations.some((c) => c.id === message.conversation)) {
        try {
            state.conversations.unshift(await pb.collection('social_conversations').getOne(message.conversation, { requestKey: null }));
        } catch {
            return;
        }
    } else {
        const index = state.conversations.findIndex((c) => c.id === message.conversation);
        state.conversations.unshift(...state.conversations.splice(index, 1));
    }
    if (state.open && state.active === message.conversation) {
        if (!state.messages.some((m) => m.id === message.id)) state.messages.push(message);
        renderThread({ keepScroll: false });
        if (document.visibilityState === 'visible') void markRead(message.conversation);
    } else if (state.open) {
        renderList();
    }
    announceUnread();
}

export async function startMessages() {
    if (state.started || !pb.authStore.isValid) return;
    state.started = true;
    try {
        await loadProfiles();
        await loadList();
        state.unsubscribe = await pb.collection('social_messages').subscribe('*', onMessageEvent);
    } catch (error) {
        state.started = false;
        console.warn('[Social] messages unavailable', error);
    }
}

export function stopMessages() {
    state.started = false;
    state.unsubscribe?.().catch(() => {});
    state.unsubscribe = null;
    state.conversations = [];
    state.last.clear();
    closeMessages();
    announceUnread();
}

// ---------------------------------------------------------------- rendering

function shareCard(raw) {
    if (!raw?.id) return '';
    // Older shares stored `type`/`image` instead of `kind`/`cover`.
    const payload = { ...raw, kind: raw.kind || raw.type || 'track', cover: raw.cover || raw.image || '' };
    const cover = coverUrl(payload.cover, '160');
    const href = attachmentHref(payload);
    const playable = payload.kind === 'track' || payload.kind === 'album';
    return `<span class="cm-share-card">
        <a href="${esc(href)}" class="cm-share-art">${cover ? `<img src="${esc(cover)}" alt="" class="${payload.kind === 'artist' ? 'is-round' : ''}" loading="lazy">` : I_MUSIC(18)}</a>
        <a href="${esc(href)}" class="cm-share-text"><strong>${esc(payload.title)}</strong><small>${esc(payload.subtitle || payload.kind)}</small></a>
        ${playable ? `<button type="button" class="cm-icon-btn is-solid is-small" data-play-kind="${esc(payload.kind)}" data-play-id="${esc(payload.id)}" aria-label="Play ${esc(payload.title)}">${I_PLAY(14)}</button>` : ''}
    </span>`;
}

function messageBody(message) {
    const parts = [];
    let payload = message.payload;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch {
            payload = null;
        }
    }
    if (payload?.id && (message.kind === 'share' || payload.kind)) parts.push(shareCard(payload));
    if (message.image) parts.push(`<img class="cm-msg-image" src="${esc(pb.files.getURL(message, message.image, { thumb: '480x0' }))}" alt="Shared image" loading="lazy">`);
    if (message.body) parts.push(`<span class="cm-msg-text">${esc(message.body)}</span>`);
    return parts.join('');
}

function preview(message) {
    if (!message) return 'No messages yet';
    const prefix = message.sender === me() ? 'You: ' : '';
    if (message.body) return prefix + message.body;
    return `${prefix}${message.kind === 'share' ? 'Shared music' : 'Sent an image'}`;
}

function renderList() {
    if (!drawer) return;
    const friends = Object.values(getState().data?.users || {}).filter((u) => u.relation === 'friend');
    const withDm = new Set(state.conversations.filter((c) => c.type === 'dm').flatMap((c) => otherMembers(c)));
    const sharing = state.pendingShare;
    drawer.querySelector('.cm-drawer-title').textContent = sharing ? 'Send to…' : 'Messages';
    drawer.querySelector('[data-drawer-back]').hidden = true;
    const body = drawer.querySelector('.cm-drawer-body');
    const rows = state.conversations
        .map((conversation) => {
            const others = otherMembers(conversation);
            const person = profileOf(others[0]);
            const last = state.last.get(conversation.id);
            return `<li><button type="button" class="cm-convo${isUnread(conversation) ? ' is-unread' : ''}" data-convo="${esc(conversation.id)}">
                ${avatar(person, 44)}
                <span class="cm-convo-text"><strong>${esc(conversationTitle(conversation))}</strong><small>${esc(preview(last))}</small></span>
                ${last ? `<time datetime="${esc(last.created)}">${esc(timeAgo(Date.parse(last.created)))}</time>` : ''}
            </button></li>`;
        })
        .join('');
    const starters = friends
        .filter((f) => !withDm.has(f.id))
        .map((f) => `<li><button type="button" class="cm-convo" data-dm="${esc(f.id)}">${avatar(f, 44)}<span class="cm-convo-text"><strong>${esc(f.name)}</strong><small>Start a conversation</small></span></button></li>`)
        .join('');
    body.innerHTML = `
        ${sharing ? `<div class="cm-drawer-share">${shareCard(sharing)}</div>` : ''}
        ${rows ? `<ul class="cm-convo-list" aria-label="Conversations">${rows}</ul>` : ''}
        ${starters ? `<p class="cm-drawer-label">Friends</p><ul class="cm-convo-list">${starters}</ul>` : ''}
        ${!rows && !starters ? '<p class="cm-drawer-empty">Messages are for friends: follow someone who follows you back and you can write to them here.</p>' : ''}`;
}

function renderThread({ keepScroll = true } = {}) {
    if (!drawer) return;
    const conversation = state.conversations.find((c) => c.id === state.active);
    if (!conversation) return renderList();
    const others = otherMembers(conversation);
    const head = drawer.querySelector('.cm-drawer-title');
    head.innerHTML = conversation.type === 'dm' && profileHref(profileOf(others[0])) ? `<a href="${esc(profileHref(profileOf(others[0])))}" data-drawer-profile>${esc(conversationTitle(conversation))}</a>` : esc(conversationTitle(conversation));
    drawer.querySelector('[data-drawer-back]').hidden = false;
    const body = drawer.querySelector('.cm-drawer-body');
    const scroller = body.querySelector('.cm-thread');
    const atBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    let previous = null;
    const items = state.messages
        .map((message) => {
            const own = message.sender === me();
            const grouped = previous && previous.sender === message.sender && Date.parse(message.created) - Date.parse(previous.created) < 5 * 60000;
            previous = message;
            const who = profileOf(message.sender);
            return `<li class="cm-msg${own ? ' is-own' : ''}${grouped ? ' is-grouped' : ''}">
                ${!own && conversation.type === 'group' && !grouped ? `<span class="cm-msg-name">${esc(firstName(who))}</span>` : ''}
                <span class="cm-msg-bubble" title="${esc(new Date(message.created).toLocaleString())}">${messageBody(message)}</span>
            </li>`;
        })
        .join('');
    const pending = state.pendingShare;
    if (!scroller) {
        body.innerHTML = `<ol class="cm-thread" aria-live="polite" aria-label="Messages">${items}</ol>
            <form class="cm-composer-msg">
                <div class="cm-composer-share">${pending ? shareCard(pending) + `<button type="button" class="cm-icon-btn is-quiet is-small" data-unshare aria-label="Remove shared music">${I_X(14)}</button>` : ''}</div>
                <div class="cm-composer-row">
                    <textarea rows="1" maxlength="4096" placeholder="Message" aria-label="Message"></textarea>
                    <button type="submit" class="cm-icon-btn is-solid" aria-label="Send">${I_ARROW_UP(18)}</button>
                </div>
            </form>`;
        bindComposer();
    } else {
        scroller.innerHTML = items;
    }
    const thread = body.querySelector('.cm-thread');
    if (!keepScroll || atBottom) thread.scrollTop = thread.scrollHeight;
}

function bindComposer() {
    const form = drawer.querySelector('.cm-composer-msg');
    const input = form.querySelector('textarea');
    const resize = () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(140, input.scrollHeight)}px`;
    };
    input.addEventListener('input', resize);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            form.requestSubmit();
        }
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = input.value.trim();
        const share = state.pendingShare;
        if (!text && !share) return;
        const conversation = state.conversations.find((c) => c.id === state.active);
        input.value = '';
        resize();
        try {
            await pb.collection('social_messages').create(
                {
                    conversation: conversation.id,
                    sender: me(),
                    recipient: conversation.type === 'dm' ? otherMembers(conversation)[0] : '',
                    kind: share ? 'share' : 'text',
                    body: text,
                    payload: share || null,
                    read: false,
                },
                { requestKey: null }
            );
            state.pendingShare = null;
            drawer.querySelector('.cm-composer-share').innerHTML = '';
        } catch (error) {
            input.value = text;
            showNotification(error?.status === 403 ? 'You can only message friends.' : 'Message not sent.');
        }
    });
    form.addEventListener('click', (event) => {
        if (event.target.closest('[data-unshare]')) {
            state.pendingShare = null;
            form.querySelector('.cm-composer-share').innerHTML = '';
        }
    });
    if (window.matchMedia('(pointer: fine)').matches) input.focus();
}

async function openConversation(id) {
    state.active = id;
    drawer.querySelector('.cm-drawer-body').innerHTML = '<p class="cm-drawer-empty">Loading…</p>';
    try {
        const result = await pb.collection('social_messages').getList(1, 80, { filter: pb.filter('conversation = {:id}', { id }), sort: '-created', requestKey: null });
        if (state.active !== id) return;
        state.messages = result.items.reverse();
        drawer.querySelector('.cm-drawer-body').innerHTML = '';
        renderThread({ keepScroll: false });
        void markRead(id);
    } catch {
        drawer.querySelector('.cm-drawer-body').innerHTML = '<p class="cm-drawer-empty">Could not load this conversation.</p>';
    }
}

async function openDmWith(userId) {
    try {
        const { conversation } = await api('/messages/dm', { method: 'POST', body: { user: userId } });
        if (!state.conversations.some((c) => c.id === conversation)) {
            state.conversations.unshift(await pb.collection('social_conversations').getOne(conversation, { requestKey: null }));
        }
        await openConversation(conversation);
    } catch (error) {
        showNotification(error?.response?.message || 'You can message friends once you follow each other.');
    }
}

function ensureDrawer() {
    if (drawer) return drawer;
    drawer = document.createElement('div');
    drawer.className = 'cm-drawer-layer';
    drawer.innerHTML = `
        <div class="cm-drawer-scrim" data-drawer-close></div>
        <aside class="cm-drawer" role="dialog" aria-modal="true" aria-labelledby="cm-drawer-title">
            <header class="cm-drawer-head">
                <button type="button" class="cm-icon-btn is-quiet" data-drawer-back aria-label="All conversations" hidden>${I_ARROW_LEFT(18)}</button>
                <h2 id="cm-drawer-title" class="cm-drawer-title">Messages</h2>
                <button type="button" class="cm-icon-btn is-quiet" data-drawer-close aria-label="Close messages">${I_X(18)}</button>
            </header>
            <div class="cm-drawer-body"></div>
        </aside>`;
    // Closed, the drawer is out of the tab order and the accessibility tree.
    drawer.inert = true;
    document.body.appendChild(drawer);
    drawer.addEventListener('click', (event) => {
        if (event.target.closest('[data-drawer-close]')) return closeMessages();
        if (event.target.closest('[data-drawer-back]')) {
            state.active = null;
            drawer.querySelector('.cm-drawer-body').innerHTML = '';
            return renderList();
        }
        const play = event.target.closest('[data-play-kind]');
        if (play) return playSharedItem(play.dataset.playKind, play.dataset.playId);
        const convo = event.target.closest('[data-convo]');
        if (convo) return void openConversation(convo.dataset.convo);
        const dm = event.target.closest('[data-dm]');
        if (dm) return void openDmWith(dm.dataset.dm);
        const link = event.target.closest('a[href^="/"]');
        if (link) {
            event.preventDefault();
            closeMessages();
            navigate(link.getAttribute('href'));
        }
    });
    drawer.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            closeMessages();
        }
        if (event.key === 'Tab') {
            const focusable = [...drawer.querySelectorAll('button:not([hidden]), a[href], textarea, input')].filter((el) => el.offsetParent);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    return drawer;
}

/** Opens the drawer: on the list, a member's DM, a conversation, or a share picker. */
export async function openMessages({ user = null, conversation = null, share = null } = {}) {
    await startMessages();
    returnFocus = document.activeElement;
    ensureDrawer();
    state.open = true;
    drawer.inert = false;
    state.pendingShare = share;
    state.active = null;
    drawer.querySelector('.cm-drawer-body').innerHTML = '';
    document.documentElement.classList.add('cm-drawer-open');
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    if (user) await openDmWith(user);
    else if (conversation) await openConversation(conversation);
    else renderList();
    drawer.querySelector('[data-drawer-close]')?.focus({ preventScroll: true });
}

export function closeMessages() {
    if (!drawer || !state.open) return;
    state.open = false;
    state.active = null;
    state.pendingShare = null;
    drawer.classList.remove('is-open');
    document.documentElement.classList.remove('cm-drawer-open');
    returnFocus?.focus?.({ preventScroll: true });
    drawer.inert = true;
}

/** Share music with a friend: opens the drawer as a recipient picker. */
export function shareWithFriend(attachment) {
    if (!attachment) return;
    void openMessages({ share: attachment });
}
