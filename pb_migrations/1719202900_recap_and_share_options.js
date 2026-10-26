/* eslint-disable no-undef */
migrate(
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.add(new BoolField({ name: 'feature_recaps' }), new BoolField({ name: 'unlock_all_share_styles' }));
        app.save(config);
        for (const record of app.findRecordsByFilter(config.id, 'id != ""', '', 100, 0)) {
            record.set('feature_recaps', true);
            record.set('unlock_all_share_styles', false);
            app.save(record);
        }
    },
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.removeByName('feature_recaps');
        config.fields.removeByName('unlock_all_share_styles');
        app.save(config);
    }
);
