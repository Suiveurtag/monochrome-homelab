// Publishes what this device is playing. The server decides whether anyone may see it:
// private accounts and Ghost Mode store nothing, so nothing can leak later.
import { pb } from '../accounts/config.js';

const HEARTBEAT_MS = 30 * 1000;
let player = null;
let timer = null;
let debounce = null;
let lastSent = '';
let started = false;
let lastResult = null;
const bound = new WeakSet();

/** Gapless and crossfade swap audio decks, so every element the player owns is watched. */
function bindElements() {
    const elements = [...(player?.getAudioElements?.() || []), player?.audio, player?.video].filter(Boolean);
    for (const element of elements) {
        if (bound.has(element)) continue;
        bound.add(element);
        for (const type of ['play', 'pause', 'seeked', 'ended']) {
            element.addEventListener(type, () => {
                if (element === player?.activeElement) queue(type !== 'seeked');
            });
        }
    }
}

function compact(track) {
    if (!track?.id) return null;
    return {
        id: String(track.id),
        title: track.title || '',
        cover: track.album?.cover || track.cover || '',
        isSelfHosted: !!track.isSelfHosted,
        isPodcast: !!track.isPodcast,
        type: track.type || 'track',
        artists: (track.artists?.length ? track.artists : track.artist ? [track.artist] : [])
            .slice(0, 6)
            .map((artist) => ({ id: artist?.id ? String(artist.id) : '', name: artist?.name || String(artist || '') })),
        album: track.album?.id
            ? { id: String(track.album.id), title: track.album.title || '', cover: track.album.cover || '' }
            : null,
    };
}

function snapshot() {
    const track = player?.currentTrack;
    const element = player?.activeElement;
    if (!track || !element || track.isPodcast || track.type === 'video') return { track: null };
    return {
        track: compact(track),
        playing: !element.paused && !element.ended,
        position: Number.isFinite(element.currentTime) ? element.currentTime : 0,
        duration: Number.isFinite(element.duration) ? element.duration : Number(track.duration) || 0,
    };
}

async function send(force = false) {
    if (!pb.authStore.isValid) return;
    const payload = snapshot();
    const signature = JSON.stringify([payload.track?.id, payload.playing, Math.round((payload.position || 0) / 10)]);
    if (!force && signature === lastSent) return;
    lastSent = signature;
    try {
        lastResult = await pb.send('/api/monochrome/social/presence', { method: 'POST', body: payload, requestKey: null });
        window.dispatchEvent(new CustomEvent('community-presence', { detail: lastResult }));
    } catch (error) {
        if (error?.status !== 403) console.debug('[Social] presence update failed', error);
    }
}

function queue(force = false) {
    clearTimeout(debounce);
    debounce = setTimeout(() => void send(force), force ? 50 : 700);
}

function goodbye() {
    if (!pb.authStore.isValid) return;
    try {
        void fetch(`${pb.baseURL.replace(/\/$/, '')}/api/monochrome/social/presence`, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
            body: JSON.stringify({ track: null }),
        });
    } catch {
        // Best effort: the server also ages presence out after 90 seconds.
    }
}

export function lastPresenceResult() {
    return lastResult;
}

/** Re-sends right away, e.g. after sharing settings change. */
export function refreshPresence() {
    lastSent = '';
    queue(true);
}

export function startPresence(instance) {
    if (started) return;
    started = true;
    player = instance;
    window.addEventListener('player-track-changed', () => {
        bindElements();
        queue(true);
    });
    bindElements();
    // Sign-out clears the session right after this event, so say goodbye while the token is valid.
    window.addEventListener('monochrome-before-signout', goodbye);
    clearInterval(timer);
    timer = setInterval(() => {
        const element = player?.activeElement;
        if (element && !element.paused) {
            lastSent = '';
            void send(true);
        }
    }, HEARTBEAT_MS);
    window.addEventListener('pagehide', goodbye);
    pb.authStore.onChange(() => {
        lastSent = '';
        if (pb.authStore.isValid) queue(true);
    });
    queue(true);
}
