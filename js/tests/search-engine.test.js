import { describe, expect, test } from 'vitest';
import {
    buildSearchIndex,
    editDistance,
    highlightRanges,
    lyricsToLines,
    normalizeSearchText,
    parseSearchQuery,
    popularTracks,
    searchLibrary,
} from '../search-engine.js';

const artist = (name) => ({ id: `artist-${name}`, name });
const track = (id, title, artistName, { album = title, date = null, ...extra } = {}) => ({
    id,
    title,
    artist: artist(artistName),
    artists: [artist(artistName)],
    album: { id: `album-${album}`, title: album, releaseDate: date },
    ...extra,
});

const tracks = [
    track('t1', 'Boy’s a liar', 'PinkPantheress', { album: 'Heaven knows', date: '2023-11-10' }),
    track('t2', 'Blinding Lights', 'The Weeknd', { album: 'After Hours', date: '2020-03-20' }),
    track('t3', 'Save Your Tears', 'The Weeknd', { album: 'After Hours', date: '2020-03-20' }),
    track('t4', 'Café de Flore', 'Doctor L', {
        lyrics: '[00:01.00]Under the paris rain\n[00:05.00]we drink our coffee slowly',
    }),
    track('t5', 'Blinding Lights (Remix) (feat. Rosalía)', 'The Weeknd', { versionGroupId: 'g1' }),
    track('t6', 'Lights Out', 'Some Band', {}),
];
const albums = [
    { id: 'album-Heaven knows', title: 'Heaven knows', artist: artist('PinkPantheress'), releaseDate: '2023' },
    { id: 'album-After Hours', title: 'After Hours', artist: artist('The Weeknd'), releaseDate: '2020' },
];
const artists = [artist('PinkPantheress'), artist('The Weeknd'), artist('Doctor L'), artist('Some Band')];
const index = buildSearchIndex({ tracks, albums, artists, playlists: [{ uuid: 'p1', title: 'Late night' }] });
const ids = (list) => list.map((r) => r.item.id);

describe('normalizeSearchText', () => {
    test('folds accents, case, apostrophes and symbols', () => {
        expect(normalizeSearchText('Café  DE Flore!')).toBe('cafe de flore');
        expect(normalizeSearchText('Boy’s a liar')).toBe('boys a liar');
        expect(normalizeSearchText('Simon & Garfunkel')).toBe('simon and garfunkel');
        expect(normalizeSearchText('Ke$ha')).toBe('kesha');
    });
});

describe('editDistance', () => {
    test('counts edits and transpositions, bails past the max', () => {
        expect(editDistance('weeknd', 'weekend', 2)).toBe(1);
        expect(editDistance('lgihts', 'lights', 2)).toBe(1);
        expect(editDistance('abc', 'xyzuvw', 2)).toBe(3);
    });
});

describe('searchLibrary', () => {
    test('ignores spacing differences in artist names', () => {
        const result = searchLibrary(index, 'Pink Pantheress');
        expect(result.artists[0].item.name).toBe('PinkPantheress');
        expect(ids(result.tracks)).toContain('t1');
    });

    test('tolerates typos', () => {
        expect(searchLibrary(index, 'blindng lihgts').tracks[0].item.id).toMatch(/t2|t5/);
        expect(searchLibrary(index, 'the weekend').artists[0].item.name).toBe('The Weeknd');
    });

    test('matches accents and apostrophes loosely', () => {
        expect(ids(searchLibrary(index, 'cafe de flore').tracks)).toEqual(['t4']);
        expect(ids(searchLibrary(index, 'boys a liar').tracks)[0]).toBe('t1');
    });

    test('finds words spread across title and artist', () => {
        expect(ids(searchLibrary(index, 'save tears weeknd').tracks)[0]).toBe('t3');
    });

    test('finds a track by its lyrics and reports the line', () => {
        const [hit] = searchLibrary(index, 'paris rain').tracks;
        expect(hit.item.id).toBe('t4');
        expect(hit.field).toBe('lyrics');
        expect(hit.lyric).toBe('Under the paris rain');
    });

    test('matches featured artists named in the title', () => {
        expect(ids(searchLibrary(index, 'rosalia').tracks)).toEqual(['t5']);
    });

    test('supports field filters, years, phrases and exclusions', () => {
        expect(ids(searchLibrary(index, 'lights artist:weeknd').tracks).sort()).toEqual(['t2', 't5']);
        expect(ids(searchLibrary(index, 'year:2023').tracks)).toEqual(['t1']);
        expect(ids(searchLibrary(index, 'lyrics:"coffee slowly"').tracks)).toEqual(['t4']);
        expect(ids(searchLibrary(index, 'blinding lights -remix').tracks)).toEqual(['t2']);
        expect(ids(searchLibrary(index, 'lights -artist:weeknd').tracks)).toEqual(['t6']);
        expect(searchLibrary(index, 'album:"after hours"').albums.map((r) => r.item.id)).toEqual(['album-After Hours']);
    });

    test('lifts the most streamed match among similar ones', () => {
        const streams = (id) => ({ t6: 500, t2: 1 })[id] || 0;
        const plain = ids(searchLibrary(index, 'lights').tracks);
        const ranked = ids(searchLibrary(index, 'lights', { streams }).tracks);
        expect(ranked.indexOf('t6')).toBeLessThanOrEqual(plain.indexOf('t6'));
        expect(ranked[0]).toBe('t6');
    });

    test('returns nothing for unrelated text', () => {
        const result = searchLibrary(index, 'zzzqqq');
        expect(result.tracks).toHaveLength(0);
        expect(result.artists).toHaveLength(0);
    });
});

describe('parseSearchQuery', () => {
    test('separates free text from operators', () => {
        const parsed = parseSearchQuery('night artist:"the weeknd" -live year:2020');
        expect(parsed.text.norm).toBe('night');
        expect(parsed.filters.artist[0].norm).toBe('the weeknd');
        expect(parsed.excludes).toEqual(['live']);
        expect(parsed.years).toEqual(['2020']);
    });

    test('keeps hyphenated words and unknown prefixes as text', () => {
        expect(parseSearchQuery('jay-z re:zero').text.norm).toBe('jay z re zero');
    });
});

describe('helpers', () => {
    test('lyricsToLines strips LRC stamps and TTML tags', () => {
        expect(lyricsToLines('[ar:X]\n[00:01.00]Hello <00:01.50>world')).toEqual(['Hello world']);
        expect(lyricsToLines('<tt><body><p begin="1">One &amp; two</p><p>Three</p></body></tt>')).toEqual([
            'One & two',
            'Three',
        ]);
    });

    test('highlightRanges marks word prefixes ignoring accents', () => {
        expect(highlightRanges('Café de Flore', 'cafe fl')).toEqual([
            [0, 4],
            [8, 10],
        ]);
    });

    test('popularTracks keeps one track per version group', () => {
        const streams = (id) => ({ t2: 3, t5: 9, t1: 4 })[id] || 0;
        const versioned = buildSearchIndex({
            tracks: tracks.map((t) => (t.id === 't2' ? { ...t, versionGroupId: 'g1' } : t)),
        });
        expect(popularTracks(versioned, streams, 5).map((r) => r.item.id)).toEqual(['t5', 't1']);
    });
});
