import { artistsOf, genresOf, compactTrack, decay, DAY } from './recommendation-metadata.js';

const STORAGE_KEY = 'monochrome-listening-data';
const COMPLETION_RATIO_THRESHOLD = 0.3;

export class ListeningTracker {
    constructor() {
        this._data = null;
        this._userId = null;
        this.accountGeneration = 0;
        this._storageKey = STORAGE_KEY;
        this._currentTrackId = null;
        this._currentTrack = null;
        this._playStartTime = null;
        this._lastTimeUpdate = 0;
        this._lastUpdateAt = 0;
        this._accumulatedPlayTime = 0;
        this._trackDuration = 0;
        this._flushTimer = null;
        this._lastSearch = null;
    }

    // Device-local profiles are isolated by authenticated account.
    setUser(userId) {
        const id = userId ? String(userId) : null;
        if (id === this._userId) return;
        this.onSessionInterrupted();
        this.forceFlush();
        this._userId = id;
        this.accountGeneration++;
        this._storageKey = id ? `${STORAGE_KEY}:${id}` : STORAGE_KEY;
        this._data = null;
        this._lastSearch = null;
    }

    get accountKey() {
        return this._storageKey;
    }

    _empty() {
        return { tracks: {}, artists: {}, genres: {}, albums: {}, likes: {}, recent: [], version: 2 };
    }
    _load() {
        if (this._data) return this._data;
        try {
            const raw = JSON.parse(localStorage.getItem(this._storageKey) || 'null');
            this._data = { ...this._empty(), ...(raw || {}), version: 2 };
            for (const key of ['tracks', 'artists', 'genres', 'albums', 'likes']) {
                if (!this._data[key] || typeof this._data[key] !== 'object' || Array.isArray(this._data[key]))
                    this._data[key] = {};
            }
            if (!Array.isArray(this._data.recent)) this._data.recent = [];
            const pending = this._data.pendingSession;
            delete this._data.pendingSession;
            if (pending?.track?.id && pending.playTime > 0) {
                this._recordSession(pending, 'interrupted');
                this._flush();
            }
        } catch {
            this._data = this._empty();
        }
        return this._data;
    }
    _save() {
        try {
            const data = this._load();
            for (const [key, limit] of [
                ['tracks', 2000],
                ['artists', 500],
                ['albums', 500],
                ['genres', 200],
                ['likes', 3000],
            ]) {
                const entries = Object.entries(data[key]);
                if (entries.length > limit) {
                    entries.sort(
                        (a, b) => (b[1].updatedAt || b[1].lastPlayed || 0) - (a[1].updatedAt || a[1].lastPlayed || 0)
                    );
                    data[key] = Object.fromEntries(entries.slice(0, limit));
                }
            }
            data.recent = data.recent.slice(-200);
            localStorage.setItem(
                this._storageKey,
                JSON.stringify({ ...data, pendingSession: this._sessionSnapshot() })
            );
        } catch (error) {
            console.warn('ListeningTracker: save failed', error);
        }
    }
    _flush() {
        if (this._flushTimer) return;
        this._flushTimer = setTimeout(() => {
            this._flushTimer = null;
            this._save();
        }, 2000);
    }

    onTrackStart(track) {
        this._finalizeCurrent(true);
        if (!track?.id || track.isPodcast || track.type === 'video') return;
        this._currentTrackId = String(track.id);
        this._currentTrack = compactTrack(track);
        this._playStartTime = Date.now();
        this._lastTimeUpdate = 0;
        this._lastUpdateAt = Date.now();
        this._accumulatedPlayTime = 0;
        this._trackDuration = Number(track.duration) || 0;
    }
    onTimeUpdate(currentTime, duration, { playbackRate = 1 } = {}) {
        if (!this._currentTrackId || this._playStartTime === null) return;
        if (!Number.isFinite(currentTime) || currentTime < 0) return;
        if (Number.isFinite(duration) && duration > 0) this._trackDuration = duration;
        const delta = currentTime - this._lastTimeUpdate;
        const now = Date.now();
        const elapsed = Math.max(0, now - this._lastUpdateAt) / 1000;
        // Background tabs may receive infrequent updates. Allow elapsed playback,
        // while onSeek resets the baseline for both short and long seeks.
        if (delta > 0 && delta <= Math.max(5, elapsed * (Number(playbackRate) || 1) + 0.5))
            this._accumulatedPlayTime += delta;
        this._lastTimeUpdate = currentTime;
        this._lastUpdateAt = now;
    }
    onSeek(time) {
        if (!Number.isFinite(time) || time < 0) return;
        this._lastTimeUpdate = time;
        this._lastUpdateAt = Date.now();
    }
    onTrackEnd() {
        this._finalizeCurrent(false);
    }
    onSkip() {
        this._finalizeCurrent(true);
    }
    onSessionInterrupted() {
        this._finalizeCurrent('interrupted');
    }

    _sessionSnapshot() {
        return this._currentTrack
            ? {
                  track: this._currentTrack,
                  playTime: this._accumulatedPlayTime,
                  duration: this._trackDuration,
                  at: Date.now(),
              }
            : null;
    }

