const SVG_NS = 'http://www.w3.org/2000/svg';

const GLYPH_PLUS = 'M8 5.1L8 10.9M5.1 8L10.9 8';
// Drawn left to right in one stroke (short leg, then long), so the check can be drawn in.
const GLYPH_CHECK = 'M4.75 8.25L7.05 10.5L11.3 5.75';

// Burst on save: a halo leaves the disc edge while sparks fly out, mostly over the top and the
// sides. A few are four-point twinkles, the rest square flecks in accent, mint and white.
const BURST_SPAN = 44; // overlay viewBox width, icon units; the disc ends at 7.25
const BURST_LIFETIME = 900;
const BURST_PARTICLES = 14;
const BURST_TONES = ['accent', 'accent', 'mint', 'mint', 'white'];
const ENTER_DURATION = 200; // ring tint pass (mint, then accent)
const LEAVE_DURATION = 340; // check fade + hold + ring hollowing back out

// A save button the user just pressed, so only that one bursts (a liked track can be on screen in
// a list, the player bar and fullscreen at once).
const recentPresses = new WeakMap();
const PRESS_WINDOW = 2500;

if (typeof document !== 'undefined') {
    document.addEventListener(
        'click',
        (event) => {
            const button = event.target instanceof Element ? event.target.closest('.track-save-btn') : null;
            if (button) recentPresses.set(button, performance.now());
        },
        true
    );
}

function isReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function takeRecentPress(button) {
    const pressedAt = recentPresses.get(button);
    recentPresses.delete(button);
    return pressedAt !== undefined && performance.now() - pressedAt < PRESS_WINDOW;
}

// Only burst where the button is actually visible on top (not under the fullscreen view).
function isOnTop(button, x, y) {
    const hit = document.elementFromPoint?.(x, y);
    return !hit || hit === button || button.contains(hit);
}

