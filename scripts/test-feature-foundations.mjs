import test from 'node:test';
import assert from 'node:assert/strict';
import { realRandom, smartRandom, rankTracks, cosineSimilarity } from '../js/recommendation-engine.js';
import { summarizeStorage, formatBytes } from '../js/storage-units.js';
import { createKeyboardShortcuts } from '../js/keyboard-shortcuts.js';
import operations from '../pb_hooks/playlist-operations.cjs';

const song = (id, artist) => ({ id, artist: { id: artist, name: artist } });
test('Real Random preserves every occurrence and does not mutate the queue', () => {
    const input = [song('1', 'a'), song('1', 'a'), song('2', 'b')];
    const result = realRandom(input, () => 0);
    assert.deepEqual(
        result.map((t) => t.id),
        ['1', '2', '1']
    );
    assert.deepEqual(
        input.map((t) => t.id),
        ['1', '1', '2']
    );
});
test('Smart Random delays recently heard songs and separates artists when possible', () => {
    const tracks = [song('old', 'a'), song('fresh-a', 'a'), song('fresh-b', 'b'), song('fresh-c', 'c')];
    const result = smartRandom(tracks, {
        random: () => 0,
        now: 1000,
        currentTrack: song('current', 'a'),
        profile: { recent: [{ id: 'old', at: 999 }] },
    });
    assert.equal(result[0].id, 'fresh-b');
    assert.equal(result.at(-1).id, 'old');
    assert.equal(new Set(result.map((t) => t.id)).size, tracks.length);
});
test('ranking uses seed proximity, exclusions and available embeddings', () => {
    const seed = song('seed', 'a');
    const near = song('near', 'a');
    const far = song('far', 'b');
    assert.equal(rankTracks([far, near, seed], { seeds: [seed], excludeIds: ['seed'], exploration: 0 })[0].id, 'near');
    const embeddings = new Map([
        ['seed', [{ model: 'mert', version: '1', vector: [1, 0] }]],
        ['far', [{ model: 'mert', version: '1', vector: [1, 0] }]],
    ]);
    assert.equal(rankTracks([near, far], { seeds: [seed], embeddings, exploration: 0 })[0].id, 'far');
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});
test('upload totals retain unknown sizes rather than silently treating them as measured zero', () => {
    assert.deepEqual(summarizeStorage([{ audioSize: 1000 }, {}, { fileSize: 2500 }]), {
        count: 3,
        bytes: 3500,
        unknown: 1,
    });
    assert.equal(formatBytes(null), 'Size unavailable');
    assert.equal(formatBytes(1e12), '1 TB');
});
test('shortcut conflicts require explicit replacement and reserved keys stay protected', () => {
    const values = new Map();
    const registry = createKeyboardShortcuts(
        {
            getItem: (key) => values.get(key),
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key),
        },
        () => {}
    );
    assert.equal(registry.setShortcut('mute', { key: 'q' }).ok, false);
    assert.equal(registry.setShortcut('mute', { key: 'q' }, { replaceConflicts: true }).ok, true);
    assert.equal(registry.getShortcutForAction('queue').key, null);
    assert.equal(registry.setShortcut('mute', { key: 'tab' }).ok, false);
    assert.equal(registry.resetShortcuts().ok, true);
    assert.equal(registry.getShortcutForAction('queue').key, 'q');
});
test('playlist operations preserve distinct media types and reject stale/incomplete reorder', () => {
    const initial = [song('1', 'a'), { ...song('1', 'a'), type: 'video' }];
    const added = operations.applyTrackOperation(
        initial,
        { type: 'add', tracks: [song('1', 'a'), song('2', 'b')] },
        100
    );
    assert.equal(added.length, 3);
    assert.throws(() => operations.applyTrackOperation(added, { type: 'reorder', order: ['track:1', 'track:2'] }));
    const reordered = operations.applyTrackOperation(added, {
        type: 'reorder',
        order: ['track:2', 'video:1', 'track:1'],
    });
    assert.deepEqual(reordered.map(operations.key), ['track:2', 'video:1', 'track:1']);
    assert.equal(initial.length, 2);
});
