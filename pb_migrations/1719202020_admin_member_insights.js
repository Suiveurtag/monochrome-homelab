/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

// Administrators can inspect member profile data and uploaded catalogue items
// from the in-app control room. Members retain their existing self-only rules.
const ADMIN = '@request.auth.id != "" && @request.auth.access_status = "active" && @request.auth.role = "admin"';

migrate(
    (app) => {
        const userData = app.findCollectionByNameOrId('DB_users');
        userData.listRule = `${ADMIN} || ${userData.listRule || 'false'}`;
        userData.viewRule = `${ADMIN} || ${userData.viewRule || 'false'}`;
        app.save(userData);

        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.listRule = `${ADMIN} || ${tracks.listRule || 'false'}`;
        tracks.viewRule = `${ADMIN} || ${tracks.viewRule || 'false'}`;
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
