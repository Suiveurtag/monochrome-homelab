import { describe, expect, test, vi } from 'vitest';
import { buildNowPlayingPanelModel, normalizeSourceContext } from './now-playing-panel-model.js';

function player(queue, currentQueueIndex = 0) {
    return { currentQueueIndex, getCurrentQueue: () => queue };
}

describe('Now Playing panel model', () => {
    test('normalizes playback context without deriving it from the current page', () => {
        expect(normalizeSourceContext({ kind: 'album', id: 12, label: 'In Rainbows', href: '/album/12' })).toEqual({
            kind: 'album',
            id: '12',
            label: 'In Rainbows',
            href: '/album/12',
        });
        expect(normalizeSourceContext({ kind: 'invalid' })).toEqual({
            kind: 'unknown',
            id: null,
            label: 'Now playing',
            href: null,
        });
    });

    test('omits album title, formats release year, and selects exactly the next queue item', async () => {
        const track = {
            id: 'one',
            title: 'Nude',
            explicit: true,
            artists: [{ id: 'artist', name: 'Radiohead' }],
            album: { title: 'In Rainbows', cover: 'cover-id', releaseDate: '2007-10-10' },
        };
        const next = { id: 'two', title: 'Weird Fishes' };
        const model = await buildNowPlayingPanelModel({
            track,
            player: player([track, next]),
            api: { getCoverUrl: (id) => `/cover/${id}`, getArtist: vi.fn(async () => ({ ...track.artists[0] })) },
            sourceContext: { kind: 'album', id: 'album', label: 'In Rainbows', href: '/album/album' },
        });
        expect(model.title).toBe('Nude');
        expect(model).not.toHaveProperty('albumName');
        expect(model.releaseYear).toBe('2007');
        expect(model.nextTrack).toBe(next);
        expect(model.artwork.staticSrc).toBe('/cover/cover-id');
    });

    test('keeps the main track cover when an albumless alternative is playing', async () => {
        const track = {
            id: 'instrumental',
            title: 'Afterglow (Instrumental)',
            cover: '/instrumental.jpg',
            artist: { name: 'Artist' },
            album: null,
            hideFromArtistPage: true,
            versionGroupId: 'versions:main',
            versionMainTrackId: 'main',
            versionMainAlbum: { id: 'album', title: 'Afterglow', cover: '/main.jpg' },
        };

        const model = await buildNowPlayingPanelModel({ track, player: player([track]), api: {} });

        expect(model.artwork.staticSrc).toBe('/main.jpg');
    });

    test('normalizes optional credits, related videos, and tour dates without placeholders', async () => {
        const track = {
            id: 'one',
            title: 'Track',
            composer: 'Writer One; Writer Two',
            artists: [{ id: 'artist', name: 'Artist' }],
            album: { cover: '/cover.jpg' },
        };
        const model = await buildNowPlayingPanelModel({
            track,
            player: player([track]),
            api: {
                getArtist: vi.fn(async () => ({
                    id: 'artist',
                    name: 'Artist',
                    monthlyListeners: 1234,
                    relatedVideos: [{ title: 'Live', href: 'https://example.com/live' }],
                    tourDates: [{ date: '2027-06-01', city: 'Paris', venue: 'Olympia' }],
                })),
            },
        });
        expect(model.credits.map((credit) => credit.name)).toEqual(['Artist', 'Writer One', 'Writer Two']);
        expect(model.relatedVideos).toHaveLength(1);
        expect(model.tourDates).toHaveLength(1);
        expect(model.nextTrack).toBeNull();
    });

    test('accepts imported role-keyed credit formats', async () => {
        const track = {
            id: 'credit-formats',
            title: 'Track',
            credits: { Producer: ['Producer One'], Composer: { name: 'Composer One' } },
            artist: { name: 'Artist' },
        };
        const model = await buildNowPlayingPanelModel({ track, player: player([track]), api: {} });
        expect(model.credits).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Producer One', role: 'Producer' }),
                expect.objectContaining({ name: 'Composer One', role: 'Composer' }),
            ])
        );
    });

    test('uses a static poster for Kawarp while retaining HLS artwork for the hero', async () => {
        const track = {
            id: 'video',
            title: 'Animated',
            videoCoverUrl: '/artwork/animated.m3u8',
            artist: { name: 'Artist' },
            album: { cover: 'poster' },
        };
        const model = await buildNowPlayingPanelModel({
            track,
            player: player([track]),
            api: { getCoverUrl: (id) => `/cover/${id}` },
        });
        expect(model.artwork.staticSrc).toBe('/cover/poster');
        expect(model.artwork.animatedSrc).toBe('/artwork/animated.m3u8');
        expect(model.artwork.isVideo).toBe(true);
    });

    test('never sends an animated cover to Kawarp and prefers its static fallback', async () => {
        const track = {
            id: 'video-with-fallback',
            title: 'Animated',
            artist: { name: 'Artist' },
            album: { cover: '/artwork/animated.mp4', coverFallback: '/artwork/poster.jpg' },
        };
        const model = await buildNowPlayingPanelModel({ track, player: player([track]), api: {} });

        expect(model.artwork.animatedSrc).toBe('/artwork/animated.mp4');
        expect(model.artwork.staticSrc).toBe('/artwork/poster.jpg');
        expect(model.artwork.isVideo).toBe(true);
    });

    test('uses the app artwork as a neutral fallback when an MP4 has no poster', async () => {
        const track = {
            id: 'video-only',
            title: 'Animated',
            artist: { name: 'Artist' },
            album: { cover: '/artwork/animated.mp4' },
        };
        const model = await buildNowPlayingPanelModel({ track, player: player([track]), api: {} });

        expect(model.artwork.animatedSrc).toBe('/artwork/animated.mp4');
        expect(model.artwork.staticSrc).toBe('/assets/appicon.png');
    });

    test('rejects stale async artist work when the caller aborts', async () => {
        const controller = new AbortController();
        const promise = buildNowPlayingPanelModel({
            track: { id: 'one', title: 'Track', artist: { id: 'artist', name: 'Artist' } },
            player: player([]),
            api: {
                getArtist: async () => {
                    controller.abort();
                    return { id: 'artist', name: 'Artist' };
                },
            },
            signal: controller.signal,
        });
        await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    });

    test('loads and normalizes the existing biography fallback when artist details omit it', async () => {
        const track = {
            id: 'bio-track',
            title: 'Track',
            artist: { id: 'artist', name: 'Artist' },
        };
        const getArtistBiography = vi.fn(async () => ({ text: '<b>Artist</b> biography from the provider.' }));
        const model = await buildNowPlayingPanelModel({
            track,
            player: player([track]),
            api: {
                getArtist: vi.fn(async () => ({ id: 'artist', name: 'Artist' })),
                getArtistBiography,
            },
        });
        expect(getArtistBiography).toHaveBeenCalledWith('artist');
        expect(model.artist.biography).toBe('Artist biography from the provider.');
    });
});
