const TRACK_THEME_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function normalizeTrackThemeColor(color) {
    const normalized = String(color || '').trim();
    return TRACK_THEME_COLOR_PATTERN.test(normalized) ? normalized.toLowerCase() : '';
}

export function getTrackThemeColor(track) {
    return normalizeTrackThemeColor(track?.themeColor);
}
