function mergeTrackMetadata(target, source) {
    if (!target || !source) return false;

    const targetAlbum = target.album;
    const sourceAlbum = source.album;
    const targetArtist = target.artist;
    const sourceArtist = source.artist;

    Object.assign(target, source);
    if (targetArtist || sourceArtist) target.artist = { ...(targetArtist || {}), ...(sourceArtist || {}) };
    if (targetAlbum || sourceAlbum) {
        target.album = {
            ...(targetAlbum || {}),
            ...(sourceAlbum || {}),
            artist: {
                ...(targetAlbum?.artist || {}),
                ...(sourceAlbum?.artist || {}),
            },
        };
    }
    return true;
}

export function hydrateQueuedTracks(queueGroups, latestTracks) {
    const latestById = new Map(
        (latestTracks || []).filter((track) => track?.id != null).map((track) => [String(track.id), track])
    );
    const visited = new Set();
    let hydrated = 0;

    for (const group of queueGroups || []) {
        for (const queuedTrack of group || []) {
            if (!queuedTrack || visited.has(queuedTrack)) continue;
            visited.add(queuedTrack);
            const latest = latestById.get(String(queuedTrack.id));
            if (latest && mergeTrackMetadata(queuedTrack, latest)) hydrated += 1;
        }
    }

    return hydrated;
}
