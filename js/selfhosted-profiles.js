import { authManager } from './accounts/auth.js';
import { getSelfHostedServerUrl } from './selfhosted-admin.js';

function getSignedInUser() {
    const user = authManager.user;
    if (!user?.$id) {
        throw new Error('Sign in before loading self-hosted profiles');
    }
    return user;
}

function getProfileHeaders() {
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
        const error = new Error(data.error || `Self-hosted profile request failed (${response.status})`);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
}

export async function getSelfHostedOwnProfile() {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/profiles/me`, {
        headers: getProfileHeaders(),
    });
    return (await parseJsonResponse(response)).profile;
}

export async function getSelfHostedProfile(username) {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/profiles/${encodeURIComponent(username)}`, {
        headers: getProfileHeaders(),
    });
    return (await parseJsonResponse(response)).profile;
}

export async function updateSelfHostedProfile(profile) {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/profiles/me`, {
        method: 'PATCH',
        headers: getProfileHeaders(),
        body: JSON.stringify(profile || {}),
    });
    return (await parseJsonResponse(response)).profile;
}
