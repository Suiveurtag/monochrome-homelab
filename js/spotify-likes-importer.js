import { createSpotifyLikesImport } from './selfhost-server-api.js';

const CLIENT_ID_KEY = 'monochrome-spotify-client-id';
const VERIFIER_KEY = 'monochrome-spotify-pkce-verifier';
const STATE_KEY = 'monochrome-spotify-oauth-state';
const RETURN_KEY = 'monochrome-spotify-likes-return';

function base64Url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function randomToken(length = 48) {
    return base64Url(crypto.getRandomValues(new Uint8Array(length)));
}

function redirectUri() {
    return `${window.location.origin}/upload`;
}

export class SpotifyLikesImporter {
    constructor() {
        this.panel = null;
        this.status = null;
    }

    init() {
        this.panel = document.getElementById('spotify-likes-panel');
        this.status = document.getElementById('spotify-likes-status');
        const clientInput = document.getElementById('spotify-client-id');
        if (clientInput) clientInput.value = localStorage.getItem(CLIENT_ID_KEY) || '';
        document.getElementById('open-spotify-likes')?.addEventListener('click', () => {
            this.panel.hidden = !this.panel.hidden;
        });
        document.getElementById('spotify-likes-connect')?.addEventListener('click', () => void this.connect());
        if (new URLSearchParams(window.location.search).has('code') && sessionStorage.getItem(VERIFIER_KEY)) void this.completeOAuth();
    }

    setStatus(message, error = false) {
        if (!this.status) return;
        this.status.textContent = message;
        this.status.classList.toggle('is-error', error);
    }

    async connect() {
        const clientId = document.getElementById('spotify-client-id')?.value.trim();
        if (!clientId) {
            this.setStatus('Enter the Client ID from your Spotify developer app.', true);
            return;
        }
        localStorage.setItem(CLIENT_ID_KEY, clientId);
        const verifier = randomToken(64);
        const state = randomToken(24);
        sessionStorage.setItem(VERIFIER_KEY, verifier);
        sessionStorage.setItem(STATE_KEY, state);
        sessionStorage.setItem(RETURN_KEY, document.getElementById('spotify-likes-order')?.value || 'oldest');
        const challenge = base64Url(await sha256(verifier));
        const authorize = new URL('https://accounts.spotify.com/authorize');
        authorize.search = new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            redirect_uri: redirectUri(),
            scope: 'user-library-read',
            code_challenge_method: 'S256',
            code_challenge: challenge,
            state,
        });
        window.location.assign(authorize);
    }

    async completeOAuth() {
        this.panel.hidden = false;
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const expectedState = sessionStorage.getItem(STATE_KEY);
        const verifier = sessionStorage.getItem(VERIFIER_KEY);
        const clientId = localStorage.getItem(CLIENT_ID_KEY);
        window.history.replaceState({}, '', '/upload');
        if (!code || !verifier || !clientId || state !== expectedState) {
            this.setStatus('Spotify authorization could not be verified. Please reconnect.', true);
            return;
        }
        try {
            this.setStatus('Connecting to Spotify…');
            const body = new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier });
            const tokenResponse = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
            const token = await tokenResponse.json();
            if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description || 'Spotify token exchange failed');
            const headers = { Authorization: `Bearer ${token.access_token}` };
            const profileResponse = await fetch('https://api.spotify.com/v1/me', { headers });
            const profile = await profileResponse.json();
            if (!profileResponse.ok) throw new Error(profile.error?.message || 'Spotify profile unavailable');
            const tracks = await this.fetchSavedTracks(headers);
            if (!tracks.length) throw new Error('This Spotify account has no saved tracks.');
            const order = sessionStorage.getItem(RETURN_KEY) || 'oldest';
            tracks.sort((a, b) => order === 'oldest' ? a.added_at.localeCompare(b.added_at) : b.added_at.localeCompare(a.added_at));
            this.setStatus(`Starting one background import for ${tracks.length} liked tracks…`);
            await createSpotifyLikesImport(tracks, profile.id);
            this.setStatus(`${tracks.length} liked tracks queued. Their original Spotify dates will be preserved.`);
            window.dispatchEvent(new CustomEvent('spotify-likes-import-started'));
        } catch (error) {
            this.setStatus(error.message, true);
        } finally {
            sessionStorage.removeItem(VERIFIER_KEY);
            sessionStorage.removeItem(STATE_KEY);
            sessionStorage.removeItem(RETURN_KEY);
        }
    }

    async fetchSavedTracks(headers) {
        const tracks = [];
        let next = 'https://api.spotify.com/v1/me/tracks?limit=50';
        while (next) {
            this.setStatus(`Reading Spotify likes… ${tracks.length} found`);
            const response = await fetch(next, { headers });
            const page = await response.json();
            if (!response.ok) throw new Error(page.error?.message || 'Could not read Spotify likes');
            for (const item of page.items || []) {
                if (item.track?.id && !item.track?.is_local) tracks.push({ url: `https://open.spotify.com/track/${item.track.id}`, added_at: item.added_at });
            }
            next = page.next;
        }
        return tracks;
    }
}

export const spotifyLikesImporter = new SpotifyLikesImporter();
