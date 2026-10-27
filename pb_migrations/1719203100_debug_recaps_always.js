/* eslint-disable no-undef */
migrate(
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.add(new BoolField({ name: 'debug_recaps_always' }));
        app.save(config);
    },
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.removeByName('debug_recaps_always');
        app.save(config);
    }
);