function spawnBurst(button) {
    if (!button.isConnected) return;
    const icon = button.querySelector('.track-save-icon') || button;
    const rect = icon.getBoundingClientRect();
    if (!rect.width) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (!isOnTop(button, cx, cy)) return;

    const size = (rect.width / 16) * BURST_SPAN;
    const half = BURST_SPAN / 2;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'track-save-burst');
    svg.setAttribute('viewBox', `${-half} ${-half} ${BURST_SPAN} ${BURST_SPAN}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.style.left = `${cx - size / 2}px`;
    svg.style.top = `${cy - size / 2}px`;
    svg.style.width = `${size}px`;
    svg.style.height = `${size}px`;
    const accent = getComputedStyle(button).getPropertyValue('--track-save-accent').trim();
    if (accent) svg.style.setProperty('--track-save-accent', accent);

    const halo = document.createElementNS(SVG_NS, 'circle');
    halo.setAttribute('r', '7.9');
    halo.setAttribute('class', 'track-save-burst-halo');
    svg.append(halo);

    const twinkles = new Set([0, 5, 10].map((n) => (n + Math.floor(Math.random() * 5)) % BURST_PARTICLES));
    for (let index = 0; index < BURST_PARTICLES; index++) {
        // Spread from just below the left side, over the top, to just below the right side.
        const slot = (index + 0.2 + Math.random() * 0.6) / BURST_PARTICLES;
        const angle = (-200 + slot * 220) * (Math.PI / 180);
        const from = 7.6 + Math.random() * 0.8;
        const to = 9.6 + Math.random() * 6.2;
        const far = to + 0.8 + Math.random() * 1.4; // keeps creeping outward while it lingers
        const spark = document.createElementNS(SVG_NS, 'path');
        const twinkle = twinkles.has(index);
        const s = twinkle ? 1.1 + Math.random() * 0.4 : 0.4 + Math.random() * 0.3;
        spark.setAttribute(
            'd',
            twinkle
                ? `M0 ${-s}L${s * 0.28} ${-s * 0.28}L${s} 0L${s * 0.28} ${s * 0.28}L0 ${s}L${-s * 0.28} ${s * 0.28}L${-s} 0L${-s * 0.28} ${-s * 0.28}Z`
                : `M${-s} ${-s}h${s * 2}v${s * 2}h${-s * 2}Z`
        );
        spark.setAttribute(
            'class',
            `track-save-burst-spark track-save-burst-spark--${twinkle ? 'white' : BURST_TONES[Math.floor(Math.random() * BURST_TONES.length)]}`
        );
        spark.style.setProperty('--x0', `${(Math.cos(angle) * from).toFixed(2)}px`);
        spark.style.setProperty('--y0', `${(Math.sin(angle) * from).toFixed(2)}px`);
        spark.style.setProperty('--x1', `${(Math.cos(angle) * to).toFixed(2)}px`);
        spark.style.setProperty('--y1', `${(Math.sin(angle) * to).toFixed(2)}px`);
        spark.style.setProperty('--x2', `${(Math.cos(angle) * far).toFixed(2)}px`);
        spark.style.setProperty('--y2', `${(Math.sin(angle) * far - 0.6 - Math.random() * 0.9).toFixed(2)}px`);
        spark.style.setProperty('--delay', `${Math.round(Math.random() * 45)}ms`);
        spark.style.setProperty('--spin', `${Math.round(Math.random() * 90 - 45)}deg`);
        svg.append(spark);
    }

    document.body.append(svg);
    window.setTimeout(() => svg.remove(), BURST_LIFETIME);
}

// Liked a track that was already saved in a playlist: the state does not change, so the disc
// takes a short press instead of the fill.
function thump(icon) {
    icon.classList.remove('track-save-thump');
    void icon.getBoundingClientRect();
    icon.classList.add('track-save-thump');
    icon.addEventListener('animationend', () => icon.classList.remove('track-save-thump'), { once: true });
}

export function buildTrackSaveStateSnapshot(likedTracks = [], likedVideos = [], playlists = []) {
    const favoriteKeys = new Set([
        ...likedTracks.map((track) => `track:${track.id}`),
        ...likedVideos.map((track) => `video:${track.id}`),
    ]);
    const playlistIdsByTrack = new Map();

    playlists.forEach((playlist) => {
        (playlist.tracks || []).forEach((track) => {
            const trackType = track.type === 'video' ? 'video' : 'track';
            const trackKey = `${trackType}:${track.id}`;
            if (!playlistIdsByTrack.has(trackKey)) playlistIdsByTrack.set(trackKey, []);
            playlistIdsByTrack.get(trackKey).push(playlist.id);
        });
    });

    return { favoriteKeys, playlistIdsByTrack };
}

export function getTrackSaveStateFromSnapshot(snapshot, type, id) {
    const normalizedType = type === 'video' ? 'video' : 'track';
    const key = `${normalizedType}:${id}`;
    const isFavorite = snapshot.favoriteKeys.has(key);
    const playlistIds = snapshot.playlistIdsByTrack.get(key) || [];
    return {
        isFavorite,
        playlistIds,
        isSaved: isFavorite || playlistIds.length > 0,
    };
}

// One SVG for both states: the ring is the unsaved outline and thickens inward until it is a
// solid disc (its outer edge never moves), the plus shrinks to nothing inside it, then the check
// is drawn on top.
export function createTrackSaveIconHTML(saved = false, size = 22) {
    const s = Number(size) || 22;
    return `<svg viewBox="0 0 16 16" width="${s}" height="${s}" class="track-save-icon${saved ? ' is-saved' : ''}" fill="none" aria-hidden="true" focusable="false"><g class="track-save-body"><circle cx="8" cy="8" r="6.6" class="track-save-ring" stroke="currentColor" stroke-width="1.3"/></g><path d="${GLYPH_PLUS}" class="track-save-plus" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="${GLYPH_CHECK}" class="track-save-check" pathLength="1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const phaseTimers = new WeakMap();

// Drives an icon built by createTrackSaveIconHTML. Without `animate` (renders, track changes) it
// jumps straight to its state; with it, saving fills the ring and draws the check (--entering adds
// the mint tint pass), unsaving fades the check and hollows the disc back out from the centre
// (--leaving holds the delays). Both are transient so a re-render never replays them.
export function setTrackSaveIconState(icon, saved, { animate = false } = {}) {
    if (!icon) return;
    const motion = animate && !isReducedMotion();
    const wasSaved = icon.classList.contains('is-saved');
    const entering = motion && !wasSaved && saved;
    const leaving = motion && wasSaved && !saved;
    window.clearTimeout(phaseTimers.get(icon));
    icon.classList.toggle('track-save-icon--entering', entering);
    icon.classList.toggle('track-save-icon--leaving', leaving);
    if (entering || leaving) {
        phaseTimers.set(
            icon,
            window.setTimeout(
                () => icon.classList.remove('track-save-icon--entering', 'track-save-icon--leaving'),
                entering ? ENTER_DURATION : LEAVE_DURATION
            )
        );
    }
    if (!motion) icon.classList.add('track-save-icon--instant');
    icon.classList.toggle('is-saved', saved);
    if (!motion) {
        void icon.getBoundingClientRect();
        icon.classList.remove('track-save-icon--instant');
    }
}

export function applyTrackSaveStateToButton(button, state, { animate = false } = {}) {
    if (!button) return;
    const wasSaved = button.dataset.isSaved === 'true' || button.classList.contains('active');
    const wasFavorite = button.dataset.isFavorite === 'true';
    const willBeSaved = !!state.isSaved;
    const motion = animate && !isReducedMotion();

    let icon = button.querySelector(':scope > .track-save-icon');
    if (!icon?.querySelector('.track-save-check')) {
        button.innerHTML = createTrackSaveIconHTML(wasSaved); // built in the old state so setState animates
        icon = button.firstElementChild;
    }

    setTrackSaveIconState(icon, willBeSaved, { animate: motion });
    button.classList.toggle('active', willBeSaved);

    button.dataset.isFavorite = String(state.isFavorite);
    button.dataset.isSaved = String(willBeSaved);
    button.dataset.playlistCount = String(state.playlistIds.length);

    const savedElsewhere = !state.isFavorite && state.playlistIds.length > 0;
    button.title = state.isFavorite
        ? 'Add to playlist · Right-click to remove'
        : savedElsewhere
          ? 'Saved in a playlist · Add to Liked Songs'
          : 'Add to Liked Songs · Right-click for playlists';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(state.isFavorite));

    if (motion) {
        const pressed = takeRecentPress(button);
        if (!wasSaved && willBeSaved) {
            if (pressed) spawnBurst(button);
        } else if (wasSaved && willBeSaved && !wasFavorite && state.isFavorite) {
            thump(icon);
            if (pressed) spawnBurst(button);
        }
    }

    button.closest('.track-item')?.classList.toggle('track-save-is-saved', willBeSaved);
}
