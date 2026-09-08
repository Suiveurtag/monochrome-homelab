import { artistsOf, genresOf, decay, DAY } from './recommendation-metadata.js';

// Pure ranking, independent of UI, Flow, storage and model runners.
export function cosineSimilarity(a, b) {
    if (!a?.length || a.length !== b?.length) return 0;
    let dot = 0,
        aa = 0,
        bb = 0;
    for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
        dot += a[i] * b[i];
        aa += a[i] ** 2;
        bb += b[i] ** 2;
    }
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

export function realRandom(tracks, random = Math.random) {
    const result = [...tracks];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function embeddingSimilarity(track, seeds, embeddings) {
    let best = 0;
    const entries = (id) => {
        const values = embeddings?.get(String(id));
        return Array.isArray(values) ? values.filter((value) => value?.model && value?.version && value?.vector) : [];
    };
    for (const a of entries(track.id)) {
        for (const seed of seeds) {
            for (const b of entries(seed.id)) {
                if (a.model === b.model && a.version === b.version)
                    best = Math.max(best, cosineSimilarity(a.vector, b.vector));
            }
        }
    }
    // Metadata features can complement embeddings without a model dependency.
    for (const seed of seeds) {
        const a = Number(track.audioFeatures?.tempo || track.bpm);
        const b = Number(seed.audioFeatures?.tempo || seed.bpm);
        if (a > 0 && b > 0) best = Math.max(best, Math.max(0, 1 - Math.abs(a - b) / 50) * 0.25);
    }
    return best;
}

export function scoreTrack(
    track,
    { profile = {}, seeds = [], favorites = new Set(), embeddings, now = Date.now() } = {}
) {
    const artists = artistsOf(track).map((a) => a.id);
    const genres = genresOf(track);
    const seedArtists = new Set(seeds.flatMap((s) => artistsOf(s).map((a) => a.id)));
    const seedGenres = new Set(seeds.flatMap(genresOf));
    const signal = profile.tracks?.[String(track.id)] || {};
    const plays = signal.playCount || 0;
    let score = artists.reduce((sum, id) => sum + Math.tanh((profile.artists?.[id] || 0) / 4), 0) * 2;
    score += genres.reduce((sum, genre) => sum + Math.tanh((profile.genres?.[genre] || 0) / 4), 0);
    score += Math.tanh((profile.albums?.[String(track.album?.id)] || 0) / 4) * 0.4;
    score += artists.some((id) => seedArtists.has(id)) ? 2.5 : 0;
    score += genres.some((g) => seedGenres.has(g)) ? 1.5 : 0;
    score += embeddingSimilarity(track, seeds, embeddings) * 4;
    score += favorites.has(String(track.id)) || signal.likeCount ? 1.2 : 0;
    score += Math.min(1, (signal.playlistAddCount || 0) * 0.3) + Math.min(0.5, (signal.searchCount || 0) * 0.15);
    score += Math.min(1.5, Math.log2(1 + (signal.replayCount || 0)) * 0.5);
    if (plays) {
        const confidence = decay(1, signal.lastPlayed, now);
        score += ((signal.completionCount || 0) / plays) * confidence;
        score -= (((signal.earlySkipCount ?? signal.skipCount) || 0) / plays) * 4 * confidence;
        score -= ((signal.lateSkipCount || 0) / plays) * 0.35 * confidence;
        score -= Math.min(1.5, Math.log2(1 + plays) * 0.2);
    } else score += 0.65; // Discovery remains possible even as tastes become established.
    if (signal.lastPlayed) score -= 4 * Math.exp(-Math.max(0, now - signal.lastPlayed) / (2 * DAY));
    return score;
}

export function rankTracks(
    tracks,
    { limit = tracks.length, excludeIds = [], random = Math.random, exploration = 0.8, ...options } = {}
) {
    const excluded = new Set([...excludeIds].map(String));
    const unique = new Map();
    for (const track of tracks) {
        if (
            track?.id == null ||
            track.isUnavailable ||
            track.isPodcast ||
            track.type === 'video' ||
            excluded.has(String(track.id))
        )
            continue;
        if (!unique.has(String(track.id))) unique.set(String(track.id), track);
    }
    const pool = [...unique.values()].map((track) => ({
        track,
        artists: artistsOf(track).map((a) => a.id),
        score:
            scoreTrack(track, options) -
            Math.log(-Math.log(Math.max(0.00001, Math.min(0.99999, random())))) * exploration,
    }));
    const result = [];
    const recentArtists = (options.profile?.recent || []).slice(-2).flatMap((entry) => entry.artists || []);
    const counts = new Map();
    while (pool.length && result.length < limit) {
        let best = 0,
            bestScore = -Infinity;
        for (let i = 0; i < pool.length; i++) {
            const item = pool[i];
            const penalty = item.artists.reduce(
                (max, id) => Math.max(max, (counts.get(id) || 0) * 1.2 + (recentArtists.includes(id) ? 4 : 0)),
                0
            );
            if (item.score - penalty > bestScore) {
                best = i;
                bestScore = item.score - penalty;
            }
        }
        const item = pool.splice(best, 1)[0];
        result.push(item.track);
        recentArtists.splice(0, recentArtists.length, ...item.artists);
        item.artists.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    }
    return result;
}

export function smartRandom(
    tracks,
    { profile = {}, currentTrack = null, favorites = new Set(), random = Math.random, now = Date.now() } = {}
) {
    const pending = tracks.map((track, index) => ({ track, index, artists: artistsOf(track).map((a) => a.id) }));
    const recentIds = new Set(
        (profile.recent || [])
            .filter((s) => now - s.at < DAY)
            .slice(-20)
            .map((s) => String(s.id))
    );
    // Use the most recent artist as the first guard, then keep the current
    // artist as the immediate guard while the session progresses. Retaining
    // an ever-growing two-artist window would postpone a perfectly valid
    // favourite after every different pick and made duplicate tracks bunch up.
    let recentArtists = (profile.recent || []).filter((s) => now - s.at < DAY).at(-1)?.artists || [];
    if (currentTrack) recentArtists = artistsOf(currentTrack).map((a) => a.id);
    const result = [];
    while (pending.length) {
        const fresh = pending.filter(({ track }) => !recentIds.has(String(track.id)));
        const eligible = fresh.length ? fresh : pending;
        const artistIds = new Set(recentArtists.flat());
        const diverse = eligible.filter(({ artists }) => !artists.some((id) => artistIds.has(id)));
        const pool = diverse.length ? diverse : eligible;
        const weights = pool.map(({ track }) => {
            const s = profile.tracks?.[String(track.id)] || {};
            return (
                (favorites.has(String(track.id)) || s.likeCount ? 1.3 : 1) *
                (0.5 + 1 / Math.sqrt(1 + (s.playCount || 0)))
            );
        });
        let draw = random() * weights.reduce((sum, value) => sum + value, 0);
        let chosen = pool.length - 1;
        for (let i = 0; i < weights.length; i++) {
            draw -= weights[i];
            if (draw < 0) {
                chosen = i;
                break;
            }
        }
        const item = pool[chosen];
        pending.splice(
            pending.findIndex((p) => p.index === item.index),
            1
        );
        result.push(item.track);
        recentIds.add(String(item.track.id));
        recentArtists = item.artists;
    }
    return result;
}
