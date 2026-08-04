export const PLAYBACK_QUALITY_OPTIONS = [
    { id: 'LOWEST', label: 'Low', detail: '24 kb/s', targetBandwidth: 24_000, apiQuality: 'LOW' },
    { id: 'LOW', label: 'Normal', detail: '96 kb/s', targetBandwidth: 96_000, apiQuality: 'LOW' },
    { id: 'NORMAL', label: 'High', detail: '160 kb/s', targetBandwidth: 160_000, apiQuality: 'HIGH' },
    { id: 'HIGH', label: 'Very High', detail: '320 kb/s', targetBandwidth: 320_000, apiQuality: 'HIGH' },
    { id: 'LOSSLESS', label: 'Lossless', detail: 'CD', targetBandwidth: 900_000, apiQuality: 'LOSSLESS' },
    {
        id: 'HI_RES_LOSSLESS',
        label: 'Hi-Res Lossless',
        detail: '24-bit / 96+ kHz',
        targetBandwidth: 2_400_000,
        apiQuality: 'HI_RES_LOSSLESS',
    },
];

const QUALITY_IDS = new Set(PLAYBACK_QUALITY_OPTIONS.map((option) => option.id));

const collectTags = (track) =>
    [
        ...(track?.mediaMetadata?.tags || []),
        ...(track?.album?.mediaMetadata?.tags || []),
        ...(track?.mediaTags || []),
        ...(track?.album?.mediaTags || []),
    ].map((tag) => String(tag).toUpperCase());

const getTrackBaseQuality = (track) => {
    const tokens = [track?.audioQuality, ...collectTags(track)].filter(Boolean).map((value) =>
        String(value)
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
    );
    if (tokens.some((token) => /HI_?RES|MASTER|MQA/.test(token))) return 'HI_RES_LOSSLESS';
    if (tokens.some((token) => /LOSSLESS|HIFI|FLAC/.test(token))) return 'LOSSLESS';
    if (tokens.some((token) => /HIGH/.test(token))) return 'HIGH';
    if (tokens.some((token) => /LOW/.test(token))) return 'LOW';
    return null;
};

export function getTrackQualityAvailability(track, variants = []) {
    const baseQuality = getTrackBaseQuality(track);
    const tags = collectTags(track);
    const flacVariants = variants.filter((variant) => variant.audioCodec?.toLowerCase().includes('flac'));
    const lossless =
        flacVariants.length > 0 ||
        baseQuality === 'LOSSLESS' ||
        baseQuality === 'HI_RES_LOSSLESS' ||
        tags.some((tag) => tag.includes('FLAC') || tag.includes('LOSSLESS')) ||
        /\.flac(?:$|[?#])/i.test(track?.audioUrl || track?.url || track?.fileName || '');
    const hiRes =
        baseQuality === 'HI_RES_LOSSLESS' ||
        flacVariants.some(
            (variant) =>
                Number(variant.audioSamplingRate || 0) > 48_000 ||
                Number(variant.audioBandwidth || variant.bandwidth || 0) > 1_200_000
        );

    return { lossless, hiRes };
}

export function getAvailableQualityOptions(track, variants = []) {
    const availability = getTrackQualityAvailability(track, variants);
    return PLAYBACK_QUALITY_OPTIONS.filter((option) => {
        if (option.id === 'HI_RES_LOSSLESS') return availability.hiRes;
        if (option.id === 'LOSSLESS') return availability.lossless;
        return true;
    });
}

export function normalizePlaybackQuality(profile) {
    return profile === 'auto' || QUALITY_IDS.has(profile) ? profile : 'auto';
}

export function getApiQuality(profile) {
    return PLAYBACK_QUALITY_OPTIONS.find((option) => option.id === profile)?.apiQuality || 'HIGH';
}

export function getQualityOption(profile) {
    return PLAYBACK_QUALITY_OPTIONS.find((option) => option.id === profile) || PLAYBACK_QUALITY_OPTIONS[3];
}

export function suggestPlaybackQuality(connection, track, variants = []) {
    const available = getAvailableQualityOptions(track, variants);
    const availableIds = new Set(available.map((option) => option.id));
    const downlink = Number(connection?.downlink || 0);
    const effectiveType = String(connection?.effectiveType || '').toLowerCase();

    let preferred = 'HIGH';
    if (
        connection?.saveData ||
        effectiveType === 'slow-2g' ||
        effectiveType === '2g' ||
        (downlink > 0 && downlink < 0.3)
    ) {
        preferred = 'LOWEST';
    } else if (effectiveType === '3g' || (downlink > 0 && downlink < 1)) {
        preferred = 'LOW';
    } else if (downlink > 0 && downlink < 2.5) {
        preferred = 'NORMAL';
    } else if (downlink >= 10 && availableIds.has('HI_RES_LOSSLESS')) {
        preferred = 'HI_RES_LOSSLESS';
    } else if (downlink >= 5 && availableIds.has('LOSSLESS')) {
        preferred = 'LOSSLESS';
    } else if (!downlink && availableIds.has('LOSSLESS')) {
        preferred = 'LOSSLESS';
    }

    return availableIds.has(preferred) ? preferred : available.at(-1)?.id || 'HIGH';
}

export function resolvePlaybackQuality(profile, track, variants = [], connection = globalThis.navigator?.connection) {
    const normalized = normalizePlaybackQuality(profile);
    const available = getAvailableQualityOptions(track, variants);
    if (normalized === 'auto') return suggestPlaybackQuality(connection, track, variants);
    if (available.some((option) => option.id === normalized)) return normalized;

    const requestedIndex = PLAYBACK_QUALITY_OPTIONS.findIndex((option) => option.id === normalized);
    for (let index = requestedIndex - 1; index >= 0; index -= 1) {
        if (available.some((option) => option.id === PLAYBACK_QUALITY_OPTIONS[index].id)) {
            return PLAYBACK_QUALITY_OPTIONS[index].id;
        }
    }
    return available.at(-1)?.id || 'HIGH';
}

export function getNextLowerQuality(profile, track, variants = []) {
    const availableIds = new Set(getAvailableQualityOptions(track, variants).map((option) => option.id));
    const index = PLAYBACK_QUALITY_OPTIONS.findIndex((option) => option.id === profile);
    for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
        const candidate = PLAYBACK_QUALITY_OPTIONS[candidateIndex].id;
        if (availableIds.has(candidate)) return candidate;
    }
    return null;
}
