/* eslint-disable no-undef */
// Social endpoints. Every read is assembled per viewer from server-only collections, so
// visibility, Ghost Mode, friendships and blocks are enforced here, never in the client.
const model = require('./social-model.cjs');

const TOPIC = 'monochrome_social';
const DAY = 86400000;
const STREAM_DAYS = 7;
const MATCH_DAYS = 90;
const NEW_MEMBER_DAYS = 14;
const FOREVER = '2100-01-01 00:00:00.000Z';

// ---------------------------------------------------------------- helpers

function text(value, limit = 256) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, limit);
}

function json(record, key, fallback) {
    try {
        return JSON.parse(record.getString(key) || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function stamp(ms) {
    return new Date(ms).toISOString().replace('T', ' ');
}

function ms(record, key) {
    const value = record.getString(key);
    return value ? Date.parse(value.replace(' ', 'T')) || 0 : 0;
}

function safeArt(value) {
    const url = text(value, 2048);
    if (/^(https?:\/\/|\/api\/files\/|\/assets\/|\/debug-avatars\/|\/debug-covers\/)/i.test(url)) return url;
    // Provider cover ids are resolved to URLs by the client.
    return /^[a-zA-Z0-9_-]{1,128}$/.test(url) ? url : '';
}

function body(e) {
    return e.requestInfo().body || {};
}

function config(app) {
    return app.findRecordsByFilter('app_config', '', '', 1, 0)[0] || null;
}

/** Active member with Social enabled; returns the caller and the instance policy. */
function gate(e) {
    const user = e.app.findRecordById('users', e.auth.id);
    if (user.getString('access_status') !== 'active') throw new ForbiddenError('An active account is required.');
    const settings = config(e.app);
    const admin = user.getString('role') === 'admin';
    if (settings?.getBool('maintenance_mode') && !admin) throw new ForbiddenError('Instance is under maintenance.');
    if (settings && !settings.getBool('feature_social') && !admin) throw new ForbiddenError('Social is turned off.');
    const canPost = admin || !settings || settings.getBool('allow_social_posts');
    return { user, admin, canPost };
}

function requirePosting(access) {
    if (!access.canPost) throw new ForbiddenError('Posting is turned off on this instance.');
}

// ---------------------------------------------------------------- shared context

function loadContext(app) {
    const now = Date.now();
    const ctx = {
        now,
        visibility: new Map(),
        ghost: new Map(),
        follows: new Set(),
        followedAt: new Map(),
        blocks: new Set(),
        active: new Set(),
        users: new Map(),
    };
    for (const record of app.findRecordsByFilter('social_settings', '', '', 0, 0)) {
        const user = record.getString('user');
        ctx.visibility.set(user, record.getString('visibility'));
        ctx.ghost.set(user, ms(record, 'ghost_until'));
    }
    for (const record of app.findRecordsByFilter('social_follows', '', '', 0, 0)) {
        const key = `${record.getString('follower')}>${record.getString('following')}`;
        ctx.follows.add(key);
        ctx.followedAt.set(key, ms(record, 'created'));
    }
    for (const record of app.findRecordsByFilter('social_blocks', '', '', 0, 0)) {
        ctx.blocks.add(`${record.getString('blocker')}>${record.getString('blocked')}`);
    }
    for (const record of app.findRecordsByFilter('users', 'access_status = "active"', '', 0, 0)) {
        ctx.active.add(record.id);
        ctx.users.set(record.id, {
            id: record.id,
            username: '',
            name: record.getString('name') || 'Member',
            avatar: '',
            joined: ms(record, 'created'),
        });
    }
    for (const record of app.findRecordsByFilter('social_profiles', '', '', 0, 0)) {
        const entry = ctx.users.get(record.getString('user'));
        if (!entry) continue;
        entry.username = record.getString('username');
        entry.name = record.getString('display_name') || record.getString('username') || entry.name;
        entry.avatar = safeArt(record.getString('avatar_url'));
    }
    return ctx;
}

function ghostActive(ctx, user) {
    return (ctx.ghost.get(user) || 0) > ctx.now;
}

/** Whether `viewer` may see `owner`'s listening right now. */
function seesListening(ctx, viewer, owner) {
    if (!ctx.active.has(owner)) return false;
    return model.canSeeListening(ctx, viewer, owner);
}

function seesLive(ctx, viewer, owner) {
    return seesListening(ctx, viewer, owner) && !ghostActive(ctx, owner);
}

function userView(ctx, viewer, id) {
    const user = ctx.users.get(id);
    if (!user) return null;
    return { ...user, relation: model.relation(ctx, viewer, id) };
}

// ---------------------------------------------------------------- realtime

/** Sends each subscribed client its own payload; `payloadFor(viewerId)` returns null to skip. */
function push(app, payloadFor) {
    const clients = app.subscriptionsBroker().clients();
    for (const id in clients) {
        const client = clients[id];
        if (!client || client.isDiscarded() || !client.hasSubscription(TOPIC)) continue;
        const auth = client.get('auth');
        const viewer = auth?.id;
        if (!viewer) continue;
        const payload = payloadFor(viewer);
        if (!payload) continue;
        client.send(new SubscriptionMessage({ name: TOPIC, data: JSON.stringify(payload) }));
    }
}

// ---------------------------------------------------------------- presence

function sanitizeTrack(app, input) {
    const id = text(input?.id, 128);
    if (!id || input.isPodcast || input.type === 'video') return null;
    if (input.isSelfHosted) {
        try {
            const track = app.findRecordById('music_tracks', id);
            const artist = track.getString('artist') || 'Unknown artist';
            const album = track.getString('album');
            const file = track.getString('cover_fallback') || track.getString('cover');
            const cover = file ? `/api/files/${track.collection().id}/${track.id}/${encodeURIComponent(file)}` : '';
            return {
                id,
                title: track.getString('title') || 'Untitled track',
                cover,
                isSelfHosted: true,
                artists: [{ id: '', name: artist, picture: '' }],
                album: album ? { id: '', title: album, cover } : null,
            };
        } catch {
            return null;
        }
    }
    const artists = (Array.isArray(input.artists) ? input.artists : [input.artist])
        .filter(Boolean)
        .slice(0, 6)
        .map((a) => ({ id: text(a.id, 128), name: text(a.name || a, 160), picture: safeArt(a.picture) }));
    return {
        id,
        title: text(input.title, 256) || 'Untitled track',
        cover: safeArt(input.cover || input.album?.cover),
        artists,
        album: input.album?.id
            ? { id: text(input.album.id, 128), title: text(input.album.title, 256), cover: safeArt(input.album.cover) }
            : null,
    };
}

function presenceView(record) {
    const track = json(record, 'track', null);
    if (!track) return null;
    return {
        user: record.getString('user'),
        playId: record.getString('play_id'),
        track,
        playing: record.getBool('is_playing'),
        position: record.getFloat('position'),
        duration: record.getFloat('duration'),
        at: ms(record, 'last_seen'),
        started: ms(record, 'started'),
    };
}

function presenceRecord(app, user) {
    return app.findRecordsByFilter('social_presence', 'user = {:user}', '', 1, 0, { user })[0] || null;
}

function clearPresence(app, user) {
    const record = presenceRecord(app, user);
    if (!record || !json(record, 'track', null)) return false;
    record.set('track', null);
    record.set('is_playing', false);
    record.set('play_id', '');
    app.save(record);
    return true;
}

function updatePresence(e) {
    const { user } = gate(e);
    const input = body(e);
    const app = e.app;
    const ctx = loadContext(app);
    const uid = user.id;
    const hidden = model.visibilityOf(ctx, uid) === 'private' || ghostActive(ctx, uid);
    const track = input.track ? sanitizeTrack(app, input.track) : null;

    if (hidden || !track) {
        const wasLive = clearPresence(app, uid);
        if (wasLive) push(app, (viewer) => (viewer !== uid && seesListening(ctx, viewer, uid) ? { type: 'presence', user: uid, presence: null } : null));
        return { shared: false, reason: hidden ? (ghostActive(ctx, uid) ? 'ghost' : 'private') : 'idle' };
    }

    const now = ctx.now;
    const position = Math.max(0, Math.min(86400, Number(input.position) || 0));
    const duration = Math.max(0, Math.min(86400, Number(input.duration) || 0));
    const playing = input.playing === true;
    const record = presenceRecord(app, uid) || new Record(app.findCollectionByNameOrId('social_presence'));
    const previous = record.id ? presenceView(record) : null;
    const newPlay = !previous || previous.track.id !== track.id || input.restart === true;
    const expected = previous
        ? previous.position + (previous.playing ? Math.max(0, now - previous.at) / 1000 : 0)
        : position;
    const changed = newPlay || previous.playing !== playing || Math.abs(expected - position) > 6;

    record.set('user', uid);
    record.set('track', track);
    record.set('is_playing', playing);
    record.set('position', position);
    record.set('duration', duration);
    record.set('last_seen', stamp(now));
    if (newPlay) {
        record.set('play_id', $security.randomString(16));
        record.set('started', stamp(now - position * 1000));
    }
    app.save(record);

    const view = presenceView(record);
    if (changed) push(app, (viewer) => (viewer !== uid && seesLive(ctx, viewer, uid) ? { type: 'presence', user: uid, presence: view } : null));
    return { shared: true, playId: view.playId };
}

// ---------------------------------------------------------------- reactions

function reactionsFor(app, ctx, viewer, keys) {
    const result = {};
    if (!keys.length) return result;
    const wanted = new Set(keys);
    // Grouped by kind so each query stays a short OR list.
    const byKind = new Map();
    for (const key of keys) {
        const [kind, id] = key.split(':');
        if (!byKind.has(kind)) byKind.set(kind, []);
        byKind.get(kind).push(id);
    }
    for (const [kind, ids] of byKind) {
        for (let i = 0; i < ids.length; i += 50) {
            const params = { kind };
            const ors = ids.slice(i, i + 50).map((id, n) => {
                params[`id${n}`] = id;
                return `target_id = {:id${n}}`;
            });
            const records = app.findRecordsByFilter('social_reactions', `target_kind = {:kind} && (${ors.join(' || ')})`, 'created', 0, 0, params);
            for (const record of records) {
                const key = `${kind}:${record.getString('target_id')}`;
                const by = record.getString('user');
                if (!wanted.has(key) || (by !== viewer && model.blocked(ctx, viewer, by))) continue;
                (result[key] = result[key] || []).push({ user: by, emoji: record.getString('emoji') });
            }
        }
    }
    return result;
}

/** Resolves a reaction target the viewer is allowed to see: { owner, label } or null. */
function reactionTarget(app, ctx, viewer, kind, id) {
    try {
        if (kind === 'play') {
            const record = app.findRecordsByFilter('social_presence', 'play_id = {:id}', '', 1, 0, { id })[0];
            const view = record && presenceView(record);
            if (!view || ctx.now - view.at > model.LIVE_WINDOW_MS || !seesLive(ctx, viewer, view.user)) return null;
            return { owner: view.user, label: view.track.title };
        }
        if (kind === 'session') {
            const record = app.findRecordById('listening_sessions', id);
            const owner = record.getString('user');
            if (record.getBool('social_hidden') || !seesListening(ctx, viewer, owner)) return null;
            return { owner, label: json(record, 'track', {}).title || 'a listening session' };
        }
        if (kind === 'note') {
            const record = app.findRecordById('social_notes', id);
            const owner = record.getString('author');
            if (ms(record, 'expires_at') <= ctx.now || !model.canSeeContent(ctx, viewer, owner, record.getString('audience'))) return null;
            return { owner, label: 'your note' };
        }
        if (kind === 'poll') {
            const record = app.findRecordById('social_polls', id);
            const owner = record.getString('author');
            if (!model.canSeeContent(ctx, viewer, owner, record.getString('audience'))) return null;
            return { owner, label: 'your poll' };
        }
        if (kind === 'chart' && /^week-\d{4}-\d{2}-\d{2}$/.test(id)) return { owner: '', label: '' };
    } catch {
        return null;
    }
    return null;
}

function react(e) {
    const { user } = gate(e);
    const app = e.app;
    const input = body(e);
    const ctx = loadContext(app);
    const uid = user.id;
    const emoji = input.emoji ? model.cleanEmoji(input.emoji) : '';
    if (input.emoji && !emoji) throw new BadRequestError('Reactions are emoji only.');
    const targets = (Array.isArray(input.targets) ? input.targets : []).slice(0, 12);
    if (!targets.length) throw new BadRequestError('Nothing to react to.');
    const changed = [];
    for (const target of targets) {
        const kind = text(target?.kind, 16);
        const id = text(target?.id, 160);
        if (!model.REACTION_KINDS.includes(kind) || !id) continue;
        const resolved = reactionTarget(app, ctx, uid, kind, id);
        if (!resolved) continue;
        const existing = app.findRecordsByFilter(
            'social_reactions',
            'user = {:user} && target_kind = {:kind} && target_id = {:id}',
            '',
            1,
            0,
            { user: uid, kind, id }
        )[0];
        if (!emoji) {
            if (existing) app.delete(existing);
        } else {
            const record = existing || new Record(app.findCollectionByNameOrId('social_reactions'));
            record.set('user', uid);
            record.set('target_kind', kind);
            record.set('target_id', id);
            record.set('target_owner', resolved.owner || '');
            record.set('emoji', emoji);
            app.save(record);
        }
        changed.push({ key: `${kind}:${id}`, kind, id, ...resolved });
    }
    if (!changed.length) throw new NotFoundError('That moment is no longer visible.');
    const keys = changed.map((c) => c.key);
    push(app, (viewer) => {
        const visible = changed.filter((c) => reactionTarget(app, ctx, viewer, c.kind, c.id));
        if (!visible.length) return null;
        return { type: 'reactions', reactions: reactionsFor(app, ctx, viewer, visible.map((c) => c.key)), keys: visible.map((c) => c.key) };
    });
    if (emoji) {
        const by = userView(ctx, '', uid);
        const notified = new Set();
        for (const c of changed) {
            if (!c.owner || c.owner === uid || notified.has(c.owner) || model.blocked(ctx, uid, c.owner)) continue;
            notified.add(c.owner);
            push(app, (viewer) => (viewer === c.owner ? { type: 'reacted', by, emoji, label: c.label, key: c.key } : null));
        }
    }
    return { reactions: reactionsFor(app, ctx, uid, keys) };
}

// ---------------------------------------------------------------- notes

function sanitizeAttachment(input) {
    if (!input || typeof input !== 'object') return null;
    const kind = ['track', 'album', 'artist'].includes(input.kind) ? input.kind : '';
    const id = text(input.id, 128);
    if (!kind || !id) return null;
    return {
        kind,
        id,
        title: text(input.title, 200) || 'Untitled',
        subtitle: text(input.subtitle, 200),
        cover: safeArt(input.cover),
        isSelfHosted: input.isSelfHosted === true,
    };
}

function noteView(record) {
    return {
        id: record.id,
        user: record.getString('author'),
        body: record.getString('body'),
        attachment: json(record, 'attachment', null),
        audience: record.getString('audience'),
        created: ms(record, 'created'),
        expires: ms(record, 'expires_at'),
    };
}

function notesFor(app, ctx, viewer) {
    const records = app.findRecordsByFilter('social_notes', 'expires_at > {:now}', '-created', 200, 0, { now: stamp(ctx.now) });
    const seen = new Set();
    const notes = [];
    for (const record of records) {
        const author = record.getString('author');
        if (seen.has(author) || !ctx.active.has(author)) continue;
        if (!model.canSeeContent(ctx, viewer, author, record.getString('audience'))) continue;
        seen.add(author);
        notes.push(noteView(record));
    }
    return notes;
}

function notifyContent(app, ctx, owner, audiences, type) {
    push(app, (viewer) => (audiences.some((audience) => model.canSeeContent(ctx, viewer, owner, audience)) ? { type } : null));
}

function postNote(e) {
    const access = gate(e);
    requirePosting(access);
    const app = e.app;
    const input = body(e);
    const uid = access.user.id;
    const note = text(input.body, 120);
    const attachment = sanitizeAttachment(input.attachment);
    if (!note && !attachment) throw new BadRequestError('Write something or attach music.');
    const ctx = loadContext(app);
    const fallback = model.visibilityOf(ctx, uid) === 'instance' ? 'instance' : 'friends';
    const audience = ['friends', 'instance'].includes(input.audience) ? input.audience : fallback;
    const previous = app.findRecordsByFilter('social_notes', 'author = {:uid}', '', 0, 0, { uid });
    const audiences = [audience, ...previous.map((r) => r.getString('audience'))];
    let saved;
    app.runInTransaction((tx) => {
        for (const record of previous) tx.delete(record);
        const record = new Record(tx.findCollectionByNameOrId('social_notes'));
        record.set('author', uid);
        record.set('body', note);
        record.set('attachment', attachment);
        record.set('audience', audience);
        record.set('expires_at', stamp(ctx.now + model.NOTE_TTL_MS));
        tx.save(record);
        saved = record;
    });
    notifyContent(app, ctx, uid, audiences, 'notes');
    return { note: noteView(saved) };
}

function deleteNote(e) {
    const { user } = gate(e);
    const app = e.app;
    const ctx = loadContext(app);
    const previous = app.findRecordsByFilter('social_notes', 'author = {:uid}', '', 0, 0, { uid: user.id });
    for (const record of previous) {
        deleteReactions(app, 'note', record.id);
        app.delete(record);
    }
    if (previous.length) notifyContent(app, ctx, user.id, previous.map((r) => r.getString('audience')), 'notes');
    return { deleted: previous.length };
}

function deleteReactions(app, kind, id) {
    for (const record of app.findRecordsByFilter('social_reactions', 'target_kind = {:kind} && target_id = {:id}', '', 0, 0, { kind, id })) {
        app.delete(record);
    }
}

// ---------------------------------------------------------------- polls

function pollView(app, record, viewer) {
    const options = json(record, 'options', []);
    const votes = app.findRecordsByFilter('social_poll_votes', 'poll = {:poll}', '', 0, 0, { poll: record.id });
    const counts = {};
    let mine = null;
    for (const vote of votes) {
        const option = vote.getString('option');
        counts[option] = (counts[option] || 0) + 1;
        if (vote.getString('user') === viewer) mine = option;
    }
    const closesAt = ms(record, 'closes_at');
    const closed = record.getBool('closed') || closesAt <= Date.now();
    const author = record.getString('author');
    const reveal = closed || mine !== null || author === viewer;
    return {
        id: record.id,
        user: author,
        question: record.getString('question'),
        audience: record.getString('audience'),
        created: ms(record, 'created'),
        closesAt,
        closed,
        total: votes.length,
        mine,
        reveal,
        options: options.map((option) => ({ ...option, votes: reveal ? counts[option.id] || 0 : null })),
    };
}

function pollsFor(app, ctx, viewer) {
    const since = stamp(ctx.now - 14 * DAY);
    return app
        .findRecordsByFilter('social_polls', 'created >= {:since}', '-created', 50, 0, { since })
        .filter((record) => ctx.active.has(record.getString('author')) && model.canSeeContent(ctx, viewer, record.getString('author'), record.getString('audience')))
        .map((record) => pollView(app, record, viewer));
}

function createPoll(e) {
    const access = gate(e);
    requirePosting(access);
    const app = e.app;
    const input = body(e);
    const question = text(input.question, 160);
    if (question.length < 3) throw new BadRequestError('Ask a question.');
    const options = (Array.isArray(input.options) ? input.options : [])
        .map((option, index) => ({
            id: `o${index + 1}`,
            label: text(option?.label, 80),
            ref: sanitizeAttachment(option?.ref),
        }))
        .filter((option) => option.label || option.ref)
        .slice(0, 4)
        .map((option) => ({ ...option, label: option.label || option.ref.title }));
    if (options.length < 2) throw new BadRequestError('A poll needs at least two answers.');
    const ctx = loadContext(app);
    const uid = access.user.id;
    const audience = ['friends', 'instance'].includes(input.audience) ? input.audience : 'instance';
    const hours = Math.max(1, Math.min(168, Math.round(Number(input.hours) || 24)));
    const record = new Record(app.findCollectionByNameOrId('social_polls'));
    record.set('author', uid);
    record.set('question', question);
    record.set('options', options);
    record.set('audience', audience);
    record.set('closes_at', stamp(ctx.now + hours * 3600000));
    app.save(record);
    notifyContent(app, ctx, uid, [audience], 'polls');
    return { poll: pollView(app, record, uid) };
}

function findPoll(app, ctx, viewer, id) {
    let record;
    try {
        record = app.findRecordById('social_polls', id);
    } catch {
        throw new NotFoundError('Poll not found.');
    }
    if (!model.canSeeContent(ctx, viewer, record.getString('author'), record.getString('audience'))) throw new NotFoundError('Poll not found.');
    return record;
}

function votePoll(e) {
    const { user } = gate(e);
    const app = e.app;
    const ctx = loadContext(app);
    const uid = user.id;
    const record = findPoll(app, ctx, uid, e.request.pathValue('id'));
    const view = pollView(app, record, uid);
    if (view.closed) throw new BadRequestError('This poll is closed.');
    const option = text(body(e).option, 16);
    const existing = app.findRecordsByFilter('social_poll_votes', 'poll = {:poll} && user = {:uid}', '', 1, 0, { poll: record.id, uid })[0];
    if (!option) {
        if (existing) app.delete(existing);
    } else {
        if (!view.options.some((o) => o.id === option)) throw new BadRequestError('Unknown answer.');
        // The unique (poll, user) index makes a second vote impossible even under a race.
        const vote = existing || new Record(app.findCollectionByNameOrId('social_poll_votes'));
        vote.set('poll', record.id);
        vote.set('user', uid);
        vote.set('option', option);
        app.save(vote);
    }
    notifyContent(app, ctx, record.getString('author'), [record.getString('audience')], 'polls');
    return { poll: pollView(app, record, uid) };
}

function closePoll(e) {
    const { user } = gate(e);
    const app = e.app;
    const ctx = loadContext(app);
    const record = findPoll(app, ctx, user.id, e.request.pathValue('id'));
    if (record.getString('author') !== user.id) throw new ForbiddenError('Only the author can close this poll.');
    record.set('closed', true);
    app.save(record);
    notifyContent(app, ctx, user.id, [record.getString('audience')], 'polls');
    return { poll: pollView(app, record, user.id) };
}

function deletePoll(e) {
    const { user } = gate(e);
    const app = e.app;
    const ctx = loadContext(app);
    const record = findPoll(app, ctx, user.id, e.request.pathValue('id'));
    if (record.getString('author') !== user.id) throw new ForbiddenError('Only the author can delete this poll.');
    const audience = record.getString('audience');
    deleteReactions(app, 'poll', record.id);
    app.delete(record);
    notifyContent(app, ctx, user.id, [audience], 'polls');
    return { deleted: true };
}

// ---------------------------------------------------------------- listening history

function sessionsSince(app, since) {
    const rows = arrayOf(new DynamicModel({ id: '', user: '', track: '', started: 0, last: 0 }));
    app.db()
        .newQuery(
            `SELECT id, user, track, CAST(started_at AS INTEGER) AS started, CAST(last_at AS INTEGER) AS last
             FROM listening_sessions
             WHERE qualified = 1 AND COALESCE(social_hidden, 0) = 0 AND started_at >= {:since}
             ORDER BY started_at DESC LIMIT 4000`
        )
        .bind({ since })
        .all(rows);
    const result = [];
    for (const row of rows) {
        try {
            const track = JSON.parse(row.track || 'null');
            if (track?.id) result.push({ id: row.id, user: row.user, track, started: row.started, last: row.last });
        } catch {
            // A malformed snapshot is skipped rather than failing the page.
        }
    }
    return result;
}

function tasteSince(app, since) {
    const rows = arrayOf(new DynamicModel({ user: '', track_id: '', track: '', plays: 0 }));
    app.db()
        .newQuery(
            `SELECT user, track_id, MAX(track) AS track, COUNT(*) AS plays
             FROM listening_sessions
             WHERE qualified = 1 AND COALESCE(social_hidden, 0) = 0 AND started_at >= {:since}
             GROUP BY user, track_id`
        )
        .bind({ since })
        .all(rows);
    const profiles = new Map();
    for (const row of rows) {
        let track;
        try {
            track = JSON.parse(row.track || 'null');
        } catch {
            continue;
        }
        if (!track?.id) continue;
        if (!profiles.has(row.user)) profiles.set(row.user, new Map());
        profiles.get(row.user).set(row.track_id, {
            plays: row.plays,
            artist: model.primaryArtist(track),
            title: track.title,
            cover: track.cover || track.album?.cover || '',
            album: track.album || null,
            track,
        });
    }
    return profiles;
}

function lightTrack(track) {
    return {
        id: track.id,
        title: track.title,
        cover: track.cover || track.album?.cover || '',
        isSelfHosted: !!track.isSelfHosted,
        artists: (track.artists || []).slice(0, 3).map((a) => ({ id: a.id || '', name: a.name || '' })),
        album: track.album ? { id: track.album.id || '', title: track.album.title || '', cover: track.album.cover || '' } : null,
    };
}

function weekKey(now) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return `week-${d.toISOString().slice(0, 10)}`;
}

// ---------------------------------------------------------------- home

function home(e) {
    const access = gate(e);
    const app = e.app;
    const ctx = loadContext(app);
    const viewer = access.user.id;
    const now = ctx.now;
    const referenced = new Set([viewer]);

    // Live listening.
    const live = [];
    const liveSince = stamp(now - model.LIVE_WINDOW_MS);
    for (const record of app.findRecordsByFilter('social_presence', 'last_seen >= {:since}', '', 0, 0, { since: liveSince })) {
        const view = presenceView(record);
        if (!view || !seesLive(ctx, viewer, view.user)) continue;
        live.push(view);
        referenced.add(view.user);
    }

    const notes = notesFor(app, ctx, viewer);
    notes.forEach((note) => referenced.add(note.user));
    const polls = pollsFor(app, ctx, viewer);

    // Recent listening, clustered into sessions per member.
    const recent = sessionsSince(app, now - STREAM_DAYS * DAY).filter((row) => seesListening(ctx, viewer, row.user));
    const stream = [];
    for (const cluster of model.clusterSessions(recent).slice(0, 40)) {
        referenced.add(cluster.user);
        stream.push({
            kind: 'session',
            key: `session:${cluster.id}`,
            at: cluster.end,
            user: cluster.user,
            start: cluster.start,
            end: cluster.end,
            count: cluster.count,
            album: cluster.album ? { id: cluster.album.id, title: cluster.album.title, cover: cluster.album.cover || '' } : null,
            tracks: cluster.tracks.slice(0, 8).map((t) => ({ ...lightTrack(t), plays: t.plays })),
        });
    }

    // Tracks you and another member both played this week.
    const mine = new Map(recent.filter((r) => r.user === viewer).map((r) => [r.track.id, r]));
    if (mine.size) {
        const shared = new Map();
        for (const row of recent) {
            if (row.user === viewer || !mine.has(row.track.id)) continue;
            const entry = shared.get(row.user) || { at: 0, tracks: new Map() };
            entry.at = Math.max(entry.at, row.last, mine.get(row.track.id).last);
            entry.tracks.set(row.track.id, row.track);
            shared.set(row.user, entry);
        }
        [...shared.entries()]
            .sort((a, b) => b[1].tracks.size - a[1].tracks.size)
            .slice(0, 3)
            .forEach(([user, entry]) => {
                referenced.add(user);
                stream.push({ kind: 'common', key: `common:${user}`, at: entry.at, user, tracks: [...entry.tracks.values()].slice(0, 3).map(lightTrack) });
            });
    }

    // New members and new friend requests.
    for (const user of ctx.users.values()) {
        if (user.id === viewer || now - user.joined > NEW_MEMBER_DAYS * DAY || model.blocked(ctx, viewer, user.id)) continue;
        referenced.add(user.id);
        stream.push({ kind: 'joined', key: `joined:${user.id}`, at: user.joined, user: user.id });
    }
    for (const [key, at] of ctx.followedAt) {
        const [follower, following] = key.split('>');
        if (following !== viewer || now - at > NEW_MEMBER_DAYS * DAY || !ctx.active.has(follower) || model.blocked(ctx, viewer, follower)) continue;
        referenced.add(follower);
        stream.push({ kind: 'follow', key: `follow:${follower}`, at, user: follower });
    }
    for (const poll of polls) {
        referenced.add(poll.user);
        stream.push({ kind: 'poll', key: `poll:${poll.id}`, at: poll.created, poll });
    }
    stream.sort((a, b) => b.at - a.at);

    // Community chart: only members sharing with the whole instance contribute.
    const weekTaste = tasteSince(app, now - 7 * DAY);
    const chartRows = [];
    let chartSeconds = 0;
    for (const [user, profile] of weekTaste) {
        if (!ctx.active.has(user) || model.visibilityOf(ctx, user) !== 'instance' || model.blocked(ctx, viewer, user)) continue;
        for (const entry of profile.values()) chartRows.push({ user, plays: entry.plays, track: lightTrack(entry.track) });
    }
    const chartData = model.communityChart(chartRows);
    let chart = null;
    if (chartData) {
        for (const row of sessionsSince(app, now - 7 * DAY)) {
            if (ctx.active.has(row.user) && model.visibilityOf(ctx, row.user) === 'instance') chartSeconds += Math.max(0, row.last - row.started) / 1000;
        }
        chart = {
            key: `chart:${weekKey(now)}`,
            tracks: chartData.tracks.map((t) => ({ track: t.track, plays: t.plays, listeners: t.listeners.slice(0, 5) })),
            artists: chartData.artists.map((a) => ({ name: a.name, cover: a.cover, plays: a.plays, listeners: a.listeners.slice(0, 5) })),
            contributors: chartData.contributors,
            hours: Math.round(chartSeconds / 360) / 10,
        };
        chart.tracks.forEach((t) => t.listeners.forEach((u) => referenced.add(u)));
    }

    // Taste matches against members whose listening you may see.
    const taste = tasteSince(app, now - MATCH_DAYS * DAY);
    const own = taste.get(viewer) || new Map();
    const matches = [];
    let ownPlays = 0;
    own.forEach((entry) => (ownPlays += entry.plays));
    for (const [user, profile] of taste) {
        if (user === viewer || !seesListening(ctx, viewer, user)) continue;
        const result = model.compatibility(own, profile);
        if (!result) continue;
        referenced.add(user);
        matches.push({ user, ...result, tracks: result.tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist, cover: t.cover })) });
    }
    matches.sort((a, b) => b.score - a.score);

    // Reactions for everything on the page.
    const keys = [
        ...live.map((p) => `play:${p.playId}`),
        ...notes.map((n) => `note:${n.id}`),
        ...stream.filter((s) => s.kind === 'session' || s.kind === 'poll').map((s) => s.key),
        ...(chart ? [chart.key] : []),
    ];
    const reactions = reactionsFor(app, ctx, viewer, keys);
    Object.values(reactions).forEach((list) => list.forEach((r) => referenced.add(r.user)));

    const members = [...ctx.users.values()].filter((u) => u.id !== viewer && !model.blocked(ctx, viewer, u.id)).map((u) => u.id);
    members.forEach((id) => referenced.add(id));
    const users = {};
    for (const id of referenced) {
        const view = userView(ctx, viewer, id);
        if (view) users[id] = view;
    }
    const ghostUntil = ghostActive(ctx, viewer) ? ctx.ghost.get(viewer) : 0;

    e.response.header().set('Cache-Control', 'no-store, private');
    return {
        now,
        me: {
            id: viewer,
            visibility: ctx.visibility.get(viewer) || '',
            ghostUntil,
            canPost: access.canPost,
            enoughTaste: ownPlays >= 10,
        },
        users,
        members,
        live,
        rooms: model.groupRooms(live).map((room) => ({ key: room.key, kind: room.kind, listeners: room.listeners.map((l) => l.user) })),
        notes,
        stream: stream.slice(0, 60),
        chart,
        matches: matches.slice(0, 6),
        reactions,
    };
}

