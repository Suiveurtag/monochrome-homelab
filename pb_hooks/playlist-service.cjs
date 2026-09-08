/* eslint-disable no-undef */
const { applyTrackOperation } = require('./playlist-operations.cjs');

function activeUser(app, id) {
    const user = app.findRecordById('users', id);
    if (user.getString('access_status') !== 'active') throw new ForbiddenError('An active account is required.');
    return user;
}

function json(record, field, fallback) {
    // JSONRaw is a Go byte slice in the JSVM; JSON.stringify encodes its bytes,
    // not the JSON document. Decode the field's textual representation instead.
    const value = record.getString(field);
    if (!value) return fallback;
    return JSON.parse(value) || fallback;
}

function refreshIdentities(app, record) {
    const ids = [record.getString('owner'), ...record.getStringSlice('members')];
    record.set(
        'identities',
        ids.map((id) => {
            const user = app.findRecordById('users', id);
            let name = user.getString('name') || 'Member';
            const profiles = app.findRecordsByFilter('DB_users', 'firebase_id = {:id}', '', 1, 0, { id });
            if (profiles.length)
                name = profiles[0].getString('display_name') || profiles[0].getString('username') || name;
            return { id, name, role: id === record.getString('owner') ? 'owner' : 'collaborator' };
        })
    );
}

function syncPublic(app, record, deleted) {
    const mirrors = app.findRecordsByFilter('public_playlists', 'uuid = {:uuid}', '', 1, 0, {
        uuid: record.getString('uuid'),
    });
    if (!record.getBool('isPublic') || deleted) {
        if (mirrors.length && mirrors[0].getString('uid') === record.getString('owner')) app.delete(mirrors[0]);
        return;
    }
    const mirror = mirrors[0] || new Record(app.findCollectionByNameOrId('public_playlists'));
    if (mirrors.length && mirror.getString('uid') !== record.getString('owner'))
        throw new ForbiddenError('Playlist belongs to another account.');
    const name = record.getString('name');
    const cover = record.getString('cover');
    const description = record.getString('description');
    const values = {
        uuid: record.getString('uuid'),
        uid: record.getString('owner'),
        firebase_id: record.getString('owner'),
        title: name,
        name,
        playlist_name: name,
        image: cover,
        cover,
        playlist_cover: cover,
        description,
        tracks: json(record, 'tracks', []),
        isPublic: true,
        data: { title: name, cover, description },
    };
    Object.keys(values).forEach((field) => mirror.set(field, values[field]));
    app.save(mirror);
}

function create(e) {
    const body = e.requestInfo().body;
    let result;
    e.app.runInTransaction((app) => {
        activeUser(app, e.auth.id);
        if (!body.uuid || !body.name || String(body.uuid).length > 128)
            throw new BadRequestError('Playlist name and ID are required.');
        const existing = app.findRecordsByFilter('shared_playlists', 'uuid = {:uuid}', '', 1, 0, { uuid: body.uuid });
        if (existing.length) {
            if (existing[0].getString('owner') !== e.auth.id)
                throw new ForbiddenError('Playlist belongs to another account.');
            result = existing[0];
            return;
        }
        const publicRecords = app.findRecordsByFilter('public_playlists', 'uuid = {:uuid}', '', 1, 0, {
            uuid: body.uuid,
        });
        if (publicRecords.length && publicRecords[0].getString('uid') !== e.auth.id)
            throw new ForbiddenError('Playlist belongs to another account.');
        const record = new Record(app.findCollectionByNameOrId('shared_playlists'));
        const values = {
            uuid: body.uuid,
            owner: e.auth.id,
            members: [],
            name: body.name,
            cover: body.cover || '',
            description: body.description || '',
            isPublic: !!body.isPublic,
            revision: 1,
        };
        Object.keys(values).forEach((field) => record.set(field, values[field]));
        try {
            record.set('tracks', applyTrackOperation([], { type: 'add', tracks: body.tracks || [] }, Date.now()));
        } catch (error) {
            throw new BadRequestError(error.message);
        }
        // Retire the owner's legacy snapshot at promotion so deleted shared playlists cannot reappear from cloud JSON.
        const profiles = app.findRecordsByFilter('DB_users', 'firebase_id = {:id}', '', 1, 0, { id: e.auth.id });
        if (profiles.length) {
            const playlists = json(profiles[0], 'user_playlists', {});
            delete playlists[body.uuid];
            profiles[0].set('user_playlists', playlists);
            app.save(profiles[0]);
        }
        refreshIdentities(app, record);
        app.save(record);
        syncPublic(app, record, false);
        result = record;
    });
    return result;
}

