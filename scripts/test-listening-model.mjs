import test from 'node:test';
import assert from 'node:assert/strict';
import { ListeningTracker } from '../js/listening-tracker.js';
import model from '../pb_hooks/listening-model.cjs';
const { windowFor, aggregate } = model;
const track = { id: 'song', title: 'Song', artists: [{ id: 'a', name: 'Artist' }], album: { id: 'b', title: 'Album' } };
const session = (at, seconds, slices = [{ at: Math.floor(at / 60000) * 60000, seconds }]) => ({
    track,
    sessionId: String(at),
    startedAt: at,
    seconds,
    slices,
    ended: true,
});
test('30-second streams exclude short plays and retain every repeated session', () => {
    const at = +new Date('2026-10-12T12:00:00Z');
    const d = aggregate(
        [session(at, 29), session(at, 30), session(at + 60000, 60)],
        windowFor('week', '2026-10-12', 0, at)
    );
    assert.equal(d.summary.streams, 2);
    assert.equal(d.summary.seconds, 90);
    assert.equal(d.top.tracks[0].streams, 2);
    assert.equal(d.history.length, 2);
    assert.equal(d.activity.length, 7);
    assert.equal(d.summary.artists, 1);
    assert.equal(d.summary.albums, 1);
});
test('midnight slices attribute minutes to both days without duplicating a stream', () => {
    const at = +new Date('2026-10-12T21:59:40Z');
    const rows = [
        session(at, 60, [
            { at: at - 40000, seconds: 20 },
            { at: at + 20000, seconds: 40 },
        ]),
    ];
    const a = aggregate(rows, windowFor('day', '2026-10-12', 120, at));
    const b = aggregate(rows, windowFor('day', '2026-10-13', 120, at + 60000));
    assert.equal(a.summary.streams, 1);
    assert.equal(a.summary.seconds, 20);
    assert.equal(b.summary.streams, 0);
    assert.equal(b.summary.seconds, 40);
    assert.equal(b.top.tracks[0].seconds, 40);
});
test('calendar windows handle year rollover, leap months and negative offsets', () => {
    const now = +new Date('2026-10-13T12:00:00Z');
    const week = windowFor('week', '2026-01-01', 60, now);
    assert.equal(new Date(week.start).toISOString(), '2025-12-28T23:00:00.000Z');
    const month = windowFor('month', '2024-02-20', -300, now);
    assert.equal((month.end - month.start) / 86400000, 29);
    assert.throws(() => windowFor('banana', '2026-10-13'));
    assert.throws(() => windowFor('day', '2026-02-30'));
});
test('streaks and previous period comparison remain period-scoped', () => {
    const dates = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-15'];
    const now = +new Date('2026-10-18T12:00:00Z');
    const d = aggregate(
        dates.map((day) => session(+new Date(`${day}T12:00:00Z`), 60)),
        windowFor('week', '2026-10-12', 0, now)
    );
    assert.equal(d.summary.longestStreak, 2);
    assert.equal(d.summary.activeDays, 3);
    assert.equal(d.summary.previousStreams, 1);
    assert.equal(d.summary.previousSeconds, 60);
});
test('tracker real wall-time threshold and final checkpoint identity', () => {
    const values = new Map();
    globalThis.localStorage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
    const original = Date.now;
    let clock = 100000;
    Date.now = () => clock;
    try {
        const tracker = new ListeningTracker();
        const sent = [];
        tracker.setSessionSink((payload) => sent.push(payload));
        tracker.onTrackStart(track);
        for (let i = 1; i <= 29; i++) {
            clock += 1000;
            tracker.onTimeUpdate(i, 100);
        }
        assert.equal(tracker.getTrackSignal('song')?.playCount || 0, 0);
        clock += 1000;
        tracker.onTimeUpdate(30, 100);
        assert.equal(tracker.getTrackSignal('song').playCount, 1);
        tracker.onSkip();
        tracker.forceFlush();
        assert.equal(tracker.getTrackSignal('song').playCount, 1);
        assert.equal(new Set(sent.map((s) => s.sessionId)).size, 1);
        assert.equal(sent.at(-1).ended, true);
    } finally {
        Date.now = original;
        delete globalThis.localStorage;
    }
});

test('DST changes preserve local calendar boundaries and local hours', () => {
    const transitions = [
        { at: Date.UTC(2026, 0, 1), offset: 60 },
        { at: Date.UTC(2026, 2, 29, 1), offset: 120 },
    ];
    const now = Date.UTC(2026, 3, 1);
    const range = windowFor('day', '2026-03-29', 120, now, transitions);
    assert.equal((range.end - range.start) / 3600000, 23);
    const rows = [session(Date.UTC(2026, 2, 29, 0, 30), 30), session(Date.UTC(2026, 2, 29, 1, 30), 30)];
    const d = aggregate(rows, range, now);
    assert.equal(d.hours[1], 30);
    assert.equal(d.hours[3], 30);
    assert.equal(d.hours[2], 0);
});

test('offline outbox preserves concurrent tabs and a newer in-flight checkpoint', async () => {
    const { ListeningOutbox } = await import('../js/listening-outbox.js');
    const values = new Map();
    const storage = {
        get length() {
            return values.size;
        },
        key: (i) => [...values.keys()][i],
        getItem: (k) => values.get(k) ?? null,
        setItem: (k, v) => values.set(k, v),
        removeItem: (k) => values.delete(k),
    };
    const a = new ListeningOutbox(storage),
        b = new ListeningOutbox(storage);
    const payload = { sessionId: 'a', startedAt: Date.now(), lastAt: Date.now(), seconds: 30, ended: false };
    a.enqueue('alice', payload);
    b.enqueue('alice', { ...payload, sessionId: 'b' });
    const id = a.key('alice', 'a'),
        old = a.entries.get(id);
    a.enqueue('alice', { ...payload, seconds: 45, ended: true });
    a.acknowledge(id, old);
    assert.equal(values.size, 2);
    const recovered = new ListeningOutbox(storage);
    recovered.restore('bob');
    assert.equal(recovered.entries.size, 0);
    recovered.restore('alice');
    assert.equal(recovered.entries.size, 2);
    assert.equal(recovered.entries.get(id).payload.seconds, 45);
    recovered.acknowledge(id, recovered.entries.get(id));
    b.restore('alice');
    assert.equal(b.entries.size, 1);
});
