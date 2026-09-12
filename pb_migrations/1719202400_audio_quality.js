/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
    const tracks = app.findCollectionByNameOrId('music_tracks');
    tracks.fields.add(
        new TextField({ name: 'audio_codec', max: 32 }),
        new NumberField({ name: 'audio_bitrate', min: 0, onlyInt: true }),
        new TextField({ name: 'audio_quality', max: 64 })
    );
    app.save(tracks);
}, (app) => {
    const tracks = app.findCollectionByNameOrId('music_tracks');
    tracks.fields.removeByName('audio_codec');
    tracks.fields.removeByName('audio_bitrate');
    tracks.fields.removeByName('audio_quality');
    app.save(tracks);
});
