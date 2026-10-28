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

function listen(app, user) {
    const track = app.findRecordsByFilter('music_tracks', '', '@random', 1, 0)[0];
    if (!track) return;
    const data = {
        user: user.id,
        track: {
            id: track.id,
            type: 'track',
            title: track.getString('title'),
            subtitle: track.getString('artist'),
            image: '',
            href: `/track/${track.id}`,
        },
        is_playing: true,
        position: Math.floor(Math.random() * 180),
        last_seen: new Date().toISOString(),
    };
    const existing = app.findRecordsByFilter('social_presence', `user = "${user.id}"`, '', 1, 0)[0];
    const record = existing || new Record(app.findCollectionByNameOrId('social_presence'));
    record.load(data);
    app.save(record);
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
