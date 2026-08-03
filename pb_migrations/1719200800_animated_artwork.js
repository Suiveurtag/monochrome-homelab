/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        const cover = tracks.fields.getByName('cover');
        cover.maxSize = 104857600;
        cover.mimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4'];
        app.save(tracks);
    },
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        const cover = tracks.fields.getByName('cover');
        cover.maxSize = 10485760;
        cover.mimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        app.save(tracks);
    }
);