function mutate(e) {
    const body = e.requestInfo().body;
    const operation = body.operation || {};
    let result;
    e.app.runInTransaction((app) => {
        activeUser(app, e.auth.id);
        const record = app.findRecordById('shared_playlists', e.request.pathValue('id'));
        const owner = record.getString('owner') === e.auth.id;
        const members = Array.from(record.getStringSlice('members'));
        if (!owner && !members.includes(e.auth.id))
            throw new ForbiddenError('You no longer have access to this playlist.');
        if (body.revision !== record.getInt('revision'))
            throw new ApiError(409, 'Playlist changed. Refresh and try again.');
        if (['add', 'remove', 'reorder'].includes(operation.type)) {
            try {
                record.set('tracks', applyTrackOperation(json(record, 'tracks', []), operation, Date.now()));
            } catch (error) {
                throw new BadRequestError(error.message);
            }
        } else if (operation.type === 'add-member') {
            if (!owner) throw new ForbiddenError('Only the owner can add collaborators.');
            const query = String(operation.username || '')
                .trim()
                .replace(/^@/, '');
            if (!query) throw new BadRequestError('Enter a username or account ID.');
            const profiles = app.findRecordsByFilter(
                'DB_users',
                'username = {:query} || firebase_id = {:query}',
                '',
                2,
                0,
                { query }
            );
            let id = profiles.length === 1 ? profiles[0].getString('firebase_id') : '';
            if (!id && /^[a-z0-9]{15}$/.test(query)) {
                try {
                    id = app.findRecordById('users', query).id;
                } catch (_) {
                    /* Missing user is reported below. */
                }
            }
            if (!id) throw new BadRequestError('No unique account found. Use their exact username or account ID.');
            activeUser(app, id);
            if (id !== record.getString('owner') && !members.includes(id)) members.push(id);
            if (members.length > 50) throw new BadRequestError('A playlist can have up to 50 collaborators.');
            record.set('members', members);
        } else if (operation.type === 'remove-member' || operation.type === 'leave') {
            const id = operation.type === 'leave' ? e.auth.id : operation.userId;
            if (!owner && id !== e.auth.id) throw new ForbiddenError('Only the owner can remove other collaborators.');
            if (id === record.getString('owner')) throw new BadRequestError('The owner cannot leave their playlist.');
            record.set(
                'members',
                members.filter((member) => member !== id)
            );
        } else if (operation.type === 'metadata') {
            if (!owner) throw new ForbiddenError('Only the owner can edit playlist details.');
            ['name', 'description', 'cover', 'isPublic'].forEach((field) => {
                if (operation[field] !== undefined) record.set(field, operation[field]);
            });
        } else if (operation.type === 'delete') {
            if (!owner) throw new ForbiddenError('Only the owner can delete a playlist.');
            syncPublic(app, record, true);
            app.delete(record);
            result = { deleted: true, uuid: record.getString('uuid') };
            return;
        } else throw new BadRequestError('Unknown playlist operation.');
        record.set('revision', record.getInt('revision') + 1);
        refreshIdentities(app, record);
        app.save(record);
        syncPublic(app, record, false);
        result =
            operation.type === 'leave' || (operation.type === 'remove-member' && operation.userId === e.auth.id)
                ? { left: true, uuid: record.getString('uuid') }
                : record;
    });
    return result;
}

module.exports = { create, mutate };
