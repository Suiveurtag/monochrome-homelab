/// <reference path="../pb_data/types.d.ts" />

// Social v2 fixup — group messages have no single recipient, and every
// conversation member must be able to read them.

migrate(
    (app) => {
        const messages = app.findCollectionByNameOrId('social_messages');
        const recipient = messages.fields.getByName('recipient');
        if (recipient) {
            recipient.required = false;
        }
        const memberRead =
            '@request.auth.id != "" && (sender = @request.auth.id || recipient = @request.auth.id || conversation.members.id ?= @request.auth.id)';
        messages.listRule = memberRead;
        messages.viewRule = memberRead;
        app.save(messages);
    },
    (app) => {
        const messages = app.findCollectionByNameOrId('social_messages');
        const recipient = messages.fields.getByName('recipient');
        if (recipient) {
            recipient.required = true;
        }
        messages.listRule = '@request.auth.id != "" && (sender = @request.auth.id || recipient = @request.auth.id)';
        messages.viewRule = '@request.auth.id != "" && (sender = @request.auth.id || recipient = @request.auth.id)';
        app.save(messages);
    }
);
