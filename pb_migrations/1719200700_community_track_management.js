/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

const ACTIVE_MEMBER = '@request.auth.id != "" && @request.auth.access_status = "active"';

migrate(
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.updateRule = ACTIVE_MEMBER;
        tracks.deleteRule = ACTIVE_MEMBER;
        app.save(tracks);
    },
    (app) => {
        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.updateRule = `${ACTIVE_MEMBER} && owner = @request.auth.id`;
        tracks.deleteRule = `${ACTIVE_MEMBER} && owner = @request.auth.id`;
        app.save(tracks);
    }
);
