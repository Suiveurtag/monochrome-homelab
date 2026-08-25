/// <reference path="../pb_data/types.d.ts" />

// Social v2 — follow graph, group conversations, instance feed, pins, mutes,
// read state, and DM image attachments. Backfills one DM conversation per
// existing sender/recipient pair so legacy messages join the new model.

migrate(
    (app) => {
        const users = app.findCollectionByNameOrId('_pb_users_auth_');
        const messages = app.findCollectionByNameOrId('social_messages');

        const follows = new Collection({ name: 'social_follows', type: 'base' });
        follows.fields.add(
            new RelationField({
                name: 'follower',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new RelationField({
                name: 'following',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new AutodateField({ name: 'created', onCreate: true }),
            new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
        );
        follows.indexes = [
            'CREATE UNIQUE INDEX idx_social_follows_pair ON social_follows (follower, following)',
            'CREATE INDEX idx_social_follows_following ON social_follows (following)',
        ];
        follows.listRule = '@request.auth.id != ""';
        follows.viewRule = '@request.auth.id != ""';
        follows.createRule = '@request.auth.id != "" && follower = @request.auth.id && following != @request.auth.id';
        follows.deleteRule = '@request.auth.id != "" && follower = @request.auth.id';
        app.save(follows);

        const conversations = new Collection({ name: 'social_conversations', type: 'base' });
        conversations.fields.add(
            new SelectField({
                name: 'type',
                required: true,
                maxSelect: 1,
                values: ['dm', 'group'],
            }),
            new TextField({ name: 'name', max: 128 }),
            new RelationField({
                name: 'created_by',
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new RelationField({
                name: 'members',
                required: true,
                collectionId: users.id,
                maxSelect: 100,
                cascadeDelete: true,
            }),
            new AutodateField({ name: 'created', onCreate: true }),
            new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
        );
        conversations.indexes = ['CREATE INDEX idx_social_conversations_type ON social_conversations (type)'];
        conversations.listRule = '@request.auth.id != "" && members.id ?= @request.auth.id';
        conversations.viewRule = '@request.auth.id != "" && members.id ?= @request.auth.id';
        conversations.createRule = '@request.auth.id != "" && @request.body.members.id ?= @request.auth.id';
        conversations.updateRule = '@request.auth.id != "" && members.id ?= @request.auth.id';
        conversations.deleteRule = '@request.auth.id != "" && (created_by = @request.auth.id || type = "dm")';
        app.save(conversations);

        messages.fields.add(
            new RelationField({
                name: 'conversation',
                collectionId: conversations.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new FileField({
                name: 'image',
                maxSelect: 1,
                maxSize: 10485760,
                mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'],
            })
        );
        messages.indexes = [
            ...messages.indexes,
            'CREATE INDEX idx_social_messages_conversation ON social_messages (conversation)',
        ];
        app.save(messages);

        const posts = new Collection({ name: 'social_posts', type: 'base' });
        posts.fields.add(
            new RelationField({
                name: 'author',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new TextField({ name: 'body', max: 2048 }),
            new JSONField({ name: 'payload' }),
            new JSONField({ name: 'repost_of' }),
            new FileField({
                name: 'image',
                maxSelect: 1,
                maxSize: 10485760,
                mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'],
            }),
            new AutodateField({ name: 'created', onCreate: true }),
            new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
        );
        posts.indexes = ['CREATE INDEX idx_social_posts_author ON social_posts (author)', 'CREATE INDEX idx_social_posts_created ON social_posts (created)'];
        posts.listRule = '@request.auth.id != ""';
        posts.viewRule = '@request.auth.id != ""';
        posts.createRule = '@request.auth.id != "" && author = @request.auth.id';
        posts.updateRule = '@request.auth.id != "" && author = @request.auth.id';
        posts.deleteRule = '@request.auth.id != "" && author = @request.auth.id';
        app.save(posts);

        const postLikes = new Collection({ name: 'social_post_likes', type: 'base' });
        postLikes.fields.add(
            new RelationField({
                name: 'post',
                required: true,
                collectionId: posts.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new RelationField({
                name: 'user',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new AutodateField({ name: 'created', onCreate: true })
        );
        postLikes.indexes = ['CREATE UNIQUE INDEX idx_social_post_likes_pair ON social_post_likes (post, user)'];
        postLikes.listRule = '@request.auth.id != ""';
        postLikes.viewRule = '@request.auth.id != ""';
        postLikes.createRule = '@request.auth.id != "" && user = @request.auth.id';
        postLikes.deleteRule = '@request.auth.id != "" && user = @request.auth.id';
        app.save(postLikes);

        const postComments = new Collection({ name: 'social_post_comments', type: 'base' });
        postComments.fields.add(
            new RelationField({
                name: 'post',
                required: true,
                collectionId: posts.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new RelationField({
                name: 'author',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new TextField({ name: 'body', required: true, max: 1024 }),
            new AutodateField({ name: 'created', onCreate: true })
        );
        postComments.indexes = ['CREATE INDEX idx_social_post_comments_post ON social_post_comments (post)'];
        postComments.listRule = '@request.auth.id != ""';
        postComments.viewRule = '@request.auth.id != ""';
        postComments.createRule = '@request.auth.id != "" && author = @request.auth.id';
        postComments.deleteRule = '@request.auth.id != "" && author = @request.auth.id';
        app.save(postComments);

        const pins = new Collection({ name: 'social_pins', type: 'base' });
        pins.fields.add(
            new RelationField({
                name: 'user',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new TextField({ name: 'kind', required: true, max: 16 }),
            new TextField({ name: 'ref', max: 256 }),
            new JSONField({ name: 'payload' }),
            new AutodateField({ name: 'created', onCreate: true })
        );
        pins.indexes = ['CREATE UNIQUE INDEX idx_social_pins_ref ON social_pins (user, ref)'];
        pins.listRule = '@request.auth.id != "" && user = @request.auth.id';
        pins.viewRule = '@request.auth.id != "" && user = @request.auth.id';
        pins.createRule = '@request.auth.id != "" && user = @request.auth.id';
        pins.deleteRule = '@request.auth.id != "" && user = @request.auth.id';
        app.save(pins);

        const mutes = new Collection({ name: 'social_mutes', type: 'base' });
        mutes.fields.add(
            new RelationField({
                name: 'user',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new RelationField({
                name: 'conversation',
                required: true,
                collectionId: conversations.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new AutodateField({ name: 'created', onCreate: true })
        );
        mutes.indexes = ['CREATE UNIQUE INDEX idx_social_mutes_pair ON social_mutes (user, conversation)'];
        mutes.listRule = '@request.auth.id != "" && user = @request.auth.id';
        mutes.viewRule = '@request.auth.id != "" && user = @request.auth.id';
        mutes.createRule = '@request.auth.id != "" && user = @request.auth.id';
        mutes.deleteRule = '@request.auth.id != "" && user = @request.auth.id';
        app.save(mutes);

        const reads = new Collection({ name: 'social_reads', type: 'base' });
        reads.fields.add(
            new RelationField({
                name: 'user',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new RelationField({
                name: 'conversation',
                required: true,
                collectionId: conversations.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new DateField({ name: 'last_read' }),
            new AutodateField({ name: 'created', onCreate: true }),
            new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
        );
        reads.indexes = ['CREATE UNIQUE INDEX idx_social_reads_pair ON social_reads (user, conversation)'];
        reads.listRule = '@request.auth.id != "" && user = @request.auth.id';
        reads.viewRule = '@request.auth.id != "" && user = @request.auth.id';
        reads.createRule = '@request.auth.id != "" && user = @request.auth.id';
        reads.updateRule = '@request.auth.id != "" && user = @request.auth.id';
        reads.deleteRule = '@request.auth.id != "" && user = @request.auth.id';
        app.save(reads);

        // Backfill: one DM conversation per existing sender/recipient pair.
        const existing = app.findRecordsByFilter('social_messages', 'conversation = ""', '', 0, 0);
        const pairs = new Map();
        for (const message of existing) {
            const sender = message.getString('sender');
            const recipient = message.getString('recipient');
            if (!sender || !recipient) continue;
            const key = [sender, recipient].sort().join(':');
            if (!pairs.has(key)) pairs.set(key, [sender, recipient]);
        }
        for (const [key, [a, b]] of pairs) {
            const conversation = new Record(conversations);
            conversation.set('type', 'dm');
            conversation.set('created_by', a);
            conversation.set('members', [a, b]);
            app.save(conversation);
            const conversationId = conversation.getString('id');
            const pairMessages = app.findRecordsByFilter(
                'social_messages',
                `(sender = "${a}" && recipient = "${b}") || (sender = "${b}" && recipient = "${a}")`,
                '',
                0,
                0
            );
            for (const message of pairMessages) {
                message.set('conversation', conversationId);
                app.save(message);
            }
        }
    },
    (app) => {
        for (const name of [
            'social_reads',
            'social_mutes',
            'social_pins',
            'social_post_comments',
            'social_post_likes',
            'social_posts',
            'social_follows',
            'social_conversations',
        ]) {
            try {
                app.delete(app.findCollectionByNameOrId(name));
            } catch (_) {}
        }
        try {
            const messages = app.findCollectionByNameOrId('social_messages');
            for (const fieldName of ['conversation', 'image']) {
                const field = messages.fields.getByName(fieldName);
                if (field) messages.fields.removeByName(fieldName);
            }
            app.save(messages);
        } catch (_) {}
    }
);
