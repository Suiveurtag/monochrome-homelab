function isReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function spawnShockwave(button) {
    if (!button || !button.isConnected || isReducedMotion()) return;
    const rect = button.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ring = document.createElement('span');
    ring.className = 'track-save-shockwave';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.left = `${cx}px`;
    ring.style.top = `${cy}px`;
    // Size based on button size – slightly larger than icon
    const size = Math.max(rect.width, rect.height) * 1.65;
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.marginLeft = `${-size / 2}px`;
    ring.style.marginTop = `${-size / 2}px`;
    document.body.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove(), { once: true });
    window.setTimeout(() => ring.remove(), 820);
}

function spawnConfetti(button) {
    if (!button || !button.isConnected || isReducedMotion()) return;
    const rect = button.getBoundingClientRect();
    // Anchor slightly above the button centre for "above the like button"
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + 2; // top edge
    const layer = document.createElement('span');
    layer.className = 'track-save-confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.left = `${cx}px`;
    layer.style.top = `${cy}px`;
    const count = 6;
    for (let i = 0; i < count; i++) {
        const dot = document.createElement('span');
        dot.className = 'track-save-confetti';
        // Spread fan upwards, minimal spread
        const angle = -90 + (Math.random() * 70 - 35); // -90 is up, +/-35 deg fan
        const rad = (angle * Math.PI) / 180;
        const dist = 14 + Math.random() * 16; // 14-30px
        const tx = Math.cos(rad) * dist;
        const ty = Math.sin(rad) * dist - Math.random() * 4; // bias upward
        const size = 2.5 + Math.random() * 2.8;
        const rot = Math.round(Math.random() * 360);
        const delay = i * 28;
        const duration = 560 + Math.random() * 120;
        dot.style.setProperty('--tx', `${tx.toFixed(1)}px`);
        dot.style.setProperty('--ty', `${ty.toFixed(1)}px`);
        dot.style.setProperty('--rot', `${rot}deg`);
        dot.style.setProperty('--delay', `${delay}ms`);
        dot.style.setProperty('--dur', `${duration}ms`);
        dot.style.width = `${size.toFixed(1)}px`;
        dot.style.height = `${size.toFixed(1)}px`;
        layer.appendChild(dot);
    }
    document.body.appendChild(layer);
    // Clean up after longest animation
    const cleanup = () => layer.remove();
    layer.addEventListener('animationend', cleanup, { once: true });
    // Fallback timer
    window.setTimeout(cleanup, 1100);
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

export function createTrackSaveIconHTML(saved = false, size = 20) {
    const s = Number(size) || 20;
    if (saved) {
        return `<svg viewBox="0 0 16 16" width="${s}" height="${s}" class="track-save-icon track-save-icon--saved" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7" class="track-save-circle track-save-circle--filled" fill="currentColor"/><path d="M4.9 8.2 L7.05 10.45 L11.35 5.7" class="track-save-symbol track-save-symbol--check" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.45" pathLength="1"/></svg>`;
    }
    return `<svg viewBox="0 0 16 16" width="${s}" height="${s}" class="track-save-icon track-save-icon--unsaved" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.55" class="track-save-circle track-save-circle--outline" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M8 5.1 L8 10.9 M5.1 8 L10.9 8" class="track-save-symbol track-save-symbol--plus" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" pathLength="1"/></svg>`;
}

export function applyTrackSaveStateToButton(button, state, { animate = false } = {}) {
    if (!button) return;
    const wasSaved = button.dataset.isSaved === 'true' || button.classList.contains('active');
    const willBeSaved = !!state.isSaved;
    const shouldAnimate = animate && wasSaved !== willBeSaved && !isReducedMotion();

    // Update markup first so the new SVG can be targeted by the entrance animation
    button.innerHTML = createTrackSaveIconHTML(willBeSaved);
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

    if (shouldAnimate) {
        // Clean any prior fill animation so it can retrigger
        button.classList.remove('track-save-animate-in', 'track-save-animate-out', 'track-save-transition');
        void button.offsetWidth;
        if (willBeSaved) {
            button.classList.add('track-save-animate-in');
            // Only on like/add: confetti + shockwave, minimalist and theme-coloured
            spawnShockwave(button);
            spawnConfetti(button);
            window.setTimeout(() => button.classList.remove('track-save-animate-in'), 620);
        } else {
            button.classList.add('track-save-animate-out');
            window.setTimeout(() => button.classList.remove('track-save-animate-out'), 520);
        }
    } else if (animate && !isReducedMotion()) {
        // Fallback pop if state didn't change but caller requested animate (e.g. refresh)
        button.classList.remove('track-save-transition');
        void button.offsetWidth;
        button.classList.add('track-save-transition');
        window.setTimeout(() => button.classList.remove('track-save-transition'), 460);
    }

    button.closest('.track-item')?.classList.toggle('track-save-is-saved', willBeSaved);
}
