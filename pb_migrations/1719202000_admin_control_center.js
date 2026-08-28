/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

const ACTIVE_MEMBER = '@request.auth.id != "" && @request.auth.access_status = "active"';
const ADMIN = '@request.auth.role = "admin"';
const CONFIG = '@collection.app_config';

const permitted = (field) => `${ACTIVE_MEMBER} && (${ADMIN} || ${CONFIG}.${field} = true)`;
const featurePermitted = (feature, permission) =>
    `${ACTIVE_MEMBER} && (${ADMIN} || (${CONFIG}.${feature} = true && ${CONFIG}.${permission} = true))`;

migrate(
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        config.fields.add(
            new TextField({ name: 'instance_name', max: 128 }),
            new TextField({ name: 'support_email', max: 254 }),
            new BoolField({ name: 'feature_social' }),
            new BoolField({ name: 'feature_stats' }),
            new BoolField({ name: 'feature_uploads' }),
            new BoolField({ name: 'feature_parties' }),
            new BoolField({ name: 'allow_uploads' }),
            new BoolField({ name: 'allow_catalog_edits' }),
            new BoolField({ name: 'allow_catalog_deletes' }),
            new BoolField({ name: 'allow_downloads' }),
            new BoolField({ name: 'allow_social_posts' }),
            new BoolField({ name: 'allow_parties' })
        );
        app.save(config);

        const records = app.findRecordsByFilter(config.id, 'id != ""', '', 1, 0);
        for (const record of records) {
            record.set('instance_name', 'Monochrome');
            record.set('support_email', '');
            for (const field of [
                'feature_social',
                'feature_stats',
                'feature_uploads',
                'feature_parties',
                'allow_uploads',
                'allow_catalog_edits',
                'allow_catalog_deletes',
                'allow_downloads',
                'allow_social_posts',
                'allow_parties',
            ]) {
                record.set(field, true);
            }
            app.save(record);
        }

        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.createRule = `${featurePermitted('feature_uploads', 'allow_uploads')} && owner = @request.auth.id`;
        tracks.updateRule = permitted('allow_catalog_edits');
        tracks.deleteRule = permitted('allow_catalog_deletes');
        app.save(tracks);

        const jobs = app.findCollectionByNameOrId('music_import_jobs');
        jobs.createRule = `${featurePermitted('feature_uploads', 'allow_uploads')} && owner = @request.auth.id`;
        app.save(jobs);

        const posts = app.findCollectionByNameOrId('social_posts');
        posts.createRule = `${featurePermitted('feature_social', 'allow_social_posts')} && author = @request.auth.id`;
        posts.updateRule = `${featurePermitted('feature_social', 'allow_social_posts')} && author = @request.auth.id`;
        app.save(posts);
    },
    (app) => {
        const config = app.findCollectionByNameOrId('app_config');
        for (const field of [
            'instance_name',
            'support_email',
            'feature_social',
            'feature_stats',
            'feature_uploads',
            'feature_parties',
            'allow_uploads',
            'allow_catalog_edits',
            'allow_catalog_deletes',
            'allow_downloads',
            'allow_social_posts',
            'allow_parties',
        ]) {
            config.fields.removeByName(field);
        }
        app.save(config);

        const tracks = app.findCollectionByNameOrId('music_tracks');
        tracks.createRule = `${ACTIVE_MEMBER} && owner = @request.auth.id`;
        tracks.updateRule = ACTIVE_MEMBER;
        tracks.deleteRule = ACTIVE_MEMBER;
        app.save(tracks);

        const jobs = app.findCollectionByNameOrId('music_import_jobs');
        jobs.createRule = '@request.auth.id != "" && owner = @request.auth.id';
        app.save(jobs);

        const posts = app.findCollectionByNameOrId('social_posts');
        posts.createRule = '@request.auth.id != "" && author = @request.auth.id';
        posts.updateRule = '@request.auth.id != "" && author = @request.auth.id';
        app.save(posts);
    }
);
