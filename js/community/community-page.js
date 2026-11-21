// The Social page: notes on top, what everyone is playing right now, then a scrollable
// stream of recent listening and community moments, with taste and charts beside it.
import I_GHOST from '!lucide/ghost.svg?svg&icon';
import I_MESSAGE from '!lucide/message-circle.svg?svg&icon';
import I_PLAY from '!lucide/play.svg?svg&icon';
import I_HEART from '!lucide/heart.svg?svg&icon';
import I_SEND from '!lucide/send.svg?svg&icon';
import I_PLUS from '!lucide/plus.svg?svg&icon';
import I_VOTE from '!lucide/vote.svg?svg&icon';
import I_USER_PLUS from '!lucide/user-plus.svg?svg&icon';
import I_USER_CHECK from '!lucide/user-check.svg?svg&icon';
import I_STICKY from '!lucide/sticky-note.svg?svg&icon';
import I_LINK from '!lucide/link.svg?svg&icon';
import I_TRASH from '!lucide/trash-2.svg?svg&icon';
import I_X from '!lucide/x.svg?svg&icon';
import { pb } from '../accounts/config.js';
import { db } from '../db.js';
import { syncManager } from '../accounts/pocketbase.js';
import { MusicAPI } from '../music-api.js';
import { playSharedItem } from '../share.js';
import { showNotification } from '../downloads.js';
import { getCachedAppConfig } from '../access-control.js';
import { api, getState, load, connect, onChange, positionOf, pruneStale, scheduleRefresh, serverNow } from './community-store.js';
import {
    albumHref,
    artistHref,
    artistNames,
    attachmentHref,
    avatar,
    clockTime,
    coverUrl,
    dayLabel,
    esc,
    firstName,
    isoTime,
    maybeLink,
    nameList,
    plural,
    profileHref,
    timeAgo,
    timeLeft,
    trackCover,
    trackHref,
} from './community-format.js';
import { bindReactions, reactionBar } from './community-reactions.js';
import { ghostSummary, openSharing, setGhost, shouldAskConsent, syncGhostMark, toggleGhostMenu, visibilityIcon, visibilityLabel } from './community-privacy.js';
import { openNoteComposer, openPollComposer } from './community-compose.js';
import { openMessages, shareWithFriend, startMessages, unreadCount } from './community-messages.js';

let root = null;
let bound = false;
let ticker = null;
const rendered = new Map();
const shares = new Map();
const seenRooms = new Set();

const data = () => getState().data;
const meId = () => data()?.me?.id;
const userOf = (id) => data()?.users?.[id] || { id, name: 'Member', avatar: '' };

