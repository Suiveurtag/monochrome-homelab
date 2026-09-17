/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.add(new NumberField({ name: 'storage_limit_bytes', min: 0, onlyInt: true }));
        app.save(config);

        const records = app.findRecordsByFilter(config.id, 'id != ""', '', 1, 0);
        for (const record of records) {
            record.set('storage_limit_bytes', 0);
            app.save(record);
        }
    },
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.removeByName('storage_limit_bytes');
        app.save(config);
    }
);