// ---------------------------------------------------------------- settings

function settingsRecord(app, user) {
    return app.findRecordsByFilter('social_settings', 'user = {:user}', '', 1, 0, { user })[0] || null;
}

function updateSettings(e) {
    const { user } = gate(e);
    const app = e.app;
    const input = body(e);
    const uid = user.id;
    const before = loadContext(app);
    const record = settingsRecord(app, uid) || new Record(app.findCollectionByNameOrId('social_settings'));
    record.set('user', uid);
    if (input.visibility !== undefined) {
        if (!['private', 'friends', 'instance'].includes(input.visibility)) throw new BadRequestError('Unknown visibility.');
        record.set('visibility', input.visibility);
    }
    if (input.ghost !== undefined) {
        const now = Date.now();
        let until = 0;
        if (input.ghost === 'forever') until = Date.parse(FOREVER.replace(' ', 'T'));
        else if (input.ghost !== 'off' && input.ghost !== 0) {
            const minutes = Math.round(Number(input.ghost));
            if (!(minutes >= 15 && minutes <= 7 * 24 * 60)) throw new BadRequestError('Choose a Ghost Mode duration.');
            until = now + minutes * 60000;
        }
        // Every ghost window is kept, so a session uploaded late is judged by when it played.
        const log = json(record, 'ghost_log', []).filter((w) => Array.isArray(w) && w[1] > now - 120 * DAY);
        const open = ms(record, 'ghost_until') > now ? log[log.length - 1] : null;
        if (open) open[1] = until || now;
        else if (until) log.push([now, until]);
        record.set('ghost_log', log.slice(-200));
        record.set('ghost_until', until ? stamp(until) : '');
    }
    app.save(record);
    const after = loadContext(app);
    const hiddenNow = model.visibilityOf(after, uid) === 'private' || ghostActive(after, uid);
    if (hiddenNow) clearPresence(app, uid);
    push(app, (viewer) => {
        if (viewer === uid) return { type: 'settings' };
        const saw = seesLive(before, viewer, uid);
        const sees = seesLive(after, viewer, uid) && !hiddenNow;
        const sawHistory = seesListening(before, viewer, uid);
        const seesHistory = seesListening(after, viewer, uid);
        if (saw && !sees) return { type: 'presence', user: uid, presence: null, refresh: sawHistory !== seesHistory };
        if (sawHistory !== seesHistory || saw !== sees) return { type: 'refresh' };
        return null;
    });
    return {
        visibility: record.getString('visibility'),
        ghostUntil: ghostActive(after, uid) ? after.ghost.get(uid) : 0,
    };
}

