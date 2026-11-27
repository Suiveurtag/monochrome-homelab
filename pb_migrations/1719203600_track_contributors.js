/* eslint-disable no-undef */
migrate((app) => {
    const tracks = app.findCollectionByNameOrId('music_tracks');
    const users = app.findCollectionByNameOrId('users');
    tracks.fields.add(new RelationField({ name: 'editors', collectionId: users.id, maxSelect: 999 }));
    app.save(tracks);
}, (app) => {
    const tracks = app.findCollectionByNameOrId('music_tracks');
    tracks.fields.removeByName('editors');
    app.save(tracks);
});
