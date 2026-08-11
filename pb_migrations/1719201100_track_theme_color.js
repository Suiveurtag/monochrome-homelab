/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.add(
            new TextField({
                name: 'theme_color',
                max: 7,
                pattern: '^#[0-9a-fA-F]{6}$',
            })
        );
        app.save(tracks);
    },
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.removeByName('theme_color');
        app.save(tracks);
    }
);
