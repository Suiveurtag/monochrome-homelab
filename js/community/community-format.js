// Small formatting and markup helpers shared by the Social modules.
import { escapeHtml } from '../utils.js';
import { MusicAPI } from '../music-api.js';

export const esc = (value) => escapeHtml(String(value ?? ''));

/** Covers arrive as URLs (self-hosted) or provider cover ids. */
export function coverUrl(cover, size = '320') {
    if (!cover) return '';
    if (/^(https?:|\/|data:)/.test(cover)) return cover;
    try {
        return MusicAPI.instance.getCoverUrl(cover, size);
    } catch {
        return '';
    }
}

export function trackCover(track, size) {
    return coverUrl(track?.cover || track?.album?.cover, size);
}

export function artistNames(track, limit = 2) {
    return (track?.artists || [])
        .map((artist) => artist?.name)
        .filter(Boolean)
        .slice(0, limit)
        .join(', ');
}

export function firstName(user) {
    return String(user?.name || 'Someone').split(/\s+/)[0];
}

/** "Inez", "Inez and Jon", "Inez, Jon and 2 others". You come first. */
export function nameList(users, meId) {
    const ordered = [...users].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : 0));
    const names = ordered.map((user) => (user.id === meId ? 'You' : firstName(user)));
    if (names.length <= 1) return names[0] || '';
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
    return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

export function avatar(user, size = 32, extraClass = '') {
    const name = user?.name || 'Member';
    const initial = esc(name.trim().charAt(0).toUpperCase() || '?');
    const src = coverUrl(user?.avatar);
    const style = `--size:${size}px`;
    if (src) {
        return `<span class="cm-avatar ${extraClass}" style="${style}"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"><span class="cm-avatar-initial" aria-hidden="true">${initial}</span></span>`;
    }
    return `<span class="cm-avatar ${extraClass}" style="${style}"><span class="cm-avatar-initial" aria-hidden="true">${initial}</span></span>`;
}

export function profileHref(user) {
    return user?.username ? `/user/@${encodeURIComponent(user.username)}` : '';
}

export function trackHref(track) {
    return track?.id ? `/track/${encodeURIComponent(track.id)}` : '';
}

export function albumHref(album) {
    return album?.id ? `/album/${encodeURIComponent(album.id)}` : '';
}

export function artistHref(artist) {
    return artist?.id ? `/artist/${encodeURIComponent(artist.id)}` : '';
}

/** A link when the entity has a page, plain text otherwise. */
export function maybeLink(href, label, className = '') {
    const text = esc(label);
    return href ? `<a href="${esc(href)}" class="${className}">${text}</a>` : `<span class="${className}">${text}</span>`;
}

export function timeAgo(at, now = Date.now()) {
    const seconds = Math.max(0, Math.round((now - at) / 1000));
    if (seconds < 45) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} d ago`;
    return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "45 min left", "23 h left", "3 days left". */
export function timeLeft(until, now = Date.now()) {
    const minutes = Math.max(0, Math.round((until - now) / 60000));
    if (minutes < 60) return `${Math.max(1, minutes)} min left`;
    const hours = Math.round(minutes / 60);
    if (hours < 36) return `${hours} h left`;
    return `${Math.round(hours / 24)} days left`;
}

export function clockTime(at) {
    return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(at, now = Date.now()) {
    const day = (value) => {
        const d = new Date(value);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    };
    const diff = Math.round((day(now) - day(at)) / 86400000);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return new Date(at).toLocaleDateString(undefined, { weekday: 'long' });
    return new Date(at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

export function isoTime(at) {
    return new Date(at).toISOString();
}

export function plural(count, one, many = `${one}s`) {
    return `${count} ${count === 1 ? one : many}`;
}

export function untilLabel(at) {
    if (!at) return '';
    if (new Date(at).getFullYear() >= 2099) return 'until you turn it off';
    const sameDay = new Date(at).toDateString() === new Date().toDateString();
    return sameDay ? `until ${clockTime(at)}` : `until ${new Date(at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
}

export function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Compact payload for music attached to a note, poll answer or message. */
export function attachmentFrom(kind, item) {
    if (!item?.id) return null;
    if (kind === 'artist') {
        return { kind, id: String(item.id), title: item.name || item.title || 'Artist', subtitle: 'Artist', cover: item.picture || item.cover || '' };
    }
    if (kind === 'album') {
        return {
            kind,
            id: String(item.id),
            title: item.title || 'Album',
            subtitle: item.artist?.name || item.artists?.[0]?.name || 'Album',
            cover: item.cover || '',
            isSelfHosted: !!item.isSelfHosted,
        };
    }
    return {
        kind: 'track',
        id: String(item.id),
        title: item.title || 'Track',
        subtitle: artistNames(item) || item.artist?.name || '',
        cover: item.album?.cover || item.cover || '',
        isSelfHosted: !!item.isSelfHosted,
    };
}

export function attachmentHref(attachment) {
    if (!attachment?.id) return '';
    if (attachment.kind === 'album') return `/album/${encodeURIComponent(attachment.id)}`;
    if (attachment.kind === 'artist') return `/artist/${encodeURIComponent(attachment.id)}`;
    return `/track/${encodeURIComponent(attachment.id)}`;
}
