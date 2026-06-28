/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
    for (const collectionName of ['DB_users', 'social_profiles']) {
        const collection = app.findCollectionByNameOrId(collectionName);
        collection.fields.removeByName('status');
        collection.fields.add(new TextField({ name: 'status', max: 2048 }));
        app.save(collection);
    }
}, (app) => {
    for (const collectionName of ['DB_users', 'social_profiles']) {
        const collection = app.findCollectionByNameOrId(collectionName);
        collection.fields.removeByName('status');
        collection.fields.add(new TextField({ name: 'status', max: collectionName === 'DB_users' ? 256 : 512 }));
        app.save(collection);
    }
});