    _finalizeCurrent(wasSkipped = false) {
        if (!this._currentTrackId || this._playStartTime === null) return;
        const session = this._sessionSnapshot();
        this._recordSession(
            session,
            wasSkipped === true ? 'skipped' : wasSkipped === 'interrupted' ? 'interrupted' : 'ended'
        );
        this._currentTrackId = null;
        this._currentTrack = null;
        this._playStartTime = null;
        this._accumulatedPlayTime = 0;
        this._lastTimeUpdate = 0;
        this._lastUpdateAt = 0;
        this._flush();
        this._notify(session.track.id);
    }

    _recordSession({ track, playTime, duration, at }, reason) {
        if (reason === 'interrupted' && playTime <= 0) return;
        const ratio = duration > 0 ? Math.min(playTime / duration, 1) : 0;
        const data = this._load();
        const signal = this._trackEntry(track);
        const now = Number(at) || Date.now();
        const replay = ratio >= 0.5 && signal.lastPlayed > now - DAY && signal.playCount > 0;
        signal.playCount++;
        signal.totalPlayTime += playTime;
        signal.avgCompletionRatio = signal.playCount === 1 ? ratio : signal.avgCompletionRatio * 0.8 + ratio * 0.2;
        signal.lastPlayed = now;
        signal.updatedAt = now;
        let weight = ratio >= 0.9 ? 1.5 : ratio >= 0.5 ? 0.5 : 0;
        const skipped = reason === 'skipped';
        if (skipped) {
            signal.skipCount++;
            if (ratio < 0.3 || (playTime < 30 && ratio < 0.7)) {
                signal.earlySkipCount++;
                weight = -1;
            } else {
                signal.lateSkipCount++;
                weight = ratio >= 0.7 ? 0.15 : -0.2;
            }
        } else if (ratio >= 0.9) {
            signal.completionCount++;
        }
        if (replay) {
            signal.replayCount++;
            weight += 0.7;
        }
        this._affinity(track, weight, playTime, skipped, now);
        data.recent.push({ id: String(track.id), artists: artistsOf(track).map((a) => a.id), at: now });
        data.recent = data.recent.slice(-200);
    }
    _trackEntry(track) {
        const data = this._load();
        const id = String(track.id);
        const initial = {
            playCount: 0,
            skipCount: 0,
            totalPlayTime: 0,
            completionCount: 0,
            lastPlayed: 0,
            avgCompletionRatio: 0,
            earlySkipCount: 0,
            lateSkipCount: 0,
            replayCount: 0,
            likeCount: 0,
            playlistAddCount: 0,
            searchCount: 0,
        };
        const previous = data.tracks[id] || {};
        data.tracks[id] = {
            ...initial,
            ...previous,
            earlySkipCount: previous.earlySkipCount ?? previous.skipCount ?? 0,
            metadata: compactTrack(track),
        };
        return data.tracks[id];
    }
    _affinity(track, weight, playTime = 0, skipped = false, now = Date.now()) {
        const data = this._load();
        const bump = (collection, id, name = '') => {
            const previous = { affinity: 0, playCount: 0, skipCount: 0, totalPlayTime: 0, ...data[collection][id] };
            data[collection][id] = {
                ...previous,
                name,
                affinity: decay(previous.affinity, previous.updatedAt, now) + weight,
                playCount: previous.playCount + (playTime > 0 ? 1 : 0),
                skipCount: previous.skipCount + (skipped ? 1 : 0),
                totalPlayTime: previous.totalPlayTime + playTime,
                updatedAt: now,
            };
        };
        for (const artist of artistsOf(track)) bump('artists', artist.id, artist.name);
        for (const genre of genresOf(track)) bump('genres', genre, genre);
        if (track.album?.id) bump('albums', String(track.album.id), track.album.title);
    }

