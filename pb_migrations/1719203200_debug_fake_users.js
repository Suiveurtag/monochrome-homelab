/* eslint-disable no-undef */
migrate(
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.add(new BoolField({ name: 'debug_fake_users' }));
        config.fields.add(new NumberField({ name: 'debug_fake_users_count', min: 1, max: 100, onlyInt: true }));
        app.save(config);
    },
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.removeByName('debug_fake_users');
        config.fields.removeByName('debug_fake_users_count');
        app.save(config);
    }
);
