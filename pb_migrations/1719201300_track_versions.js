/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.add(
            new TextField({ name: 'version_group', max: 256 }),
            new JSONField({ name: 'alternative_version_ids' }),
            new TextField({ name: 'version_label', max: 128 }),
            new BoolField({ name: 'hide_from_artist_page' })
        );
        tracks.indexes = [
            ...tracks.indexes,
            'CREATE INDEX IF NOT EXISTS idx_music_tracks_version_group ON music_tracks (version_group)',
        ];
        app.save(tracks);
    },
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.indexes = tracks.indexes.filter((index) => !index.includes('idx_music_tracks_version_group'));
        for (const field of ['version_group', 'alternative_version_ids', 'version_label', 'hide_from_artist_page']) {
            tracks.fields.removeByName(field);
        }
        app.save(tracks);
    }
);
