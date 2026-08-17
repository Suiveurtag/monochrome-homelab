import { pb } from './accounts/config.js';
import { isVideoArtwork } from './animated-artwork.js';
import { getTrackThemeColor, normalizeTrackThemeColor } from './track-theme-color.js';

export const SELFHOST_TRACKS_COLLECTION = 'music_tracks';
export const FALLBACK_COVER = '/assets/appicon.png';

function stableId(prefix, value) {
    let hash = 0;
    const input = String(value || 'unknown');
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return `${prefix}-${Math.abs(hash).toString(36)}`;
}

function firstArtistName(track) {
    return track?.artist?.name || track?.artists?.[0]?.name || 'Unknown Artist';
}

function albumArtistName(track) {
    return track?.album?.artist?.name || firstArtistName(track);
}

export function pocketBaseFileUrl(client, record, filename) {
    if (!filename) return null;
    if (typeof filename === 'string' && (filename.startsWith('http') || filename.startsWith('blob:'))) return filename;
    if (client?.files?.getURL) return client.files.getURL(record, filename);
    if (client?.files?.getUrl) return client.files.getUrl(record, filename);
    const collection = record.collectionId || record.collectionName || SELFHOST_TRACKS_COLLECTION;
    if (record?.id && collection) return `/api/files/${collection}/${record.id}/${filename}`;
    return null;
}

