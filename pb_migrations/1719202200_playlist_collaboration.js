/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const users = app.findCollectionByNameOrId('users');
        const collection = new Collection({ name: 'shared_playlists', type: 'base' });
        collection.fields.add(
            new TextField({ name: 'uuid', required: true, max: 128 }),
            new RelationField({
                name: 'owner',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new RelationField({ name: 'members', collectionId: users.id, maxSelect: 50 }),
            new JSONField({ name: 'identities', maxSize: 100000 }),
            new TextField({ name: 'name', required: true, max: 256 }),
            new TextField({ name: 'description', max: 5000 }),
            new TextField({ name: 'cover', max: 2000000 }),
            new JSONField({ name: 'tracks', maxSize: 16000000 }),
            new BoolField({ name: 'isPublic' }),
            new NumberField({ name: 'revision', required: true, min: 1, onlyInt: true }),
            new AutodateField({ name: 'created', onCreate: true }),
            new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
        );
        collection.indexes = ['CREATE UNIQUE INDEX idx_shared_playlist_uuid ON shared_playlists (uuid)'];
        const member =
            '@request.auth.id != "" && @request.auth.access_status = "active" && (owner = @request.auth.id || members.id ?= @request.auth.id)';
        collection.listRule = member;
        collection.viewRule = member;
        // Writes must use the transactional endpoint; direct record writes cannot bypass revision or role checks.
        collection.createRule = null;
        collection.updateRule = null;
        collection.deleteRule = null;
        app.save(collection);
    },
    (app) => app.delete(app.findCollectionByNameOrId('shared_playlists'))
);
