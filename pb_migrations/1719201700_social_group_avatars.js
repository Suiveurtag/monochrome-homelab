/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const conversations = app.findCollectionByNameOrId('social_conversations');
        conversations.fields.add(
            new FileField({
                name: 'avatar',
                maxSelect: 1,
                maxSize: 10485760,
                mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'],
            })
        );
        app.save(conversations);

        const messages = app.findCollectionByNameOrId('social_messages');
        messages.fields.add(new TextField({ name: 'client_nonce', max: 64 }));
        messages.indexes = [
            ...messages.indexes,
            'CREATE INDEX IF NOT EXISTS idx_social_messages_client_nonce ON social_messages (client_nonce)',
        ];
        app.save(messages);
    },
    (app) => {
        const messages = app.findCollectionByNameOrId('social_messages');
        messages.indexes = messages.indexes.filter((index) => !index.includes('idx_social_messages_client_nonce'));
        messages.fields.removeByName('client_nonce');
        app.save(messages);

        const conversations = app.findCollectionByNameOrId('social_conversations');
        conversations.fields.removeByName('avatar');
        app.save(conversations);
    }
);
