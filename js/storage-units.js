export function formatBytes(value) {
    const bytes = Number(value);
    if (value == null || !Number.isFinite(bytes) || bytes < 0) return 'Size unavailable';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const power = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1));
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: power ? 1 : 0 }).format(bytes / 1000 ** power)} ${units[power]}`;
}

export function trackStorageBytes(track) {
    const value = track?.audioSize ?? track?.file?.size ?? track?.fileSize;
    return value != null && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}

export function summarizeStorage(tracks) {
    return tracks.reduce((result, track) => {
        const bytes = trackStorageBytes(track);
        result.count++;
        if (bytes == null) result.unknown++;
        else result.bytes += bytes;
        return result;
    }, { bytes: 0, count: 0, unknown: 0 });
}

export function storageSummaryLabel(tracks) {
    const { bytes, unknown, count } = summarizeStorage(tracks);
    if (unknown === count && count > 0) return 'Size unavailable';
    return `${formatBytes(bytes)}${unknown ? ` + ${unknown} unknown` : ''}`;
}
