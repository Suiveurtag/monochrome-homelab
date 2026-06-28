migrate((app) => {
    const tracks = app.findCollectionByNameOrId('music_tracks');
    tracks.fields.add(new TextField({ name: 'lyrics', max: 1048576 }));
    app.save(tracks);
}, (app) => {
    const tracks = app.findCollectionByNameOrId('music_tracks');
    tracks.fields.removeByName('lyrics');
    app.save(tracks);
});
