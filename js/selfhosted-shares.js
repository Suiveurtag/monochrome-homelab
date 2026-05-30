import { authManager } from './accounts/auth.js';
import { getSelfHostedServerUrl } from './selfhosted-admin.js';
import { minifyHybridTrack } from './track-model.ts';

function getSignedInUser() {
    const user = authManager.user;
    if (!user?.$id) {
        throw new Error('Sign in before sharing music');
    }
    return user;
}

function getShareHeaders() {
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
        const error = new Error(data.error || `Self-hosted share request failed (${response.status})`);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
}

function getTrackTitle(track) {
    return track?.title || track?.name || 'Shared Track';
}

export function createSharePayload(item, type, href = '') {
    if (type === 'user-playlist' || type === 'playlist') {
        return {
            type: 'playlist',
            title: item?.name || item?.title || 'Shared Playlist',
            description: item?.description || '',
            href: href || `/userplaylist/${item?.id || item?.uuid}`,
            playlist: {
                ...item,
                tracks: Array.isArray(item?.tracks) ? item.tracks.map((track) => minifyHybridTrack(track)) : [],
            },
        };
    }

    return {
        type: 'track',
        title: getTrackTitle(item),
        href: href || getTrackHref(item),
        track: minifyHybridTrack(item || {}),
    };
}

function getTrackHref(track) {
    if (!track?.id) return '';
    if (track.source?.kind && track.source.kind !== 'external') return '';
    if (track.source?.provider === 'tidal') return `/track/t/${track.id}`;
    return `/track/${track.id}`;
}

export async function createSelfHostedShare(item, type, href = '') {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/shares`, {
        method: 'POST',
        headers: getShareHeaders(),
        body: JSON.stringify(createSharePayload(item, type, href)),
    });
    return (await parseJsonResponse(response)).share;
}

export async function getSelfHostedShare(shareId) {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/shares/${encodeURIComponent(shareId)}`, {
        headers: getShareHeaders(),
    });
    return (await parseJsonResponse(response)).share;
}
