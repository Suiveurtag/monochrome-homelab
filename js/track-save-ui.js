import { SVG_TRACK_SAVED, SVG_TRACK_UNSAVED } from './icons.js';

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
    return saved ? SVG_TRACK_SAVED(size) : SVG_TRACK_UNSAVED(size);
}

export function applyTrackSaveStateToButton(button, state, { animate = false } = {}) {
    if (!button) return;
    button.innerHTML = createTrackSaveIconHTML(state.isSaved);
    button.classList.toggle('active', state.isSaved);
    button.dataset.isFavorite = String(state.isFavorite);
    button.dataset.isSaved = String(state.isSaved);
    button.dataset.playlistCount = String(state.playlistIds.length);

    const savedElsewhere = !state.isFavorite && state.playlistIds.length > 0;
    button.title = state.isFavorite
        ? 'Remove from Liked Songs · Right-click for playlists'
        : savedElsewhere
          ? 'Saved in a playlist · Add to Liked Songs'
          : 'Add to Liked Songs · Right-click for playlists';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(state.isFavorite));

    if (animate) {
        button.classList.remove('track-save-transition');
        void button.offsetWidth;
        button.classList.add('track-save-transition');
        window.setTimeout(() => button.classList.remove('track-save-transition'), 460);
    }

    button.closest('.track-item')?.classList.toggle('track-save-is-saved', state.isSaved);
}