export function mapPocketBaseTrack(record, client = pb) {
    const title = record.title || 'Unknown Title';
    const artistName = record.artist || 'Unknown Artist';
    const hideFromArtistPage = Boolean(record.hide_from_artist_page);
    const albumTitle = hideFromArtistPage ? '' : record.album || '';
    const albumArtist = record.album_artist || artistName;
    const audioUrl = pocketBaseFileUrl(client, record, record.audio);
    const audioFileName = String(record.audio || '');
    const declaredAudioQuality = record.audio_quality || record.quality || null;
    const isFlac = /\.flac(?:$|[?#])/i.test(audioFileName);
    const audioQuality = declaredAudioQuality || (isFlac ? 'LOSSLESS' : null);
    const storedCoverUrl = pocketBaseFileUrl(client, record, record.cover);
    const fallbackCoverUrl = pocketBaseFileUrl(client, record, record.cover_fallback);
    const canvasUrl = pocketBaseFileUrl(client, record, record.canvas);
    const legacyVideoCoverUrl = isVideoArtwork(storedCoverUrl) ? storedCoverUrl : null;
    const coverUrl = legacyVideoCoverUrl
        ? fallbackCoverUrl || FALLBACK_COVER
        : storedCoverUrl || fallbackCoverUrl || FALLBACK_COVER;
    const videoCoverUrl = canvasUrl || legacyVideoCoverUrl;
    const artist = {
        id: stableId('selfhost-artist', artistName),
        name: artistName,
        picture: coverUrl,
    };

    return {
        id: record.id,
        type: 'track',
        isLocal: true,
        isSelfHosted: true,
        ownerId: typeof record.owner === 'string' ? record.owner : record.owner?.id || null,
        title,
        duration: Number(record.duration || 0),
        explicit: Boolean(record.explicit),
        themeColor: normalizeTrackThemeColor(record.theme_color),
        versionGroupId: record.version_group || null,
        versionMainTrackId: record.version_main_track || null,
        alternativeVersionIds: Array.isArray(record.alternative_version_ids)
            ? record.alternative_version_ids.map(String)
            : [],
        versionLabel: record.version_label || null,
        hideFromArtistPage,
        cover: coverUrl,
        uploadedAt: record.created ? Date.parse(record.created) : Date.now(),
        updatedAt: record.updated ? Date.parse(record.updated) : Date.now(),
        trackNumber: Number(record.track_number || 0) || null,
        discNumber: Number(record.disc_number || 0) || null,
        totalTracks: Number(record.total_tracks || 0) || null,
        totalDiscs: Number(record.total_discs || 0) || null,
        spotifyId: record.spotify_id || null,
        spotifyUrl: record.spotify_url || null,
        isrc: record.isrc || null,
        audioQuality,
        fileName: audioFileName,
        artist,
        artists: [artist],
        album: albumTitle
            ? {
                  id: stableId('selfhost-album', `${albumArtist}|${albumTitle}`),
                  title: albumTitle,
                  cover: coverUrl,
                  videoCoverUrl,
                  releaseDate: record.release_date || null,
                  artist: { id: stableId('selfhost-artist', albumArtist), name: albumArtist, picture: coverUrl },
              }
            : null,
        serverAudioUrl: audioUrl,
        serverCoverUrl: coverUrl,
        serverCanvasUrl: canvasUrl,
        videoCoverUrl,
        mediaMetadata: { tags: ['Self-hosted', ...(isFlac ? ['FLAC', 'LOSSLESS'] : [])] },
        lyrics: record.lyrics || '',
        importSource: record.source_provider || null,
    };
}

async function authenticatedImportRequest(path, options = {}, client = pb, fetchImpl = fetch) {
    if (!client?.authStore?.isValid || !client?.authStore?.token) {
        throw new Error('You must be signed in to import music.');
    }
    const response = await fetchImpl(path, {
        ...options,
        headers: {
            Authorization: `Bearer ${client.authStore.token}`,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers,
        },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.message || 'Spotify import request failed');
    return result;
}

export async function createSpotifyImport(url, client = pb, fetchImpl = fetch) {
    return authenticatedImportRequest(
        '/api/selfhost/imports',
        { method: 'POST', body: JSON.stringify({ url }) },
        client,
        fetchImpl
    );
}

export async function createSpotifyLikesImport(tracks, spotifyUserId, client = pb, fetchImpl = fetch) {
    return authenticatedImportRequest(
        '/api/selfhost/imports',
        { method: 'POST', body: JSON.stringify({ tracks, spotify_user_id: spotifyUserId }) },
        client,
        fetchImpl
    );
}

export async function listSpotifyImports(client = pb, fetchImpl = fetch) {
    const result = await authenticatedImportRequest('/api/selfhost/imports', {}, client, fetchImpl);
    return result.items || [];
}

export async function cancelSpotifyImport(id, client = pb, fetchImpl = fetch) {
    return authenticatedImportRequest(
        `/api/selfhost/imports/${encodeURIComponent(id)}/cancel`,
        { method: 'POST' },
        client,
        fetchImpl
    );
}

export async function markSpotifyImportPlaylistCreated(id, client = pb) {
    if (!client?.authStore?.isValid) throw new Error('You must be signed in.');
    return client.collection('music_import_jobs').update(id, { playlist_created: true });
}

export function createTrackFormData(track, file, ownerId, coverFile = null) {
    if (!ownerId) throw new Error('You must be signed in to upload music.');
    if (!file) throw new Error('Missing audio file.');

    const formData = new FormData();
    formData.set('owner', ownerId);
    formData.set('title', track?.title || file.name?.replace(/\.[^/.]+$/, '') || 'Unknown Title');
    formData.set('artist', firstArtistName(track));
    formData.set('album', track?.hideFromArtistPage ? '' : track?.album?.title || 'Unknown Album');
    formData.set('album_artist', albumArtistName(track));
    formData.set('release_date', track?.album?.releaseDate || '');
    formData.set('track_number', String(track?.trackNumber || track?.track || ''));
    formData.set('duration', String(Number(track?.duration || 0)));
    formData.set('explicit', String(Boolean(track?.explicit)));
    formData.set('theme_color', getTrackThemeColor(track));
    formData.set('version_group', track?.versionGroupId || '');
    formData.set('version_main_track', track?.versionMainTrackId || '');
    formData.set('alternative_version_ids', JSON.stringify(track?.alternativeVersionIds || []));
    formData.set('version_label', track?.versionLabel || '');
    formData.set('hide_from_artist_page', String(Boolean(track?.hideFromArtistPage)));
    formData.set('lyrics', track?.lyrics || '');
    formData.set('audio', file);
    if (coverFile) formData.set('cover', coverFile);
    return formData;
}

export async function listSelfHostedTracks(client = pb, fetchImpl = fetch) {
    const headers = client?.authStore?.token ? { Authorization: `Bearer ${client.authStore.token}` } : {};
    const response = await fetchImpl(`/api/collections/${SELFHOST_TRACKS_COLLECTION}/records?perPage=500`, { headers });

    if (!response.ok) throw new Error('Failed to list server uploads');
    const data = await response.json();
    const records = [...(data.items || [])];
    for (let page = 2; page <= Number(data.totalPages || 1); page++) {
        const next = await fetchImpl(
            `/api/collections/${SELFHOST_TRACKS_COLLECTION}/records?perPage=500&page=${page}`,
            { headers }
        );
        if (!next.ok) throw new Error('Failed to list the complete server catalogue');
        const nextData = await next.json();
        records.push(...(nextData.items || []));
    }
    return records.map((record) => mapPocketBaseTrack(record, client));
}

export async function importRemoteSelfHostedTrack(payload, client = pb, fetchImpl = fetch) {
    if (!client?.authStore?.isValid || !client?.authStore?.token) {
        throw new Error('You must be signed in to import music.');
    }
    const response = await fetchImpl('/api/selfhost/import-url', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${client.authStore.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || result.message || 'Remote FLAC import failed');
    }
    return mapPocketBaseTrack(result.record, client);
}

export async function uploadSelfHostedTrack(track, file, coverFile = null, client = pb) {
    if (!client?.authStore?.isValid) throw new Error('You must be signed in to upload music.');
    const ownerId = client.authStore.model?.id || client.authStore.model?.$id;
    const record = await client
        .collection(SELFHOST_TRACKS_COLLECTION)
        .create(createTrackFormData(track, file, ownerId, coverFile));
    return mapPocketBaseTrack(record, client);
}

export async function updateSelfHostedTrack(id, track, coverFile = null, clientOrCanvasOptions = pb) {
    const isCanvasOptions = Boolean(
        clientOrCanvasOptions &&
        (Object.hasOwn(clientOrCanvasOptions, 'canvasFile') || Object.hasOwn(clientOrCanvasOptions, 'removeCanvas'))
    );
    const client = isCanvasOptions ? clientOrCanvasOptions.client || pb : clientOrCanvasOptions;
    const canvasFile = isCanvasOptions ? clientOrCanvasOptions.canvasFile : null;
    const removeCanvas = isCanvasOptions ? Boolean(clientOrCanvasOptions.removeCanvas) : false;
    if (!client?.authStore?.isValid) throw new Error('You must be signed in to edit music.');
    if (!id) throw new Error('Missing track id.');

    const formData = new FormData();
    formData.set('title', track?.title || 'Unknown Title');
    formData.set('artist', firstArtistName(track));
    formData.set('album', track?.hideFromArtistPage ? '' : track?.album?.title || 'Unknown Album');
    formData.set('album_artist', albumArtistName(track));
    formData.set('release_date', track?.album?.releaseDate || track?.releaseDate || '');
    formData.set('track_number', String(track?.trackNumber || track?.track || ''));
    formData.set('duration', String(Number(track?.duration || 0)));
    formData.set('explicit', String(Boolean(track?.explicit)));
    formData.set('theme_color', getTrackThemeColor(track));
    formData.set('version_group', track?.versionGroupId || '');
    formData.set('version_main_track', track?.versionMainTrackId || '');
    formData.set('alternative_version_ids', JSON.stringify(track?.alternativeVersionIds || []));
    formData.set('version_label', track?.versionLabel || '');
    formData.set('hide_from_artist_page', String(Boolean(track?.hideFromArtistPage)));
    formData.set('lyrics', track?.lyrics || '');
    if (coverFile) formData.set('cover', coverFile);
    if (canvasFile) formData.set('canvas', canvasFile);
    else if (removeCanvas) formData.set('canvas', '');

    const record = await client.collection(SELFHOST_TRACKS_COLLECTION).update(id, formData);
    return mapPocketBaseTrack(record, client);
}

export async function deleteSelfHostedTrack(id, client = pb) {
    if (!client?.authStore?.isValid) throw new Error('You must be signed in to delete music.');
    await client.collection(SELFHOST_TRACKS_COLLECTION).delete(id);
}

export async function getSelfHostedTrack(id, client = pb) {
    if (!client?.authStore?.isValid) return null;
    const record = await client.collection(SELFHOST_TRACKS_COLLECTION).getOne(id);
    return mapPocketBaseTrack(record, client);
}

export function getSelfHostedStream(track) {
    if (!track?.serverAudioUrl) throw new Error('Server audio file is not available for playback');
    return {
        url: track.serverAudioUrl,
        rgInfo: {
            trackReplayGain: 0,
            trackPeakAmplitude: 1,
            albumReplayGain: 0,
            albumPeakAmplitude: 1,
        },
    };
}