    recordSignal(kind, item, { type = 'track', added = true } = {}) {
        if (!item?.id || !['track', 'artist', 'album'].includes(type) || item.isPodcast || item.type === 'video')
            return;
        const weight = { like: added ? 2 : -2, 'playlist-add': 1, search: 0.25 }[kind];
        if (weight === undefined) return;
        if (kind === 'like') {
            const data = this._load();
            const key = `${type}:${item.id}`;
            const previous =
                data.likes[key]?.added ?? (type === 'track' && Boolean(data.tracks[String(item.id)]?.likeCount));
            if (previous === Boolean(added)) return;
            data.likes[key] = { added: Boolean(added), updatedAt: Date.now() };
        }
        const track =
            type === 'artist'
                ? { id: `artist:${item.id}`, artist: item }
                : type === 'album'
                  ? { ...item, id: `album:${item.id}`, album: item }
                  : item;
        if (type === 'track') {
            const signal = this._trackEntry(track);
            if (kind === 'like') signal.likeCount = added ? 1 : 0;
            if (kind === 'playlist-add') signal.playlistAddCount++;
            if (kind === 'search') signal.searchCount++;
            signal.updatedAt = Date.now();
        }
        this._affinity(track, weight);
        this._flush();
        this._notify(item.id);
    }
    recordSearch(query, results) {
        const normalized = String(query || '')
            .trim()
            .toLowerCase();
        if (
            normalized.length < 2 ||
            (this._lastSearch?.query === normalized && Date.now() - this._lastSearch.at < 60_000)
        )
            return;
        this._lastSearch = { query: normalized, at: Date.now() };
        // Only close matches express useful intent; unrelated broad results do not.
        for (const [key, type, label] of [
            ['tracks', 'track', 'title'],
            ['artists', 'artist', 'name'],
        ]) {
            const items = Array.isArray(results?.[key]) ? results[key] : results?.[key]?.items || [];
            const matches = items
                .filter((item) =>
                    String(item[label] || '')
                        .toLowerCase()
                        .startsWith(normalized)
                )
                .slice(0, 3);
            for (const item of matches) this.recordSignal('search', item, { type });
        }
    }
    _notify(trackId) {
        if (typeof window !== 'undefined')
            window.dispatchEvent(
                new CustomEvent('listening-data-updated', {
                    detail: { trackId, playCount: this.getTrackSignal(trackId)?.playCount || 0 },
                })
            );
    }
    updateArtistAffinity(track, playTimeS, durationS, wasSkipped) {
        this._affinity(track, wasSkipped ? -0.5 : durationS > 0 ? playTimeS / durationS : 0, playTimeS, wasSkipped);
        this._flush();
    }
    getTrackSignal(id) {
        return this._load().tracks[String(id)] || null;
    }
    getTrackScore(id) {
        const s = this.getTrackSignal(id);
        if (!s) return 0;
        const plays = Math.max(1, s.playCount);
        return (
            s.avgCompletionRatio * 2 +
            (s.completionCount / plays) * 3 -
            ((s.earlySkipCount ?? s.skipCount) / plays) * 4 +
            (s.likeCount || 0) * 2 +
            Math.log2(1 + (s.replayCount || 0)) +
            Math.min(2, (s.playlistAddCount || 0) * 0.3) +
            Math.min(1, (s.searchCount || 0) * 0.2)
        );
    }
    getArtistSignal(id) {
        return this._load().artists[String(id).toLowerCase()] || null;
    }
    getArtistAffinity(id) {
        const s = this.getArtistSignal(id);
        return s ? decay(s.affinity, s.updatedAt) : 0;
    }
    getTopArtists(limit = 20) {
        return Object.entries(this._load().artists)
            .map(([id, v]) => ({ ...v, id, affinity: decay(v.affinity, v.updatedAt) }))
            .filter((v) => v.affinity > 0)
            .sort((a, b) => b.affinity - a.affinity)
            .slice(0, limit);
    }
    getDislikedArtists(limit = 20) {
        return Object.entries(this._load().artists)
            .map(([id, v]) => ({ ...v, id, affinity: decay(v.affinity, v.updatedAt) }))
            .filter((v) => v.playCount >= 2 && v.affinity < -0.3)
            .sort((a, b) => a.affinity - b.affinity)
            .slice(0, limit);
    }
    getHighlyPlayedTracks(limit = 50) {
        return Object.entries(this._load().tracks)
            .filter(([, v]) => v.playCount >= 2 && v.avgCompletionRatio > 0.6)
            .sort((a, b) => b[1].playCount - a[1].playCount)
            .slice(0, limit)
            .map(([id]) => id);
    }
    getFrequentlySkippedTrackIds(limit = 50) {
        return Object.entries(this._load().tracks)
            .filter(([, v]) => v.playCount >= 2 && (v.earlySkipCount ?? v.skipCount) / v.playCount > 0.5)
            .sort((a, b) => b[1].skipCount - a[1].skipCount)
            .slice(0, limit)
            .map(([id]) => id);
    }
    getShortPlayTrackIds(limit = 50) {
        return Object.entries(this._load().tracks)
            .filter(([, v]) => v.playCount >= 2 && v.avgCompletionRatio < COMPLETION_RATIO_THRESHOLD)
            .sort((a, b) => a[1].avgCompletionRatio - b[1].avgCompletionRatio)
            .slice(0, limit)
            .map(([id]) => id);
    }
    getDislikedArtistIds() {
        return this.getDislikedArtists(30).map((a) => a.id);
    }
    getTasteProfile() {
        const data = this._load();
        const affinities = (key) =>
            Object.fromEntries(Object.entries(data[key]).map(([id, v]) => [id, decay(v.affinity, v.updatedAt)]));
        return {
            tracks: data.tracks,
            artists: affinities('artists'),
            genres: affinities('genres'),
            albums: affinities('albums'),
            recent: data.recent,
        };
    }
    getSessionSignals() {
        return {
            currentTrackId: this._currentTrackId,
            accumulatedPlayTime: this._accumulatedPlayTime,
            trackDuration: this._trackDuration,
        };
    }
    forceFlush() {
        if (this._flushTimer) clearTimeout(this._flushTimer);
        this._flushTimer = null;
        this._save();
    }
}
export const listeningTracker = new ListeningTracker();
