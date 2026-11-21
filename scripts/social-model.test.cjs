// Run with: node --test scripts/social-model.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../pb_hooks/social-model.cjs');

function ctx({ visibility = {}, follows = [], blocks = [] } = {}) {
    return {
        visibility: new Map(Object.entries(visibility)),
        follows: new Set(follows),
        blocks: new Set(blocks),
    };
}

test('listening visibility follows the owner choice and defaults to private', () => {
    const c = ctx({ visibility: { a: 'instance', b: 'friends' }, follows: ['b>v', 'v>b'] });
    assert.equal(model.canSeeListening(c, 'v', 'a'), true);
    assert.equal(model.canSeeListening(c, 'v', 'b'), true);
    assert.equal(model.canSeeListening(c, 'x', 'b'), false, 'friends-only hides from non-friends');
    assert.equal(model.canSeeListening(c, 'v', 'unset'), false, 'no choice means private');
    assert.equal(model.canSeeListening(c, 'unset', 'unset'), true, 'you always see yourself');
});

test('one-way follows are not friendship, and blocks hide everything both ways', () => {
    const c = ctx({ visibility: { b: 'friends', a: 'instance' }, follows: ['v>b'], blocks: ['a>v'] });
    assert.equal(model.canSeeListening(c, 'v', 'b'), false);
    assert.equal(model.relation(c, 'v', 'b'), 'requested');
    assert.equal(model.relation(c, 'b', 'v'), 'follows-you');
    assert.equal(model.canSeeListening(c, 'v', 'a'), false);
    assert.equal(model.canSeeContent(c, 'v', 'a', 'instance'), false);
});

test('rooms group the same track, then album, then artist, biggest first', () => {
    const t = (id, album, artist) => ({ id, title: id, album: { id: album }, artists: [{ name: artist }] });
    const rooms = model.groupRooms([
        { user: 'a', started: 1, track: t('t1', 'al1', 'X') },
        { user: 'b', started: 2, track: t('t1', 'al1', 'X') },
        { user: 'c', started: 3, track: t('t2', 'al2', 'Y') },
        { user: 'd', started: 4, track: t('t3', 'al2', 'Y') },
        { user: 'e', started: 5, track: t('t4', 'al3', 'Z') },
    ]);
    assert.deepEqual(
        rooms.map((r) => [r.kind, r.listeners.map((l) => l.user).join('')]),
        [
            ['track', 'ab'],
            ['album', 'cd'],
            ['solo', 'e'],
        ]
    );
});

test('plays split into sessions at a 30 minute pause and keep a dominant album', () => {
    const play = (id, started, album = 'al') => ({ id, user: 'u', started, last: started + 180000, track: { id, title: id, album: { id: album, title: 'A' } } });
    const clusters = model.clusterSessions([play('1', 0), play('2', 200000), play('3', 400000), play('4', 400000 + 60 * 60000, 'other')]);
    assert.equal(clusters.length, 2);
    assert.equal(clusters[1].count, 3);
    assert.equal(clusters[1].album.id, 'al');
    assert.equal(clusters[0].album, null);
});

test('taste match is deterministic and honest about thin data', () => {
    const profile = (entries) => new Map(entries.map(([id, artist, plays]) => [id, { plays, artist, title: id }]));
    const a = profile([['1', 'X', 5], ['2', 'Y', 4], ['3', 'Z', 3]]);
    const b = profile([['1', 'X', 6], ['2', 'Y', 2], ['4', 'W', 4]]);
    const result = model.compatibility(a, b);
    assert.ok(result.score > 0 && result.score < 100);
    assert.deepEqual(model.compatibility(a, b), result);
    assert.deepEqual(result.artists.sort(), ['X', 'Y']);
    assert.equal(model.compatibility(a, profile([['1', 'X', 2]])), null);
    assert.equal(model.compatibility(a, a).score, 100);
});

test('community chart needs several members and repeated tracks', () => {
    const row = (user, id, plays) => ({ user, plays, track: { id, title: id, artists: [{ name: id.toUpperCase() }] } });
    assert.equal(model.communityChart([row('a', 't1', 9), row('a', 't2', 9), row('a', 't3', 9)]), null);
    const chart = model.communityChart([row('a', 't1', 3), row('b', 't1', 1), row('a', 't2', 2), row('b', 't3', 5), row('b', 't4', 1)]);
    assert.equal(chart.tracks[0].track.id, 't1');
    assert.equal(chart.tracks.length, 3, 'single plays never pad the chart');
});

test('reactions accept emoji only', () => {
    for (const ok of ['🔥', '❤️', '👍🏽', '🇫🇷', '1️⃣', '🧑‍🎤']) assert.equal(model.cleanEmoji(ok), ok);
    for (const bad of ['', 'a', 'hello', '<b>', '🔥x', '1']) assert.equal(model.cleanEmoji(bad), '');
});
