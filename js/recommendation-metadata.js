// Provider-independent metadata shared by listening signals and ranking.
export const DAY = 86_400_000;
export function artistsOf(track) {
    const credited = [track?.artists, track?.artist].flat().filter(Boolean);
    const artists = (credited.length ? credited : [track?.album?.artist].filter(Boolean)).map((artist) =>
        typeof artist === 'string' ? { name: artist } : artist
    );
    return [
        ...new Map(
            artists.map((a) => [
                String(a.id ?? a.name ?? '')
                    .trim()
                    .toLowerCase(),
                a,
            ])
        ),
    ]
        .filter(([id]) => id)
        .map(([id, a]) => ({ id, name: a.name || '' }));
}
export function genresOf(track) {
    const values = [track?.genre, track?.genres, track?.album?.genre].flat().filter(Boolean);
    return [
        ...new Set(
            values
                .flatMap((g) =>
                    String(g.name || g)
                        .toLowerCase()
                        .split(/[,;]/)
                )
                .map((g) => g.trim())
                .filter(Boolean)
        ),
    ];
}
export function compactTrack(track) {
    return {
        id: String(track.id),
        title: track.title || '',
        artists: artistsOf(track),
        genres: genresOf(track),
        album: track.album?.id ? { id: String(track.album.id), title: track.album.title || '' } : null,
    };
}
export function decay(value = 0, updatedAt, now = Date.now()) {
    return value * Math.pow(0.5, Math.max(0, now - (updatedAt || now)) / (30 * DAY));
}
