import { getTrackKey } from './track-model.ts';

const STORAGE_KEY = 'monochrome-youtube-clips-v1';

export function parseYouTubeVideoId(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

    try {
        const url = new URL(text);
        const host = url.hostname.replace(/^www\./, '').toLowerCase();
        if (host === 'youtu.be') {
            const id = url.pathname.split('/').filter(Boolean)[0];
            return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null;
        }
        if (host === 'youtube.com' || host === 'music.youtube.com' || host.endsWith('.youtube.com')) {
            const watchId = url.searchParams.get('v');
            if (/^[a-zA-Z0-9_-]{11}$/.test(watchId || '')) return watchId;
            const parts = url.pathname.split('/').filter(Boolean);
            const embedIndex = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));
            const id = embedIndex >= 0 ? parts[embedIndex + 1] : null;
            return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null;
        }
    } catch {}

    return null;
}

export function getYouTubeWatchUrl(videoId) {
    return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null;
}

export function getYouTubeEmbedUrl(videoId) {
    return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : null;
}

export function getTrackYouTubeClip(track) {
    const explicitId = track?.youtubeVideoId || track?.youtubeClip?.videoId;
    const videoId = parseYouTubeVideoId(explicitId || track?.youtubeClipUrl || track?.youtubeUrl);
    if (videoId) {
        return { videoId, url: getYouTubeWatchUrl(videoId), source: track?.source?.kind === 'server-local' ? 'shared' : 'track' };
    }

    const trackKey = getTrackKey(track);
    if (!trackKey) return null;
    const stored = readClipMap()[trackKey];
    if (!stored?.videoId) return null;
    return { videoId: stored.videoId, url: getYouTubeWatchUrl(stored.videoId), source: 'local' };
}

export function saveLocalTrackYouTubeClip(track, value) {
    const trackKey = getTrackKey(track);
    if (!trackKey) throw new Error('This track cannot store a local YouTube clip association');
    const clips = readClipMap();
    const videoId = parseYouTubeVideoId(value);
    if (!videoId && String(value || '').trim()) {
        throw new Error('Enter a valid YouTube URL or 11-character video ID');
    }

    if (videoId) {
        clips[trackKey] = { videoId, updatedAt: Date.now() };
    } else {
        delete clips[trackKey];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clips));
    return videoId ? { videoId, url: getYouTubeWatchUrl(videoId), source: 'local' } : null;
}

function readClipMap() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}
