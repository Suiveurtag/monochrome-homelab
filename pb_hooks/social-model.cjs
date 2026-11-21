// Pure Social rules shared by the hooks and their tests. No PocketBase globals here.
const LIVE_WINDOW_MS = 90 * 1000;
const SESSION_GAP_MS = 30 * 60 * 1000;
const NOTE_TTL_MS = 24 * 60 * 60 * 1000;
const MATCH_MIN_PLAYS = 10;
const MATCH_MIN_ARTISTS = 3;
const CHART_MIN_CONTRIBUTORS = 2;
const CHART_MIN_TRACKS = 3;
const REACTION_KINDS = ['play', 'session', 'note', 'poll', 'chart'];

// ctx: { visibility: Map<user, 'private'|'friends'|'instance'>, follows: Set<'a>b'>, blocks: Set<'a>b'> }
function follows(ctx, a, b) {
    return ctx.follows.has(`${a}>${b}`);
}

function blocked(ctx, a, b) {
    return ctx.blocks.has(`${a}>${b}`) || ctx.blocks.has(`${b}>${a}`);
}

function mutual(ctx, a, b) {
    return follows(ctx, a, b) && follows(ctx, b, a);
}

function relation(ctx, viewer, owner) {
    if (viewer === owner) return 'self';
    if (blocked(ctx, viewer, owner)) return 'blocked';
    if (mutual(ctx, viewer, owner)) return 'friend';
    if (follows(ctx, viewer, owner)) return 'requested';
    if (follows(ctx, owner, viewer)) return 'follows-you';
    return 'none';
}

function visibilityOf(ctx, user) {
    const value = ctx.visibility.get(user);
    return value === 'friends' || value === 'instance' ? value : 'private';
}

/** Listening activity (live, plays, taste) follows the owner's sharing choice. */
function canSeeListening(ctx, viewer, owner) {
    if (viewer === owner) return true;
    if (blocked(ctx, viewer, owner)) return false;
    const visibility = visibilityOf(ctx, owner);
    if (visibility === 'instance') return true;
    if (visibility === 'friends') return mutual(ctx, viewer, owner);
    return false;
}

/** Notes and polls carry their own audience, chosen when they are written. */
function canSeeContent(ctx, viewer, owner, audience) {
    if (viewer === owner) return true;
    if (blocked(ctx, viewer, owner)) return false;
    return audience === 'instance' || mutual(ctx, viewer, owner);
}

function primaryArtist(track) {
    return track?.artists?.[0]?.name || '';
}

/**
 * Live listeners grouped by what they share: the same track first, then the same album,
 * then the same artist. Order is stable while membership is unchanged: bigger rooms first,
 * then the room that started earliest.
 */
function groupRooms(presences) {
    const rooms = [];
    const take = (list, keyOf, kind) => {
        const groups = new Map();
        for (const presence of list) {
            const key = keyOf(presence);
            if (!key) continue;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(presence);
        }
        const used = new Set();
        for (const [key, listeners] of groups) {
            if (listeners.length < 2) continue;
            listeners.forEach((listener) => used.add(listener));
            rooms.push({ key: `${kind}:${key}`, kind, listeners });
        }
        return list.filter((presence) => !used.has(presence));
    };
    let rest = take(presences, (p) => p.track?.id, 'track');
    rest = take(rest, (p) => p.track?.album?.id, 'album');
    rest = take(rest, (p) => primaryArtist(p.track).toLowerCase(), 'artist');
    for (const presence of rest) rooms.push({ key: `solo:${presence.user}`, kind: 'solo', listeners: [presence] });
    const startOf = (room) => Math.min(...room.listeners.map((l) => l.started || l.at || 0));
    for (const room of rooms) room.listeners.sort((a, b) => (a.started || 0) - (b.started || 0));
    rooms.sort((a, b) => b.listeners.length - a.listeners.length || startOf(a) - startOf(b));
    return rooms;
}

/** Consecutive plays by one member, split where they paused for longer than the gap. */
function clusterSessions(rows, gap = SESSION_GAP_MS) {
    const byUser = new Map();
    for (const row of rows) {
        if (!byUser.has(row.user)) byUser.set(row.user, []);
        byUser.get(row.user).push(row);
    }
    const clusters = [];
    for (const [user, list] of byUser) {
        list.sort((a, b) => a.started - b.started);
        let current = null;
        for (const row of list) {
            if (!current || row.started - current.end > gap) {
                current = { id: row.id, user, start: row.started, end: row.last, plays: [] };
                clusters.push(current);
            }
            current.end = Math.max(current.end, row.last);
            current.plays.push(row);
        }
    }
    for (const cluster of clusters) {
        const tracks = new Map();
        const albums = new Map();
        for (const play of cluster.plays) {
            const entry = tracks.get(play.track.id) || { ...play.track, plays: 0, last: 0 };
            entry.plays++;
            entry.last = Math.max(entry.last, play.last);
            tracks.set(play.track.id, entry);
            const album = play.track.album;
            if (album?.id) {
                const a = albums.get(album.id) || { ...album, plays: 0 };
                a.plays++;
                albums.set(album.id, a);
            }
        }
        cluster.count = cluster.plays.length;
        cluster.tracks = [...tracks.values()].sort((a, b) => b.last - a.last);
        const topAlbum = [...albums.values()].sort((a, b) => b.plays - a.plays)[0];
        cluster.album = topAlbum && topAlbum.plays >= Math.max(2, cluster.count * 0.6) ? topAlbum : null;
        delete cluster.plays;
    }
    return clusters.sort((a, b) => b.end - a.end);
}