// ---------------------------------------------------------------- members and messages

function member(e) {
    const { user } = gate(e);
    const app = e.app;
    const ctx = loadContext(app);
    const viewer = user.id;
    const username = text(e.request.pathValue('username'), 128);
    const target = [...ctx.users.values()].find((u) => u.username === username);
    if (!target || model.blocked(ctx, viewer, target.id)) throw new NotFoundError('Member not found.');
    let presence = null;
    if (target.id !== viewer && seesLive(ctx, viewer, target.id)) {
        const record = presenceRecord(app, target.id);
        const view = record && presenceView(record);
        if (view && ctx.now - view.at <= model.LIVE_WINDOW_MS) presence = view;
    }
    let match = null;
    let enough = false;
    if (target.id !== viewer && seesListening(ctx, viewer, target.id)) {
        const taste = tasteSince(app, ctx.now - MATCH_DAYS * DAY);
        const result = model.compatibility(taste.get(viewer) || new Map(), taste.get(target.id) || new Map());
        if (result) match = { ...result, tracks: result.tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist, cover: t.cover })) };
        enough = !!result;
    }
    let friends = 0;
    for (const key of ctx.follows) {
        const [a, b] = key.split('>');
        if (a === target.id && model.mutual(ctx, a, b) && ctx.active.has(b)) friends++;
    }
    e.response.header().set('Cache-Control', 'no-store, private');
    return {
        user: userView(ctx, viewer, target.id),
        friends,
        presence,
        match,
        matchAvailable: enough,
        listeningVisible: target.id === viewer || seesListening(ctx, viewer, target.id),
        canMessage: target.id !== viewer && model.mutual(ctx, viewer, target.id),
    };
}

