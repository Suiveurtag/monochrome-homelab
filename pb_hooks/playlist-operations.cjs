// Pure mutation logic shared by the PocketBase transaction and regression tests.
const key = (track) => `${track.type || 'track'}:${String(track.id)}`;

function applyTrackOperation(existing, operation, now) {
    const tracks = Array.isArray(existing) ? existing.slice() : [];
    if (operation.type === 'add') {
        if (!Array.isArray(operation.tracks) || operation.tracks.length > 10000) throw new Error('Invalid tracks');
        const seen = new Set(tracks.map(key));
        for (const track of operation.tracks) {
            if (!track || !['string', 'number'].includes(typeof track.id) || !String(track.id))
                throw new Error('Invalid track');
            if (!seen.has(key(track))) {
                seen.add(key(track));
                tracks.push({ ...track, addedAt: now });
            }
        }
        if (tracks.length > 10000) throw new Error('A playlist can contain up to 10,000 tracks');
        return tracks;
    }
    if (operation.type === 'remove') {
        if (operation.trackId == null) throw new Error('Missing track');
        return tracks.filter(
            (track) =>
                String(track.id) !== String(operation.trackId) ||
                (operation.trackType && (track.type || 'track') !== operation.trackType)
        );
    }
    if (operation.type === 'reorder') {
        const order = operation.order;
        if (!Array.isArray(order) || order.length !== tracks.length || new Set(order).size !== tracks.length)
            throw new Error('Playlist changed. Refresh before reordering.');
        const lookup = new Map(tracks.map((track) => [key(track), track]));
        if (order.some((id) => !lookup.has(id))) throw new Error('Playlist changed. Refresh before reordering.');
        return order.map((id) => lookup.get(id));
    }
    throw new Error('Unknown track operation');
}

module.exports = { applyTrackOperation, key };
