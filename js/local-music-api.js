// js/local-music-api.js
import { db } from './db.js';
import { getSelfHostedStream, listSelfHostedTracks } from './selfhost-server-api.js';

const FALLBACK_COVER = '/assets/appicon.png';

function hashString(value) {
    let hash = 0;
    const input = String(value || 'unknown');
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function getArtistName(track) {
    return track?.artist?.name || track?.artists?.[0]?.name || 'Unknown Artist';
}

function getAlbumTitle(track) {
    return track?.album?.title || 'Unknown Album';
}

function mergeById(primary, secondary) {
    const seen = new Set();
    const result = [];
    for (const item of [...primary, ...secondary]) {
        if (!item) continue;
        const key = String(item.id || getLocalTrackKey(item));
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }
    return result;
}

function getLocalTrackKey(track) {
    return [
        normalizeText(track?.title),
        normalizeText(getArtistName(track)),
        normalizeText(getAlbumTitle(track)),
        track?.duration ? Math.round(track.duration) : '',
    ].join('|');
}

function uniqueBy(items, keyFn) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const key = keyFn(item);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }
    return result;
}

function shuffle(items) {
    return [...items].sort(() => Math.random() - 0.5);
}

export class LocalMusicAPI {
    constructor(settings) {
        this.settings = settings;
    }

    async ensureLocalCache() {
        if (Array.isArray(window.localFilesCache)) return;
        if (typeof window.refreshLocalMediaFolder === 'function') {
            await window.refreshLocalMediaFolder();
        }
    }

    normalizeTrack(track) {
        if (!track) return null;

        const artistName = getArtistName(track);
        const albumTitle = getAlbumTitle(track);
        const artistId = track.artist?.id || `local-artist-${hashString(artistName)}`;
        const albumId = track.album?.id || `local-album-${hashString(`${artistName}|${albumTitle}`)}`;
        const id = track.id || `local-track-${hashString(getLocalTrackKey(track))}`;
        const artist = { ...(track.artist || {}), id: artistId, name: artistName, picture: track.album?.cover };
        const artists = (track.artists?.length ? track.artists : [artist]).map((a) => ({
            ...a,
            id: a.id || `local-artist-${hashString(a.name || artistName)}`,
            name: a.name || artistName,
            picture: a.picture || track.album?.cover,
        }));

        return {
            ...track,
            id,
            type: 'track',
            isLocal: true,
            title: track.title || 'Unknown Title',
            duration: track.duration || 0,
            artist,
            artists,
            album: {
                ...(track.album || {}),
                id: albumId,
                title: albumTitle,
                cover: track.album?.cover || FALLBACK_COVER,
                artist: track.album?.artist || artist,
                numberOfTracks: track.album?.numberOfTracks || null,
            },
            mediaMetadata: track.mediaMetadata || { tags: ['Local'] },
        };
    }

    normalizeAlbum(album, tracks = []) {
        const firstTrack = tracks[0];
        const artist = album?.artist || firstTrack?.album?.artist || firstTrack?.artist || { name: 'Unknown Artist' };
        const title = album?.title || firstTrack?.album?.title || 'Unknown Album';
        const id = album?.id || firstTrack?.album?.id || `local-album-${hashString(`${artist.name}|${title}`)}`;

        return {
            ...(album || {}),
            id,
            title,
            type: 'ALBUM',
            artist: {
                ...artist,
                id: artist.id || `local-artist-${hashString(artist.name)}`,
                name: artist.name || 'Unknown Artist',
            },
            artists: album?.artists || [artist],
            cover: album?.cover || firstTrack?.album?.cover || FALLBACK_COVER,
            releaseDate: album?.releaseDate || firstTrack?.album?.releaseDate || null,
            numberOfTracks: tracks.length || album?.numberOfTracks || 0,
            duration: tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
            isLocal: true,
        };
    }

    normalizeArtist(artist, tracks = []) {
        const name = artist?.name || getArtistName(tracks[0]) || 'Unknown Artist';
        return {
            ...(artist || {}),
            id: artist?.id || `local-artist-${hashString(name)}`,
            name,
            picture: artist?.picture || tracks.find((track) => track.album?.cover)?.album?.cover || FALLBACK_COVER,
            popularity: Math.min(100, Math.max(1, tracks.length * 5)),
            artistRoles: [{ category: 'Local library' }],
            isLocal: true,
        };
    }

