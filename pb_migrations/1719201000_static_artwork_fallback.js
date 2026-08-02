/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

const STATIC_ARTWORK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const PREVIOUS_FALLBACK_TYPES = [...STATIC_ARTWORK_TYPES, 'image/gif'];

migrate(
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.getByName('cover_fallback').mimeTypes = STATIC_ARTWORK_TYPES;
        app.save(tracks);
    },
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.getByName('cover_fallback').mimeTypes = PREVIOUS_FALLBACK_TYPES;
        app.save(tracks);
    }
);
