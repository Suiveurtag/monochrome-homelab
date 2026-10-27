function isReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Contour pulse: a thin ring that expands just past the button edge and fades
function spawnShockwave(button, delay = 0) {
    if (!button || !button.isConnected || isReducedMotion()) return;
    if (delay) {
        window.setTimeout(() => spawnShockwave(button), delay);
        return;
    }
    const rect = button.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ring = document.createElement('span');
    ring.className = 'track-save-shockwave';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.left = `${cx}px`;
    ring.style.top = `${cy}px`;
    const size = Math.max(rect.width, rect.height) * 1.65;
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.marginLeft = `${-size / 2}px`;
    ring.style.marginTop = `${-size / 2}px`;
    document.body.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove(), { once: true });
    window.setTimeout(() => ring.remove(), 700);
}

// Confetti: a full circle of small squares and dots that bursts out and fades
function spawnConfetti(button, delay = 0) {
    if (!button || !button.isConnected || isReducedMotion()) return;
    if (delay) {
        window.setTimeout(() => spawnConfetti(button), delay);
        return;
    }
    const rect = button.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const layer = document.createElement('span');
    layer.className = 'track-save-confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.left = `${cx}px`;
    layer.style.top = `${cy}px`;
    const count = 16;
    const radius = Math.max(rect.width, rect.height) / 2;
    // Green, white and teal, as in the reference recording
    const colors = ['var(--highlight)', 'rgba(255, 255, 255, 0.8)', '#3fd6a8'];
    for (let i = 0; i < count; i++) {
        const piece = document.createElement('span');
        piece.className = i % 2 ? 'track-save-confetti track-save-confetti--square' : 'track-save-confetti';
        // Full circle with jitter. Pieces appear near the rim and drift outwards, they do not fly from the centre.
        const angle = (360 / count) * i + (Math.random() - 0.5) * 16;
        const rad = (angle * Math.PI) / 180;
        const startDist = radius * (1.25 + Math.random() * 0.15);
        const endDist = radius * (1.8 + Math.random() * 0.2);
        const size = 1.8 + Math.random() * 1.2;
        piece.style.setProperty('--sx', `${(Math.cos(rad) * startDist).toFixed(1)}px`);
        piece.style.setProperty('--sy', `${(Math.sin(rad) * startDist).toFixed(1)}px`);
        piece.style.setProperty('--tx', `${(Math.cos(rad) * endDist).toFixed(1)}px`);
        piece.style.setProperty('--ty', `${(Math.sin(rad) * endDist).toFixed(1)}px`);
        piece.style.setProperty('--rot', `${Math.round(Math.random() * 360)}deg`);
        piece.style.setProperty('--delay', `${Math.round(Math.random() * 30)}ms`);
        piece.style.setProperty('--dur', `${260 + Math.random() * 70}ms`);
        piece.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]);
        piece.style.width = `${size.toFixed(1)}px`;
        piece.style.height = `${size.toFixed(1)}px`;
        layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    // Remove on a timer covering the longest piece: animationend bubbles up from every
    // child, so listening to it would cut the burst short when the first piece lands.
    window.setTimeout(() => layer.remove(), 800);
}

// Unlike: the filled disc shrinks to a dot before the outline comes back
function spawnUnlikeDot(button) {
    if (!button || !button.isConnected || isReducedMotion()) return;
    const rect = button.getBoundingClientRect();
    const dot = document.createElement('span');
    dot.className = 'track-save-unlike-dot';
    dot.setAttribute('aria-hidden', 'true');
    const size = Math.min(rect.width, rect.height) * 0.7;
    dot.style.left = `${rect.left + rect.width / 2}px`;
    dot.style.top = `${rect.top + rect.height / 2}px`;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.marginLeft = `${-size / 2}px`;
    dot.style.marginTop = `${-size / 2}px`;
    document.body.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
    window.setTimeout(() => dot.remove(), 500);
}

// Pale disc behind the icon on click: a light flash before the fill takes over
function spawnFlash(button, delay = 0) {
    if (!button || isReducedMotion()) return;
    window.setTimeout(() => {
        if (!button.isConnected) return;
        const rect = button.getBoundingClientRect();
        const flash = document.createElement('span');
        flash.className = 'track-save-flash';
        flash.setAttribute('aria-hidden', 'true');
        const size = Math.min(rect.width, rect.height);
        flash.style.left = `${rect.left + rect.width / 2}px`;
        flash.style.top = `${rect.top + rect.height / 2}px`;
        flash.style.width = `${size}px`;
        flash.style.height = `${size}px`;
        flash.style.marginLeft = `${-size / 2}px`;
        flash.style.marginTop = `${-size / 2}px`;
        document.body.appendChild(flash);
        window.setTimeout(() => flash.remove(), 150);
    }, delay);
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

export function createTrackSaveIconHTML(saved = false, size = 22) {
    const s = Number(size) || 22;
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
            spawnFlash(button);
            spawnShockwave(button, 120);
            spawnConfetti(button, 180);
            window.setTimeout(() => button.classList.remove('track-save-animate-in'), 620);
        } else {
            button.classList.add('track-save-animate-out');
            spawnUnlikeDot(button);
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
