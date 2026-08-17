/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.add(new TextField({ name: 'version_main_track', max: 256 }));
        tracks.indexes = [
            ...tracks.indexes,
            'CREATE INDEX IF NOT EXISTS idx_music_tracks_version_main ON music_tracks (version_main_track)',
        ];
        app.save(tracks);
    },
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.indexes = tracks.indexes.filter((index) => !index.includes('idx_music_tracks_version_main'));
        tracks.fields.removeByName('version_main_track');
        app.save(tracks);
    }
);
