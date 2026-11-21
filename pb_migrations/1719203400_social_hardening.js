/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />
// Social hardening after review:
// - conversation members may no longer change a conversation's type, members or creator
//   (that turned a DM into a "group" and bypassed friendship and block checks);
// - only members may delete a conversation;
// - a message recipient may only mark it read, never rewrite it;
// - Ghost Mode keeps a log of its windows so late-uploaded sessions are judged by when they played.

const ACTIVE_MEMBER = '@request.auth.id != "" && @request.auth.access_status = "active"';
const ADMIN = '@request.auth.role = "admin"';
const SOCIAL_GATE = `${ACTIVE_MEMBER} && (${ADMIN} || @collection.app_config.feature_social = true)`;
const gated = (rule) => `${SOCIAL_GATE} && (${rule})`;
const unchanged = (...fields) => fields.map((field) => `@request.body.${field}:isset = false`).join(' && ');

migrate(
    (app) => {
        const conversations = app.findCollectionByNameOrId('social_conversations');
        conversations.updateRule = gated(`members.id ?= @request.auth.id && ${unchanged('type', 'members', 'created_by')}`);
        conversations.deleteRule = gated('members.id ?= @request.auth.id && (created_by = @request.auth.id || type = "dm")');
        app.save(conversations);

        const messages = app.findCollectionByNameOrId('social_messages');
        messages.updateRule = gated(
            `recipient = @request.auth.id && ${unchanged('body', 'sender', 'recipient', 'conversation', 'kind', 'payload', 'image')}`
        );
        app.save(messages);

        const settings = app.findCollectionByNameOrId('social_settings');
        settings.fields.add(new JSONField({ name: 'ghost_log', maxSize: 20000 }));
        app.save(settings);
    },
    (app) => {
        const conversations = app.findCollectionByNameOrId('social_conversations');
        conversations.updateRule = gated('@request.auth.id != "" && members.id ?= @request.auth.id');
        conversations.deleteRule = gated('@request.auth.id != "" && (created_by = @request.auth.id || type = "dm")');
        app.save(conversations);

        const messages = app.findCollectionByNameOrId('social_messages');
        messages.updateRule = gated('@request.auth.id != "" && recipient = @request.auth.id');
        app.save(messages);

        const settings = app.findCollectionByNameOrId('social_settings');
        settings.fields.removeByName('ghost_log');
        app.save(settings);
    }
);
