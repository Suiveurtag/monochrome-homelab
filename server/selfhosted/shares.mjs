import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SHARE_TYPES = ['track', 'playlist'];

function cleanText(value, maxLength = 300) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizePath(value) {
    const path = cleanText(value, 1000);
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) {
        try {
            const url = new URL(path);
            return `${url.pathname}${url.search}${url.hash}`;
        } catch {
            return '';
        }
    }
    return path.startsWith('/') ? path : `/${path}`;
}

function minifyTrack(track) {
    if (!track || typeof track !== 'object') return null;
    return {
        id: track.id != null ? String(track.id) : null,
        trackKey: track.trackKey || null,
        source: track.source || null,
        type: track.type || 'track',
        title: track.title || 'Shared Track',
        duration: track.duration || null,
        artist: track.artist || null,
        artists: Array.isArray(track.artists) ? track.artists : [],
        album: track.album || null,
        cover: track.cover || track.artworkUrl || track.album?.cover || null,
        artworkUrl: track.artworkUrl || null,
        audioUrl: track.audioUrl || track.remoteUrl || track.playback?.url || null,
        remoteUrl: track.remoteUrl || track.audioUrl || track.playback?.url || null,
        playback: track.playback || null,
        isLocal: track.isLocal || false,
        isRadio: track.isRadio || false,
    };
}

function minifyPlaylist(playlist) {
    if (!playlist || typeof playlist !== 'object') return null;
    const tracks = Array.isArray(playlist.tracks) ? playlist.tracks.map(minifyTrack).filter(Boolean) : [];
    return {
        id: playlist.id || playlist.uuid || null,
        uuid: playlist.uuid || playlist.id || null,
        name: playlist.name || playlist.title || 'Shared Playlist',
        title: playlist.title || playlist.name || 'Shared Playlist',
        description: playlist.description || '',
        cover: playlist.cover || playlist.image || null,
        images: Array.isArray(playlist.images) ? playlist.images : [],
        numberOfTracks: playlist.numberOfTracks || tracks.length,
        tracks,
        type: 'user-playlist',
    };
}

function publicShare(share) {
    return {
        id: String(share.id),
        type: SHARE_TYPES.includes(share.type) ? share.type : 'track',
        title: share.title || (share.type === 'playlist' ? 'Shared Playlist' : 'Shared Track'),
        description: share.description || '',
        href: share.href || '',
        track: share.track || null,
        playlist: share.playlist || null,
        createdByUserId: share.createdByUserId || null,
        createdAt: share.createdAt,
        updatedAt: share.updatedAt || share.createdAt,
    };
}

function normalizeShare(input, createdByUserId) {
    const now = new Date().toISOString();
    const type = SHARE_TYPES.includes(input.type) ? input.type : 'track';
    const track = type === 'track' ? minifyTrack(input.track) : null;
    const playlist = type === 'playlist' ? minifyPlaylist(input.playlist) : null;
    const title = cleanText(input.title || playlist?.name || track?.title || (type === 'playlist' ? 'Shared Playlist' : 'Shared Track'));
    return publicShare({
        id: input.id || randomBytes(9).toString('base64url'),
        type,
        title,
        description: cleanText(input.description, 1000),
        href: normalizePath(input.href),
        track,
        playlist,
        createdByUserId: input.createdByUserId || createdByUserId,
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || input.createdAt || now,
    });
}

async function readJson(path, fallback) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return fallback;
        throw error;
    }
}

async function writeJsonAtomic(path, value) {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(tempPath, JSON.stringify(value, null, 2));
    try {
        await rename(tempPath, path);
    } catch (error) {
        await unlink(tempPath).catch(() => {});
        throw error;
    }
}

export function createShareStore(config) {
    const sharesPath = join(config.paths.shares, 'shares.json');

    async function readShares() {
        const data = await readJson(sharesPath, { shares: [] });
        return Array.isArray(data.shares) ? data.shares.map(publicShare) : [];
    }

    async function writeShares(shares) {
        await writeJsonAtomic(sharesPath, {
            shares: shares.map(publicShare),
            updatedAt: new Date().toISOString(),
        });
    }

    async function createShare(input, createdByUserId) {
        const shares = await readShares();
        const share = normalizeShare(input || {}, createdByUserId);
        shares.unshift(share);
        await writeShares(shares);
        return publicShare(share);
    }

    async function getShare(id) {
        const share = (await readShares()).find((candidate) => candidate.id === String(id));
        return share ? publicShare(share) : null;
    }

    return {
        createShare,
        getShare,
    };
}
