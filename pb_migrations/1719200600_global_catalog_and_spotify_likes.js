migrate((app) => {
    for (const name of ['music_tracks', 'music_artists', 'music_albums']) {
        const collection = app.findCollectionByNameOrId(name);
        collection.listRule = '';
        collection.viewRule = '';
        app.save(collection);
    }

    const jobs = app.findCollectionByNameOrId('music_import_jobs');
    jobs.fields.add(
        new BoolField({ name: 'like_after_import' }),
        new TextField({ name: 'spotify_user_id', max: 128 })
    );
    app.save(jobs);
}, (app) => {
    for (const name of ['music_tracks', 'music_artists', 'music_albums']) {
        const collection = app.findCollectionByNameOrId(name);
        collection.listRule = '@request.auth.id != "" && owner = @request.auth.id';
        collection.viewRule = '@request.auth.id != "" && owner = @request.auth.id';
        app.save(collection);
    }
    const jobs = app.findCollectionByNameOrId('music_import_jobs');
    jobs.fields.removeByName('like_after_import');
    jobs.fields.removeByName('spotify_user_id');
    app.save(jobs);
});
