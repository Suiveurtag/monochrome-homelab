/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

// Keep each callback self-contained because PocketBase may execute request
// hooks in a different JS runtime from the one that registered them.
onRecordCreateRequest((event) => {
    const audio = event.record.getUploadedFiles('audio');
    const incomingBytes = audio.length ? audio[0].size : 0;
    const config = event.app.findRecordsByFilter('app_config', 'id != ""', '', 1, 0)[0];
    const limit = config ? config.getInt('storage_limit_bytes') : 0;
    if (limit && incomingBytes > 0) {
        const records = event.app.findRecordsByFilter('music_tracks', '', 'id', 100000, 0);
        const storedBytes = records.reduce((total, record) => total + Math.max(0, record.getInt('audio_size')), 0);
        const nextTotal = storedBytes + incomingBytes;
        if (nextTotal > limit) {
            throw new ApiError(
                413,
                `Storage limit reached. This upload would use ${nextTotal} bytes of the ${limit}-byte instance limit.`
            );
        }
    }
    event.record.set('audio_size', incomingBytes);
    event.next();
}, 'music_tracks');

onRecordUpdateRequest((event) => {
    const audio = event.record.getUploadedFiles('audio');
    const original = event.record.original();
    const incomingBytes = audio.length ? audio[0].size : 0;
    if (incomingBytes > 0) {
        const config = event.app.findRecordsByFilter('app_config', 'id != ""', '', 1, 0)[0];
        const limit = config ? config.getInt('storage_limit_bytes') : 0;
        if (limit) {
            const records = event.app.findRecordsByFilter('music_tracks', '', 'id', 100000, 0);
            const storedBytes = records.reduce((total, record) => {
                if (record.id === original.id) return total;
                return total + Math.max(0, record.getInt('audio_size'));
            }, 0);
            const nextTotal = storedBytes + incomingBytes;
            if (nextTotal > limit) {
                throw new ApiError(
                    413,
                    `Storage limit reached. This upload would use ${nextTotal} bytes of the ${limit}-byte instance limit.`
                );
            }
        }
    }
    event.record.set('audio_size', incomingBytes || original.getFloat('audio_size'));
    event.next();
}, 'music_tracks');
