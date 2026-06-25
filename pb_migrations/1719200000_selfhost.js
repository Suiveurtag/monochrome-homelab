/// <reference path="../pb_data/types.d.ts" />

function findOrCreate(app, name) {
    try {
        return app.findCollectionByNameOrId(name);
    } catch (_) {
        return new Collection({ name, type: 'base' });
    }
}

migrate((app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_');

    const userData = findOrCreate(app, 'DB_users');
    userData.fields.add(
        new TextField({ name: 'firebase_id', required: true, max: 128 }),
        new TextField({ name: 'username', max: 128 }),
        new TextField({ name: 'display_name', max: 128 }),
        new TextField({ name: 'avatar_url' }),
        new TextField({ name: 'banner' }),
        new TextField({ name: 'status', max: 256 }),
        new TextField({ name: 'about' }),
        new TextField({ name: 'website' }),
        new TextField({ name: 'lastfm_username', max: 128 }),
        new JSONField({ name: 'library' }),
        new JSONField({ name: 'history' }),
        new JSONField({ name: 'user_playlists' }),
        new JSONField({ name: 'user_folders' }),
        new JSONField({ name: 'favorite_albums' }),
        new JSONField({ name: 'privacy' })
    );
    userData.indexes = ['CREATE UNIQUE INDEX IF NOT EXISTS idx_db_users_firebase_id ON DB_users (firebase_id)'];
    app.save(userData);
    userData.listRule = '@request.auth.id != "" && firebase_id = @request.auth.id';
    userData.viewRule = '@request.auth.id != "" && firebase_id = @request.auth.id';
    userData.createRule = '@request.auth.id != ""';
    userData.updateRule = '@request.auth.id != "" && firebase_id = @request.auth.id';
    userData.deleteRule = '@request.auth.id != "" && firebase_id = @request.auth.id';
    app.save(userData);

    const publicPlaylists = findOrCreate(app, 'public_playlists');
    publicPlaylists.fields.add(
        new TextField({ name: 'uuid', required: true, max: 128 }),
        new TextField({ name: 'uid', required: true, max: 128 }),
        new TextField({ name: 'firebase_id', max: 128 }),
        new TextField({ name: 'title', max: 256 }),
        new TextField({ name: 'name', max: 256 }),
        new TextField({ name: 'playlist_name', max: 256 }),
        new TextField({ name: 'image' }),
        new TextField({ name: 'cover' }),
        new TextField({ name: 'playlist_cover' }),
        new TextField({ name: 'description' }),
        new JSONField({ name: 'tracks' }),
        new BoolField({ name: 'isPublic' }),
        new JSONField({ name: 'data' })
    );
    publicPlaylists.indexes = ['CREATE UNIQUE INDEX IF NOT EXISTS idx_public_playlists_uuid ON public_playlists (uuid)'];
    app.save(publicPlaylists);
    publicPlaylists.listRule = 'isPublic = true';
    publicPlaylists.viewRule = 'isPublic = true || (@request.auth.id != "" && uid = @request.auth.id)';
    publicPlaylists.createRule = '@request.auth.id != "" && uid = @request.auth.id';
    publicPlaylists.updateRule = '@request.auth.id != "" && uid = @request.auth.id';
    publicPlaylists.deleteRule = '@request.auth.id != "" && uid = @request.auth.id';
    app.save(publicPlaylists);

    const tracks = findOrCreate(app, 'music_tracks');
    tracks.fields.add(
        new RelationField({ name: 'owner', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }),
        new TextField({ name: 'title', required: true, max: 512 }),
        new TextField({ name: 'artist', required: true, max: 512 }),
        new TextField({ name: 'album', max: 512 }),
        new TextField({ name: 'album_artist', max: 512 }),
        new DateField({ name: 'release_date' }),
        new NumberField({ name: 'duration', min: 0 }),
        new NumberField({ name: 'track_number', min: 0 }),
        new BoolField({ name: 'explicit' }),
        new FileField({
            name: 'audio',
            required: true,
            maxSelect: 1,
            maxSize: 2147483648,
            mimeTypes: ['audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/x-wav'],
        }),
        new FileField({
            name: 'cover',
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        })
    );
    tracks.indexes = [
        'CREATE INDEX IF NOT EXISTS idx_music_tracks_owner ON music_tracks (owner)',
        'CREATE INDEX IF NOT EXISTS idx_music_tracks_artist ON music_tracks (artist)',
        'CREATE INDEX IF NOT EXISTS idx_music_tracks_album ON music_tracks (album)',
    ];
    app.save(tracks);
    tracks.listRule = '@request.auth.id != "" && owner = @request.auth.id';
    tracks.viewRule = '@request.auth.id != "" && owner = @request.auth.id';
    tracks.createRule = '@request.auth.id != "" && owner = @request.auth.id';
    tracks.updateRule = '@request.auth.id != "" && owner = @request.auth.id';
    tracks.deleteRule = '@request.auth.id != "" && owner = @request.auth.id';
    app.save(tracks);
}, (app) => {
    for (const name of ['music_tracks', 'public_playlists', 'DB_users']) {
        try {
            const collection = app.findCollectionByNameOrId(name);
            app.delete(collection);
        } catch (_) {}
    }
});
