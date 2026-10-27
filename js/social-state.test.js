import { describe, expect, test } from 'vitest';
import { isMutualFriend, rankBooth, reconcileSentMessage, splitFeedPosts } from './social-state.js';
import { patchKeyed } from './social-dom.js';

describe('social state helpers', () => {
    test('requires both follow directions before two people are friends', () => {
        const following = new Set(['mutual', 'outgoing']);
        const followers = new Set(['mutual', 'incoming']);

        expect(isMutualFriend(following, followers, 'mutual')).toBe(true);
        expect(isMutualFriend(following, followers, 'outgoing')).toBe(false);
        expect(isMutualFriend(following, followers, 'incoming')).toBe(false);
    });

    test('removes the optimistic copy when realtime arrives before create resolves', () => {
        const temp = { id: 'tmp-1', body: 'hello', created: '2026-08-25T10:00:00Z' };
        const saved = { id: 'saved-1', body: 'hello', created: '2026-08-25T10:00:01Z' };
        const messages = [temp, saved];

        reconcileSentMessage(messages, temp.id, saved);

        expect(messages).toEqual([saved]);
    });

    test('ranks the booth live first and pushes old or silent listeners to the edge', () => {
        const now = Date.parse('2026-10-27T12:00:00Z');
        const track = { id: 't' };
        const ranked = rankBooth(
            [
                { user: 'silent', track: null, lastSeen: now },
                { user: 'stale', track, lastSeen: now - 40 * 86_400_000 },
                { user: 'yesterday', track, lastSeen: now - 86_400_000 },
                { user: 'live', track, playing: true, online: true, lastSeen: now },
                { user: 'hour', track, lastSeen: now - 3_600_000 },
            ],
            now
        );

        expect(ranked.map((member) => member.user)).toEqual(['live', 'hour', 'yesterday', 'silent', 'stale']);
        expect(ranked[0].depth).toBe(0);
        expect(ranked[1].depth).toBeLessThan(ranked[2].depth);
        expect(ranked.at(-1).depth).toBe(1);
    });

    test('keyed patching keeps unchanged nodes and swaps changed ones', () => {
        const list = document.createElement('div');
        patchKeyed(list, [
            { key: 'a', html: '<p>a</p>' },
            { key: 'b', html: '<p>b</p>' },
        ]);
        const keptA = list.children[0];
        const oldB = list.children[1];

        patchKeyed(list, [
            { key: 'c', html: '<p>c</p>' },
            { key: 'a', html: '<p>a</p>' },
            { key: 'b', html: '<p>b2</p>' },
        ]);

        expect([...list.children].map((node) => node.textContent)).toEqual(['c', 'a', 'b2']);
        expect(list.children[1]).toBe(keptA);
        expect(list.children[2]).not.toBe(oldB);
    });

    test('splits the feed without rendering the same post twice', () => {
        const followed = { id: 'a', author: 'friend' };
        const instance = { id: 'b', author: 'member' };

        expect(splitFeedPosts([followed, instance], new Set(['friend']))).toEqual({
            circle: [followed],
            instance: [instance],
        });
    });
});
