// js/social-utils.js — shared helpers for the social surfaces (messages, feed,
// share sheet). Pure functions only; no PocketBase access here.

import { getTrackArtists } from './utils.js';
import { buildSharePath } from './share.js';

export const ACTIVE_WINDOW_MS = 90_000;

export function parseJson(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

const initialDiscs = new Map();

/**
 * A neutral initial disc. It is painted on a canvas because an SVG image cannot
 * reach the page's fonts and falls back to a serif; the one DOM touch in this file.
 */
function initialDisc(initial) {
    if (initialDiscs.has(initial)) return initialDiscs.get(initial);
    const letter = initial.replace(/[<&>"']/g, (char) => `&#${char.charCodeAt(0)};`);
    let url = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2c2c2f"/><text x="32" y="42.5" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="600" fill="#ececec">${letter}</text></svg>`)}`;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2c2c2f';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#ececec';
        ctx.font = `600 56px ${getComputedStyle(document.body).fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial, 64, 68);
        url = canvas.toDataURL('image/png');
    } catch {
        /* Outside a document the SVG disc stands in. */
    }
    // Only keep the disc once the app's fonts are in, so an early paint is not frozen in a fallback face.
    if (typeof document === 'undefined' || document.fonts?.status === 'loaded') initialDiscs.set(initial, url);
    return url;
}

/** A member's picture, or a neutral initial disc so nobody wears the app logo. */
export function avatarFor(profile) {
    if (profile?.avatar_url) return profile.avatar_url;
    return initialDisc(([...displayName(profile).trim()][0] || '?').toUpperCase());
}

export function displayName(profile) {
    return profile?.display_name || profile?.username || 'Homelab member';
}

export function handleFor(profile) {
    return profile?.username ? `@${profile.username}` : '';
}

export function cleanImage(value) {
    if (!value || typeof value !== 'string' || value.startsWith('blob:') || value.startsWith('data:')) return '';
    return value;
}

export function profileHref(profile) {
    return profile?.username ? `/user/@${encodeURIComponent(profile.username)}` : '#';
}

export function presenceState(presence) {
    const timestamp = Date.parse(presence?.last_seen || presence?.updated || 0);
    const online = Number.isFinite(timestamp) && Date.now() - timestamp < ACTIVE_WINDOW_MS;
    const track = parseJson(presence?.track);
    return { online, track: online ? track : null, playing: online && Boolean(presence?.is_playing) };
}

export function itemTitle(kind, item) {
    return kind === 'artist' ? item.name : item.title || item.name;
}

export function itemSubtitle(kind, item) {
    if (kind === 'track') return getTrackArtists(item) || item.artist?.name || 'Track';
    if (kind === 'album') return item.artist?.name || item.artists?.[0]?.name || 'Album';
    return 'Artist';
}

export function itemImage(kind, item) {
    if (kind === 'track') return cleanImage(item.album?.cover || item.cover);
    if (kind === 'album') return cleanImage(item.cover);
    return cleanImage(item.picture || item.cover);
}

export function sharePayload(kind, item) {
    const id = String(item.id || item.uuid || '');
    const title = itemTitle(kind, item) || `Shared ${kind}`;
    const sharePath = buildSharePath(kind, item);
    return {
        id,
        type: kind,
        title,
        subtitle: itemSubtitle(kind, item),
        image: itemImage(kind, item),
        href: sharePath || `/${kind}/${encodeURIComponent(id)}`,
    };
}

export function formatClock(dateLike) {
    const date = new Date(dateLike);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dayKey(dateLike) {
    const date = new Date(dateLike);
    return Number.isNaN(date.getTime()) ? '' : startOfDay(date).toDateString();
}

export function formatDayLabel(dateLike) {
    const date = new Date(dateLike);
    if (Number.isNaN(date.getTime())) return '';
    const today = startOfDay(new Date());
    const day = startOfDay(date);
    const days = Math.round((today - day) / 86_400_000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
    const sameYear = date.getFullYear() === today.getFullYear();
    return new Intl.DateTimeFormat(undefined, {
        month: 'long',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
    }).format(date);
}

export function formatRelativeTime(dateLike) {
    const date = new Date(dateLike);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
    if (seconds < 45) return 'now';
    if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function formatListTime(dateLike) {
    const date = new Date(dateLike);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = (Date.now() - date.getTime()) / 1000;
    if (seconds < 86_400 && startOfDay(date).toDateString() === startOfDay(new Date()).toDateString()) {
        return formatClock(date);
    }
    if (seconds < 172_800) return 'Yesterday';
    if (seconds < 604_800) return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function formatDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

export function formatCount(value) {
    const count = Number(value) || 0;
    if (count < 1000) return String(count);
    return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
}

/** Downsample a peak array to `bars` values for snippet cards. */
export function downsamplePeaks(peaks, bars = 96) {
    if (!Array.isArray(peaks) || !peaks.length) return [];
    if (peaks.length <= bars) return peaks.slice();
    const out = new Array(bars).fill(0);
    const step = peaks.length / bars;
    for (let i = 0; i < bars; i++) {
        const start = Math.floor(i * step);
        const end = Math.min(peaks.length, Math.floor((i + 1) * step));
        let max = 0;
        for (let j = start; j < end; j++) max = Math.max(max, peaks[j]);
        out[i] = max;
    }
    return out;
}
