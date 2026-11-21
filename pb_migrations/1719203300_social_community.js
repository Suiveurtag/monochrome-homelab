/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />
// Social rebuild: sharing consent, Ghost Mode, 24-hour notes, reactions and polls.
// Every new collection is server-only (null rules): reads and writes go through
// /api/monochrome/social/*, which applies visibility, friendship and block checks.
// Presence stops being readable by every member; only its owner may read it directly.

const ACTIVE_MEMBER = '@request.auth.id != "" && @request.auth.access_status = "active"';
const ADMIN = '@request.auth.role = "admin"';
const SOCIAL_GATE = `${ACTIVE_MEMBER} && (${ADMIN} || @collection.app_config.feature_social = true)`;
const gated = (rule) => `${SOCIAL_GATE} && (${rule})`;

function userRelation(users, name, required = true) {
    return new RelationField({ name, required, collectionId: users.id, maxSelect: 1, cascadeDelete: true });
}

function closedCollection(name, fields, indexes) {
    const collection = new Collection({ name, type: 'base' });
    collection.fields.add(...fields);
    collection.indexes = indexes;
    collection.listRule = collection.viewRule = collection.createRule = collection.updateRule = collection.deleteRule = null;
    return collection;
}

migrate(
    (app) => {
        const users = app.findCollectionByNameOrId('_pb_users_auth_');

        const settings = closedCollection(
            'social_settings',
            [
                userRelation(users, 'user'),
                // Empty means "not chosen yet", which the server treats as private.
                new SelectField({ name: 'visibility', maxSelect: 1, values: ['private', 'friends', 'instance'] }),
                new DateField({ name: 'ghost_until' }),
                new AutodateField({ name: 'created', onCreate: true }),
                new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
            ],
            ['CREATE UNIQUE INDEX idx_social_settings_user ON social_settings (user)']
        );
        settings.listRule = settings.viewRule = gated('user = @request.auth.id');
        app.save(settings);

        app.save(
            closedCollection(
                'social_notes',
                [
                    userRelation(users, 'author'),
                    new TextField({ name: 'body', max: 120 }),
                    new JSONField({ name: 'attachment', maxSize: 4000 }),
                    new SelectField({ name: 'audience', required: true, maxSelect: 1, values: ['friends', 'instance'] }),
                    new DateField({ name: 'expires_at', required: true }),
                    new AutodateField({ name: 'created', onCreate: true }),
                    new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
                ],
                [
                    'CREATE INDEX idx_social_notes_author ON social_notes (author)',
                    'CREATE INDEX idx_social_notes_expires ON social_notes (expires_at)',
                ]
            )
        );

        app.save(
            closedCollection(
                'social_reactions',
                [
                    userRelation(users, 'user'),
                    new TextField({ name: 'target_kind', required: true, max: 16 }),
                    new TextField({ name: 'target_id', required: true, max: 160 }),
                    userRelation(users, 'target_owner', false),
                    new TextField({ name: 'emoji', required: true, max: 32 }),
                    new AutodateField({ name: 'created', onCreate: true }),
                    new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
                ],
                [
                    'CREATE UNIQUE INDEX idx_social_reactions_one ON social_reactions (user, target_kind, target_id)',
                    'CREATE INDEX idx_social_reactions_target ON social_reactions (target_kind, target_id)',
                ]
            )
        );

        const polls = closedCollection(
            'social_polls',
            [
                userRelation(users, 'author'),
                new TextField({ name: 'question', required: true, max: 160 }),
                new JSONField({ name: 'options', maxSize: 8000 }),
                new SelectField({ name: 'audience', required: true, maxSelect: 1, values: ['friends', 'instance'] }),
                new DateField({ name: 'closes_at', required: true }),
                new BoolField({ name: 'closed' }),
                new AutodateField({ name: 'created', onCreate: true }),
                new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
            ],
            [
                'CREATE INDEX idx_social_polls_author ON social_polls (author)',
                'CREATE INDEX idx_social_polls_created ON social_polls (created)',
            ]
        );
        app.save(polls);

        app.save(
            closedCollection(
                'social_poll_votes',
                [
                    new RelationField({
                        name: 'poll',
                        required: true,
                        collectionId: polls.id,
                        maxSelect: 1,
                        cascadeDelete: true,
                    }),
                    userRelation(users, 'user'),
                    new TextField({ name: 'option', required: true, max: 16 }),
                    new AutodateField({ name: 'created', onCreate: true }),
                    new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
                ],
                ['CREATE UNIQUE INDEX idx_social_poll_votes_one ON social_poll_votes (poll, user)']
            )
        );

        // Sessions recorded during Ghost Mode stay out of every social surface, permanently.
        const sessions = app.findCollectionByNameOrId('listening_sessions');
        sessions.fields.add(new BoolField({ name: 'social_hidden' }));
        app.save(sessions);

        const presence = app.findCollectionByNameOrId('social_presence');
        presence.fields.add(
            new TextField({ name: 'play_id', max: 32 }),
            new NumberField({ name: 'duration', min: 0 }),
            new DateField({ name: 'started' })
        );
        presence.listRule = presence.viewRule = gated('user = @request.auth.id');
        presence.createRule = presence.updateRule = null;
        presence.deleteRule = gated('user = @request.auth.id');
        app.save(presence);

        // A message may only be posted into a conversation its sender belongs to.
        const messages = app.findCollectionByNameOrId('social_messages');
        messages.createRule = gated(
            'sender = @request.auth.id && recipient != @request.auth.id && conversation.members.id ?= @request.auth.id'
        );
        app.save(messages);

        // Conversations are opened by the server, which checks friendship and blocks.
        const conversations = app.findCollectionByNameOrId('social_conversations');
        conversations.createRule = null;
        app.save(conversations);
    },
    (app) => {
        for (const name of ['social_poll_votes', 'social_polls', 'social_reactions', 'social_notes', 'social_settings']) {
            try {
                app.delete(app.findCollectionByNameOrId(name));
            } catch (_) {}
        }
        const sessions = app.findCollectionByNameOrId('listening_sessions');
        sessions.fields.removeByName('social_hidden');
        app.save(sessions);

        const presence = app.findCollectionByNameOrId('social_presence');
        for (const name of ['play_id', 'duration', 'started']) presence.fields.removeByName(name);
        presence.listRule = presence.viewRule = gated('@request.auth.id != ""');
        presence.createRule = presence.updateRule = gated('@request.auth.id != "" && user = @request.auth.id');
        presence.deleteRule = gated('@request.auth.id != "" && user = @request.auth.id');
        app.save(presence);

        const messages = app.findCollectionByNameOrId('social_messages');
        messages.createRule = gated('@request.auth.id != "" && sender = @request.auth.id && recipient != @request.auth.id');
        app.save(messages);

        const conversations = app.findCollectionByNameOrId('social_conversations');
        conversations.createRule = gated('@request.auth.id != "" && @request.body.members.id ?= @request.auth.id');
        app.save(conversations);
    }
);
