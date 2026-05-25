import {
    getUploadServerUrl,
    listServerUploadTracks,
    uploadServerTrack,
} from './server-uploads.js';

export function getServerLibraryBaseUrl() {
    return getUploadServerUrl();
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function getTrackSearchText(track) {
    const artistNames = Array.isArray(track.artists)
        ? track.artists.map((artist) => artist?.name).filter(Boolean)
        : [track.artist?.name].filter(Boolean);
    const tags = [
        ...(track.mediaMetadata?.tags || []),
        ...(track.album?.mediaMetadata?.tags || []),
    ];

    return normalizeSearchText([
        track.title,
        track.album?.title,
        ...artistNames,
        ...tags,
    ].join(' '));
}

export function filterServerLibraryTracks(tracks, query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return tracks;
    return tracks.filter((track) => getTrackSearchText(track).includes(normalizedQuery));
}

export async function listServerLibraryTracks(options = {}) {
    const tracks = await listServerUploadTracks();
    return filterServerLibraryTracks(tracks, options.query);
}

export async function searchServerLibraryTracks(query, options = {}) {
    const tracks = await listServerLibraryTracks({ ...options, query });
    const limit = Number(options.limit || 50);
    return tracks.slice(0, limit);
}

export async function uploadServerLibraryTrack(file) {
    return uploadServerTrack(file);
}

export async function updateServerLibraryTrackMetadata() {
    throw new Error('Server library metadata updates are not supported by the local upload prototype yet');
}

export function getServerLibraryStreamUrl(track) {
    return track?.playback?.url || track?.audioUrl || track?.remoteUrl || null;
}

export function getServerLibraryArtworkUrl(track) {
    return track?.artworkUrl || track?.cover || track?.album?.cover || null;
}
