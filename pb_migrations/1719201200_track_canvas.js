/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.add(
            new FileField({
                name: 'canvas',
                maxSelect: 1,
                maxSize: 104857600,
                mimeTypes: ['video/mp4'],
            })
        );
        app.save(tracks);
    },
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.removeByName('canvas');
        app.save(tracks);
    }
);