function fmt(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function remember(payload) {
    const key = `${payload.kind}:${payload.id}`;
    shares.set(key, payload);
    return key;
}

function trackPayload(track) {
    return remember({
        kind: 'track',
        id: track.id,
        title: track.title,
        subtitle: artistNames(track),
        cover: track.cover || track.album?.cover || '',
        isSelfHosted: !!track.isSelfHosted,
    });
}

// ---------------------------------------------------------------- rooms (client mirror of the server grouping)

function groupRooms(live) {
    const rooms = [];
    const take = (list, keyOf, kind) => {
        const groups = new Map();
        for (const p of list) {
            const key = keyOf(p);
            if (!key) continue;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(p);
        }
        const used = new Set();
        for (const [key, listeners] of groups) {
            if (listeners.length < 2) continue;
            listeners.forEach((l) => used.add(l));
            rooms.push({ key: `${kind}:${key}`, kind, listeners });
        }
        return list.filter((p) => !used.has(p));
    };
    let rest = take(live, (p) => p.track?.id, 'track');
    rest = take(rest, (p) => p.track?.album?.id, 'album');
    rest = take(rest, (p) => (p.track?.artists?.[0]?.name || '').toLowerCase(), 'artist');
    for (const p of rest) rooms.push({ key: `solo:${p.user}`, kind: 'solo', listeners: [p] });
    const startOf = (room) => Math.min(...room.listeners.map((l) => l.started || l.at || 0));
    rooms.forEach((room) => room.listeners.sort((a, b) => (a.started || 0) - (b.started || 0)));
    rooms.sort((a, b) => b.listeners.length - a.listeners.length || startOf(a) - startOf(b));
    return rooms;
}

// ---------------------------------------------------------------- header

function renderHead() {
    const d = data();
    const others = d.live.filter((p) => p.user !== d.me.id).length;
    const members = d.members.length + 1;
    const sub = [others ? `${others} listening now` : 'Nobody else is playing right now', plural(members, 'member')].join(' · ');
    const unread = unreadCount();
    const ghost = d.me.ghostUntil;
    return `<header class="cm-head">
        <div class="cm-head-text">
            <h1 class="cm-title">Social</h1>
            <p class="cm-sub">${esc(sub)}</p>
        </div>
        <div class="cm-head-actions">
            <button type="button" class="cm-pill" data-cm="privacy" aria-label="Listening visibility: ${esc(visibilityLabel(d.me.visibility))}">${visibilityIcon(d.me.visibility, 15)}<span>${esc(d.me.visibility ? visibilityLabel(d.me.visibility) : 'Not sharing')}</span></button>
            <button type="button" class="cm-icon-btn" data-cm="ghost" aria-pressed="${!!ghost}" aria-haspopup="${ghost ? 'false' : 'menu'}" aria-label="${ghost ? 'Turn off Ghost Mode' : 'Ghost Mode'}" title="${ghost ? 'Turn off Ghost Mode' : 'Ghost Mode'}">${I_GHOST(19)}</button>
            <button type="button" class="cm-icon-btn" data-cm="messages" aria-label="Messages${unread ? `, ${unread} unread` : ''}" title="Messages">${I_MESSAGE(19)}${unread ? `<span class="cm-badge" aria-hidden="true">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
        </div>
    </header>
    ${ghost ? `<div class="cm-ghostband" role="status">${I_GHOST(18)}<p>${esc(ghostSummary())}</p><button type="button" class="cm-btn is-soft is-small" data-ghost-off>Turn off</button></div>` : ''}
    ${!d.me.visibility && !ghost ? `<div class="cm-ghostband is-consent" role="status">${visibilityIcon('private', 18)}<p>You're not sharing your listening yet. Others can't see what you play.</p><button type="button" class="cm-btn is-soft is-small" data-cm="privacy">Choose</button></div>` : ''}`;
}

// ---------------------------------------------------------------- notes row

function noteBubble(note) {
    const a = note.attachment;
    const chip = a
        ? `<span class="cm-bubble-music">${a.cover ? `<img src="${esc(coverUrl(a.cover, '80'))}" alt="" class="${a.kind === 'artist' ? 'is-round' : ''}">` : ''}<span>${esc(a.title)}</span></span>`
        : '';
    return `${note.body ? `<span class="cm-bubble-text">${esc(note.body)}</span>` : ''}${chip}`;
}

function renderNotes() {
    const d = data();
    const me = userOf(d.me.id);
    const mine = d.notes.find((n) => n.user === d.me.id);
    const liveUsers = new Map(d.live.map((p) => [p.user, p]));
    const items = [];
    items.push(`<li class="cm-note is-me">
        <button type="button" class="cm-note-bubble${mine ? '' : ' is-prompt'}" data-cm="note" aria-label="${mine ? 'Edit your note' : 'Leave a note'}">${mine ? noteBubble(mine) : '<span class="cm-bubble-text">Leave a note…</span>'}</button>
        <span class="cm-note-person">${personAvatar(me, liveUsers.get(me.id), 64)}${mine ? '' : `<span class="cm-note-plus" aria-hidden="true">${I_PLUS(14)}</span>`}<span class="cm-note-name">Your note</span></span>
    </li>`);
    const withNotes = d.notes.filter((n) => n.user !== d.me.id);
    for (const note of withNotes) {
        const user = userOf(note.user);
        items.push(`<li class="cm-note">
            <button type="button" class="cm-note-bubble" data-note="${esc(note.id)}" aria-label="${esc(`Note from ${user.name}: ${note.body || note.attachment?.title || ''}`)}">${noteBubble(note)}</button>
            <a class="cm-note-person" href="${esc(profileHref(user))}">${personAvatar(user, liveUsers.get(user.id), 64)}<span class="cm-note-name">${esc(firstName(user))}</span></a>
        </li>`);
    }
    const noted = new Set(d.notes.map((n) => n.user));
    for (const presence of d.live) {
        if (noted.has(presence.user) || presence.user === d.me.id) continue;
        const user = userOf(presence.user);
        items.push(`<li class="cm-note is-quiet">
            <span class="cm-note-bubble is-empty" aria-hidden="true"></span>
            <a class="cm-note-person" href="${esc(profileHref(user))}" title="${esc(`${user.name} is listening to ${presence.track.title}`)}">${personAvatar(user, presence, 64)}<span class="cm-note-name">${esc(firstName(user))}</span></a>
        </li>`);
    }
    return `<section class="cm-notes" aria-label="Notes"><ul class="cm-notes-row">${items.join('')}</ul></section>`;
}

function personAvatar(user, presence, size) {
    const ring = presence ? ` is-live${presence.playing ? '' : ' is-paused'}` : '';
    const badge = presence ? `<span class="cm-live-badge" aria-hidden="true"><i></i><i></i><i></i></span>` : '';
    return `<span class="cm-ring${ring}" style="--size:${size}px">${avatar(user, size)}${badge}</span>`;
}

// ---------------------------------------------------------------- live

function roomKeys(room) {
    return room.listeners.map((l) => `play:${l.playId}`).filter((k) => k !== 'play:');
}

function timeline(room) {
    const lead = room.listeners[0];
    return `<div class="cm-timeline" role="group" aria-label="Where everyone is in the song">
        <span class="cm-timeline-line"><span class="cm-timeline-fill" data-fill="${esc(lead.user)}"></span></span>
        ${room.listeners
            .map((l) => {
                const user = userOf(l.user);
                return `<a class="cm-playhead${l.playing ? '' : ' is-paused'}" href="${esc(profileHref(user))}" data-head="${esc(l.user)}" aria-label="${esc(`${l.user === meId() ? 'You' : user.name}${l.playing ? '' : ', paused'}`)}">${avatar(user, 26)}</a>`;
            })
            .join('')}
        <span class="cm-timeline-times"><span data-pos="${esc(lead.user)}">0:00</span><span>${esc(fmt(lead.duration))}</span></span>
    </div>`;
}

function listenerLines(room) {
    return `<ul class="cm-room-lines">${room.listeners
        .map((l) => {
            const user = userOf(l.user);
            return `<li><a href="${esc(profileHref(user))}" class="cm-room-line-who">${avatar(user, 24)}<span>${esc(l.user === meId() ? 'You' : firstName(user))}</span></a>
                <span class="cm-room-line-track">${maybeLink(trackHref(l.track), l.track.title)}</span>
                <span class="cm-mini-progress" aria-hidden="true"><span data-fill="${esc(l.user)}"></span></span></li>`;
        })
        .join('')}</ul>`;
}

function roomTitle(room) {
    const t = room.listeners[0].track;
    if (room.kind === 'album') return { title: t.album?.title || 'An album', href: albumHref(t.album), meta: maybeLink(artistHref(t.artists?.[0]), artistNames(t)) };
    if (room.kind === 'artist') return { title: t.artists?.[0]?.name || 'An artist', href: artistHref(t.artists?.[0]), meta: 'Different songs, same artist' };
    const album = t.album?.title ? ` · ${maybeLink(albumHref(t.album), t.album.title)}` : '';
    return { title: t.title, href: trackHref(t), meta: `${maybeLink(artistHref(t.artists?.[0]), artistNames(t))}${album}` };
}

function whoLine(room) {
    const users = room.listeners.map((l) => userOf(l.user));
    const names = nameList(users, meId());
    const verb = room.kind === 'album' ? 'are all in this album' : room.kind === 'artist' ? 'are all on this artist' : users.length > 1 ? 'are listening together' : users[0]?.id === meId() ? 'are listening' : 'is listening';
    const anyPlaying = room.listeners.some((l) => l.playing);
    return `<p class="cm-room-who"><span class="cm-stack">${users.slice(0, 4).map((u) => avatar(u, 28)).join('')}</span><span>${esc(`${names} ${users.length === 1 && users[0].id === meId() ? 'are listening' : verb}`)}</span>${anyPlaying ? '<span class="cm-live-tag">Live</span>' : '<span class="cm-live-tag is-paused">Paused</span>'}</p>`;
}

function roomActions(room, { lead }) {
    const t = room.listeners[0].track;
    const key = trackPayload(t);
    const playLabel = room.kind === 'album' ? 'Play album' : 'Play';
    const play = room.kind === 'album' && t.album?.id ? `data-play-kind="album" data-play-id="${esc(t.album.id)}"` : `data-play-kind="track" data-play-id="${esc(t.id)}"`;
    return `<div class="cm-room-actions">
        <button type="button" class="${lead ? 'cm-btn is-primary' : 'cm-icon-btn is-solid'}" ${play} aria-label="${esc(`${playLabel} ${t.title}`)}">${I_PLAY(lead ? 16 : 15)}${lead ? `<span>${playLabel}</span>` : ''}</button>
        <button type="button" class="cm-icon-btn" data-save-track="${esc(t.id)}" aria-pressed="false" aria-label="Save ${esc(t.title)} to your library" title="Save">${I_HEART(18)}</button>
        <button type="button" class="cm-icon-btn" data-send="${esc(key)}" aria-label="Send ${esc(t.title)} to a friend" title="Send to a friend">${I_SEND(17)}</button>
        ${lead ? `<button type="button" class="cm-icon-btn" data-note-with="${esc(key)}" aria-label="Write a note about ${esc(t.title)}" title="Write a note">${I_STICKY(17)}</button>` : ''}
        ${reactionBar(roomKeys(room), { label: `React to ${room.listeners.length > 1 ? 'everyone in this room' : 'this'}` })}
    </div>`;
}

function roomStage(room) {
    const t = room.listeners[0].track;
    const cover = trackCover(t, '640');
    const head = roomTitle(room);
    const isNew = !seenRooms.has(room.key);
    return `<article class="cm-stage${isNew ? ' is-new' : ''}" data-room="${esc(room.key)}">
        ${cover ? `<img class="cm-stage-ambience" src="${esc(cover)}" alt="" aria-hidden="true">` : ''}
        <button type="button" class="cm-stage-cover" data-play-kind="track" data-play-id="${esc(t.id)}" aria-label="${esc(`Play ${t.title}`)}">
            ${cover ? `<img src="${esc(cover)}" alt="" loading="eager" decoding="async">` : '<span class="cm-cover-blank"></span>'}
            <span class="cm-cover-play" aria-hidden="true">${I_PLAY(26)}</span>
        </button>
        <div class="cm-stage-info">
            ${whoLine(room)}
            <h3 class="cm-stage-title">${maybeLink(head.href, head.title)}</h3>
            <p class="cm-stage-meta">${head.meta}</p>
            ${room.kind === 'track' || room.kind === 'solo' ? timeline(room) : listenerLines(room)}
            ${roomActions(room, { lead: true })}
        </div>
    </article>`;
}

function roomCard(room) {
    const t = room.listeners[0].track;
    const cover = trackCover(t, '320');
    const head = roomTitle(room);
    const users = room.listeners.map((l) => userOf(l.user));
    const isNew = !seenRooms.has(room.key);
    return `<li class="cm-room${isNew ? ' is-new' : ''}" data-room="${esc(room.key)}">
        <div class="cm-room-art">
            <button type="button" class="cm-room-cover" data-play-kind="track" data-play-id="${esc(t.id)}" aria-label="${esc(`Play ${t.title}`)}">
                ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" decoding="async">` : '<span class="cm-cover-blank"></span>'}
                <span class="cm-cover-play" aria-hidden="true">${I_PLAY(20)}</span>
            </button>
            <span class="cm-room-faces">${users.slice(0, 3).map((u) => `<a href="${esc(profileHref(u))}" aria-label="${esc(u.name)}">${personAvatar(u, room.listeners.find((l) => l.user === u.id), 30)}</a>`).join('')}</span>
        </div>
        <p class="cm-room-who-small">${esc(nameList(users, meId()))}${room.listeners.every((l) => !l.playing) ? ' · paused' : ''}</p>
        <h3 class="cm-room-title">${maybeLink(head.href, head.title)}</h3>
        <p class="cm-room-meta">${room.kind === 'track' || room.kind === 'solo' ? maybeLink(artistHref(t.artists?.[0]), artistNames(t)) : esc(room.kind === 'album' ? `${plural(users.length, 'listener')} in this album` : `${plural(users.length, 'listener')} on this artist`)}</p>
        <span class="cm-mini-progress" aria-hidden="true"><span data-fill="${esc(room.listeners[0].user)}"></span></span>
        ${roomActions(room, { lead: false })}
    </li>`;
}

function connections(rooms) {
    const shared = rooms.filter((r) => r.listeners.length > 1);
    if (!shared.length) return '';
    const room = shared[0];
    const names = nameList(room.listeners.map((l) => userOf(l.user)), meId());
    const what = room.kind === 'track' ? 'the same song' : room.kind === 'album' ? 'the same album' : 'the same artist';
    return `<p class="cm-live-hint">${esc(`${names} are on ${what} right now.`)}</p>`;
}

function renderLive() {
    const d = data();
    const rooms = groupRooms(d.live);
    const instance = getCachedAppConfig().instance_name?.trim() || 'Monochrome';
    let body;
    if (!d.members.length) {
        body = `<div class="cm-invite">
            <p class="cm-invite-title">It's just you on ${esc(instance)} for now.</p>
            <p class="cm-invite-text">Social comes alive when friends join: you'll see what they play, swap notes and find out whose taste matches yours.</p>
            <button type="button" class="cm-btn is-primary" data-copy-invite>${I_LINK(16)}<span>Copy the instance link</span></button>
        </div>`;
    } else if (!rooms.length) {
        const recent = d.stream.filter((s) => s.kind === 'session' && s.user !== d.me.id).slice(0, 4);
        body = `<div class="cm-quiet">
            <p class="cm-quiet-title">Quiet right now.</p>
            <p class="cm-quiet-text">${recent.length ? 'Last heard on the instance:' : 'When someone who shares their listening presses play, it shows up here.'}</p>
            ${recent.length ? `<ul class="cm-lastheard">${recent.map(lastHeard).join('')}</ul>` : ''}
        </div>`;
    } else {
        const [lead, ...rest] = rooms;
        body = `${connections(rooms)}${roomStage(lead)}${rest.length ? `<ul class="cm-rooms${rest.length > 3 ? ' is-scroll' : ''}" aria-label="Also listening">${rest.map(roomCard).join('')}</ul>` : ''}`;
    }
    const liveCount = d.live.length;
    return `<section class="cm-live" aria-labelledby="cm-live-title">
        <div class="cm-section-head"><h2 id="cm-live-title" class="cm-h2">${liveCount ? '<span class="cm-live-dot" aria-hidden="true"></span>' : ''}Listening now</h2></div>
        ${body}
    </section>`;
}

function lastHeard(session) {
    const user = userOf(session.user);
    const t = session.tracks[0];
    return `<li class="cm-lastheard-item">
        <button type="button" class="cm-lastheard-cover" data-play-kind="track" data-play-id="${esc(t.id)}" aria-label="${esc(`Play ${t.title}`)}">${trackCover(t, '160') ? `<img src="${esc(trackCover(t, '160'))}" alt="" loading="lazy">` : '<span class="cm-cover-blank"></span>'}<span class="cm-cover-play" aria-hidden="true">${I_PLAY(16)}</span></button>
        <span class="cm-lastheard-text"><strong>${maybeLink(trackHref(t), t.title)}</strong><small><a href="${esc(profileHref(user))}">${esc(firstName(user))}</a> · ${esc(timeAgo(session.end, serverNow()))}</small></span>
    </li>`;
}

// ---------------------------------------------------------------- stream

function itemHead(user, html, at) {
    return `<header class="cm-item-head">
        <a href="${esc(profileHref(user))}" class="cm-item-avatar">${avatar(user, 40)}</a>
        <p class="cm-item-line">${html}</p>
        <time datetime="${esc(isoTime(at))}" title="${esc(new Date(at).toLocaleString())}">${esc(timeAgo(at, serverNow()))}</time>
    </header>`;
}

function who(user) {
    const label = user.id === meId() ? 'You' : user.name;
    return `<a href="${esc(profileHref(user))}" class="cm-who">${esc(label)}</a>`;
}

/** One song: the song itself is the content, so it is shown once, as a playable row. */
function singlePlayItem(item, user) {
    const t = item.tracks[0];
    const cover = trackCover(t, '160');
    const album = t.album?.title ? ` · ${maybeLink(albumHref(t.album), t.album.title)}` : '';
    return `<li class="cm-item cm-item--session is-single">
        ${itemHead(user, `${who(user)} played`, item.end)}
        <div class="cm-single">
            <button type="button" class="cm-single-cover" data-play-kind="track" data-play-id="${esc(t.id)}" aria-label="${esc(`Play ${t.title}`)}">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" decoding="async">` : '<span class="cm-cover-blank"></span>'}<span class="cm-cover-play" aria-hidden="true">${I_PLAY(16)}</span></button>
            <span class="cm-single-text"><strong>${maybeLink(trackHref(t), t.title)}</strong><small>${maybeLink(artistHref(t.artists?.[0]), artistNames(t))}${album}</small></span>
            <button type="button" class="cm-icon-btn is-small" data-send="${esc(trackPayload(t))}" aria-label="Send ${esc(t.title)} to a friend" title="Send to a friend">${I_SEND(15)}</button>
            ${reactionBar([item.key], { compact: true })}
        </div>
    </li>`;
}

function sessionItem(item) {
    const user = userOf(item.user);
    if (item.count === 1 && !item.album) return singlePlayItem(item, user);
    const lead = item.album || item.tracks[0]?.album;
    const what = item.album
        ? `played ${maybeLink(albumHref(item.album), item.album.title, 'cm-em')}`
        : `listened to ${esc(plural(item.count, 'track'))}`;
    const covers = item.album ? [item.album.cover || item.tracks[0]?.cover] : [...new Set(item.tracks.map((t) => t.cover || t.album?.cover).filter(Boolean))].slice(0, 4);
    const art = covers.length
        ? `<div class="cm-session-art${covers.length > 1 ? ' is-mosaic' : ''}" data-count="${covers.length}">${covers.map((c) => `<img src="${esc(coverUrl(c, '320'))}" alt="" loading="lazy" decoding="async">`).join('')}</div>`
        : '';
    const span = item.end - item.start > 20 * 60000 ? ` <span class="cm-dim">${esc(`${clockTime(item.start)}–${clockTime(item.end)}`)}</span>` : '';
    const tracks = item.tracks
        .slice(0, 5)
        .map(
            (t) => `<li><button type="button" class="cm-tracklet" data-play-kind="track" data-play-id="${esc(t.id)}" aria-label="${esc(`Play ${t.title}`)}">${I_PLAY(12)}</button>
            <span class="cm-tracklet-text">${maybeLink(trackHref(t), t.title)}<small>${esc(artistNames(t))}</small></span>${t.plays > 1 ? `<span class="cm-dim">×${t.plays}</span>` : ''}</li>`
        )
        .join('');
    const more = item.count > 5 ? `<p class="cm-dim cm-more-line">${esc(`and ${item.count - Math.min(5, item.tracks.length)} more`)}</p>` : '';
    const play = item.album?.id ? `data-play-kind="album" data-play-id="${esc(item.album.id)}"` : `data-play-kind="track" data-play-id="${esc(item.tracks[0].id)}"`;
    return `<li class="cm-item cm-item--session">
        ${itemHead(user, `${who(user)} ${what}${span}`, item.end)}
        <div class="cm-session">
            ${art}
            <div class="cm-session-body">
                ${lead && item.album ? `<p class="cm-session-sub">${esc(artistNames(item.tracks[0]))}</p>` : ''}
                <ol class="cm-tracklets">${tracks}</ol>${more}
            </div>
        </div>
        <footer class="cm-item-foot">
            <button type="button" class="cm-btn is-soft is-small" ${play}>${I_PLAY(14)}<span>${item.album ? 'Play album' : 'Play'}</span></button>
            <button type="button" class="cm-icon-btn is-small" data-send="${esc(item.album ? remember({ kind: 'album', id: item.album.id, title: item.album.title, subtitle: artistNames(item.tracks[0]), cover: item.album.cover }) : trackPayload(item.tracks[0]))}" aria-label="Send to a friend" title="Send to a friend">${I_SEND(15)}</button>
            ${reactionBar([item.key], { compact: true })}
        </footer>
    </li>`;
}

function commonItem(item) {
    const user = userOf(item.user);
    return `<li class="cm-item cm-item--common">
        ${itemHead(user, `You and ${who(user)} both played ${item.tracks.length > 1 ? `${item.tracks.length} of the same songs` : 'the same song'} this week`, item.at)}
        <ul class="cm-common">${item.tracks
            .map(
                (t) => `<li><button type="button" class="cm-common-cover" data-play-kind="track" data-play-id="${esc(t.id)}" aria-label="${esc(`Play ${t.title}`)}">${trackCover(t, '160') ? `<img src="${esc(trackCover(t, '160'))}" alt="" loading="lazy">` : '<span class="cm-cover-blank"></span>'}<span class="cm-cover-play" aria-hidden="true">${I_PLAY(14)}</span></button><span>${maybeLink(trackHref(t), t.title)}<small>${esc(artistNames(t))}</small></span></li>`
            )
            .join('')}</ul>
    </li>`;
}

function followButton(user, { small = true, quiet = false } = {}) {
    const r = user.relation;
    if (r === 'self' || r === 'blocked') return '';
    const label = r === 'friend' ? 'Friends' : r === 'requested' ? 'Requested' : r === 'follows-you' ? 'Follow back' : 'Add friend';
    const icon = r === 'friend' ? I_USER_CHECK(15) : I_USER_PLUS(15);
    const kind = r === 'friend' || r === 'requested' || (quiet && r !== 'follows-you') ? 'is-soft' : 'is-primary';
    return `<button type="button" class="cm-btn ${kind}${small ? ' is-small' : ''}" data-follow="${esc(user.id)}" aria-pressed="${r === 'friend' || r === 'requested'}" aria-label="${esc(`${label}: ${user.name}`)}">${icon}<span>${label}</span></button>`;
}

function joinedItem(item) {
    const user = userOf(item.user);
    return `<li class="cm-item cm-item--quiet">
        ${itemHead(user, `${who(user)} joined the instance`, item.at)}
        <footer class="cm-item-foot">${followButton(user)}</footer>
    </li>`;
}

function followItem(item) {
    const user = userOf(item.user);
    return `<li class="cm-item cm-item--quiet">
        ${itemHead(user, `${who(user)} ${user.relation === 'friend' ? 'and you are now friends' : 'added you as a friend'}`, item.at)}
        <footer class="cm-item-foot">${followButton(user)}${user.relation === 'friend' ? `<button type="button" class="cm-btn is-soft is-small" data-message-user="${esc(user.id)}">${I_MESSAGE(14)}<span>Message</span></button>` : ''}</footer>
    </li>`;
}

function pollCard(poll) {
    const author = userOf(poll.user);
    const total = poll.total;
    const max = Math.max(1, ...poll.options.map((o) => o.votes || 0));
    const left = poll.closed ? 'Final results' : timeLeft(poll.closesAt, serverNow());
    const options = poll.options
        .map((option) => {
            const share = poll.reveal && total ? (option.votes || 0) / total : 0;
            const pct = poll.reveal ? `${Math.round(share * 100)}%` : '';
            const ref = option.ref;
            const cover = ref?.cover ? `<img src="${esc(coverUrl(ref.cover, '80'))}" alt="" class="${ref.kind === 'artist' ? 'is-round' : ''}">` : '';
            return `<li><button type="button" class="cm-poll-option${poll.reveal ? ' is-revealed' : ''}${(option.votes || 0) === max && poll.reveal && total ? ' is-top' : ''}" data-vote="${esc(option.id)}" data-poll="${esc(poll.id)}" aria-pressed="${poll.mine === option.id}" ${poll.closed ? 'disabled' : ''} style="--v:${share.toFixed(3)}">
                <span class="cm-poll-bar" aria-hidden="true"></span>
                ${cover}<span class="cm-poll-label">${esc(option.label)}</span>${pct ? `<span class="cm-poll-pct">${pct}</span>` : ''}
            </button>${ref ? `<a class="cm-poll-ref" href="${esc(attachmentHref(ref))}" aria-label="${esc(`Open ${ref.title}`)}">${I_PLAY(12)}</a>` : ''}</li>`;
        })
        .join('');
    const own = poll.user === meId();
    return `<article class="cm-poll" data-poll-card="${esc(poll.id)}">
        <h3 class="cm-poll-q">${esc(poll.question)}</h3>
        <ol class="cm-poll-options">${options}</ol>
        <p class="cm-poll-foot"><span>${esc(plural(total, 'vote'))} · ${esc(left)}${poll.mine && !poll.closed ? ' · tap your answer again to take it back' : ''}${!poll.reveal ? ' · results after you vote' : ''}</span>
        ${own && !poll.closed ? `<button type="button" class="cm-link-btn" data-poll-close="${esc(poll.id)}">End poll</button>` : ''}${own ? `<button type="button" class="cm-link-btn" data-poll-delete="${esc(poll.id)}" aria-label="Delete poll">${I_TRASH(13)}</button>` : ''}</p>
        <span class="sr-only">Asked by ${esc(author.name)}</span>
    </article>`;
}

function pollItem(item) {
    const user = userOf(item.poll.user);
    return `<li class="cm-item cm-item--poll">
        ${itemHead(user, `${who(user)} asked`, item.at)}
        ${pollCard(item.poll)}
        <footer class="cm-item-foot">${reactionBar([item.key], { compact: true })}</footer>
    </li>`;
}

function chartBlock(chart, { inStream = false } = {}) {
    if (!chart) return '';
    const rows = chart.tracks
        .map((entry, index) => {
            const t = entry.track;
            const people = entry.listeners.map((id) => userOf(id));
            return `<li class="cm-chart-row">
                <span class="cm-chart-rank">${index + 1}</span>
                <button type="button" class="cm-chart-cover" data-play-kind="track" data-play-id="${esc(t.id)}" aria-label="${esc(`Play ${t.title}`)}">${trackCover(t, '160') ? `<img src="${esc(trackCover(t, '160'))}" alt="" loading="lazy">` : '<span class="cm-cover-blank"></span>'}<span class="cm-cover-play" aria-hidden="true">${I_PLAY(14)}</span></button>
                <span class="cm-chart-text">${maybeLink(trackHref(t), t.title)}<small>${esc(artistNames(t))}</small></span>
                <span class="cm-chart-people" title="${esc(`${nameList(people, meId())} · ${plural(entry.plays, 'play')}`)}">${people.slice(0, 3).map((u) => avatar(u, 20)).join('')}</span>
            </li>`;
        })
        .join('');
    return `<section class="cm-card cm-chart${inStream ? ' is-in-stream' : ''}" aria-label="Top this week">
        <h2 class="cm-card-title">Top this week</h2>
        <p class="cm-card-sub">${esc(`${plural(chart.contributors, 'member')} sharing with everyone · ${chart.hours} h played`)}</p>
        <ol class="cm-chart-list">${rows}</ol>
        ${chart.artists.length ? `<p class="cm-chart-artists"><span class="cm-dim">Most played artists</span> ${chart.artists.map((a) => esc(a.name)).slice(0, 4).join(' · ')}</p>` : ''}
        ${inStream ? '' : reactionBar([chart.key], { compact: true })}
    </section>`;
}

function matchesBlock({ inStream = false } = {}) {
    const d = data();
    const list = d.matches
        .slice(0, 4)
        .map((m) => {
            const user = userOf(m.user);
            const common = m.artists.length ? `You both play ${m.artists.slice(0, 2).join(' and ')}` : m.tracks.length ? `You share ${m.tracks[0].title}` : 'Similar listening';
            return `<li class="cm-match">
                <a href="${esc(profileHref(user))}" class="cm-match-who">${avatar(user, 44)}<span><strong>${esc(user.name)}</strong><small>${esc(common)}</small></span></a>
                <span class="cm-match-score" aria-label="${m.score}% taste match">${m.score}<small>%</small></span>
            </li>`;
        })
        .join('');
    const empty = !d.me.enoughTaste
        ? 'Taste matches show up once you have a few more plays: about ten songs over the last three months.'
        : 'Nobody who shares their listening overlaps with yours yet.';
    return `<section class="cm-card cm-matches${inStream ? ' is-in-stream' : ''}" aria-label="Taste matches">
        <h2 class="cm-card-title">Taste matches</h2>
        ${list ? `<ul class="cm-match-list">${list}</ul><p class="cm-card-foot">Based on the artists and songs you both played in the last 90 days.</p>` : `<p class="cm-card-empty">${esc(empty)}</p>`}
    </section>`;
}

function peopleBlock() {
    const d = data();
    if (!d.members.length) return '';
    const live = new Set(d.live.map((p) => p.user));
    const order = { friend: 0, 'follows-you': 1, requested: 2, none: 3 };
    const people = d.members
        .map((id) => userOf(id))
        .sort((a, b) => Number(live.has(b.id)) - Number(live.has(a.id)) || (order[a.relation] ?? 4) - (order[b.relation] ?? 4) || a.name.localeCompare(b.name));
    const rows = people
        .map(
            (user, index) => `<li class="cm-person${index >= 8 ? ' is-extra' : ''}">
            <a href="${esc(profileHref(user))}" class="cm-person-who">${personAvatar(user, d.live.find((p) => p.user === user.id), 36)}<span><strong>${esc(user.name)}</strong><small>${esc(live.has(user.id) ? 'Listening now' : user.relation === 'friend' ? 'Friend' : user.relation === 'follows-you' ? 'Follows you' : `@${user.username || 'member'}`)}</small></span></a>
            ${followButton(user, { quiet: true })}
        </li>`
        )
        .join('');
    return `<section class="cm-card cm-people" aria-label="People here">
        <h2 class="cm-card-title">People here</h2>
        <ul class="cm-people-list">${rows}</ul>
        ${people.length > 8 ? `<button type="button" class="cm-link-btn" data-people-more aria-expanded="false">${esc(`Show all ${people.length}`)}</button>` : ''}
    </section>`;
}

function renderStream() {
    const d = data();
    const items = d.stream;
    const parts = [];
    let day = '';
    let count = 0;
    for (const item of items) {
        const label = dayLabel(item.at, serverNow());
        if (label !== day) {
            day = label;
            parts.push(`<li class="cm-day" aria-hidden="false"><h3>${esc(label)}</h3></li>`);
        }
        if (item.kind === 'session') parts.push(sessionItem(item));
        else if (item.kind === 'common') parts.push(commonItem(item));
        else if (item.kind === 'joined') parts.push(joinedItem(item));
        else if (item.kind === 'follow') parts.push(followItem(item));
        else if (item.kind === 'poll') parts.push(pollItem(item));
        count++;
        // On narrow screens, insights live inside the stream instead of a side rail.
        if (count === 3 && d.chart) parts.push(`<li class="cm-insight">${chartBlock(d.chart, { inStream: true })}</li>`);
        if (count === 6) parts.push(`<li class="cm-insight">${matchesBlock({ inStream: true })}</li>`);
    }
    if (count < 3 && d.chart) parts.push(`<li class="cm-insight">${chartBlock(d.chart, { inStream: true })}</li>`);
    if (count < 6) parts.push(`<li class="cm-insight">${matchesBlock({ inStream: true })}</li>`);
    const me = userOf(d.me.id);
    const composer = d.me.canPost
        ? `<div class="cm-composer">
            ${avatar(me, 40)}
            <button type="button" class="cm-composer-input" data-cm="note">What are you hearing?</button>
            <button type="button" class="cm-btn is-soft" data-cm="poll">${I_VOTE(16)}<span>Poll</span></button>
        </div>`
        : '';
    const empty = !count
        ? `<li class="cm-stream-empty"><p class="cm-quiet-title">Nothing from this week yet.</p><p class="cm-quiet-text">Plays from members who share their listening, polls and new friends land here as they happen.</p></li>`
        : '';
    return `<section class="cm-stream" aria-labelledby="cm-stream-title">
        <div class="cm-section-head"><h2 id="cm-stream-title" class="cm-h2">Recently</h2></div>
        ${composer}
        <ol class="cm-feed">${parts.join('')}${empty}</ol>
    </section>`;
}

function renderRail() {
    const d = data();
    return `<aside class="cm-rail" aria-label="Community">${matchesBlock()}${chartBlock(d.chart)}${peopleBlock()}</aside>`;
}

// ---------------------------------------------------------------- render loop

function section(name, html) {
    const host = root.querySelector(`[data-section="${name}"]`);
    if (!host || rendered.get(name) === html) return false;
    rendered.set(name, html);
    host.innerHTML = html;
    return true;
}

function renderAll() {
    if (!root) return;
    const d = data();
    if (!d) return;
    shares.clear();
    section('head', renderHead());
    section('notes', renderNotes());
    const liveChanged = section('live', renderLive());
    section('stream', renderStream());
    section('rail', renderRail());
    if (liveChanged) {
        for (const room of groupRooms(d.live)) seenRooms.add(room.key);
    }
    syncGhostMark();
    tick();
    void markSaved();
}

function renderLiveOnly() {
    if (!root || !data()) return;
    section('head', renderHead());
    section('notes', renderNotes());
    if (section('live', renderLive())) for (const room of groupRooms(data().live)) seenRooms.add(room.key);
    section('rail', renderRail());
    tick();
    void markSaved();
}

function refreshReactions(keys) {
    if (!root) return;
    const changed = new Set(keys || []);
    root.querySelectorAll('.cm-reactions[data-react-keys]').forEach((bar) => {
        const own = bar.dataset.reactKeys.split(' ');
        if (keys && !own.some((k) => changed.has(k))) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = reactionBar(own, { compact: bar.classList.contains('is-compact'), label: bar.querySelector('[data-react-open]')?.getAttribute('aria-label') || 'React' });
        const next = wrapper.firstElementChild;
        next.querySelectorAll('.cm-react-chip').forEach((chip) => {
            const before = bar.querySelector(`.cm-react-chip[data-emoji="${CSS.escape(chip.dataset.emoji)}"]`);
            if (!before || before.querySelector('.cm-react-count')?.textContent !== chip.querySelector('.cm-react-count')?.textContent) chip.classList.add('is-bump');
        });
        bar.replaceWith(next);
    });
    // Keep section caches honest so the next diff does not undo the in-place update.
    rendered.clear();
}

function tick() {
    const d = data();
    if (!root || !d) return;
    if (pruneStale()) return;
    const byUser = new Map(d.live.map((p) => [p.user, p]));
    root.querySelectorAll('[data-head]').forEach((head) => {
        const p = byUser.get(head.dataset.head);
        if (!p?.duration) return;
        head.style.setProperty('--p', Math.min(1, positionOf(p) / p.duration).toFixed(4));
    });
    root.querySelectorAll('[data-fill]').forEach((fill) => {
        const p = byUser.get(fill.dataset.fill);
        if (!p?.duration) return;
        fill.style.setProperty('--p', Math.min(1, positionOf(p) / p.duration).toFixed(4));
    });
    root.querySelectorAll('[data-pos]').forEach((label) => {
        const p = byUser.get(label.dataset.pos);
        if (p) label.textContent = fmt(positionOf(p));
    });
}

async function markSaved() {
    const buttons = root?.querySelectorAll('[data-save-track]') || [];
    for (const button of buttons) {
        const saved = await db.isFavorite('track', button.dataset.saveTrack);
        button.setAttribute('aria-pressed', String(saved));
    }
}

function skeleton() {
    return `<div class="cm-loading" role="status"><span class="sr-only">Loading Social</span>
        <div class="cm-skel cm-skel-title"></div>
        <div class="cm-skel-row">${'<div class="cm-skel cm-skel-note"></div>'.repeat(5)}</div>
        <div class="cm-skel cm-skel-stage"></div>
    </div>`;
}

function shell() {
    root.innerHTML = `<div data-section="head"></div><div data-section="notes"></div><div data-section="live"></div>
        <div class="cm-body"><div data-section="stream" class="cm-body-main"></div><div data-section="rail" class="cm-body-rail"></div></div>`;
    rendered.clear();
}

// ---------------------------------------------------------------- actions

async function toggleFollow(button) {
    const id = button.dataset.follow;
    const user = userOf(id);
    const me = meId();
    button.disabled = true;
    try {
        if (user.relation === 'friend' || user.relation === 'requested') {
            const existing = await pb.collection('social_follows').getFirstListItem(pb.filter('follower = {:me} && following = {:id}', { me, id }), { requestKey: null });
            await pb.collection('social_follows').delete(existing.id, { requestKey: null });
            user.relation = user.relation === 'friend' ? 'follows-you' : 'none';
        } else {
            await pb.collection('social_follows').create({ follower: me, following: id }, { requestKey: null });
            user.relation = user.relation === 'follows-you' ? 'friend' : 'requested';
            if (user.relation === 'friend') showNotification(`You and ${firstName(user)} are friends now.`);
        }
        rendered.clear();
        renderAll();
        scheduleRefresh(400);
    } catch {
        button.disabled = false;
        showNotification('Could not update this friendship.');
    }
}

async function toggleSave(button) {
    const id = button.dataset.saveTrack;
    button.disabled = true;
    try {
        const track = await MusicAPI.instance.getTrackMetadata(id);
        const added = await db.toggleFavorite('track', track);
        await syncManager.syncLibraryItem('track', track, added);
        button.setAttribute('aria-pressed', String(added));
        showNotification(added ? `Saved ${track.title}` : `Removed ${track.title}`);
    } catch {
        showNotification("This track isn't available in your library.");
    } finally {
        button.disabled = false;
    }
}

async function vote(button) {
    const pollId = button.dataset.poll;
    const poll = data()?.stream.find((s) => s.kind === 'poll' && s.poll.id === pollId)?.poll;
    if (!poll || poll.closed) return;
    const option = poll.mine === button.dataset.vote ? '' : button.dataset.vote;
    try {
        const result = await api(`/polls/${encodeURIComponent(pollId)}/vote`, { method: 'POST', body: { option } });
        Object.assign(poll, result.poll);
        rendered.delete('stream');
        section('stream', renderStream());
    } catch (error) {
        showNotification(error?.response?.message || 'Your vote did not go through.');
    }
}

function openNote(noteId) {
    const d = data();
    const note = d.notes.find((n) => n.id === noteId);
    if (!note) return;
    const user = userOf(note.user);
    const a = note.attachment;
    const key = a ? remember(a) : '';
    const left = Math.max(0, note.expires - serverNow());
    const dialog = document.createElement('dialog');
    dialog.className = 'cm-dialog cm-note-view';
    dialog.setAttribute('aria-label', `Note from ${user.name}`);
    dialog.innerHTML = `<div class="cm-dialog-card">
        <header class="cm-dialog-head">
            <a href="${esc(profileHref(user))}" class="cm-note-view-who">${avatar(user, 40)}<span><strong>${esc(user.name)}</strong><small>${esc(timeAgo(note.created, serverNow()))} · ${esc(`${Math.ceil(left / 3600000)} h left`)}</small></span></a>
            <button type="button" class="cm-icon-btn is-quiet" data-close aria-label="Close">${I_X(18)}</button>
        </header>
        ${note.body ? `<p class="cm-note-view-text">${esc(note.body)}</p>` : ''}
        ${a ? `<div class="cm-note-view-music">${a.cover ? `<img src="${esc(coverUrl(a.cover, '320'))}" alt="" class="${a.kind === 'artist' ? 'is-round' : ''}">` : ''}<span><a href="${esc(attachmentHref(a))}"><strong>${esc(a.title)}</strong></a><small>${esc(a.subtitle || a.kind)}</small></span>${a.kind !== 'artist' ? `<button type="button" class="cm-icon-btn is-solid" data-play-kind="${esc(a.kind)}" data-play-id="${esc(a.id)}" aria-label="Play ${esc(a.title)}">${I_PLAY(16)}</button>` : ''}</div>` : ''}
        <footer class="cm-note-view-foot">
            ${reactionBar([`note:${note.id}`], { label: 'React to this note' })}
            ${user.relation === 'friend' ? `<button type="button" class="cm-btn is-soft is-small" data-reply>${I_MESSAGE(14)}<span>Reply</span></button>` : ''}
        </footer>
    </div>`;
    document.body.appendChild(dialog);
    bindReactions(dialog);
    const stop = onChange((reason, keys) => {
        if (reason === 'reactions' && (!keys || keys.includes(`note:${note.id}`))) {
            const bar = dialog.querySelector('.cm-reactions');
            const wrapper = document.createElement('div');
            wrapper.innerHTML = reactionBar([`note:${note.id}`], { label: 'React to this note' });
            bar?.replaceWith(wrapper.firstElementChild);
        }
    });
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
        const play = event.target.closest('[data-play-kind]');
        if (play) playSharedItem(play.dataset.playKind, play.dataset.playId);
        if (event.target.closest('[data-reply]')) {
            dialog.close();
            void openMessages({ user: user.id });
        }
        if (event.target.closest('a[href^="/"]')) dialog.close();
    });
    dialog.addEventListener('close', () => {
        stop();
        dialog.remove();
    });
    void key;
    dialog.showModal();
}

function bind() {
    if (bound) return;
    bound = true;
    bindReactions(root);
    root.addEventListener('click', (event) => {
        const target = event.target;
        const cm = target.closest('[data-cm]');
        if (cm) {
            const action = cm.dataset.cm;
            if (action === 'privacy') openSharing();
            else if (action === 'ghost') toggleGhostMenu(cm);
            else if (action === 'messages') void openMessages();
            else if (action === 'note') openNoteComposer();
            else if (action === 'poll') openPollComposer();
            return;
        }
        if (target.closest('[data-ghost-off]')) return void setGhost('off');
        const note = target.closest('[data-note]');
        if (note) return openNote(note.dataset.note);
        const play = target.closest('[data-play-kind]');
        if (play) {
            playSharedItem(play.dataset.playKind, play.dataset.playId);
            return;
        }
        const save = target.closest('[data-save-track]');
        if (save) return void toggleSave(save);
        const send = target.closest('[data-send]');
        if (send) return shareWithFriend(shares.get(send.dataset.send));
        const noteWith = target.closest('[data-note-with]');
        if (noteWith) return openNoteComposer({ attachment: shares.get(noteWith.dataset.noteWith) });
        const follow = target.closest('[data-follow]');
        if (follow) return void toggleFollow(follow);
        const message = target.closest('[data-message-user]');
        if (message) return void openMessages({ user: message.dataset.messageUser });
        const voteButton = target.closest('[data-vote]');
        if (voteButton) return void vote(voteButton);
        const close = target.closest('[data-poll-close]');
        if (close) {
            return void api(`/polls/${encodeURIComponent(close.dataset.pollClose)}/close`, { method: 'POST' }).then(() => scheduleRefresh(0));
        }
        const remove = target.closest('[data-poll-delete]');
        if (remove) {
            if (!window.confirm('Delete this poll and its votes?')) return;
            return void api(`/polls/${encodeURIComponent(remove.dataset.pollDelete)}`, { method: 'DELETE' }).then(() => scheduleRefresh(0));
        }
        const more = target.closest('[data-people-more]');
        if (more) {
            const open = more.getAttribute('aria-expanded') !== 'true';
            more.setAttribute('aria-expanded', String(open));
            more.closest('.cm-people').classList.toggle('is-open', open);
            more.textContent = open ? 'Show fewer' : more.textContent;
            return;
        }
        if (target.closest('[data-copy-invite]')) {
            navigator.clipboard?.writeText(window.location.origin).then(
                () => showNotification('Instance link copied.'),
                () => showNotification(window.location.origin)
            );
        }
    });
    onChange((reason, detail) => {
        if (!isActive()) return;
        if (reason === 'load' || reason === 'refresh' || reason === 'me') renderAll();
        else if (reason === 'live') renderLiveOnly();
        else if (reason === 'reactions') refreshReactions(detail);
        else if (reason === 'reacted') {
            const who = firstName(detail.by);
            showNotification(`${who} reacted ${detail.emoji} to ${detail.label}`);
        } else if (reason === 'error' && !data()) {
            root.innerHTML = `<div class="cm-error" role="alert"><p class="cm-quiet-title">Social didn't load.</p><p class="cm-quiet-text">${esc(getState().error?.status === 403 ? 'Social is turned off on this instance, or your account is not active yet.' : 'The server did not answer. It will retry on its own.')}</p><button type="button" class="cm-btn is-soft" data-retry>Try again</button></div>`;
            root.querySelector('[data-retry]')?.addEventListener('click', () => void renderSocialPage());
        }
    });
    window.addEventListener('community-unread', () => {
        if (isActive() && data()) section('head', renderHead());
    });
}

function isActive() {
    return document.getElementById('page-social')?.classList.contains('active');
}

export async function renderSocialPage() {
    root = document.getElementById('cm-root');
    if (!root) return;
    bind();
    if (!data()) root.innerHTML = skeleton();
    void connect();
    void startMessages();
    const result = await load({ quiet: !!data() });
    if (!result && !data()) return;
    if (!root.querySelector('[data-section]')) shell();
    rendered.clear();
    renderAll();
    clearInterval(ticker);
    ticker = setInterval(() => {
        if (!isActive()) return clearInterval(ticker);
        if (document.visibilityState === 'visible') tick();
    }, 1000);
    if (shouldAskConsent()) openSharing({ firstRun: true });
}