function dmBetween(app, a, b) {
    return app
        .findRecordsByFilter('social_conversations', 'type = "dm" && members.id ?= {:a}', '-updated', 200, 0, { a })
        .find((conversation) => conversation.getStringSlice('members').includes(b));
}

function openDm(e) {
    const { user } = gate(e);
    const app = e.app;
    const other = text(body(e).user, 32);
    const ctx = loadContext(app);
    if (!other || other === user.id || !ctx.active.has(other)) throw new NotFoundError('Member not found.');
    const existing = dmBetween(app, user.id, other);
    if (model.blocked(ctx, user.id, other)) throw new ForbiddenError('You cannot message this member.');
    if (existing) return { conversation: existing.id };
    if (!model.mutual(ctx, user.id, other)) throw new ForbiddenError('You can message friends: follow each other first.');
    const record = new Record(app.findCollectionByNameOrId('social_conversations'));
    record.set('type', 'dm');
    record.set('created_by', user.id);
    record.set('members', [user.id, other]);
    app.save(record);
    return { conversation: record.id };
}

/** Message create hook: DMs need friendship (or a reply to a message request) and no block. */
function guardMessage(e) {
    const app = e.app;
    const record = e.record;
    const sender = e.auth?.id;
    const conversationId = record.getString('conversation');
    if (!sender || !conversationId) throw new BadRequestError('Messages belong to a conversation.');
    const conversation = app.findRecordById('social_conversations', conversationId);
    const members = conversation.getStringSlice('members');
    if (!members.includes(sender)) throw new ForbiddenError('You are not in this conversation.');
    record.set('sender', sender);
    record.set('read', false);
    if (!['text', 'share', 'image'].includes(record.getString('kind'))) record.set('kind', 'text');
    if (record.getString('kind') === 'share') record.set('payload', sanitizeAttachment(json(record, 'payload', null)));
    if (conversation.getString('type') === 'dm') {
        const other = members.find((id) => id !== sender);
        const ctx = loadContext(app);
        if (!other || model.blocked(ctx, sender, other)) throw new ForbiddenError('You cannot message this member.');
        const replied = app.findRecordsByFilter('social_messages', 'conversation = {:c} && sender = {:o}', '', 1, 0, { c: conversationId, o: other }).length > 0;
        if (!model.mutual(ctx, sender, other) && !replied) throw new ForbiddenError('You can message friends: follow each other first.');
        record.set('recipient', other);
    }
}

