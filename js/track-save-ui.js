const SVG_NS = 'http://www.w3.org/2000/svg';

// The plus and the check share one command structure, so CSS can morph `d` between them: the
// plus's vertical bar tips over into the check's long stroke, the horizontal bar folds into the
// short one. Both strokes of the check end on the same vertex, where their round caps meet.
const GLYPH_PLUS = 'M8 5.1L8 10.9M5.1 8L10.9 8';
const GLYPH_CHECK = 'M11.3 5.75L7.05 10.5M4.75 8.25L7.05 10.5';

// Spectrum sweep on save: bars around the disc, a few tall peaks among shorter ones, rotated by a
// random step each time so two saves never look the same.
const SPECTRUM = [1, 0.5, 0.78, 0.42, 0.92, 0.58, 0.84, 0.46, 0.96, 0.54, 0.72, 0.62];
const SPECTRUM_INNER = 9.2; // icon units; the disc ends at 7.25
const SPECTRUM_SPAN = 44; // overlay viewBox width, icon units
const SPECTRUM_LIFETIME = 900;

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

function spawnSpectrum(button) {
    if (!button.isConnected) return;
    const icon = button.querySelector('.track-save-icon') || button;
    const rect = icon.getBoundingClientRect();
    if (!rect.width) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (!isOnTop(button, cx, cy)) return;

    const size = (rect.width / 16) * SPECTRUM_SPAN;
    const half = SPECTRUM_SPAN / 2;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'track-save-spectrum');
    svg.setAttribute('viewBox', `${-half} ${-half} ${SPECTRUM_SPAN} ${SPECTRUM_SPAN}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.style.left = `${cx - size / 2}px`;
    svg.style.top = `${cy - size / 2}px`;
    svg.style.width = `${size}px`;
    svg.style.height = `${size}px`;
    const accent = getComputedStyle(button).getPropertyValue('--track-save-accent').trim();
    if (accent) svg.style.color = accent;

    const shift = Math.floor(Math.random() * SPECTRUM.length);
    SPECTRUM.forEach((_, index) => {
        const level = SPECTRUM[(index + shift) % SPECTRUM.length] * (0.85 + Math.random() * 0.3);
        const angle = (index / SPECTRUM.length) * Math.PI * 2 - Math.PI / 2;
        const outer = SPECTRUM_INNER + 0.6 + level * 3;
        const bar = document.createElementNS(SVG_NS, 'path');
        const point = (radius) => `${(Math.cos(angle) * radius).toFixed(2)} ${(Math.sin(angle) * radius).toFixed(2)}`;
        bar.setAttribute('d', `M${point(SPECTRUM_INNER)}L${point(outer)}`);
        bar.setAttribute('pathLength', '1');
        // Clockwise sweep from twelve o'clock.
        bar.style.setProperty('--i', String(index));
        svg.append(bar);
    });

    document.body.append(svg);
    window.setTimeout(() => svg.remove(), SPECTRUM_LIFETIME);
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

// One SVG for both states: the ring is the unsaved outline, the disc fills over it (its edge sits
// exactly on the ring's outer edge, so the silhouette never changes size), and the glyph morphs.
export function createTrackSaveIconHTML(saved = false, size = 22) {
    const s = Number(size) || 22;
    return `<svg viewBox="0 0 16 16" width="${s}" height="${s}" class="track-save-icon${saved ? ' is-saved' : ''}" fill="none" aria-hidden="true" focusable="false"><g class="track-save-body"><circle cx="8" cy="8" r="6.6" class="track-save-ring" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="7.25" class="track-save-disc" fill="currentColor"/></g><path d="${saved ? GLYPH_CHECK : GLYPH_PLUS}" class="track-save-glyph" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
}

// Drives an icon built by createTrackSaveIconHTML. Without `animate` (renders, track changes) it
// jumps straight to its state; with it, the ring fills and the plus morphs into the check.
export function setTrackSaveIconState(icon, saved, { animate = false } = {}) {
    if (!icon) return;
    const motion = animate && !isReducedMotion();
    if (!motion) icon.classList.add('track-save-icon--instant');
    icon.classList.toggle('is-saved', saved);
    // The attribute is the fallback where CSS `d` is unsupported (Safari): the glyph swaps there.
    icon.querySelector('.track-save-glyph')?.setAttribute('d', saved ? GLYPH_CHECK : GLYPH_PLUS);
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
    if (!icon?.querySelector('.track-save-glyph')) {
        button.innerHTML = createTrackSaveIconHTML(willBeSaved);
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
            if (pressed) spawnSpectrum(button);
        } else if (wasSaved && willBeSaved && !wasFavorite && state.isFavorite) {
            thump(icon);
            if (pressed) spawnSpectrum(button);
        }
    }

    button.closest('.track-item')?.classList.toggle('track-save-is-saved', willBeSaved);
}
