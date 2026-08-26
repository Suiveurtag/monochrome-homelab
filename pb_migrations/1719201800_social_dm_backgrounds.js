/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

migrate(
    (app) => {
        const conversations = app.findCollectionByNameOrId('social_conversations');
        conversations.fields.add(
            new FileField({
                name: 'background',
                maxSelect: 1,
                maxSize: 15728640,
                mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'],
            })
        );
        app.save(conversations);
    },
    (app) => {
        const conversations = app.findCollectionByNameOrId('social_conversations');
        conversations.fields.removeByName('background');
        app.save(conversations);
    }
);
