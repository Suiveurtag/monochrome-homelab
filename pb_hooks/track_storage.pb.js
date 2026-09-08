/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />
// Compute on every upload path, including the importer. Ignore client size claims.
onRecordCreateRequest((event) => {
    const audio = event.record.getUploadedFiles('audio');
    event.record.set('audio_size', audio.length ? audio[0].size : 0);
    event.next();
}, 'music_tracks');
onRecordUpdateRequest((event) => {
    const audio = event.record.getUploadedFiles('audio');
    event.record.set('audio_size', audio.length ? audio[0].size : event.record.original().getFloat('audio_size'));
    event.next();
}, 'music_tracks');
