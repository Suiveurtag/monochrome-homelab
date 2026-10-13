/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

const ACTIVE_MEMBER = '@request.auth.id != "" && @request.auth.access_status = "active"';
const ADMIN = `${ACTIVE_MEMBER} && @request.auth.role = "admin"`;
const CONFIG = '@collection.app_config';

migrate(
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.add(
            new BoolField({ name: 'require_login' }),
            new BoolField({ name: 'require_approval' }),
            new BoolField({ name: 'allow_guest_uploads' })
        );
        app.save(config);

        for (const record of app.findRecordsByFilter(config.id, 'id != ""', '', 1, 0)) {
            record.set('require_login', true);
            record.set('require_approval', true);
            record.set('allow_guest_uploads', false);
            app.save(record);
        }

        const users = app.findCollectionByNameOrId('_pb_users_auth_');
        users.createRule =
            `${CONFIG}.registrations_open = true && ` +
            `@request.body.role = "member" && (` +
            `(${CONFIG}.require_approval = true && @request.body.access_status = "pending") || ` +
            `(${CONFIG}.require_approval = false && @request.body.access_status = "active"))`;
        app.save(users);

        // Guests may read the shared catalogue only when the instance is in
        // public mode. All catalogue writes remain restricted to active users.
        const tracks = app.findCollectionByNameOrId('music_tracks');
        const publicOrMember = `${CONFIG}.require_login = false || (${ACTIVE_MEMBER} && (${ADMIN} || owner = @request.auth.id))`;
        tracks.listRule = publicOrMember;
        tracks.viewRule = publicOrMember;
        tracks.fields.getByName('owner').required = false;
        tracks.createRule =
            `(${ACTIVE_MEMBER} && (${ADMIN} || (${CONFIG}.feature_uploads = true && ${CONFIG}.allow_uploads = true)) && owner = @request.auth.id) || ` +
            `(${CONFIG}.require_login = false && ${CONFIG}.allow_guest_uploads = true && ${CONFIG}.feature_uploads = true && ${CONFIG}.allow_uploads = true && owner = "")`;
        app.save(tracks);
    },
    (app) => {
        const users = app.findCollectionByNameOrId('_pb_users_auth_');
        users.createRule =
            '@collection.app_config.registrations_open = true && ' +
            '@request.body.access_status = "pending" && @request.body.role = "member"';
        app.save(users);

        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.listRule = `${ACTIVE_MEMBER} && (${ADMIN} || owner = @request.auth.id)`;
        tracks.viewRule = `${ACTIVE_MEMBER} && (${ADMIN} || owner = @request.auth.id)`;
        const ownerField = tracks.fields.getByName('owner');
        ownerField.required = app.findRecordsByFilter(tracks.id, 'owner = ""', '', 1, 0).length === 0;
        tracks.createRule =
            `@request.auth.id != "" && @request.auth.access_status = "active" && ` +
            `(@request.auth.role = "admin" || (@collection.app_config.feature_uploads = true && @collection.app_config.allow_uploads = true)) && owner = @request.auth.id`;
        app.save(tracks);

        const config = app.findCollectionByNameOrId('app_config');
        config.fields.removeByName('require_login');
        config.fields.removeByName('require_approval');
        config.fields.removeByName('allow_guest_uploads');
        app.save(config);
    }
);