function touchConversation(app, record) {
    try {
        const conversation = app.findRecordById('social_conversations', record.getString('conversation'));
        app.save(conversation); // bumps `updated` so lists sort by latest message
    } catch {
        // A missing conversation was already rejected by the create guard.
    }
}

function onFollowChange(app, record) {
    const a = record.getString('follower');
    const b = record.getString('following');
    // Friendship can reveal or hide friends-only listening for both people.
    push(app, (viewer) => (viewer === a || viewer === b ? { type: 'refresh' } : null));
}

function onUnblock(app, record) {
    const a = record.getString('blocker');
    const b = record.getString('blocked');
    push(app, (viewer) => (viewer === a || viewer === b ? { type: 'refresh' } : null));
}

function onBlock(app, record) {
    const a = record.getString('blocker');
    const b = record.getString('blocked');
    for (const follow of app.findRecordsByFilter(
        'social_follows',
        '(follower = {:a} && following = {:b}) || (follower = {:b} && following = {:a})',
        '',
        0,
        0,
        { a, b }
    )) {
        app.delete(follow);
    }
    push(app, (viewer) => (viewer === a || viewer === b ? { type: 'refresh' } : null));
}

/** Keeps the public social profile in step with the account profile (DB_users). */
function syncProfile(app, source) {
    const uid = source.getString('firebase_id');
    if (!uid) return;
    try {
        app.findRecordById('users', uid);
    } catch {
        return;
    }
    const record = app.findRecordsByFilter('social_profiles', 'user = {:uid}', '', 1, 0, { uid })[0] || new Record(app.findCollectionByNameOrId('social_profiles'));
    record.set('user', uid);
    for (const field of ['username', 'display_name', 'avatar_url', 'banner', 'status', 'about', 'website']) {
        record.set(field, source.getString(field));
    }
    try {
        app.save(record);
    } catch (error) {
        console.warn('[social] profile sync skipped:', error);
    }
}

