import { authManager } from './accounts/auth.js';
import { getSelfHostedServerUrl } from './selfhosted-admin.js';
import { withTrackIdentity } from './track-model.ts';

function getSignedInUser() {
    const user = authManager.user;
    if (!user?.$id) {
        throw new Error('Sign in before using self-hosted radios');
    }
    return user;
}

function getRadioHeaders() {
    const user = getSignedInUser();
    return {
        'content-type': 'application/json',
        'x-monochrome-user-id': user.$id,
        'x-monochrome-user-email': user.email || '',
        'x-monochrome-user-name': user.name || user.email || '',
    };
}

async function parseJsonResponse(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        const error = new Error(data.error || `Self-hosted radio request failed (${response.status})`);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
}

function normalizeRadioTrack(raw) {
    const radioId = String(raw.id);
    const artworkUrl = raw.artworkUrl || '/assets/appicon.png';
    const artist = { name: raw.genre || raw.country || 'Live Radio' };

    return withTrackIdentity({
        ...raw,
        id: radioId,
        type: 'track',
        source: { kind: 'radio', sourceId: radioId },
        title: raw.name || 'Radio Station',
        artist,
        artists: [artist],
        album: {
            id: `radio:${radioId}`,
            title: raw.country || 'Radio',
            cover: artworkUrl,
        },
        duration: null,
        audioUrl: raw.streamUrl,
        remoteUrl: raw.streamUrl,
        streamUrl: raw.streamUrl,
        playback: { mode: 'radio-stream', url: raw.streamUrl },
        isRadio: true,
        isLocal: false,
    });
}

export async function listSelfHostedRadios() {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/radios`, {
        headers: getRadioHeaders(),
    });
    const data = await parseJsonResponse(response);
    return (data.radios || []).map(normalizeRadioTrack);
}

export async function createSelfHostedRadio(input) {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/radios`, {
        method: 'POST',
        headers: getRadioHeaders(),
        body: JSON.stringify(input || {}),
    });
    const data = await parseJsonResponse(response);
    return normalizeRadioTrack(data.radio);
}

export function filterSelfHostedRadios(radios, query) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return radios;

    return radios.filter((radio) => {
        const text = [
            radio.title,
            radio.artist?.name,
            radio.album?.title,
            radio.genre,
            radio.country,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return text.includes(normalizedQuery);
    });
}