/** profile: Map<trackId, { plays, artist, title, cover, album }> for one member. */
function tasteVectors(profile) {
    const artists = new Map();
    let plays = 0;
    for (const entry of profile.values()) {
        plays += entry.plays;
        const key = String(entry.artist || '').toLowerCase();
        if (!key) continue;
        const current = artists.get(key) || { name: entry.artist, plays: 0 };
        current.plays += entry.plays;
        artists.set(key, current);
    }
    return { artists, plays };
}

/**
 * Taste match: cosine similarity of artist listening (log-damped) blended with the overlap of
 * actual tracks. The same inputs always give the same score; too little data gives null.
 */
function compatibility(a, b) {
    const va = tasteVectors(a);
    const vb = tasteVectors(b);
    if (va.plays < MATCH_MIN_PLAYS || vb.plays < MATCH_MIN_PLAYS) return null;
    if (va.artists.size < MATCH_MIN_ARTISTS || vb.artists.size < MATCH_MIN_ARTISTS) return null;
    let dot = 0;
    let na = 0;
    let nb = 0;
    const shared = [];
    for (const [key, entry] of va.artists) {
        const wa = Math.log1p(entry.plays);
        na += wa * wa;
        const other = vb.artists.get(key);
        if (other) {
            const wb = Math.log1p(other.plays);
            dot += wa * wb;
            shared.push({ name: entry.name, weight: Math.min(entry.plays, other.plays) });
        }
    }
    for (const entry of vb.artists.values()) nb += Math.log1p(entry.plays) ** 2;
    const cosine = na && nb ? dot / Math.sqrt(na * nb) : 0;
    const sharedTracks = [];
    for (const [id, entry] of a) {
        const other = b.get(id);
        if (other) sharedTracks.push({ id, title: entry.title, artist: entry.artist, cover: entry.cover || other.cover, album: entry.album || other.album, weight: Math.min(entry.plays, other.plays) });
    }
    const union = new Set([...a.keys(), ...b.keys()]).size;
    const jaccard = union ? sharedTracks.length / union : 0;
    const score = Math.round(100 * (0.7 * cosine + 0.3 * Math.sqrt(jaccard)));
    return {
        score: Math.max(0, Math.min(100, score)),
        artists: shared.sort((x, y) => y.weight - x.weight).slice(0, 4).map((x) => x.name),
        tracks: sharedTracks.sort((x, y) => y.weight - x.weight).slice(0, 3).map(({ weight: _w, ...track }) => track),
    };
}

/**
 * Community chart over rows of { user, track: {id,title,artists,album,cover}, plays }.
 * Returns null unless enough distinct members and repeated tracks exist to mean something.
 */
function communityChart(rows) {
    const contributors = new Set(rows.map((row) => row.user));
    if (contributors.size < CHART_MIN_CONTRIBUTORS) return null;
    const tracks = new Map();
    const artists = new Map();
    for (const row of rows) {
        const t = tracks.get(row.track.id) || { track: row.track, plays: 0, listeners: new Set() };
        t.plays += row.plays;
        t.listeners.add(row.user);
        tracks.set(row.track.id, t);
        const name = primaryArtist(row.track);
        if (name) {
            const key = name.toLowerCase();
            const a = artists.get(key) || { name, picture: row.track.artists?.[0]?.picture || '', cover: row.track.cover || row.track.album?.cover || '', plays: 0, listeners: new Set() };
            a.plays += row.plays;
            a.listeners.add(row.user);
            artists.set(key, a);
        }
    }
    const rank = (list) =>
        list
            .filter((entry) => entry.plays >= 2)
            .sort((x, y) => y.listeners.size - x.listeners.size || y.plays - x.plays)
            .slice(0, 5)
            .map((entry) => ({ ...entry, listeners: [...entry.listeners] }));
    const topTracks = rank([...tracks.values()]);
    if (topTracks.length < CHART_MIN_TRACKS) return null;
    return { tracks: topTracks, artists: rank([...artists.values()]), contributors: contributors.size };
}

const EMOJI_RANGES = [
    [0x1f000, 0x1faff], // pictographs, faces, flags, modifiers
    [0x2190, 0x21ff],
    [0x2300, 0x23ff],
    [0x2460, 0x27bf], // symbols and dingbats
    [0x2900, 0x2bff],
    [0x3030, 0x3030],
    [0x303d, 0x303d],
    [0x3297, 0x3299],
    [0xe0020, 0xe007f], // tag sequences
    [0x200d, 0x200d], // zero-width joiner
    [0xfe0f, 0xfe0f], // variation selector
    [0x20e3, 0x20e3], // keycap
    [0xa9, 0xa9],
    [0xae, 0xae],
    [0x2122, 0x2122],
];

/** Accepts one emoji (sequence) and nothing else; written without Unicode regex classes for the JSVM. */
function cleanEmoji(value) {
    const text = String(value || '').trim();
    if (!text || text.length > 16) return '';
    let pictographs = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.codePointAt(i);
        if (code > 0xffff) i++;
        const keycapBase = (code === 0x23 || code === 0x2a || (code >= 0x30 && code <= 0x39)) && text.includes('⃣');
        const ok = keycapBase || EMOJI_RANGES.some(([from, to]) => code >= from && code <= to);
        if (!ok) return '';
        if (code !== 0x200d && code !== 0xfe0f && code !== 0x20e3) pictographs++;
    }
    return pictographs ? text : '';
}

module.exports = {
    LIVE_WINDOW_MS,
    SESSION_GAP_MS,
    NOTE_TTL_MS,
    REACTION_KINDS,
    relation,
    mutual,
    blocked,
    visibilityOf,
    canSeeListening,
    canSeeContent,
    groupRooms,
    clusterSessions,
    compatibility,
    communityChart,
    cleanEmoji,
    primaryArtist,
};
