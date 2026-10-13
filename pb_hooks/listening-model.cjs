// Shared, deterministic aggregation; the service applies access rules before reading data.
const DAY = 86400000;
const STREAM_SECONDS = 30;
function windowFor(period, anchor, offset = 0, now = Date.now(), offsets = []) {
    if (!['day', 'week', 'month', 'year', 'lifetime'].includes(period)) throw new Error('Invalid period');
    const shiftAt = (at) => {
        let found = offset;
        for (const entry of offsets) {
            if (entry.at > at) break;
            found = entry.offset;
        }
        return found * 60000;
    };
    const utcOfLocal = (at) => {
        let utc = at - shiftAt(at);
        for (let i = 0; i < 3; i++) utc = at - shiftAt(utc);
        return utc;
    };
    const shift = shiftAt(now); // Minutes east of UTC.
    const today = new Date(now + shift).toISOString().slice(0, 10);
    const date = String(anchor || today);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date');
    const d = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== date || +d > now + shift + DAY)
        throw new Error('Invalid date');
    let end;
    if (period === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    if (period === 'month') d.setUTCDate(1);
    if (period === 'year') {
        d.setUTCMonth(0, 1);
    }
    end = new Date(+d);
    if (period === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
    else if (period === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCDate(end.getUTCDate() + (period === 'week' ? 7 : 1));
    const start = period === 'lifetime' ? 0 : utcOfLocal(+d);
    const finish = period === 'lifetime' ? now + 1 : utcOfLocal(+end);
    let previousStart = start - (finish - start);
    if (period !== 'lifetime') {
        const prev = new Date(+d);
        if (period === 'month') prev.setUTCMonth(prev.getUTCMonth() - 1);
        else if (period === 'year') prev.setUTCFullYear(prev.getUTCFullYear() - 1);
        else prev.setUTCDate(prev.getUTCDate() - (period === 'week' ? 7 : 1));
        previousStart = utcOfLocal(+prev);
    }
    return { period, start, end: finish, previousStart, shift, shiftAt, utcOfLocal, anchor: date };
}
function aggregate(sessions, range, now = Date.now()) {
    const { start, end, shift, period, previousStart } = range;
    const shiftAt = range.shiftAt || (() => shift);
    const utcOfLocal = range.utcOfLocal || ((at) => at - shift);
    const ranked = { tracks: new Map(), artists: new Map(), albums: new Map() };
    const buckets = new Map();
    const days = new Map();
    const hours = Array(24).fill(0);
    const weekdays = Array(7).fill(0);
    const history = [];
    let seconds = 0,
        streams = 0,
        previousSeconds = 0,
        previousStreams = 0;
    const add = (map, id, values, heard, played) => {
        if (!id) return;
        const old = map.get(String(id)) || { ...values, id: String(id), seconds: 0, streams: 0 };
        old.seconds += heard;
        old.streams += played;
        map.set(String(id), old);
    };
    const bucketKey = (at) => {
        const local = new Date(at + shiftAt(at));
        if (period === 'day') return local.toISOString().slice(0, 13);
        if (period === 'year') return local.toISOString().slice(0, 7);
        if (period === 'lifetime') return String(local.getUTCFullYear());
        return local.toISOString().slice(0, 10);
    };
    const ensureBucket = (at) => {
        const key = bucketKey(at);
        if (!buckets.has(key)) buckets.set(key, { key, seconds: 0, streams: 0 });
        return buckets.get(key);
    };
    let earliest = now;
    for (const s of sessions) {
        if (s.seconds < STREAM_SECONDS) continue;
        earliest = Math.min(earliest, s.startedAt);
        const played = s.startedAt >= start && s.startedAt < end ? 1 : 0;
        const previousPlay = period !== 'lifetime' && s.startedAt >= previousStart && s.startedAt < start;
        streams += played;
        previousStreams += previousPlay ? 1 : 0;
        let heard = 0;
        // Each slice represents real heard time within a UTC minute. Assign it to
        // the matching local day/hour, even if a session crosses midnight.
        for (const slice of s.slices || []) {
            if (slice.at >= previousStart && slice.at < start && period !== 'lifetime')
                previousSeconds += slice.seconds;
            if (slice.at < start || slice.at >= end) continue;
            heard += slice.seconds;
            seconds += slice.seconds;
            const local = new Date(slice.at + shiftAt(slice.at));
            const day = local.toISOString().slice(0, 10);
            const current = days.get(day) || { key: day, seconds: 0, streams: 0 };
            current.seconds += slice.seconds;
            days.set(day, current);
            hours[local.getUTCHours()] += slice.seconds;
            weekdays[(local.getUTCDay() + 6) % 7] += slice.seconds;
            ensureBucket(slice.at).seconds += slice.seconds;
        }
        if (played) {
            ensureBucket(s.startedAt).streams++;
            const day = new Date(s.startedAt + shiftAt(s.startedAt)).toISOString().slice(0, 10);
            const current = days.get(day) || { key: day, seconds: 0, streams: 0 };
            current.streams++;
            days.set(day, current);
            history.push({
                sessionId: s.sessionId,
                track: s.track,
                startedAt: s.startedAt,
                seconds: s.seconds,
                ended: s.ended,
            });
        }
        if (!played && !heard) continue;
        const track = s.track;
        add(
            ranked.tracks,
            track.id,
            {
                title: track.title,
                cover: track.cover,
                artists: track.artists,
                album: track.album,
                isSelfHosted: track.isSelfHosted,
            },
            heard,
            played
        );
        for (const artist of track.artists || [])
            add(ranked.artists, artist.id, { name: artist.name, cover: artist.picture || track.cover }, heard, played);
        if (track.album)
            add(
                ranked.albums,
                track.album.id,
                { title: track.album.title, cover: track.album.cover || track.cover, artists: track.artists },
                heard,
                played
            );
    }
    // Include silent intervals so zero listening remains visible, rather than connecting across it.
    const cursor = new Date(
        (period === 'lifetime' ? earliest : start) + shiftAt(period === 'lifetime' ? earliest : start)
    );
    if (period === 'lifetime') cursor.setUTCMonth(0, 1);
    cursor.setUTCHours(0, 0, 0, 0);
    while (utcOfLocal(+cursor) < end) {
        ensureBucket(utcOfLocal(+cursor));
        if (period === 'day') cursor.setUTCHours(cursor.getUTCHours() + 1);
        else if (period === 'year') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        else if (period === 'lifetime') cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
        else cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const active = [...days.values()].filter((d) => d.seconds > 0).sort((a, b) => a.key.localeCompare(b.key));
    let streak = 0,
        longestStreak = 0,
        previousDay = null;
    for (const d of active) {
        const at = +new Date(d.key);
        streak = previousDay !== null && at - previousDay === DAY ? streak + 1 : 1;
        longestStreak = Math.max(longestStreak, streak);
        previousDay = at;
    }
    const sorted = (map) =>
        [...map.values()].sort((a, b) => b.streams - a.streams || b.seconds - a.seconds || a.id.localeCompare(b.id));
    const topArtists = sorted(ranked.artists);
    return {
        period,
        start,
        end,
        earliest: sessions.length ? sessions.reduce((min, s) => Math.min(min, s.startedAt), now) : null,
        summary: {
            seconds,
            streams,
            artists: ranked.artists.size,
            albums: ranked.albums.size,
            tracks: ranked.tracks.size,
            activeDays: active.length,
            longestStreak,
            previousSeconds,
            previousStreams,
        },
        activity: [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)),
        days: [...days.values()].sort((a, b) => a.key.localeCompare(b.key)),
        hours,
        weekdays,
        artistSeconds: topArtists.reduce((sum, artist) => sum + artist.seconds, 0),
        distribution: topArtists.slice(0, 5).map((a) => ({ id: a.id, name: a.name, seconds: a.seconds })),
        // Artists with shared credits may overlap, so distribution uses a clear seconds denominator.
        top: { tracks: sorted(ranked.tracks), artists: topArtists, albums: sorted(ranked.albums) },
        history: history.sort((a, b) => b.startedAt - a.startedAt),
    };
}
module.exports = { STREAM_SECONDS, windowFor, aggregate };
