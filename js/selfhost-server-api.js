import { pb } from './accounts/config.js';

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
    const albumTitle = record.album || 'Unknown Album';
    const albumArtist = record.album_artist || artistName;
    const audioUrl = pocketBaseFileUrl(client, record, record.audio);
    const coverUrl = pocketBaseFileUrl(client, record, record.cover) || FALLBACK_COVER;
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
        title,
        duration: Number(record.duration || 0),
        explicit: Boolean(record.explicit),
        uploadedAt: record.created ? Date.parse(record.created) : Date.now(),
        updatedAt: record.updated ? Date.parse(record.updated) : Date.now(),
        trackNumber: Number(record.track_number || 0) || null,
        artist,
        artists: [artist],
        album: {
            id: stableId('selfhost-album', `${albumArtist}|${albumTitle}`),
            title: albumTitle,
            cover: coverUrl,
            releaseDate: record.release_date || null,
            artist: { id: stableId('selfhost-artist', albumArtist), name: albumArtist, picture: coverUrl },
        },
        serverAudioUrl: audioUrl,
        serverCoverUrl: coverUrl,
        mediaMetadata: { tags: ['Self-hosted'] },
        lyrics: record.lyrics || '',
    };
}

export function createTrackFormData(track, file, ownerId, coverFile = null) {
    if (!ownerId) throw new Error('You must be signed in to upload music.');
    if (!file) throw new Error('Missing audio file.');

    const formData = new FormData();
    formData.set('owner', ownerId);
    formData.set('title', track?.title || file.name?.replace(/\.[^/.]+$/, '') || 'Unknown Title');
    formData.set('artist', firstArtistName(track));
    formData.set('album', track?.album?.title || 'Unknown Album');
    formData.set('album_artist', albumArtistName(track));
    formData.set('release_date', track?.album?.releaseDate || '');
    formData.set('track_number', String(track?.trackNumber || track?.track || ''));
    formData.set('duration', String(Number(track?.duration || 0)));
    formData.set('explicit', String(Boolean(track?.explicit)));
    formData.set('lyrics', track?.lyrics || '');
    formData.set('audio', file);
    if (coverFile) formData.set('cover', coverFile);
    return formData;
}

export async function listSelfHostedTracks(client = pb, fetchImpl = fetch) {
    if (!client?.authStore?.isValid || !client?.authStore?.token) return [];

    const response = await fetchImpl(`/api/collections/${SELFHOST_TRACKS_COLLECTION}/records?perPage=500`, {
        headers: { Authorization: `Bearer ${client.authStore.token}` },
    });

    if (!response.ok) throw new Error('Failed to list server uploads');
    const data = await response.json();
    return (data.items || []).map((record) => mapPocketBaseTrack(record, client));
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

export async function updateSelfHostedTrack(id, track, coverFile = null, client = pb) {
    if (!client?.authStore?.isValid) throw new Error('You must be signed in to edit music.');
    if (!id) throw new Error('Missing track id.');

    const formData = new FormData();
    formData.set('title', track?.title || 'Unknown Title');
    formData.set('artist', firstArtistName(track));
    formData.set('album', track?.album?.title || 'Unknown Album');
    formData.set('album_artist', albumArtistName(track));
    formData.set('release_date', track?.album?.releaseDate || track?.releaseDate || '');
    formData.set('track_number', String(track?.trackNumber || track?.track || ''));
    formData.set('duration', String(Number(track?.duration || 0)));
    formData.set('explicit', String(Boolean(track?.explicit)));
    formData.set('lyrics', track?.lyrics || '');
    if (coverFile) formData.set('cover', coverFile);

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
