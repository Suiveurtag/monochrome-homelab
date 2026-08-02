import { cancelSpotifyImport, listSpotifyImports, markSpotifyImportPlaylistCreated, listSelfHostedTracks } from './selfhost-server-api.js';
import { db } from './db.js';
import { syncManager } from './accounts/pocketbase.js';
import { SVG_CLOSE } from './icons.js';

const ACTIVE = new Set(['queued', 'resolving', 'downloading']);

export function openSpotifyImportVerification(rawURL) {
    const challenge = new URL(rawURL, window.location.origin);
    const callback = challenge.searchParams.get('cb');
    if (callback) challenge.searchParams.set('cb', new URL(callback, window.location.origin).href);
    window.open(challenge.href, '_blank', 'noopener,noreferrer');
}

export class SpotifyImportManager {
    constructor() {
        this.jobs = [];
        this.timer = null;
        this.createdPlaylists = new Set();
    }

    start() {
        if (this.timer) return;
        void this.refresh();
        this.timer = window.setInterval(() => void this.refresh(), 1500);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) void this.refresh();
        });
    }

    async refresh() {
        try {
            this.jobs = await listSpotifyImports();
            await this.applyCompletedLikes();
            await this.createCompletedPlaylists();
            this.renderGlobalNotifications();
            window.dispatchEvent(new CustomEvent('spotify-import-jobs', { detail: this.jobs }));
        } catch {
            this.jobs = [];
            this.renderGlobalNotifications();
        }
    }

    async createCompletedPlaylists() {
        const candidates = this.jobs.filter(
            (job) => job.source_type === 'playlist' && !job.like_after_import && ['completed', 'partial'].includes(job.status) && !job.playlist_created && !this.createdPlaylists.has(job.id)
        );
        if (!candidates.length) return;
        const tracks = await listSelfHostedTracks().catch(() => []);
        const byId = new Map(tracks.map((track) => [track.id, track]));
        for (const job of candidates) {
            this.createdPlaylists.add(job.id);
            try {
                await markSpotifyImportPlaylistCreated(job.id);
                const orderedTracks = (job.track_ids || []).map((id) => byId.get(id)).filter(Boolean);
                const playlist = await db.createPlaylist(job.title || 'Spotify import', orderedTracks, job.cover || '', job.description || '');
                await syncManager.syncUserPlaylist(playlist, 'create');
                window.dispatchEvent(new CustomEvent('library-changed'));
            } catch (error) {
                console.warn('[SpotifyImport] Could not create playlist:', error);
            }
        }
    }

    async applyCompletedLikes() {
        const candidates = this.jobs.filter(
            (job) => job.like_after_import && ['completed', 'partial'].includes(job.status) && !job.playlist_created && !this.createdPlaylists.has(`likes:${job.id}`)
        );
        if (!candidates.length) return;
        const tracks = await listSelfHostedTracks().catch(() => []);
        const byId = new Map(tracks.map((track) => [track.id, track]));
        for (const job of candidates) {
            this.createdPlaylists.add(`likes:${job.id}`);
            try {
                for (const item of job.items || []) {
                    if (item.status !== 'completed') continue;
                    const track = byId.get(item.record_id);
                    if (!track) continue;
                    const addedAt = Date.parse(item.added_at) || Date.now();
                    await db.addFavorite('track', track, addedAt);
                    await syncManager.syncLibraryItem('track', { ...track, addedAt }, true);
                }
                await markSpotifyImportPlaylistCreated(job.id);
                window.dispatchEvent(new CustomEvent('library-changed'));
            } catch (error) {
                console.warn('[SpotifyImport] Could not apply imported likes:', error);
            }
        }
    }

    renderGlobalNotifications() {
        let container = document.getElementById('spotify-import-notifications');
        const visible = this.jobs.filter((job) => ACTIVE.has(job.status));
        if (!visible.length) {
            container?.remove();
            return;
        }
        if (!container) {
            container = document.createElement('div');
            container.id = 'spotify-import-notifications';
            container.className = 'spotify-import-notifications';
            document.body.appendChild(container);
        }
        const visibleIds = new Set(visible.map((job) => job.id));
        container.querySelectorAll('[data-import-id]').forEach((element) => {
            if (!visibleIds.has(element.dataset.importId)) element.remove();
        });
        for (const job of visible) {
            let element = container.querySelector(`[data-import-id="${CSS.escape(job.id)}"]`);
            if (!element) {
                element = document.createElement('article');
                element.className = 'download-task spotify-import-toast';
                element.dataset.importId = job.id;
                element.innerHTML = `<img alt="" /><div class="spotify-import-toast-copy"><strong></strong><span></span><div class="download-progress-bar"><i></i></div><small></small><button class="spotify-import-verify" type="button" hidden>Verify download</button></div><button class="download-cancel" aria-label="Cancel import">${SVG_CLOSE(18)}</button>`;
                element.querySelector('button').addEventListener('click', async () => {
                    element.querySelector('button').disabled = true;
                    await cancelSpotifyImport(job.id).catch(console.error);
                    void this.refresh();
                });
                container.appendChild(element);
            }
            const total = Number(job.total || 0);
            const done = Number(job.completed || 0) + Number(job.failed || 0);
            const percent = total ? Math.round((done / total) * 100) : job.status === 'resolving' ? 8 : 2;
            element.querySelector('img').src = job.cover || '/assets/appicon.png';
            element.querySelector('strong').textContent = job.title || 'Spotify import';
            element.querySelector('.spotify-import-toast-copy > span').textContent = job.current_track || (job.status === 'resolving' ? 'Reading Spotify metadata…' : 'Waiting…');
            element.querySelector('.download-progress-bar i').style.width = `${percent}%`;
            element.querySelector('small').textContent = total ? `${done} / ${total}` : 'Preparing import';
            const verify = element.querySelector('.spotify-import-verify');
            verify.hidden = !job.verification_url;
            verify.onclick = job.verification_url ? () => openSpotifyImportVerification(job.verification_url) : null;
            if (job.verification_url) element.querySelector('.spotify-import-toast-copy > span').textContent = 'One-time verification required';
        }
    }
}

export const spotifyImportManager = new SpotifyImportManager();
