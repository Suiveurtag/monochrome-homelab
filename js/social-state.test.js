import { describe, expect, test } from 'vitest';
import { isMutualFriend, reconcileSentMessage, splitFeedPosts } from './social-state.js';

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

    test('splits the feed without rendering the same post twice', () => {
        const followed = { id: 'a', author: 'friend' };
        const instance = { id: 'b', author: 'member' };

        expect(splitFeedPosts([followed, instance], new Set(['friend']))).toEqual({
            circle: [followed],
            instance: [instance],
        });
    });
});
