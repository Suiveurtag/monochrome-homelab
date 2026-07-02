/// <reference path="../pb_data/types.d.ts" />

function collection(app, name) {
    try {
        return app.findCollectionByNameOrId(name);
    } catch (_) {
        return new Collection({ name, type: 'base' });
    }
}

migrate((app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_');
    const tracks = app.findCollectionByNameOrId('music_tracks');

    const artists = collection(app, 'music_artists');
    artists.fields.add(
        new RelationField({ name: 'owner', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }),
        new TextField({ name: 'spotify_id', required: true, max: 64 }),
        new TextField({ name: 'name', required: true, max: 512 }),
        new TextField({ name: 'image' }),
        new TextField({ name: 'spotify_url' }),
        new JSONField({ name: 'genres' }),
        new NumberField({ name: 'followers', min: 0 }),
        new AutodateField({ name: 'created', onCreate: true }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
    );
    artists.indexes = [
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_music_artists_owner_spotify ON music_artists (owner, spotify_id)',
        'CREATE INDEX IF NOT EXISTS idx_music_artists_owner_name ON music_artists (owner, name)',
    ];
    artists.listRule = artists.viewRule = '@request.auth.id != "" && owner = @request.auth.id';
    artists.createRule = artists.updateRule = artists.deleteRule = '@request.auth.id != "" && owner = @request.auth.id';
    app.save(artists);

    const albums = collection(app, 'music_albums');
    albums.fields.add(
        new RelationField({ name: 'owner', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }),
        new TextField({ name: 'spotify_id', required: true, max: 64 }),
        new TextField({ name: 'title', required: true, max: 512 }),
        new RelationField({ name: 'artists', collectionId: artists.id, maxSelect: 20 }),
        new TextField({ name: 'artist_name', max: 512 }),
        new TextField({ name: 'cover' }),
        new TextField({ name: 'spotify_url' }),
        new TextField({ name: 'upc', max: 64 }),
        new DateField({ name: 'release_date' }),
        new NumberField({ name: 'total_tracks', min: 0 }),
        new NumberField({ name: 'total_discs', min: 0 }),
        new TextField({ name: 'label', max: 512 }),
        new TextField({ name: 'copyright', max: 2048 }),
        new AutodateField({ name: 'created', onCreate: true }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
    );
    albums.indexes = [
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_music_albums_owner_spotify ON music_albums (owner, spotify_id)',
        'CREATE INDEX IF NOT EXISTS idx_music_albums_owner_title ON music_albums (owner, title)',
    ];
    albums.listRule = albums.viewRule = '@request.auth.id != "" && owner = @request.auth.id';
    albums.createRule = albums.updateRule = albums.deleteRule = '@request.auth.id != "" && owner = @request.auth.id';
    app.save(albums);

    tracks.fields.add(
        new TextField({ name: 'spotify_id', max: 64 }),
        new TextField({ name: 'spotify_url' }),
        new TextField({ name: 'isrc', max: 64 }),
        new RelationField({ name: 'artists_rel', collectionId: artists.id, maxSelect: 20 }),
        new RelationField({ name: 'album_rel', collectionId: albums.id, maxSelect: 1 }),
        new NumberField({ name: 'disc_number', min: 0 }),
        new NumberField({ name: 'total_tracks', min: 0 }),
        new NumberField({ name: 'total_discs', min: 0 }),
        new TextField({ name: 'upc', max: 64 }),
        new TextField({ name: 'composer', max: 2048 }),
        new TextField({ name: 'publisher', max: 1024 }),
        new TextField({ name: 'copyright', max: 2048 }),
        new TextField({ name: 'source_provider', max: 64 }),
        new JSONField({ name: 'audio_info' })
    );
    tracks.indexes = [
        ...tracks.indexes,
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_music_tracks_owner_spotify ON music_tracks (owner, spotify_id) WHERE spotify_id != ""',
        'CREATE INDEX IF NOT EXISTS idx_music_tracks_owner_isrc ON music_tracks (owner, isrc)',
    ];
    app.save(tracks);

    const jobs = collection(app, 'music_import_jobs');
    jobs.fields.add(
        new RelationField({ name: 'owner', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }),
        new TextField({ name: 'source_url', required: true, max: 2048 }),
        new SelectField({ name: 'source_type', values: ['track', 'album', 'playlist'] }),
        new TextField({ name: 'title', max: 512 }),
        new TextField({ name: 'description', max: 4096 }),
        new TextField({ name: 'cover' }),
        new SelectField({ name: 'status', required: true, values: ['queued', 'resolving', 'downloading', 'completed', 'partial', 'failed', 'cancelled'] }),
        new NumberField({ name: 'total', min: 0 }),
        new NumberField({ name: 'completed', min: 0 }),
        new NumberField({ name: 'failed', min: 0 }),
        new TextField({ name: 'current_track', max: 512 }),
        new TextField({ name: 'error', max: 8192 }),
        new JSONField({ name: 'items' }),
        new JSONField({ name: 'track_ids' }),
        new BoolField({ name: 'playlist_created' }),
        new AutodateField({ name: 'created', onCreate: true }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
    );
    jobs.indexes = [
        'CREATE INDEX IF NOT EXISTS idx_music_import_jobs_owner_created ON music_import_jobs (owner, created)',
        'CREATE INDEX IF NOT EXISTS idx_music_import_jobs_owner_status ON music_import_jobs (owner, status)',
    ];
    jobs.listRule = jobs.viewRule = '@request.auth.id != "" && owner = @request.auth.id';
    jobs.createRule = jobs.updateRule = jobs.deleteRule = '@request.auth.id != "" && owner = @request.auth.id';
    app.save(jobs);
}, (app) => {
    const tracks = app.findCollectionByNameOrId('music_tracks');
    for (const field of ['spotify_id', 'spotify_url', 'isrc', 'artists_rel', 'album_rel', 'disc_number', 'total_tracks', 'total_discs', 'upc', 'composer', 'publisher', 'copyright', 'source_provider', 'audio_info']) {
        try { tracks.fields.removeByName(field); } catch (_) {}
    }
    app.save(tracks);
    for (const name of ['music_import_jobs', 'music_albums', 'music_artists']) {
        try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
    }
});
