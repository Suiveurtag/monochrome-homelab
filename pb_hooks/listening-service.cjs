/* eslint-disable no-undef */
const { STREAM_SECONDS, windowFor, aggregate } = require('./listening-model.cjs');
function userFor(e) {
    const user = e.app.findRecordById('users', e.auth.id);
    if (user.getString('access_status') !== 'active') throw new ForbiddenError('An active account is required.');
    const config = e.app.findRecordsByFilter('app_config', '', '', 1, 0)[0];
    if (config?.getBool('maintenance_mode') && user.getString('role') !== 'admin')
        throw new ForbiddenError('Instance is under maintenance.');
    return { user, config };
}
function json(record, key, fallback) {
    return JSON.parse(record.getString(key) || 'null') || fallback;
}
function text(value, limit = 256) {
    return String(value || '')
        .trim()
        .slice(0, limit);
}
function stableId(prefix, value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    return `${prefix}-${Math.abs(hash).toString(36)}`;
}
function metadata(app, input, uid) {
    const id = text(input?.id, 128);
    if (!id || input.isPodcast || input.type === 'video') throw new BadRequestError('An audio track is required.');
    if (input.isSelfHosted) {
        let track;
        try {
            track = app.findRecordById('music_tracks', id);
        } catch {
            throw new NotFoundError('Track no longer exists.');
        }
        // Catalogue access mirrors the existing library policy.
        const user = app.findRecordById('users', uid);
        if (track.getString('owner') !== uid && user.getString('role') !== 'admin')
            throw new ForbiddenError('Track is not in your catalogue.');
        const artist = track.getString('artist') || 'Unknown artist';
        const albumArtist = track.getString('album_artist') || artist;
        const album = track.getString('album');
        const coverFile = track.getString('cover_fallback') || track.getString('cover');
        const cover = coverFile
            ? `/api/files/${track.collection().id}/${track.id}/${encodeURIComponent(coverFile)}`
            : '';
        return {
            id,
            title: track.getString('title'),
            cover,
            isSelfHosted: true,
            artists: [{ id: stableId('selfhost-artist', artist), name: artist, picture: cover }],
            album: album ? { id: stableId('selfhost-album', `${albumArtist}|${album}`), title: album, cover } : null,
        };
    }
    // Imported/provider and offline tracks retain their identity, never a client-provided user ID.
    const safeUrl = (url) =>
        /^(https?:\/\/|\/api\/files\/|\/assets\/)/i.test(String(url || '')) ? text(url, 2048) : '';
    const artists = (Array.isArray(input.artists) ? input.artists : [input.artist])
        .filter(Boolean)
        .slice(0, 20)
        .map((a) => ({ id: text(a.id || a.name, 128), name: text(a.name), picture: safeUrl(a.picture) }));
    return {
        id,
        title: text(input.title) || 'Untitled track',
        cover: safeUrl(input.cover),
        artists,
        album: input.album?.id
            ? { id: text(input.album.id, 128), title: text(input.album.title), cover: safeUrl(input.album.cover) }
            : null,
    };
}
function saveSession(e) {
    userFor(e); // Tracking deliberately continues while stats are locked.
    const body = e.requestInfo().body;
    const now = Date.now();
    const id = text(body.sessionId, 64);
    const started = Number(body.startedAt),
        last = Number(body.lastAt),
        seconds = Number(body.seconds);
    if (
        !/^[a-zA-Z0-9_-]{16,64}$/.test(id) ||
        !Number.isFinite(started) ||
        !Number.isFinite(last) ||
        !Number.isFinite(seconds) ||
        started < now - 32 * 86400000 ||
        last < started ||
        last > now + 2000 ||
        seconds < 0 ||
        seconds > 86400 ||
        seconds > (last - started) / 1000 + 0.75
    )
        throw new BadRequestError('Invalid listening session.');
    const slices = body.slices;
    if (!Array.isArray(slices) || slices.length > 2000) throw new BadRequestError('Invalid listening intervals.');
    let sum = 0;
    const seen = new Set();
    for (const s of slices) {
        if (
            !Number.isFinite(s.at) ||
            s.at % 60000 !== 0 ||
            s.at < Math.floor(started / 60000) * 60000 ||
            s.at > last ||
            !Number.isFinite(s.seconds) ||
            s.seconds < 0 ||
            s.seconds > 60.01 ||
            seen.has(s.at)
        )
            throw new BadRequestError('Invalid listening interval.');
        seen.add(s.at);
        sum += s.seconds;
    }
    if (Math.abs(sum - seconds) > 0.1) throw new BadRequestError('Listening time does not match intervals.');
    let result;
    e.app.runInTransaction((app) => {
        const found = app.findRecordsByFilter('listening_sessions', 'user = {:uid} && session_id = {:sid}', '', 1, 0, {
            uid: e.auth.id,
            sid: id,
        });
        const record = found[0] || new Record(app.findCollectionByNameOrId('listening_sessions'));
        if (
            found.length &&
            (record.getString('track_id') !== String(body.track?.id) || record.getFloat('started_at') !== started)
        )
            throw new BadRequestError('Session identity cannot change.');
        const totals = app.findRecordsByFilter('listening_totals', 'track_id = {:id}', '', 1, 0, {
            id: String(body.track?.id),
        });
        let count = totals[0]?.getInt('streams') || 0;
        // Duplicate, late, and retried checkpoints are harmless, including after finalization.
        if (
            !found.length ||
            (!record.getBool('ended') && seconds >= record.getFloat('seconds') && last >= record.getFloat('last_at'))
        ) {
            if (!found.length) {
                const track = metadata(app, body.track, e.auth.id);
                record.set('user', e.auth.id);
                record.set('session_id', id);
                record.set('track_id', track.id);
                record.set('track', track);
                record.set('started_at', started);
            }
            const previous = json(record, 'slices', []);
            if (previous.some((s) => (slices.find((next) => next.at === s.at)?.seconds ?? -1) + 0.001 < s.seconds))
                throw new BadRequestError('Listening intervals cannot decrease.');
            if (!record.getBool('qualified') && seconds >= STREAM_SECONDS) {
                const total = totals[0] || new Record(app.findCollectionByNameOrId('listening_totals'));
                total.set('track_id', record.getString('track_id'));
                total.set('streams', ++count);
                app.save(total);
                record.set('qualified', true);
            }
            record.set('seconds', seconds);
            record.set('last_at', last);
            record.set('slices', slices);
            record.set('ended', body.ended === true);
            app.save(record);
        }
        result = {
            sessionId: id,
            qualified: record.getBool('qualified'),
            seconds: record.getFloat('seconds'),
            globalStreams: count,
            trackId: record.getString('track_id'),
        };
    });
    return result;
}
function stats(e) {
    const { config } = userFor(e);
    const query = e.requestInfo().query;
    const period = query.period || 'week';
    const policy = {
        locked: config ? !config.getBool('feature_stats') : false,
        longTermLocked: config?.getBool('stats_lock_long_term') || false,
    };
    if (policy.locked || (policy.longTermLocked && ['year', 'lifetime'].includes(period)))
        return { locked: policy.locked ? 'all' : 'long-term', policy };
    const offset = Number(query.offset || 0);
    if (!Number.isFinite(offset) || Math.abs(offset) > 840) throw new BadRequestError('Invalid timezone offset.');
    let offsets;
    try {
        offsets = JSON.parse(query.offsets || '[]');
    } catch {
        throw new BadRequestError('Invalid timezone transitions.');
    }
    if (
        !Array.isArray(offsets) ||
        offsets.length > 200 ||
        offsets.some(
            (entry, index) =>
                !Number.isFinite(entry.at) ||
                !Number.isFinite(entry.offset) ||
                Math.abs(entry.offset) > 840 ||
                (index > 0 && entry.at <= offsets[index - 1].at)
        )
    )
        throw new BadRequestError('Invalid timezone transitions.');
    let range;
    try {
        range = windowFor(period, query.anchor, offset, Date.now(), offsets);
    } catch (error) {
        throw new BadRequestError(error.message);
    }
    // Query in bounded batches. Includes sessions crossing the beginning of a period.
    const filter = 'user = {:uid} && qualified = true && last_at >= {:start} && started_at < {:end}';
    const rows = [];
    let page = 0;
    while (true) {
        const batch = e.app.findRecordsByFilter('listening_sessions', filter, 'started_at,id', 1000, page++ * 1000, {
            uid: e.auth.id,
            start: period === 'lifetime' ? 0 : range.previousStart,
            end: range.end,
        });
        for (const record of batch)
            rows.push({
                sessionId: record.getString('session_id'),
                track: json(record, 'track', {}),
                startedAt: record.getFloat('started_at'),
                seconds: record.getFloat('seconds'),
                slices: json(record, 'slices', []),
                ended: record.getBool('ended'),
            });
        if (batch.length < 1000) break;
    }
    const result = aggregate(rows, range);
    const historyPage = Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1)));
    result.historyTotal = result.history.length;
    result.historyPage = historyPage;
    if (query.export !== 'true') {
        result.history = result.history.slice((historyPage - 1) * 30, historyPage * 30);
        for (const key of ['tracks', 'artists', 'albums']) result.top[key] = result.top[key].slice(0, 100);
    }
    return { ...result, policy, generatedAt: Date.now(), streamThreshold: STREAM_SECONDS };
}
module.exports = { saveSession, stats };
