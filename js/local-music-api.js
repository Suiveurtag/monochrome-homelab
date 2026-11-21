// js/local-music-api.js
import { offlineCache } from './offline-cache.js';
import { db } from './db.js';
import { getSelfHostedStream, listSelfHostedTracks } from './selfhost-server-api.js';
import { isVideoArtwork } from './animated-artwork.js';
import { getTrackDisplayAlbum, hydrateTrackVersionDisplayMetadata } from './track-versions.js';
import { buildSearchIndex, popularTracks, searchLibrary } from './search-engine.js';
import { getGlobalStreamCount, loadAllStreamCounts } from './listening-sync.js';

// Live suggestions query on every keystroke: keep the catalogue index warm instead of refetching it.
const SEARCH_INDEX_TTL = 45_000;

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
    return getTrackDisplayAlbum(track)?.title || '';
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

export function mergeServerTrackWithLocalMetadata(track, local) {
    if (!local) return track;
    const hasServerCanvasMetadata = Object.hasOwn(track, 'serverCanvasUrl');
    const serverCanvasUrl = track.serverCanvasUrl || track.videoCoverUrl || track.album?.videoCoverUrl || null;
    const videoCoverUrl = hasServerCanvasMetadata
        ? serverCanvasUrl
        : serverCanvasUrl || local.videoCoverUrl || local.album?.videoCoverUrl || null;
    const album = Object.hasOwn(local, 'album') ? local.album : track.album;
    return {
        ...track,
        ...local,
        serverAudioUrl: track.serverAudioUrl,
        serverCoverUrl: track.serverCoverUrl,
        serverCanvasUrl,
        videoCoverUrl,
        artist: { ...track.artist, ...local.artist },
        artists: local.artists?.length ? local.artists : track.artists,
        album: album
            ? {
                  ...track.album,
                  ...album,
                  videoCoverUrl,
                  artist: { ...track.album?.artist, ...album.artist },
              }
            : null,
    };
}

export class LocalMusicAPI {
    constructor(settings) {
        this.settings = settings;
        this.searchIndex = null;
        this.searchIndexAt = 0;
        this.searchIndexPending = null;
        this.searchIndexGeneration = 0;
        if (typeof window !== 'undefined') {
            const invalidate = () => this.invalidateSearchIndex();
            window.addEventListener('local-library-updated', invalidate);
            window.addEventListener('library-changed', invalidate);
            window.addEventListener('playlist-tracks-changed', invalidate);
        }
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
        const ownAlbum = track.album?.id || track.album?.title ? track.album : null;
        const albumTitle = ownAlbum?.title || '';
        const artistId = track.artist?.id || `local-artist-${hashString(artistName)}`;
        const albumId = ownAlbum
            ? ownAlbum.id || `local-album-${hashString(`${artistName}|${albumTitle || 'Unknown Album'}`)}`
            : null;
        const id = track.id || `local-track-${hashString(getLocalTrackKey(track))}`;
        const trackCover = track.cover || track.serverCoverUrl || ownAlbum?.cover || FALLBACK_COVER;
        const artist = { ...(track.artist || {}), id: artistId, name: artistName, picture: trackCover };
        const videoCoverUrl = track.videoCoverUrl || (isVideoArtwork(ownAlbum?.cover) ? ownAlbum.cover : null);
        const artists = (track.artists?.length ? track.artists : [artist]).map((a) => ({
            ...a,
            id: a.id || `local-artist-${hashString(a.name || artistName)}`,
            name: a.name || artistName,
            picture: a.picture || trackCover,
        }));

        return {
            ...track,
            id,
            type: 'track',
            isLocal: true,
            title: track.title || 'Unknown Title',
            duration: track.duration || 0,
            cover: trackCover,
            artist,
            artists,
            album: ownAlbum
                ? {
                      ...ownAlbum,
                      id: albumId,
                      title: albumTitle || 'Unknown Album',
                      cover: ownAlbum.cover || trackCover,
                      videoCoverUrl: ownAlbum.videoCoverUrl || videoCoverUrl,
                      artist: ownAlbum.artist || artist,
                      numberOfTracks: ownAlbum.numberOfTracks || null,
                  }
                : null,
            mediaMetadata: track.mediaMetadata || { tags: ['Local'] },
            videoCoverUrl,
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
            videoCoverUrl:
                album?.videoCoverUrl ||
                firstTrack?.album?.videoCoverUrl ||
                (isVideoArtwork(album?.cover || firstTrack?.album?.cover)
                    ? album?.cover || firstTrack?.album?.cover
                    : null),
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
            picture:
                artist?.picture ||
                tracks.map((track) => getTrackDisplayAlbum(track)?.cover || track.cover).find(Boolean) ||
                FALLBACK_COVER,
            popularity: Math.min(100, Math.max(1, tracks.length * 5)),
            artistRoles: [{ category: 'Local library' }],
            isLocal: true,
        };
    }

    async getTracks() {
        await this.ensureLocalCache();
        const [serverTracks, uploadedTracks, offlineTracks] = await Promise.all([
            (navigator.onLine ? listSelfHostedTracks() : Promise.resolve([])).catch((error) => {
                console.warn('[SelfHost] Could not load server library:', error);
                return [];
            }),
            db.getUploadedTracks().catch(() => []),
            offlineCache.tracks().catch(() => []),
        ]);
        const localFiles = Array.isArray(window.localFilesCache) ? window.localFilesCache : [];
        const uploadedById = new Map(uploadedTracks.map((track) => [String(track.id), track]));
        const serverWithLocalMetadata = serverTracks.map((track) => {
            const local = uploadedById.get(String(track.id));
            return mergeServerTrackWithLocalMetadata(track, local);
        });
        return hydrateTrackVersionDisplayMetadata(
            uniqueBy(
                mergeById(serverWithLocalMetadata, mergeById(uploadedTracks, mergeById(localFiles, offlineTracks)))
                    .map((track) => this.normalizeTrack(track))
                    .filter(Boolean),
                (track) => track.id || getLocalTrackKey(track)
            )
        );
    }