function sweep(app) {
    const now = stamp(Date.now());
    for (const record of app.findRecordsByFilter('social_notes', 'expires_at <= {:now}', '', 500, 0, { now })) {
        deleteReactions(app, 'note', record.id);
        app.delete(record);
    }
    // Reactions to live moments only matter while the moment is recent.
    const old = stamp(Date.now() - 7 * DAY);
    for (const record of app.findRecordsByFilter('social_reactions', 'target_kind = "play" && created <= {:old}', '', 500, 0, { old })) {
        app.delete(record);
    }
}

/** Used by the listening service: Ghost Mode sessions never become social, even later. */
function ghostFor(app, user, start = Date.now(), end = Date.now()) {
    const record = settingsRecord(app, user);
    if (!record) return false;
    const now = Date.now();
    if (ms(record, 'ghost_until') > now && end >= now - 5 * 60000) return true;
    // A play that overlaps any ghost window stays out of Social, however late it is uploaded.
    return json(record, 'ghost_log', []).some((w) => Array.isArray(w) && start < w[1] && end > w[0]);
}

/** Admin dashboard: how many members are live right now, with no per-member detail. */
function onlineCount(e) {
    const { admin } = gate(e);
    if (!admin) throw new ForbiddenError('Admins only.');
    const since = stamp(Date.now() - model.LIVE_WINDOW_MS);
    const live = e.app.findRecordsByFilter('social_presence', 'last_seen >= {:since}', '', 0, 0, { since }).filter((r) => json(r, 'track', null));
    e.response.header().set('Cache-Control', 'no-store, private');
    return { count: live.length };
}

