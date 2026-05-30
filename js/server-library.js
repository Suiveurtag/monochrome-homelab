import {
    getUploadServerUrl,
    listServerUploadTracks,
    searchServerUploadTracks,
    updateServerUploadTrackMetadata,
    uploadServerTrack,
} from './server-uploads.js';

export function getServerLibraryBaseUrl() {
    return getUploadServerUrl();
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
}

function getTrackSearchText(track) {
    const artistNames = Array.isArray(track.artists)
        ? track.artists.map((artist) => artist?.name).filter(Boolean)
        : [track.artist?.name].filter(Boolean);
    const tags = [
        ...(Array.isArray(track.tags) ? track.tags : []),
        ...(Array.isArray(track.mediaMetadata?.tags) ? track.mediaMetadata.tags : []),
        ...(Array.isArray(track.album?.mediaMetadata?.tags) ? track.album.mediaMetadata.tags : []),
    ];

    return normalizeSearchText([
        track.title,
        track.album?.title,
        track.originalFileName,
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
    if (options.query) {
        return searchServerLibraryTracks(options.query, options);
    }

    const tracks = await listServerUploadTracks();
    return tracks;
}

export async function searchServerLibraryTracks(query, options = {}) {
    const limit = Number(options.limit || 50);
    try {
        return await searchServerUploadTracks(query, { ...options, limit });
    } catch (error) {
        if (!/not found|404/i.test(error.message || '')) {
            throw error;
        }
        const tracks = await listServerUploadTracks();
        return filterServerLibraryTracks(tracks, query).slice(0, limit);
    }
}

export async function uploadServerLibraryTrack(file) {
    return uploadServerTrack(file);
}

export async function updateServerLibraryTrackMetadata(track, metadata) {
    const trackId = typeof track === 'string' ? track : track?.id;
    if (!trackId) {
        throw new Error('Missing uploaded track id');
    }
    return updateServerUploadTrackMetadata(trackId, metadata);
}

export function getServerLibraryStreamUrl(track) {
    return track?.playback?.url || track?.audioUrl || track?.remoteUrl || null;
}

export function getServerLibraryArtworkUrl(track) {
    return track?.artworkUrl || track?.cover || track?.album?.cover || null;
}
