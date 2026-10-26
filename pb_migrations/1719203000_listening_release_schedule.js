/* eslint-disable no-undef */
const FIELDS = ['lock_week', 'lock_month', 'lock_year', 'lock_lifetime', 'past_week', 'past_month', 'past_year'];

migrate(
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.add(...FIELDS.map((name) => new BoolField({ name })));
        app.save(config);
        // The old switch held back Year and Lifetime together.
        for (const record of app.findRecordsByFilter(config.id, 'id != ""', '', 100, 0)) {
            const held = record.getBool('stats_lock_long_term');
            record.set('lock_week', false);
            record.set('lock_month', false);
            record.set('lock_year', held);
            record.set('lock_lifetime', held);
            for (const name of ['past_week', 'past_month', 'past_year']) record.set(name, true);
            app.save(record);
        }
        config.fields.removeByName('stats_lock_long_term');
        app.save(config);
    },
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.add(new BoolField({ name: 'stats_lock_long_term' }));
        app.save(config);
        for (const record of app.findRecordsByFilter(config.id, 'id != ""', '', 100, 0)) {
            record.set('stats_lock_long_term', record.getBool('lock_year'));
            app.save(record);
        }
        for (const name of FIELDS) config.fields.removeByName(name);
        app.save(config);
    }
);
