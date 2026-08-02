/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.add(
            new FileField({
                name: 'cover_fallback',
                maxSelect: 1,
                maxSize: 10485760,
                mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
            })
        );
        app.save(tracks);
    },
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.removeByName('cover_fallback');
        app.save(tracks);
    }
);
