/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />
migrate(
    (app) => {
        const collection = app.findCollectionByNameOrId('music_tracks');
        collection.fields.add(new NumberField({ name: 'audio_size', min: 0, onlyInt: true }));
        app.save(collection);
        const filesystem = app.newFilesystem();
        try {
            for (let offset = 0; ; offset += 250) {
                const records = app.findRecordsByFilter('music_tracks', '', 'id', 250, offset);
                if (!records.length) break;
                for (const record of records) {
                    try {
                        const info = filesystem.attributes(record.baseFilesPath() + '/' + record.getString('audio'));
                        record.set('audio_size', info.size);
                        app.save(record);
                    } catch {
                        /* Missing legacy files stay unknown; never estimate from duration. */
                    }
                }
            }
        } finally {
            filesystem.close();
        }
    },
    (app) => {
        const collection = app.findCollectionByNameOrId('music_tracks');
        collection.fields.removeByName('audio_size');
        app.save(collection);
    }
);
