/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

const ACTIVE_USER = '@request.auth.id != "" && @request.auth.access_status = "active"';
const ADMIN_USER = `${ACTIVE_USER} && @request.auth.role = "admin"`;

function addActiveUser(rule) {
    if (rule === null) return null;
    if (!rule) return ACTIVE_USER;
    return `${ACTIVE_USER} && (${rule})`;
}

migrate(
    (app) => {
        const users = app.findCollectionByNameOrId('_pb_users_auth_');
        users.fields.add(
            new SelectField({
                name: 'access_status',
                required: true,
                maxSelect: 1,
                values: ['pending', 'active', 'banned'],
            }),
            new SelectField({ name: 'role', required: true, maxSelect: 1, values: ['member', 'admin'] })
        );
        app.save(users);

        const config = new Collection({ name: 'app_config', type: 'base' });
        config.fields.add(
            new BoolField({ name: 'registrations_open' }),
            new BoolField({ name: 'maintenance_mode' }),
            new TextField({ name: 'announcement', max: 1000 })
        );
        config.listRule = '';
        config.viewRule = '';
        config.createRule = null;
        config.updateRule = ADMIN_USER;
        config.deleteRule = null;
        app.save(config);

        const configRecord = new Record(config);
        configRecord.set('registrations_open', true);
        configRecord.set('maintenance_mode', false);
        configRecord.set('announcement', '');
        app.save(configRecord);

        users.authRule = 'access_status = "active"';
        users.listRule = `${ADMIN_USER} || id = @request.auth.id`;
        users.viewRule = `${ADMIN_USER} || id = @request.auth.id`;
        users.createRule =
            '@collection.app_config.registrations_open = true && ' +
            '@request.body.access_status = "pending" && @request.body.role = "member"';
        users.updateRule = `${ADMIN_USER} && id != @request.auth.id`;
        users.deleteRule = `${ADMIN_USER} && id != @request.auth.id`;
        users.manageRule = ADMIN_USER;
        app.save(users);

        const existingUsers = app.findRecordsByFilter(users.id, 'id != ""', '', 10000, 0);
        for (const user of existingUsers) {
            const identity = `${user.getString('name')} ${user.getString('email')}`.toLowerCase();
            user.set('access_status', 'active');
            user.set('role', /(^|[\s@._-])suiveurtag([\s@._-]|$)/.test(identity) ? 'admin' : 'member');
            app.save(user);
        }

        for (const name of [
            'DB_users',
            'public_playlists',
            'music_tracks',
            'social_profiles',
            'social_presence',
            'social_messages',
        ]) {
            try {
                const collection = app.findCollectionByNameOrId(name);
                collection.listRule = addActiveUser(collection.listRule);
                collection.viewRule = addActiveUser(collection.viewRule);
                collection.createRule = addActiveUser(collection.createRule);
                collection.updateRule = addActiveUser(collection.updateRule);
                collection.deleteRule = addActiveUser(collection.deleteRule);
                app.save(collection);
            } catch (_) {}
        }
    },
    (app) => {
        const users = app.findCollectionByNameOrId('_pb_users_auth_');
        users.fields.removeByName('access_status');
        users.fields.removeByName('role');
        users.authRule = '';
        users.listRule = null;
        users.viewRule = null;
        users.createRule = '';
        users.updateRule = 'id = @request.auth.id';
        users.deleteRule = 'id = @request.auth.id';
        users.manageRule = null;
        app.save(users);

        try {
            app.delete(app.findCollectionByNameOrId('app_config'));
        } catch (_) {}
    }
);
