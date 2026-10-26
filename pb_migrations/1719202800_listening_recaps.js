/* eslint-disable no-undef */
// Watched recaps and collected share-card editions follow the account across devices.
migrate(
    (app) => {
        const users = app.findCollectionByNameOrId('DB_users');
        users.fields.add(new JSONField({ name: 'recaps', maxSize: 200000 }));
        app.save(users);
    },
    (app) => {
        const users = app.findCollectionByNameOrId('DB_users');
        users.fields.removeByName('recaps');
        app.save(users);
    }
);
