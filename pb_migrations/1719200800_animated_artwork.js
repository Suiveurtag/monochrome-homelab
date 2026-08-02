/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

const STATIC_ARTWORK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ANIMATED_ARTWORK_TYPES = [...STATIC_ARTWORK_TYPES, 'image/avif', 'image/gif', 'video/mp4'];

migrate(
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.getByName('cover').mimeTypes = ANIMATED_ARTWORK_TYPES;
        app.save(tracks);
    },
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.getByName('cover').mimeTypes = STATIC_ARTWORK_TYPES;
        app.save(tracks);
    }
);
