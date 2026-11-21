// Social on member profiles: friendship, messages, blocking, taste match and what they are
// playing right now — all from the same server rules as the Social page.
import I_PLAY from '!lucide/play.svg?svg&icon';
import I_MESSAGE from '!lucide/message-circle.svg?svg&icon';
import { pb } from '../accounts/config.js';
import { api, positionOf } from './community-store.js';
import { artistNames, esc, maybeLink, plural, trackCover, trackHref, artistHref } from './community-format.js';
import { openMessages } from './community-messages.js';
import { playSharedItem } from '../share.js';
import { showNotification } from '../downloads.js';

let ticker = null;
let current = '';

const $ = (id) => document.getElementById(id);

async function profileUserId(username) {
    try {
        const record = await pb.collection('social_profiles').getFirstListItem(pb.filter('username = {:username}', { username }), { requestKey: null, fields: 'user' });
        return record.user;
    } catch {
        return null;
    }
}

async function memberInfo(username) {
    try {
        return await api(`/member/${encodeURIComponent(username)}`);
    } catch {
        return null;
    }
}

function fmt(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function nowPlayingCard(presence) {
    const t = presence.track;
    const cover = trackCover(t, '320');
    return `<div class="cm-profile-live">
        <button type="button" class="cm-profile-live-cover" data-play-id="${esc(t.id)}" aria-label="Play ${esc(t.title)}">${cover ? `<img src="${esc(cover)}" alt="">` : ''}<span class="cm-cover-play" aria-hidden="true">${I_PLAY(18)}</span></button>
        <div class="cm-profile-live-text">
            <p class="cm-profile-live-label"><span class="cm-live-dot" aria-hidden="true"></span>${presence.playing ? 'Listening now' : 'Paused'}</p>
            <p class="cm-profile-live-title">${maybeLink(trackHref(t), t.title)}</p>
            <p class="cm-profile-live-meta">${maybeLink(artistHref(t.artists?.[0]), artistNames(t))}</p>
            <span class="cm-mini-progress" aria-hidden="true"><span data-profile-fill></span></span>
            <span class="cm-profile-live-time"><span data-profile-pos>0:00</span> / ${esc(fmt(presence.duration))}</span>
        </div>
    </div>`;
}

function statsLine(info) {
    const parts = [plural(info.friends, 'friend')];
    if (info.match) {
        const common = info.match.artists.slice(0, 3).join(', ');
        parts.push(`<strong>${info.match.score}% taste match</strong>${common ? ` · you both play ${esc(common)}` : ''}`);
    }
    return parts.join(' · ');
}

/** Runs for every profile view, including your own. */
export async function renderProfilePresence(username) {
    current = username;
    clearInterval(ticker);
    const live = $('profile-now-playing');
    const stats = $('profile-social-stats');
    if (live) {
        live.style.display = 'none';
        live.innerHTML = '';
    }
    if (stats) {
        stats.style.display = 'none';
        stats.innerHTML = '';
    }
    if (!pb.authStore.isValid) return;
    const info = await memberInfo(username);
    if (!info || current !== username) return;
    if (stats) {
        stats.innerHTML = statsLine(info);
        stats.style.display = 'block';
    }
    if (live && info.presence) {
        live.innerHTML = nowPlayingCard(info.presence);
        live.style.display = 'block';
        live.querySelector('[data-play-id]')?.addEventListener('click', (event) => playSharedItem('track', event.currentTarget.dataset.playId));
        const update = () => {
            if (current !== username || !live.isConnected) return clearInterval(ticker);
            const p = info.presence;
            const fill = live.querySelector('[data-profile-fill]');
            if (fill && p.duration) fill.style.setProperty('--p', Math.min(1, positionOf(p) / p.duration).toFixed(4));
            const pos = live.querySelector('[data-profile-pos]');
            if (pos) pos.textContent = fmt(positionOf(p));
        };
        update();
        ticker = setInterval(update, 1000);
    }
}

function labelFor(relation) {
    if (relation === 'friend') return 'Friends';
    if (relation === 'requested') return 'Requested';
    if (relation === 'follows-you') return 'Follow back';
    return 'Add friend';
}

/** Friendship, message and block controls on someone else's profile. */
export async function renderProfileSocial(username) {
    const follow = $('profile-follow-btn');
    const block = $('profile-block-btn');
    const actions = follow?.parentElement;
    if (!follow || !block || !actions) return;
    actions.querySelector('.cm-profile-message')?.remove();
    const me = pb.authStore.record?.id;
    const id = await profileUserId(username);
    if (!me || !id || id === me || current !== username) return;

    const blocks = await pb.collection('social_blocks').getFullList({ filter: pb.filter('blocker = {:me} && blocked = {:id}', { me, id }), requestKey: null }).catch(() => []);
    if (blocks.length) {
        follow.style.display = 'none';
        block.style.display = 'inline-flex';
        block.textContent = 'Unblock';
        block.onclick = async () => {
            await pb.collection('social_blocks').delete(blocks[0].id, { requestKey: null }).catch(() => null);
            showNotification('Unblocked.');
            void renderProfileSocial(username);
            void renderProfilePresence(username);
        };
        return;
    }

    const info = await memberInfo(username);
    if (!info || current !== username) return;
    let relation = info.user.relation;
    const paint = () => {
        follow.textContent = labelFor(relation);
        follow.classList.toggle('btn-primary', relation === 'none' || relation === 'follows-you');
        follow.classList.toggle('btn-secondary', relation === 'friend' || relation === 'requested');
        follow.setAttribute('aria-pressed', String(relation === 'friend' || relation === 'requested'));
        follow.style.display = 'inline-flex';
        actions.querySelector('.cm-profile-message')?.remove();
        if (relation === 'friend') {
            const message = document.createElement('button');
            message.type = 'button';
            message.className = 'btn-secondary cm-profile-message';
            message.innerHTML = `${I_MESSAGE(16)}<span>Message</span>`;
            message.addEventListener('click', () => void openMessages({ user: id }));
            follow.after(message);
        }
    };
    paint();
    follow.onclick = async () => {
        follow.disabled = true;
        try {
            if (relation === 'friend' || relation === 'requested') {
                const existing = await pb.collection('social_follows').getFirstListItem(pb.filter('follower = {:me} && following = {:id}', { me, id }), { requestKey: null });
                await pb.collection('social_follows').delete(existing.id, { requestKey: null });
                relation = relation === 'friend' ? 'follows-you' : 'none';
            } else {
                await pb.collection('social_follows').create({ follower: me, following: id }, { requestKey: null });
                relation = relation === 'follows-you' ? 'friend' : 'requested';
            }
            paint();
            void renderProfilePresence(username);
        } catch {
            showNotification('Could not update this friendship.');
        } finally {
            follow.disabled = false;
        }
    };
    block.style.display = 'inline-flex';
    block.textContent = 'Block';
    block.onclick = async () => {
        if (!window.confirm(`Block ${info.user.name}? You'll stop seeing each other in Social and messages, and any follows between you are removed.`)) return;
        try {
            await pb.collection('social_blocks').create({ blocker: me, blocked: id }, { requestKey: null });
            showNotification('Blocked.');
            void renderProfileSocial(username);
            void renderProfilePresence(username);
        } catch {
            showNotification('Could not block this member.');
        }
    };
}
