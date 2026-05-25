import { authManager } from './accounts/auth.js';
import { withTrackIdentity } from './track-model.ts';

const DEFAULT_UPLOAD_SERVER_URL = 'http://localhost:8789';

export function getUploadServerUrl() {
    const configured =
        window.__MONOCHROME_UPLOAD_SERVER_URL__ ||
        localStorage.getItem('monochrome-upload-server-url') ||
        DEFAULT_UPLOAD_SERVER_URL;
    return String(configured).replace(/\/+$/, '');
}

function getUploadUser() {
    const user = authManager.user;
    if (!user?.$id) {
        throw new Error('Sign in before using server uploads');
    }
    return user;
}

function getAuthHeaders() {
    const user = getUploadUser();
    return {
        'x-monochrome-user-id': user.$id,
        'x-monochrome-user-email': user.email || '',
    };
}

function normalizeServerUploadTrack(raw) {
    const source = { kind: 'server-local', sourceId: String(raw.id) };
    const artist =
        raw.artist && typeof raw.artist === 'object'
            ? raw.artist
            : { name: typeof raw.artist === 'string' ? raw.artist : 'Unknown Artist' };
    const audioUrl = raw.audioUrl || raw.remoteUrl || raw.playback?.url || '';

    return withTrackIdentity({
        ...raw,
        trackKey: undefined,
        id: String(raw.id),
        type: 'track',
        source,
        title: raw.title || 'Uploaded Track',
        artist,
        artists: Array.isArray(raw.artists) && raw.artists.length > 0 ? raw.artists : [artist],
        album: raw.album || { title: 'Server Uploads', cover: '/assets/appicon.png' },
        duration: raw.duration || null,
        audioUrl,
        remoteUrl: audioUrl,
        playback: { mode: 'remote-url', url: audioUrl, mimeType: raw.mimeType || raw.playback?.mimeType },
        isLocal: false,
    });
}

async function parseUploadResponse(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        throw new Error(data.error || `Upload server request failed (${response.status})`);
    }
    return data;
}

export async function listServerUploadTracks() {
    const response = await fetch(`${getUploadServerUrl()}/uploads`, {
        headers: getAuthHeaders(),
    });
    const data = await parseUploadResponse(response);
    return (data.tracks || []).map(normalizeServerUploadTrack);
}

export async function uploadServerTrack(file) {
    if (!file?.type?.startsWith('audio/') && !/\.(flac|mp3|m4a|mp4|wav|ogg|opus|aac)$/i.test(file?.name || '')) {
        throw new Error('Only audio files are accepted');
    }

    const body = new FormData();
    body.append('file', file);

    const response = await fetch(`${getUploadServerUrl()}/uploads`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body,
    });
    const data = await parseUploadResponse(response);
    return normalizeServerUploadTrack(data.track);
}
