/* eslint-disable no-undef */
onRecordCreateRequest((e) => {
    e.record.set('editors', []);
    e.next();
}, 'music_tracks');

onRecordUpdateRequest((e) => {
    const original = e.record.original();
    const editors = original.getStringSlice('editors');
    const fields = [
        'title', 'artist', 'album', 'album_artist', 'release_date', 'duration', 'track_number',
        'disc_number', 'total_tracks', 'total_discs', 'explicit', 'theme_color', 'version_group',
        'version_main_track', 'alternative_version_ids', 'version_label', 'hide_from_artist_page',
        'use_original_track_assets', 'lyrics', 'use_spicy_lyrics', 'audio', 'cover', 'canvas',
        'cover_fallback', 'audio_quality', 'audio_codec', 'audio_bitrate', 'isrc',
    ];
    const changed = fields.some((field) =>
        JSON.stringify(e.record.get(field)) !== JSON.stringify(original.get(field)) ||
        ['audio', 'cover', 'canvas', 'cover_fallback'].includes(field) && e.record.getUploadedFiles(field).length > 0
    );
    if (changed && e.auth?.id && !editors.includes(e.auth.id)) editors.push(e.auth.id);
    e.record.set('editors', editors);
    e.next();
}, 'music_tracks');
