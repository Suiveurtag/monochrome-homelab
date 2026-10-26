import { beforeEach, describe, expect, test } from 'vitest';
import { recordRecent } from './sidebar.js';

const KEY = 'monochrome-sidebar-recents';
const recents = () => JSON.parse(localStorage.getItem(KEY));
const album = (id) => ({ kind: 'album', id, label: `Album ${id}`, href: `/album/${id}` });

beforeEach(() => localStorage.removeItem(KEY));

describe('Sidebar Recents', () => {
    test('moves a replayed source to the top without duplicating it', () => {
        expect(recordRecent(album('a'), null)).toBe(true);
        expect(recordRecent(album('b'), null)).toBe(true);
        expect(recordRecent(album('b'), null)).toBe(false);
        recordRecent(album('a'), null);
        expect(recents().map((entry) => entry.key)).toEqual(['album:a', 'album:b']);
    });

    test('ignores sources the sidebar cannot link to', () => {
        expect(recordRecent({ kind: 'radio', id: null, label: 'Radio', href: null }, null)).toBe(false);
        expect(recordRecent({ kind: 'single', id: null, label: 'Search', href: null }, null)).toBe(false);
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    test('falls back to the playing track artwork and keeps 30 entries', () => {
        recordRecent(album('x'), { album: { cover: 'cover-x' } });
        recordRecent({ kind: 'artist', id: '7', label: 'Artist', href: '/artist/7' }, {
            album: { cover: 'not-an-artist-picture' },
            artists: [{ id: 7, picture: 'pic-7' }],
        });
        expect(recents().map((entry) => entry.cover)).toEqual(['pic-7', 'cover-x']);

        for (let i = 0; i < 40; i++) recordRecent(album(String(i)), null);
        expect(recents()).toHaveLength(30);
        expect(recents()[0].key).toBe('album:39');
    });
});