    async getAlbums(allTracks) {
        const tracks = (allTracks || (await this.getTracks())).filter(
            (track) => !track.hideFromArtistPage && track.album
        );
        const customAlbums = await db.getLocalAlbums().catch(() => []);
        const grouped = new Map();
        for (const track of tracks) {
            const key =
                track.album?.id || `local-album-${hashString(`${getArtistName(track)}|${getAlbumTitle(track)}`)}`;
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

    async getArtists(allTracks) {
        const tracks = allTracks || (await this.getTracks());
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
            image:
                playlist.image || playlist.cover || playlist.tracks?.find((track) => track.album?.cover)?.album?.cover,
            isUserPlaylist: true,
        }));
    }

    async buildSearchIndex() {
        const generation = this.searchIndexGeneration;
        const tracks = await this.getTracks();
        const [albums, artists, playlists] = await Promise.all([
            this.getAlbums(tracks),
            this.getArtists(tracks),
            this.getUserPlaylists(),
            loadAllStreamCounts().catch((error) => console.warn('[Search] Stream counts unavailable:', error)),
        ]);
        this.searchIndex = buildSearchIndex({ tracks, albums, artists, playlists });
        // A library change during the build leaves the result stale, so the next query rebuilds.
        this.searchIndexAt = generation === this.searchIndexGeneration ? Date.now() : 0;
        return this.searchIndex;
    }

    /** Cached index; a stale one is served while a fresh one builds in the background. */
    async getSearchIndex({ fresh = false } = {}) {
        const stale = !this.searchIndex || Date.now() - this.searchIndexAt > SEARCH_INDEX_TTL;
        if (stale && !this.searchIndexPending) {
            this.searchIndexPending = this.buildSearchIndex().finally(() => (this.searchIndexPending = null));
            // A background rebuild failing keeps the previous index; only awaiting callers see the error.
            this.searchIndexPending.catch((error) => console.warn('[Search] Index rebuild failed:', error));
        }
        if (this.searchIndex && !fresh) return this.searchIndex;
        return this.searchIndexPending || this.searchIndex;
    }

    invalidateSearchIndex() {
        this.searchIndexGeneration++;
        this.searchIndexAt = 0;
    }

    async search(query) {
        const index = await this.getSearchIndex({ fresh: true });
        const results = searchLibrary(index, query, {
            streams: getGlobalStreamCount,
            limits: { tracks: 50, albums: 24, artists: 24, playlists: 24 },
        });
        const items = (list) => ({ items: list.map((result) => result.item) });
        return {
            tracks: items(results.tracks),
            videos: { items: [] },
            artists: items(results.artists),
            albums: items(results.albums),
            playlists: items(results.playlists),
        };
    }

    /** Ranked matches with match metadata, for the live suggestion panel. */
    async suggest(query, limits = { tracks: 4, albums: 3, artists: 3, playlists: 0 }) {
        const index = await this.getSearchIndex();
        return searchLibrary(index, query, { streams: getGlobalStreamCount, limits });
    }

    async getPopularTracks(limit = 5) {
        const index = await this.getSearchIndex();
        return popularTracks(index, getGlobalStreamCount, limit);
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
        const tracks = (await this.getTracks()).filter(
            (track) => !track.hideFromArtistPage && String(track.album?.id) === String(id)
        );
        if (tracks.length === 0) throw new Error('Local album not found');
        const customAlbums = await db.getLocalAlbums().catch(() => []);
        const custom = customAlbums.find((album) => String(album.id) === String(id));
        return {
            album: this.normalizeAlbum({ ...tracks[0].album, ...custom }, tracks),
            tracks: tracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0)),
        };
    }

    async getArtist(id) {
        const tracks = (await this.getTracks()).filter((track) =>
            (track.artists?.length ? track.artists : [track.artist]).some((artist) => String(artist?.id) === String(id))
        );
        if (tracks.length === 0) throw new Error('Local artist not found');
        const visibleTracks = tracks.filter((track) => !track.hideFromArtistPage);

        const customArtists = await db.getLocalArtists().catch(() => []);
        const custom = customArtists.find((item) => String(item.id) === String(id));
        const sourceArtist = tracks
            .flatMap((track) => track.artists || [track.artist])
            .find((item) => String(item?.id) === String(id));
        const artist = this.normalizeArtist(
            { ...sourceArtist, ...custom },
            visibleTracks.length ? visibleTracks : tracks
        );
        const albums = uniqueBy(
            visibleTracks
                .filter((track) => track.album)
                .map((track) =>
                    this.normalizeAlbum(
                        track.album,
                        visibleTracks.filter((t) => t.album?.id === track.album?.id)
                    )
                ),
            (album) => album.id
        );

        return {
            ...artist,
            biography: artist.biography || 'Local artist from your self-hosted library.',
            banner: artist.banner || null,
            tracks: visibleTracks,
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
        const { recommendationService } = await import('./recommendation-service.js');
        return recommendationService.rank(tracks, {
            seeds: tracks.filter((track) => String(track.id) === String(id)),
            excludeIds: [id],
            limit: 20,
        });
    }

    async getRecommendedTracksForPlaylist(tracks = [], limit = 20, options = {}) {
        const known = new Set([...(options.knownTrackIds || []), ...tracks.map((track) => track.id)]);
        const allTracks = await this.getTracks();
        const { recommendationService } = await import('./recommendation-service.js');
        return recommendationService.rank(allTracks, { seeds: tracks, excludeIds: [...known], limit });
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