    async getTracks() {
        await this.ensureLocalCache();
        const [serverTracks, uploadedTracks] = await Promise.all([
            listSelfHostedTracks().catch((error) => {
                console.warn('[SelfHost] Could not load server library:', error);
                return [];
            }),
            db.getUploadedTracks().catch(() => []),
        ]);
        const localFiles = Array.isArray(window.localFilesCache) ? window.localFilesCache : [];
        return uniqueBy(
            mergeById(serverTracks, mergeById(uploadedTracks, localFiles)).map((track) => this.normalizeTrack(track)).filter(Boolean),
            (track) => track.id || getLocalTrackKey(track)
        );
    }

    async getAlbums() {
        const tracks = await this.getTracks();
        const customAlbums = await db.getLocalAlbums().catch(() => []);
        const grouped = new Map();
        for (const track of tracks) {
            const key = track.album?.id || `local-album-${hashString(`${getArtistName(track)}|${getAlbumTitle(track)}`)}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(track);
        }

        return Array.from(grouped.entries())
            .map(([id, albumTracks]) => {
                const custom = customAlbums.find((album) => String(album.id) === String(id));
                return this.normalizeAlbum({ ...albumTracks[0].album, ...custom }, albumTracks);
            })
            .sort((a, b) => a.title.localeCompare(b.title));
    }

    async getArtists() {
        const tracks = await this.getTracks();
        const customArtists = await db.getLocalArtists().catch(() => []);
        const grouped = new Map();
        for (const track of tracks) {
            for (const artist of track.artists?.length ? track.artists : [track.artist]) {
                const key = artist?.id || `local-artist-${hashString(artist?.name || getArtistName(track))}`;
                if (!grouped.has(key)) grouped.set(key, { artist, tracks: [] });
                grouped.get(key).tracks.push(track);
            }
        }

        return Array.from(grouped.values())
            .map(({ artist, tracks }) => {
                const custom = customArtists.find((item) => String(item.id) === String(artist?.id));
                return this.normalizeArtist({ ...artist, ...custom }, tracks);
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async getUserPlaylists() {
        const playlists = await db.getPlaylists(true).catch(() => []);
        return playlists.map((playlist) => ({
            ...playlist,
            uuid: playlist.uuid || playlist.id,
            title: playlist.title || playlist.name,
            numberOfTracks: playlist.numberOfTracks || playlist.tracks?.length || 0,
            image: playlist.image || playlist.cover || playlist.tracks?.find((track) => track.album?.cover)?.album?.cover,
            isUserPlaylist: true,
        }));
    }

    async search(query) {
        const q = normalizeText(query);
        const [tracks, albums, artists, playlists] = await Promise.all([
            this.getTracks(),
            this.getAlbums(),
            this.getArtists(),
            this.getUserPlaylists(),
        ]);

        const matches = (...parts) => normalizeText(parts.filter(Boolean).join(' ')).includes(q);
        const limit = (items, predicate, count = 24) => items.filter(predicate).slice(0, count);

        return {
            tracks: {
                items: limit(tracks, (track) => matches(track.title, getArtistName(track), getAlbumTitle(track)), 50),
            },
            videos: { items: [] },
            artists: { items: limit(artists, (artist) => matches(artist.name), 24) },
            albums: {
                items: limit(albums, (album) => matches(album.title, album.artist?.name), 24),
            },
            playlists: {
                items: limit(playlists, (playlist) => matches(playlist.title, playlist.name), 24),
            },
        };
    }

    async searchTracks(query) {
        return (await this.search(query)).tracks;
    }

    async searchArtists(query) {
        return (await this.search(query)).artists;
    }

    async searchAlbums(query) {
        return (await this.search(query)).albums;
    }

    async searchPlaylists(query) {
        return (await this.search(query)).playlists;
    }

    async searchVideos() {
        return { items: [] };
    }

    async getVideo() {
        throw new Error('Videos are disabled in local-only mode');
    }

    async getVideoStreamUrl() {
        throw new Error('Videos are disabled in local-only mode');
    }

    async getTrackMetadata(id) {
        const tracks = await this.getTracks();
        const track = tracks.find((item) => String(item.id) === String(id));
        if (!track) throw new Error('Local track not found');
        return track;
    }

    async getTrack(id) {
        const track = await this.getTrackMetadata(id);
        return {
            track,
            info: {
                audioQuality: 'LOCAL',
                trackReplayGain: 0,
                trackPeakAmplitude: 1,
                albumReplayGain: 0,
                albumPeakAmplitude: 1,
            },
        };
    }

    async getAlbum(id) {
        const tracks = (await this.getTracks()).filter((track) => String(track.album?.id) === String(id));
        if (tracks.length === 0) throw new Error('Local album not found');
        return {
            album: this.normalizeAlbum(tracks[0].album, tracks),
            tracks: tracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0)),
        };
    }

    async getArtist(id) {
        const tracks = (await this.getTracks()).filter((track) =>
            (track.artists?.length ? track.artists : [track.artist]).some((artist) => String(artist?.id) === String(id))
        );
        if (tracks.length === 0) throw new Error('Local artist not found');

        const artist = this.normalizeArtist(
            tracks.flatMap((track) => track.artists || [track.artist]).find((item) => String(item?.id) === String(id)),
            tracks
        );
        const albums = uniqueBy(
            tracks.map((track) => this.normalizeAlbum(track.album, tracks.filter((t) => t.album?.id === track.album?.id))),
            (album) => album.id
        );

        return {
            ...artist,
            biography: artist.biography || 'Local artist from your self-hosted library.',
            banner: artist.banner || null,
            tracks,
            albums,
            eps: [],
            videos: [],
            mixes: {},
        };
    }

    async getPlaylist(id) {
        const playlist = await db.getPlaylist(id);
        if (!playlist) throw new Error('Local playlist not found');
        return { playlist, tracks: playlist.tracks || [] };
    }

    async getMix(id) {
        return this.getPlaylist(id);
    }

    async getArtistBiography() {
        return null;
    }

    async getArtistSocials() {
        return [];
    }

    async getArtistBanner() {
        return null;
    }

    async getSimilarArtists(artistId) {
        const artists = await this.getArtists();
        return artists.filter((artist) => String(artist.id) !== String(artistId)).slice(0, 12);
    }

    async getSimilarAlbums(albumId) {
        const albums = await this.getAlbums();
        return albums.filter((album) => String(album.id) !== String(albumId)).slice(0, 12);
    }

    async getArtistTopTracks(artistId, { offset = 0, limit = 50 } = {}) {
        const artist = await this.getArtist(artistId);
        return artist.tracks.slice(offset, offset + limit);
    }

    async getTrackRecommendations(id) {
        const tracks = await this.getTracks();
        return shuffle(tracks.filter((track) => String(track.id) !== String(id))).slice(0, 20);
    }

    async getRecommendedTracksForPlaylist(tracks = [], limit = 20, options = {}) {
        const known = new Set([...(options.knownTrackIds || []), ...tracks.map((track) => track.id)]);
        const allTracks = await this.getTracks();
        return shuffle(allTracks.filter((track) => !known.has(track.id))).slice(0, limit);
    }

    async getStreamUrl(id) {
        const track = await this.getTrackMetadata(id);
        if (track.serverAudioUrl) return getSelfHostedStream(track);
        if (!track.file) throw new Error('Local file is not available for playback');
        return {
            url: URL.createObjectURL(track.file),
            rgInfo: {
                trackReplayGain: 0,
                trackPeakAmplitude: 1,
                albumReplayGain: 0,
                albumPeakAmplitude: 1,
            },
        };
    }

    async downloadTrack(id) {
        const track = await this.getTrackMetadata(id);
        if (track.serverAudioUrl) return track.serverAudioUrl;
        if (!track.file) throw new Error('Local file is not available');
        return track.file;
    }

    getCoverUrl(id) {
        if (!id) return FALLBACK_COVER;
        return String(id);
    }

    getCoverSrcset() {
        return '';
    }

    getVideoCoverUrl(id) {
        return this.getCoverUrl(id);
    }

    getArtistPictureUrl(id) {
        return this.getCoverUrl(id);
    }

    getArtistPictureSrcset() {
        return '';
    }

    async getVideoArtwork() {
        return null;
    }

    extractStreamUrlFromManifest() {
        return null;
    }

    async clearCache() {}

    getCacheStats() {
        return { size: 0, maxSize: 0, ttl: 0 };
    }
}
