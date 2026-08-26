/// <reference path="../pb_data/types.d.ts" />

// Reciprocal social visibility blocks. Both participants may read the block so
// each client can remove the other account from every normal social surface;
// only the blocker may create or remove their record.

migrate(
    (app) => {
        const users = app.findCollectionByNameOrId('_pb_users_auth_');
        const blocks = new Collection({ name: 'social_blocks', type: 'base' });
        blocks.fields.add(
            new RelationField({
                name: 'blocker',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new RelationField({
                name: 'blocked',
                required: true,
                collectionId: users.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new AutodateField({ name: 'created', onCreate: true })
        );
        blocks.indexes = [
            'CREATE UNIQUE INDEX idx_social_blocks_pair ON social_blocks (blocker, blocked)',
            'CREATE INDEX idx_social_blocks_blocked ON social_blocks (blocked)',
        ];
        const involved = '@request.auth.id != "" && (blocker = @request.auth.id || blocked = @request.auth.id)';
        blocks.listRule = involved;
        blocks.viewRule = involved;
        blocks.createRule = '@request.auth.id != "" && blocker = @request.auth.id && blocked != @request.auth.id';
        blocks.deleteRule = '@request.auth.id != "" && blocker = @request.auth.id';
        app.save(blocks);
    },
    (app) => {
        app.delete(app.findCollectionByNameOrId('social_blocks'));
    }
);
