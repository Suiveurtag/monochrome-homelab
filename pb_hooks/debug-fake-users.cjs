/* eslint-disable no-undef */
// Debug only: fake users named after Overwatch heroes, switched by app_config.debug_fake_users.
// They are real users on FAKE_DOMAIN, so turning the switch off deletes them and their rows cascade away.
const FAKE_DOMAIN = 'debug-fake.example.com';
const DEFAULT_COUNT = 10;

// Avatars live in public/debug-avatars/<avatar>; swap in real portraits under the same names.
const ROSTER = [
    {
        name: 'Tracer',
        avatar: 'tracer.svg',
        color: '#f59e0b',
        lines: [
            "Cheers, love! The cavalry's here!",
            'Gotta go fast!',
            'Blimey, that was close!',
            'Lovely day for a bit of time travel.',
        ],
    },
    {
        name: 'Genji',
        avatar: 'genji.svg',
        color: '#22c55e',
        lines: ['The dragon awakens.', 'Hesitation is defeat.', 'My blade is ready.'],
    },
    {
        name: 'Reinhardt',
        avatar: 'reinhardt.svg',
        color: '#94a3b8',
        lines: ['Lay down your arms!', 'Fear not, the shield is raised!', 'Hammer time!', 'For honor and glory!'],
    },
    {
        name: 'Mercy',
        avatar: 'mercy.svg',
        color: '#fde68a',
        lines: ["I'm here to help.", 'Heroes never die.', 'Cleansing light.', 'Let me take care of that.'],
    },
    {
        name: 'Winston',
        avatar: 'winston.svg',
        color: '#64748b',
        lines: ['Hmm, interesting.', 'Science!', "Let's go, let's go!", 'Gorilla on the move.'],
    },
    {
        name: 'Widowmaker',
        avatar: 'widowmaker.svg',
        color: '#7c3aed',
        lines: ['Bonjour, mon ami.', 'Sweet dreams.', 'Nothing personal.', 'The hunt is on.'],
    },
    {
        name: 'Soldier: 76',
        avatar: 'soldier-76.svg',
        color: '#2563eb',
        lines: ["Let's roll out.", 'Stay sharp.', "Let's do this.", 'Time to get to work.'],
    },
    {
        name: 'Hanzo',
        avatar: 'hanzo.svg',
        color: '#15803d',
        lines: [
            'Honor is for the living.',
            'The arrow knows its path.',
            'Stillness before the storm.',
            'Do not test my patience.',
        ],
    },
    {
        name: 'Junkrat',
        avatar: 'junkrat.svg',
        color: '#eab308',
        lines: ['Boom! Boom!', "Let's blow stuff up!", 'Gonna blow!', 'Mine! Mine! Mine!'],
    },
    {
        name: 'Mei',
        avatar: 'mei.svg',
        color: '#38bdf8',
        lines: [
            "Brrr, it's chilly in here!",
            "Let's make some ice!",
            'Stay cool, friend.',
            'Oh no, I froze the whole room!',
        ],
    },
    {
        name: 'Zarya',
        avatar: 'zarya.svg',
        color: '#db2777',
        lines: ['Comrade, shall we lift?', 'Strong like a mountain.', "Let's push forward!", 'Nothing can stop me!'],
    },
    {
        name: 'Lúcio',
        avatar: 'lucio.svg',
        color: '#84cc16',
        lines: ["Let's get the party started!", 'Feel the beat!', 'Pump it up!', 'Keep the rhythm going!'],
    },
    {
        name: 'D.Va',
        avatar: 'dva.svg',
        color: '#f472b6',
        lines: ["Let's play!", "Mech online, let's go!", 'Game on!', "I'll cover you."],
    },
    {
        name: 'Ana',
        avatar: 'ana.svg',
        color: '#a16207',
        lines: ['Keep your head down.', 'Good shot!', 'Stay alert, partner.', 'Easy target.'],
    },
    {
        name: 'Sombra',
        avatar: 'sombra.svg',
        color: '#a855f7',
        lines: ['Hasta la vista.', 'Oops, sorry about that.', 'Got your data.', 'Look over there.'],
    },
    {
        name: 'Ashe',
        avatar: 'ashe.svg',
        color: '#b45309',
        lines: ["Let's do this, Bob.", 'Dead man walking.', 'Hope you brought your wallet.', 'Dynamite time.'],
    },
    {
        name: 'Bastion',
        avatar: 'bastion.svg',
        color: '#65a30d',
        lines: ['Beep boop.', 'Threat detected.', 'Recalibrating.', 'Peace, peace.'],
    },
    {
        name: 'Brigitte',
        avatar: 'brigitte.svg',
        color: '#f97316',
        lines: ['Shield up!', "Let's go, comrades.", 'Stay together.', 'I am ready to fight.'],
    },
    {
        name: 'Echo',
        avatar: 'echo.svg',
        color: '#06b6d4',
        lines: ['Projecting.', 'Scanning.', 'Analyzing the battlefield.'],
    },
    {
        name: 'Kiriko',
        avatar: 'kiriko.svg',
        color: '#f43f5e',
        lines: ['Forgive me.', 'Kitsune, guide me.', 'Stay safe out there.'],
    },
    {
        name: 'Orisa',
        avatar: 'orisa.svg',
        color: '#0ea5e9',
        lines: ['Fortify!', "I'm ready to fight.", 'Protect the team.'],
    },
    {
        name: 'Doomfist',
        avatar: 'doomfist.svg',
        color: '#dc2626',
        lines: ['The future is mine.', 'Hand over the power.', 'Nothing stands in my way.'],
    },
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const token = (length) =>
    Math.random()
        .toString(36)
        .slice(2, 2 + length)
        .padEnd(length, '0');
const slug = (name) =>
    name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
const clampCount = (value) => Math.min(100, Math.max(1, value || DEFAULT_COUNT));
const heroOf = (user) => ROSTER.find((hero) => hero.name === user.getString('name')) || ROSTER[0];

function read(record) {
    return { enabled: record.getBool('debug_fake_users'), count: clampCount(record.getInt('debug_fake_users_count')) };
}

function save(app, collection, data) {
    const record = new Record(app.findCollectionByNameOrId(collection));
    record.load(data);
    app.save(record);
    return record;
}

function tryCreate(app, collection, data) {
    try {
        return save(app, collection, data);
    } catch (_) {
        return null;
    }
}

function fakeUsers(app) {
    return app.findRecordsByFilter('users', `email ~ "@${FAKE_DOMAIN}"`, '', 10000, 0);
}

// Two `members.id ?=` conditions in one filter never match the same row, so check the second member in JS.
function dmBetween(app, a, b) {
    return app
        .findRecordsByFilter('social_conversations', `type = "dm" && members.id ?= "${a}"`, '', 200, 0)
        .find((conversation) => conversation.getStringSlice('members').includes(b));
}

function say(app, conversation, sender, body) {
    const recipient = conversation.getStringSlice('members').find((id) => id !== sender);
    return save(app, 'social_messages', {
        sender,
        recipient,
        conversation: conversation.id,
        kind: 'text',
        body,
        read: false,
    });
}

function sendDm(app, from, to, body) {
    const conversation =
        dmBetween(app, from, to) ||
        save(app, 'social_conversations', { type: 'dm', created_by: from, members: [from, to] });
    return say(app, conversation, from, body);
}

const stamp = (ms) => new Date(ms).toISOString().replace('T', ' ');

function trackSnapshot(track) {
    const artist = track.getString('artist') || 'Unknown artist';
    const album = track.getString('album');
    const file = track.getString('cover_fallback') || track.getString('cover');
    const cover = file ? `/api/files/${track.collection().id}/${track.id}/${encodeURIComponent(file)}` : '';
    return {
        id: track.id,
        title: track.getString('title') || 'Untitled track',
        cover,
        isSelfHosted: true,
        artists: [{ id: '', name: artist, picture: '' }],
        album: album ? { id: '', title: album, cover } : null,
    };
}

// Debug-only fictional music with generated covers in public/debug-covers/. Never shown unless
// the fake-user switch is on, and only when the instance has no uploaded tracks to borrow.
const DEBUG_ALBUMS = [
    ['Debug Harbour', 'Saltwater Hours', 1],
    ['Debug Harbour', 'Saltwater Hours', 1],
    ['Juno Park (debug)', 'Neon Margins', 2],
    ['The Pale Hours (debug)', 'Slow Orbit', 3],
    ['Cass Arlo (debug)', 'Weathervane', 4],
    ['Velvet Static (debug)', 'Low Tide Radio', 5],
    ['Mira Sol (debug)', 'Glass Weather', 6],
    ['Northbound (debug)', 'Paper Satellites', 7],
    ['Juno Park (debug)', 'Neon Margins', 2],
];
const DEBUG_TITLES = ['Undertow', 'Lanterns', 'First Light', 'Static Bloom', 'Copper Sky', 'Night Bus', 'Driftwood', 'Afterglow', 'Halflife', 'Open Water', 'Sundial', 'Echo Park'];
const DEBUG_CATALOGUE = DEBUG_TITLES.map((title, index) => {
    const [artist, album, cover] = DEBUG_ALBUMS[index % DEBUG_ALBUMS.length];
    const art = `/debug-covers/cover-${cover}.svg`;
    return {
        id: `debug-track-${index + 1}`,
        title,
        cover: art,
        isDebug: true,
        duration: 150 + ((index * 37) % 120),
        artists: [{ id: '', name: artist, picture: '' }],
        album: { id: `debug-album-${cover}`, title: album, cover: art },
    };
});

// The previous presence becomes a finished, qualified listening session, so recent activity,
// charts and taste matches have real rows to work with.
function finishPlay(app, user, presence, now) {
    const track = JSON.parse(presence.getString('track') || 'null');
    if (!track?.id || !track.cover) return;
    const started = Date.parse(presence.getString('started').replace(' ', 'T')) || now - 200000;
    const seconds = Math.min(240, Math.max(35, Math.round((now - started) / 1000)));
    tryCreate(app, 'listening_sessions', {
        user: user.id,
        session_id: `fake_${token(20)}`,
        track_id: track.id,
        track,
        started_at: started,
        last_at: started + seconds * 1000,
        seconds,
        qualified: true,
        ended: true,
        slices: [],
    });
}

function listen(app, user) {
    const now = Date.now();
    const existing = app.findRecordsByFilter('social_presence', `user = "${user.id}"`, '', 1, 0)[0];
    if (existing) finishPlay(app, user, existing, now);
    // Fakes keep returning to the same few tracks so overlaps (and rooms) actually happen.
    const pool = app.findRecordsByFilter('music_tracks', 'cover != "" || cover_fallback != ""', 'title', 24, 0);
    const record_ = pick(pool.length ? pool : app.findRecordsByFilter('music_tracks', '', '@random', 1, 0));
    // An instance without uploaded music falls back to an obviously fictional debug catalogue.
    const snapshot = record_ ? trackSnapshot(record_) : pick(DEBUG_CATALOGUE);
    if (!snapshot) return;
    const { duration: _debugLength, ...trackData } = snapshot;
    const length = record_ ? record_.getFloat('duration') || 210 : snapshot.duration;
    const position = Math.floor(Math.random() * Math.min(120, length - 30));
    const record = existing || new Record(app.findCollectionByNameOrId('social_presence'));
    record.load({
        user: user.id,
        track: trackData,
        is_playing: true,
        position,
        duration: length,
        last_seen: stamp(now),
        started: stamp(now - position * 1000),
        play_id: token(16),
    });
    app.save(record);
    const social = require(`${__hooks}/social-service.cjs`);
    const ctx = social.loadContext(app);
    const view = social.presenceView(record);
    social.push(app, (viewer) => (viewer !== user.id && social.seesLive(ctx, viewer, user.id) ? { type: 'presence', user: user.id, presence: view } : null));
}

// Fakes keep their presence fresh between actions so they stay "live".
function heartbeat(app, fakes) {
    for (const fake of fakes) {
        const record = app.findRecordsByFilter('social_presence', `user = "${fake.id}"`, '', 1, 0)[0];
        if (!record || !record.getString('track') || record.getString('track') === 'null') continue;
        const at = Date.parse(record.getString('last_seen').replace(' ', 'T')) || Date.now();
        const position = record.getFloat('position') + (Date.now() - at) / 1000;
        if (position > record.getFloat('duration')) {
            listen(app, fake);
            continue;
        }
        record.set('position', position);
        record.set('last_seen', stamp(Date.now()));
        app.save(record);
    }
}

const NOTE_LINES = ['This outro is unreal.', 'On repeat all day.', 'Anyone else up late with this?', 'Album of the year?', 'Headphones on, world off.', 'Found my new favourite song.'];
const REACTIONS = ['🔥', '❤️', '🤯', '🎧', '😭', '🕺'];

function leaveNote(app, fake) {
    for (const old of app.findRecordsByFilter('social_notes', `author = "${fake.id}"`, '', 10, 0)) app.delete(old);
    const presence = app.findRecordsByFilter('social_presence', `user = "${fake.id}"`, '', 1, 0)[0];
    const track = presence && JSON.parse(presence.getString('track') || 'null');
    tryCreate(app, 'social_notes', {
        author: fake.id,
        body: pick(NOTE_LINES),
        attachment: track && Math.random() < 0.6 ? { kind: 'track', id: track.id, title: track.title, subtitle: track.artists?.[0]?.name || '', cover: track.cover, isSelfHosted: true } : null,
        audience: 'instance',
        expires_at: stamp(Date.now() + 24 * 3600000),
    });
}

function reactToSomething(app, fake) {
    const presence = pick(app.findRecordsByFilter('social_presence', `user != "${fake.id}" && play_id != ""`, '-last_seen', 10, 0));
    const note = pick(app.findRecordsByFilter('social_notes', `author != "${fake.id}"`, '-created', 10, 0));
    const target = Math.random() < 0.5 && presence ? { kind: 'play', id: presence.getString('play_id'), owner: presence.getString('user') } : note ? { kind: 'note', id: note.id, owner: note.getString('author') } : null;
    if (!target) return;
    const existing = app.findRecordsByFilter('social_reactions', `user = "${fake.id}" && target_kind = "${target.kind}" && target_id = "${target.id}"`, '', 1, 0)[0];
    const record = existing || new Record(app.findCollectionByNameOrId('social_reactions'));
    record.load({ user: fake.id, target_kind: target.kind, target_id: target.id, target_owner: target.owner, emoji: pick(REACTIONS) });
    app.save(record);
}

function votePolls(app, fake) {
    for (const poll of app.findRecordsByFilter('social_polls', 'closed = false', '-created', 5, 0)) {
        if (Date.parse(poll.getString('closes_at').replace(' ', 'T')) < Date.now()) continue;
        const options = JSON.parse(poll.getString('options') || '[]');
        if (options.length) tryCreate(app, 'social_poll_votes', { poll: poll.id, user: fake.id, option: pick(options).id });
    }
}

function seed(app, count) {
    const created = [];
    for (let i = 0; i < count; i++) {
        const hero = ROSTER[i % ROSTER.length];
        const handle = `${slug(hero.name)}_${token(4)}`;
        const user = new Record(app.findCollectionByNameOrId('users'));
        user.setEmail(`${handle}@${FAKE_DOMAIN}`);
        user.setPassword(token(24));
        user.setVerified(true);
        user.load({ name: hero.name, access_status: 'active', role: 'member' });
        user.refreshTokenKey();
        app.save(user);
        save(app, 'social_profiles', {
            user: user.id,
            username: handle,
            display_name: hero.name,
            avatar_url: `/debug-avatars/${hero.avatar}`,
            about: pick(hero.lines),
        });
        // Fakes consent to sharing with the whole instance, so debug data exercises every surface.
        save(app, 'social_settings', { user: user.id, visibility: 'instance' });
        for (let post = 0; post < 2; post++) save(app, 'social_posts', { author: user.id, body: pick(hero.lines) });
        for (const other of created.slice(-3))
            tryCreate(app, 'social_follows', { follower: user.id, following: other.id });
        listen(app, user);
        created.push(user);
    }
}

function teardown(app) {
    const ids = new Set(fakeUsers(app).map((user) => user.id));
    for (const conversation of app.findRecordsByFilter(
        'social_conversations',
        `members.email ~ "@${FAKE_DOMAIN}"`,
        '',
        10000,
        0
    )) {
        if (conversation.getString('type') === 'dm') {
            app.delete(conversation);
            continue;
        }
        // Group members are required: strip fakes from real groups first, so a cascade never drops the group.
        const kept = conversation.getStringSlice('members').filter((id) => !ids.has(id));
        if (kept.length) {
            conversation.set('members', kept);
            app.save(conversation);
        } else app.delete(conversation);
    }
    for (const user of fakeUsers(app)) app.delete(user);
}

// Runs when the switch or the count changes; a count change while on re-seeds the roster.
function onConfigSaved(app, record) {
    const before = read(record.original());
    const after = read(record);
    if (before.enabled === after.enabled && (!after.enabled || before.count === after.count)) return;
    teardown(app);
    if (after.enabled) seed(app, after.count);
}

// One minute tick: each fake posts, comments, likes, follows, listens or messages someone, and answers DMs.
function tick(app) {
    const config = app.findRecordsByFilter('app_config', 'id != ""', '', 1, 0)[0];
    if (!config || !config.getBool('debug_fake_users')) return;
    const fakes = fakeUsers(app);
    if (!fakes.length) return;
    const ids = new Set(fakes.map((user) => user.id));
    const everyone = [
        ...ids,
        ...app.findRecordsByFilter('users', `email !~ "@${FAKE_DOMAIN}"`, '', 200, 0).map((user) => user.id),
    ];

    for (const fake of fakes) {
        const lines = heroOf(fake).lines;
        // Anyone who added a fake as a friend, without a DM yet, gets a greeting.
        for (const follow of app.findRecordsByFilter('social_follows', `following = "${fake.id}"`, '', 200, 0)) {
            const follower = follow.getString('follower');
            if (!ids.has(follower) && !dmBetween(app, fake.id, follower)) sendDm(app, fake.id, follower, pick(lines));
        }
        // A DM whose last message came from someone real gets an answer.
        for (const conversation of app.findRecordsByFilter(
            'social_conversations',
            `type = "dm" && members.id ?= "${fake.id}"`,
            '',
            200,
            0
        )) {
            const last = app.findRecordsByFilter(
                'social_messages',
                `conversation = "${conversation.id}"`,
                '-created',
                1,
                0
            )[0];
            if (last && !ids.has(last.getString('sender'))) say(app, conversation, fake.id, pick(lines));
        }
    }

    heartbeat(app, fakes);
    for (const fake of fakes) {
        if (!app.findRecordsByFilter('social_settings', `user = "${fake.id}"`, '', 1, 0).length)
            tryCreate(app, 'social_settings', { user: fake.id, visibility: 'instance' });
        if (Math.random() < 0.08) leaveNote(app, fake);
        if (Math.random() < 0.12) reactToSomething(app, fake);
        if (Math.random() < 0.2) votePolls(app, fake);
    }

    const actions = Math.max(1, Math.round(fakes.length / 4));
    for (let i = 0; i < actions; i++) {
        const fake = pick(fakes);
        const lines = heroOf(fake).lines;
        const target = pick(everyone.filter((id) => id !== fake.id));
        const posts = app.findRecordsByFilter('social_posts', '', '-created', 50, 0);
        const post = pick(posts.length ? posts : [null]);
        switch (pick(['post', 'comment', 'like', 'follow', 'listen', 'dm'])) {
            case 'post':
                save(app, 'social_posts', { author: fake.id, body: pick(lines) });
                break;
            case 'comment':
                if (post) tryCreate(app, 'social_post_comments', { post: post.id, author: fake.id, body: pick(lines) });
                break;
            case 'like':
                if (post) tryCreate(app, 'social_post_likes', { post: post.id, user: fake.id });
                break;
            case 'follow':
                if (target) tryCreate(app, 'social_follows', { follower: fake.id, following: target });
                break;
            case 'listen':
                listen(app, fake);
                break;
            case 'dm':
                if (target) sendDm(app, fake.id, target, pick(lines));
                break;
        }
    }
}

module.exports = { FAKE_DOMAIN, ROSTER, clampCount, onConfigSaved, tick, teardown, seed };
