/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_');

    const profiles = new Collection({ name: 'social_profiles', type: 'base' });
    profiles.fields.add(
        new RelationField({ name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }),
        new TextField({ name: 'username', max: 128 }),
        new TextField({ name: 'display_name', max: 128 }),
        new TextField({ name: 'avatar_url' }),
        new TextField({ name: 'banner' }),
        new TextField({ name: 'status', max: 512 }),
        new TextField({ name: 'about' }),
        new TextField({ name: 'website' }),
        new AutodateField({ name: 'created', onCreate: true }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
    );
    profiles.indexes = [
        'CREATE UNIQUE INDEX idx_social_profiles_user ON social_profiles (user)',
        'CREATE UNIQUE INDEX idx_social_profiles_username ON social_profiles (username) WHERE username != ""',
    ];
    profiles.listRule = '@request.auth.id != ""';
    profiles.viewRule = '@request.auth.id != ""';
    profiles.createRule = '@request.auth.id != "" && user = @request.auth.id';
    profiles.updateRule = '@request.auth.id != "" && user = @request.auth.id';
    profiles.deleteRule = '@request.auth.id != "" && user = @request.auth.id';
    app.save(profiles);

    const presence = new Collection({ name: 'social_presence', type: 'base' });
    presence.fields.add(
        new RelationField({ name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }),
        new JSONField({ name: 'track' }),
        new BoolField({ name: 'is_playing' }),
        new NumberField({ name: 'position', min: 0 }),
        new DateField({ name: 'last_seen' }),
        new AutodateField({ name: 'created', onCreate: true }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
    );
    presence.indexes = ['CREATE UNIQUE INDEX idx_social_presence_user ON social_presence (user)'];
    presence.listRule = '@request.auth.id != ""';
    presence.viewRule = '@request.auth.id != ""';
    presence.createRule = '@request.auth.id != "" && user = @request.auth.id';
    presence.updateRule = '@request.auth.id != "" && user = @request.auth.id';
    presence.deleteRule = '@request.auth.id != "" && user = @request.auth.id';
    app.save(presence);

    const messages = new Collection({ name: 'social_messages', type: 'base' });
    messages.fields.add(
        new RelationField({ name: 'sender', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }),
        new RelationField({ name: 'recipient', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }),
        new TextField({ name: 'kind', required: true, max: 16 }),
        new TextField({ name: 'body', max: 4096 }),
        new JSONField({ name: 'payload' }),
        new BoolField({ name: 'read' }),
        new AutodateField({ name: 'created', onCreate: true }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
    );
    messages.indexes = [
        'CREATE INDEX idx_social_messages_sender ON social_messages (sender)',
        'CREATE INDEX idx_social_messages_recipient ON social_messages (recipient)',
        'CREATE INDEX idx_social_messages_created ON social_messages (created)',
    ];
    messages.listRule = '@request.auth.id != "" && (sender = @request.auth.id || recipient = @request.auth.id)';
    messages.viewRule = '@request.auth.id != "" && (sender = @request.auth.id || recipient = @request.auth.id)';
    messages.createRule = '@request.auth.id != "" && sender = @request.auth.id && recipient != @request.auth.id';
    messages.updateRule = '@request.auth.id != "" && recipient = @request.auth.id';
    messages.deleteRule = '@request.auth.id != "" && (sender = @request.auth.id || recipient = @request.auth.id)';
    app.save(messages);

    try {
        const existingProfiles = app.findRecordsByFilter('DB_users', 'firebase_id != ""', '', 500, 0);
        for (const source of existingProfiles) {
            try {
                const record = new Record(profiles);
                record.set('user', source.getString('firebase_id'));
                record.set('username', source.getString('username'));
                record.set('display_name', source.getString('display_name'));
                record.set('avatar_url', source.getString('avatar_url'));
                record.set('banner', source.getString('banner'));
                record.set('status', source.getString('status'));
                record.set('about', source.getString('about'));
                record.set('website', source.getString('website'));
                app.save(record);
            } catch (_) {}
        }
    } catch (_) {}
}, (app) => {
    for (const name of ['social_messages', 'social_presence', 'social_profiles']) {
        try {
            app.delete(app.findCollectionByNameOrId(name));
        } catch (_) {}
    }
});
