/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.add(new BoolField({ name: 'use_spicy_lyrics' }));
        app.save(tracks);

        const secrets = new Collection({ name: 'instance_secrets', type: 'base' });
        secrets.fields.add(new TextField({ name: 'spicy_lyrics_key', max: 512 }));
        secrets.listRule = null;
        secrets.viewRule = null;
        secrets.createRule = null;
        secrets.updateRule = null;
        secrets.deleteRule = null;
        app.save(secrets);
    },
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.fields.removeByName('use_spicy_lyrics');
        app.save(tracks);
        app.delete(app.findCollectionByNameOrId('instance_secrets'));
    }
);
