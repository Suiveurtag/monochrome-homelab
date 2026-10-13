/* eslint-disable no-undef */
migrate(
    (app) => {
        const users = app.findCollectionByNameOrId('users');
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.add(new BoolField({ name: 'stats_lock_long_term' }));
        app.save(config);
        // No record API access: the period-aware endpoint owns privacy and locks.
        const sessions = new Collection({ type: 'base', name: 'listening_sessions' });
        sessions.fields.add(
            new RelationField({
                name: 'user',
                collectionId: users.id,
                required: true,
                maxSelect: 1,
                cascadeDelete: true,
            }),
            new TextField({ name: 'session_id', required: true, max: 64 }),
            new TextField({ name: 'track_id', required: true, max: 128 }),
            new JSONField({ name: 'track', maxSize: 20000 }),
            new NumberField({ name: 'started_at', required: true }),
            new NumberField({ name: 'last_at', required: true }),
            new NumberField({ name: 'seconds', min: 0 }),
            new BoolField({ name: 'qualified' }),
            new BoolField({ name: 'ended' }),
            new JSONField({ name: 'slices', maxSize: 200000 })
        );
        sessions.indexes = [
            'CREATE UNIQUE INDEX idx_listening_session_identity ON listening_sessions (user, session_id)',
            'CREATE INDEX idx_listening_user_time ON listening_sessions (user, started_at)',
        ];
        sessions.listRule = sessions.viewRule = sessions.createRule = sessions.updateRule = sessions.deleteRule = null;
        app.save(sessions);
        const totals = new Collection({ type: 'base', name: 'listening_totals' });
        totals.fields.add(
            new TextField({ name: 'track_id', required: true, max: 128 }),
            new NumberField({ name: 'streams', min: 0 })
        );
        totals.indexes = ['CREATE UNIQUE INDEX idx_listening_totals_track ON listening_totals (track_id)'];
        totals.listRule = totals.viewRule = '@request.auth.id != "" && @request.auth.access_status = "active"';
        totals.createRule = totals.updateRule = totals.deleteRule = null;
        app.save(totals);
    },
    (app) => {
        app.delete(app.findCollectionByNameOrId('listening_sessions'));
        app.delete(app.findCollectionByNameOrId('listening_totals'));
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.removeByName('stats_lock_long_term');
        app.save(config);
    }
);
