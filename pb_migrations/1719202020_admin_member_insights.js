/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

// Administrators can inspect member profile data and uploaded catalogue items
// from the in-app control room. Members retain their existing self-only rules.
const ACTIVE_ADMIN =
    '@request.auth.id != "" && @request.auth.access_status = "active" && @request.auth.role = "admin"';
const ACTIVE_MEMBER = '@request.auth.id != "" && @request.auth.access_status = "active"';

migrate(
    (app) => {
        const userData = app.findCollectionByNameOrId('DB_users');
        userData.listRule = `${ACTIVE_MEMBER} && (${ACTIVE_ADMIN} || firebase_id = @request.auth.id)`;
        userData.viewRule = `${ACTIVE_MEMBER} && (${ACTIVE_ADMIN} || firebase_id = @request.auth.id)`;
        app.save(userData);

        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.listRule = `${ACTIVE_MEMBER} && (${ACTIVE_ADMIN} || owner = @request.auth.id)`;
        tracks.viewRule = `${ACTIVE_MEMBER} && (${ACTIVE_ADMIN} || owner = @request.auth.id)`;
        app.save(tracks);
    },
    (app) => {
        const userData = app.findCollectionByNameOrId('DB_users');
        userData.listRule =
            '@request.auth.id != "" && @request.auth.access_status = "active" && firebase_id = @request.auth.id';
        userData.viewRule =
            '@request.auth.id != "" && @request.auth.access_status = "active" && firebase_id = @request.auth.id';
        app.save(userData);

        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.listRule =
            '@request.auth.id != "" && @request.auth.access_status = "active" && owner = @request.auth.id';
        tracks.viewRule =
            '@request.auth.id != "" && @request.auth.access_status = "active" && owner = @request.auth.id';
        app.save(tracks);
    }
);
