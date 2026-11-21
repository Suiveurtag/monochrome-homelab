// Social data: one per-viewer snapshot from the server, patched by realtime messages.
// The server already filtered everything for this viewer; the store never widens it.
import { pb } from '../accounts/config.js';

export const TOPIC = 'monochrome_social';
const LIVE_WINDOW_MS = 90 * 1000;
const FALLBACK_POLL_MS = 60 * 1000;

export function api(path, { method = 'GET', body } = {}) {
    return pb.send(`/api/monochrome/social${path}`, { method, body, requestKey: null });
}

const listeners = new Set();
const state = {
    data: null,
    offset: 0, // server clock minus client clock
    loading: null,
    error: null,
    realtime: false,
    unsubscribe: null,
    pollTimer: null,
    refreshTimer: null,
    owner: null,
};

export function getState() {
    return state;
}

export function serverNow() {
    return Date.now() + state.offset;
}

export function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function emit(reason, detail) {
    for (const listener of listeners) {
        try {
            listener(reason, detail);
        } catch (error) {
            console.error('[Social] listener failed', error);
        }
    }
}

export async function load({ quiet = false } = {}) {
    const owner = pb.authStore.record?.id || null;
    if (!owner) return null;
    if (state.loading) return state.loading;
    state.loading = (async () => {
        try {
            const sentAt = Date.now();
            const data = await api('/home');
            if (pb.authStore.record?.id !== owner) return null;
            state.offset = data.now - (sentAt + Date.now()) / 2;
            state.owner = owner;
            state.data = data;
            state.error = null;
            emit(quiet ? 'refresh' : 'load');
            return data;
        } catch (error) {
            state.error = error;
            emit('error', error);
            return null;
        } finally {
            state.loading = null;
        }
    })();
    return state.loading;
}

/** Coalesces bursts of realtime hints into one refetch. */
export function scheduleRefresh(delay = 600) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => void load({ quiet: true }), delay);
}

function applyPresence(message) {
    const data = state.data;
    if (!data) return;
    const before = data.live.findIndex((p) => p.user === message.user);
    if (message.presence) {
        if (before >= 0) data.live[before] = message.presence;
        else data.live.push(message.presence);
        if (!data.users[message.user]) scheduleRefresh(200);
    } else if (before >= 0) {
        data.live.splice(before, 1);
    }
    emit('live');
    if (message.refresh) scheduleRefresh();
}

function onMessage(event) {
    let message = event;
    if (typeof event === 'string') {
        try {
            message = JSON.parse(event);
        } catch {
            return;
        }
    }
    if (!message?.type || !state.data) return;
    switch (message.type) {
        case 'presence':
            applyPresence(message);
            break;
        case 'reactions':
            Object.assign(state.data.reactions, message.reactions || {});
            for (const key of message.keys || []) if (!message.reactions?.[key]) delete state.data.reactions[key];
            emit('reactions', message.keys);
            break;
        case 'reacted':
            emit('reacted', message);
            break;
        default:
            // notes, polls, follows, settings and visibility changes: refetch the snapshot.
            scheduleRefresh();
    }
}

export async function connect() {
    if (state.unsubscribe || !pb.authStore.isValid) return;
    try {
        state.unsubscribe = await pb.realtime.subscribe(TOPIC, onMessage);
        state.realtime = true;
    } catch (error) {
        state.realtime = false;
        console.warn('[Social] realtime unavailable, polling instead', error);
    }
    clearInterval(state.pollTimer);
    // Light safety net: realtime covers changes, this catches anything missed while offline.
    state.pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') void load({ quiet: true });
    }, FALLBACK_POLL_MS);
}

export async function disconnect() {
    clearInterval(state.pollTimer);
    clearTimeout(state.refreshTimer);
    const unsubscribe = state.unsubscribe;
    state.unsubscribe = null;
    state.realtime = false;
    if (unsubscribe) await unsubscribe().catch(() => {});
}

export function reset() {
    void disconnect();
    state.data = null;
    state.owner = null;
    emit('reset');
}

/** Drops presences that went quiet without a goodbye (closed laptop, lost network). */
export function pruneStale() {
    const data = state.data;
    if (!data) return false;
    const now = serverNow();
    const kept = data.live.filter((p) => now - p.at <= LIVE_WINDOW_MS);
    if (kept.length === data.live.length) return false;
    data.live = kept;
    emit('live');
    return true;
}

/** Current playback position of a presence, in seconds. */
export function positionOf(presence) {
    if (!presence) return 0;
    const elapsed = presence.playing ? Math.max(0, serverNow() - presence.at) / 1000 : 0;
    const position = presence.position + elapsed;
    return presence.duration ? Math.min(presence.duration, position) : position;
}

export function patchMe(patch) {
    if (!state.data) return;
    Object.assign(state.data.me, patch);
    emit('me');
}

export function setReactions(map) {
    if (!state.data) return;
    Object.assign(state.data.reactions, map);
    emit('reactions', Object.keys(map));
}

pb.authStore.onChange(() => {
    if (state.owner && pb.authStore.record?.id !== state.owner) reset();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.data) void load({ quiet: true });
});