/** One member's live presence, under the same rules as Social (admins get no exception). */
function presenceOf(e) {
    const { user } = gate(e);
    const ctx = loadContext(e.app);
    const target = text(e.request.pathValue('id'), 32);
    if (!target || !seesLive(ctx, user.id, target)) return { presence: null };
    const record = presenceRecord(e.app, target);
    const view = record && presenceView(record);
    e.response.header().set('Cache-Control', 'no-store, private');
    return { presence: view && ctx.now - view.at <= model.LIVE_WINDOW_MS ? view : null };
}

/** DB_users rows mirror into public profiles, so their owner must be the caller. */
function guardAccountRecord(e) {
    if (e.hasSuperuserAuth()) return;
    const auth = e.auth?.id;
    const owner = e.record.getString('firebase_id');
    if (!auth || owner !== auth) throw new ForbiddenError('You can only edit your own profile.');
}

module.exports = {
    TOPIC,
    home,
    updatePresence,
    updateSettings,
    react,
    postNote,
    deleteNote,
    createPoll,
    votePoll,
    closePoll,
    deletePoll,
    member,
    openDm,
    guardMessage,
    touchConversation,
    onFollowChange,
    onBlock,
    onUnblock,
    syncProfile,
    sweep,
    ghostFor,
    onlineCount,
    presenceOf,
    guardAccountRecord,
    push,
    loadContext,
    presenceView,
    seesLive,
};
