export function uploadDayKey(value) {
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return 'unknown';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function groupTracksByUploadDay(tracks) {
    const groups = new Map();
    [...tracks]
        .sort((a, b) => Number(b.uploadedAt || 0) - Number(a.uploadedAt || 0))
        .forEach((track) => {
            const key = uploadDayKey(track.uploadedAt);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(track);
        });
    return [...groups].map(([key, items]) => ({ key, tracks: items }));
}

export function uploadDayLabel(key, now = new Date(), locale = undefined) {
    if (key === 'unknown') return 'Date unknown';
    const date = new Date(`${key}T00:00:00`);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const difference = Math.round((today - day) / 86400000);
    if (difference === 0) return 'Today';
    if (difference === 1) return 'Yesterday';
    return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

export function patchTrackMetadata(track, changes) {
    const next = { ...track };
    if ('artist' in changes) {
        const artist = { ...(track.artist || {}), name: changes.artist };
        next.artist = artist;
        next.artists = (track.artists?.length ? track.artists : [artist]).map((item, index) =>
            index === 0 ? { ...item, name: changes.artist } : item
        );
        next.album = { ...(next.album || {}), artist: { ...(next.album?.artist || artist), name: changes.artist } };
    }
    if ('album' in changes) next.album = { ...(next.album || {}), title: changes.album };
    if ('releaseDate' in changes) {
        next.releaseDate = changes.releaseDate;
        next.album = { ...(next.album || {}), releaseDate: changes.releaseDate };
    }
    if ('explicit' in changes) next.explicit = changes.explicit;
    if ('lyrics' in changes) next.lyrics = changes.lyrics;
    return next;
}
