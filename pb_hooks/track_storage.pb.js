/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />
function configuredStorageLimit() {
    const records = $app.findRecordsByFilter('app_config', 'id != ""', '', 1, 0);
    return records.length ? records[0].getInt('storage_limit_bytes') : 0;
}

function storedAudioBytes(excludeId = '') {
    const records = $app.findRecordsByFilter('music_tracks', '', 'id', 100000, 0);
    return records.reduce((total, record) => {
        if (record.id === excludeId) return total;
        return total + Math.max(0, record.getInt('audio_size'));
    }, 0);
}

function enforceStorageLimit(incomingBytes, replacingId = '') {
    const limit = configuredStorageLimit();
    if (!limit || incomingBytes <= 0) return;
    const nextTotal = storedAudioBytes(replacingId) + incomingBytes;
    if (nextTotal > limit) {
        throw new ApiError(413, `Storage limit reached. This upload would use ${nextTotal} bytes of the ${limit}-byte instance limit.`);
    }
}

// Compute on every upload path, including the importer. Ignore client size claims.
onRecordCreateRequest((event) => {
    const audio = event.record.getUploadedFiles('audio');
    enforceStorageLimit(audio.length ? audio[0].size : 0);
    event.record.set('audio_size', audio.length ? audio[0].size : 0);
    event.next();
}, 'music_tracks');
onRecordUpdateRequest((event) => {
    const audio = event.record.getUploadedFiles('audio');
    if (audio.length) enforceStorageLimit(audio[0].size, event.record.original().id);
    event.record.set('audio_size', audio.length ? audio[0].size : event.record.original().getFloat('audio_size'));
    event.next();
}, 'music_tracks');
