// Runs the real repository migrations/hooks against a disposable PocketBase database.
// Usage: PB_TEST_BINARY=/path/to/pocketbase node --test scripts/test-playlist-collaboration.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';

test('PocketBase collaboration lifecycle, authorization and concurrent revisions', { timeout: 60000 }, async (t) => {
    assert.ok(process.env.PB_TEST_BINARY, 'Set PB_TEST_BINARY to a PocketBase 0.30 executable');
    const directory = await mkdtemp(`${tmpdir()}/monochrome-playlist-test-`);
    const binary = resolve(process.env.PB_TEST_BINARY);
    const email = 'isolated@example.test';
    const password = randomUUID();
    const args = [
        `--dir=${directory}`,
        `--migrationsDir=${resolve('pb_migrations')}`,
        `--hooksDir=${resolve('pb_hooks')}`,
        '--dev=false',
    ];
    let processHandle;
    let log = '';
    try {
        const setup = spawnSync(binary, ['superuser', 'upsert', email, password, ...args], { encoding: 'utf8' });
        assert.ifError(setup.error);
        assert.equal(setup.status, 0, setup.stderr || setup.stdout || 'PocketBase setup failed');
        const socket = createServer();
        await new Promise((done) => socket.listen(0, '127.0.0.1', done));
        const port = socket.address().port;
        await new Promise((done) => socket.close(done));
        const base = `http://127.0.0.1:${port}`;
        processHandle = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, ...args]);
        processHandle.stdout.on('data', (data) => {
            log = (log + data).slice(-20000);
        });
        processHandle.stderr.on('data', (data) => {
            log = (log + data).slice(-20000);
        });
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            try {
                ready = (await fetch(`${base}/api/health`)).ok;
            } catch {
                /* Starting. */
            }
            if (ready) break;
            if (processHandle.exitCode !== null) break;
            await new Promise((done) => setTimeout(done, 50));
        }
        assert.ok(ready, log);
        const request = async (path, { token, method = 'GET', body, status = 200 } = {}) => {
            const response = await fetch(`${base}${path}`, {
                method,
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            const data = await response.json().catch(() => null);
            assert.equal(
                response.status,
                status,
                `${method} ${path}: ${JSON.stringify(data)}\n${response.status >= 500 ? log : ''}`
            );
            return data;
        };
        const admin = (
            await request('/api/collections/_superusers/auth-with-password', {
                method: 'POST',
                body: { identity: email, password },
            })
        ).token;
        const users = {};
        for (const name of ['owner', 'editor', 'stranger', 'blocked']) {
            const record = await request('/api/collections/users/records', {
                token: admin,
                method: 'POST',
                body: {
                    email: `${name}@example.test`,
                    password,
                    passwordConfirm: password,
                    name,
                    access_status: 'active',
                    role: 'member',
                    verified: true,
                },
            });
            const profile = await request('/api/collections/DB_users/records', {
                token: admin,
                method: 'POST',
                body: { firebase_id: record.id, username: name, display_name: name, user_playlists: {} },
            });
            const token = (
                await request('/api/collections/users/auth-with-password', {
                    method: 'POST',
                    body: { identity: record.email, password },
                })
            ).token;
            users[name] = { ...record, token, profile };
        }
        const uuid = randomUUID();
        await request(`/api/collections/DB_users/records/${users.owner.profile.id}`, {
            token: admin,
            method: 'PATCH',
            body: { user_playlists: { [uuid]: { id: uuid, tracks: [] } } },
        });
        let playlist;
        const operate = (who, operation, { revision = playlist.revision, status = 200 } = {}) =>
            request(`/api/monochrome/playlists/${playlist.id}/operations`, {
                token: users[who].token,
                method: 'POST',
                body: { revision, operation },
                status,
            });
        const read = (who, status = 200) =>
            request(`/api/collections/shared_playlists/records/${playlist.id}`, { token: users[who].token, status });

        await t.test('promotes local data, retires its legacy snapshot, and locks direct writes', async () => {
            await request('/api/monochrome/playlists', {
                method: 'POST',
                body: { uuid, name: 'Together' },
                status: 401,
            });
            playlist = await request('/api/monochrome/playlists', {
                token: users.owner.token,
                method: 'POST',
                body: { uuid, name: 'Together', tracks: [{ id: 'a' }, { id: 'b' }], isPublic: true },
            });
            assert.equal(playlist.revision, 1);
            assert.equal(playlist.owner, users.owner.id);
            assert.ok(Array.isArray(playlist.tracks), JSON.stringify(playlist));
            assert.deepEqual(
                playlist.identities.map((identity) => identity.role),
                ['owner']
            );
            const profile = await request(`/api/collections/DB_users/records/${users.owner.profile.id}`, {
                token: users.owner.token,
            });
            assert.equal(profile.user_playlists[uuid], undefined);
            await read('stranger', 404);
            const list = await request('/api/collections/shared_playlists/records', { token: users.stranger.token });
            assert.equal(list.totalItems, 0);
            await request('/api/collections/shared_playlists/records', {
                token: users.owner.token,
                method: 'POST',
                body: { uuid: randomUUID(), owner: users.owner.id, name: 'Bypass', revision: 1 },
                status: 403,
            });
            await request(`/api/collections/shared_playlists/records/${playlist.id}`, {
                token: users.owner.token,
                method: 'PATCH',
                body: { revision: 99, tracks: [] },
                status: 403,
            });
            await operate('stranger', { type: 'add', tracks: [{ id: 'bad' }] }, { status: 403 });
        });

        await t.test('adds exact usernames and grants editors only track operations', async () => {
            playlist = await operate('owner', { type: 'add-member', username: '@editor' });
            assert.deepEqual(playlist.members, [users.editor.id]);
            const stored = await request(`/api/collections/shared_playlists/records/${playlist.id}`, { token: admin });
            assert.deepEqual(stored.members, [users.editor.id], JSON.stringify(stored));
            assert.deepEqual(
                (await read('editor')).identities.map((identity) => identity.role),
                ['owner', 'collaborator']
            );
            for (const operation of [
                { type: 'add-member', username: 'stranger' },
                { type: 'remove-member', userId: users.owner.id },
                { type: 'metadata', name: 'Hijack' },
                { type: 'delete' },
            ]) {
                await operate('editor', operation, { status: 403 });
            }
            await operate('owner', { type: 'add-member', username: 'missing' }, { status: 400 });
            playlist = await operate('editor', { type: 'add', tracks: [{ id: 'c' }, { id: 'a' }] });
            assert.deepEqual(
                playlist.tracks.map((track) => track.id),
                ['a', 'b', 'c']
            );
        });

        await t.test('concurrent clients cannot overwrite an acknowledged revision', async () => {
            const revision = playlist.revision;
            const responses = await Promise.all(
                ['d', 'e'].map((id, index) =>
                    fetch(`${base}/api/monochrome/playlists/${playlist.id}/operations`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: users[index ? 'editor' : 'owner'].token,
                        },
                        body: JSON.stringify({ revision, operation: { type: 'add', tracks: [{ id }] } }),
                    })
                )
            );
            assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
            playlist = await read('owner');
            assert.equal(playlist.revision, revision + 1);
            assert.equal(playlist.tracks.length, 4);
            await operate(
                'editor',
                { type: 'reorder', order: ['track:c', 'track:b', 'track:a'] },
                { revision, status: 409 }
            );
            await operate('editor', { type: 'reorder', order: ['track:a'] }, { status: 400 });
            const order = playlist.tracks.map((track) => `track:${track.id}`).reverse();
            playlist = await operate('editor', { type: 'reorder', order });
            assert.deepEqual(
                playlist.tracks.map((track) => `track:${track.id}`),
                order
            );
            playlist = await operate('editor', { type: 'remove', trackId: 'b', trackType: 'track' });
            assert.ok(!playlist.tracks.some((track) => track.id === 'b'));
        });

        await t.test('persists metadata and public mirrors while protecting private membership', async () => {
            playlist = await operate('owner', {
                type: 'metadata',
                name: 'Shared mix',
                description: 'Updated together',
            });
            assert.equal((await read('editor')).name, 'Shared mix');
            let mirrors = await request(
                `/api/collections/public_playlists/records?filter=${encodeURIComponent(`uuid="${uuid}"`)}`,
                { token: users.stranger.token }
            );
            assert.equal(mirrors.items[0].name, 'Shared mix');
            assert.deepEqual(
                mirrors.items[0].tracks.map((track) => track.id),
                playlist.tracks.map((track) => track.id)
            );
            assert.equal(mirrors.items[0].members, undefined);
            playlist = await operate('owner', { type: 'metadata', isPublic: false });
            mirrors = await request(
                `/api/collections/public_playlists/records?filter=${encodeURIComponent(`uuid="${uuid}"`)}`,
                { token: users.stranger.token }
            );
            assert.equal(mirrors.totalItems, 0);
        });

        await t.test('revocation, leaving, inactive accounts and deletion enforce access immediately', async () => {
            playlist = await operate('owner', { type: 'remove-member', userId: users.editor.id });
            await read('editor', 404);
            await operate('editor', { type: 'add', tracks: [{ id: 'denied' }] }, { status: 403 });
            playlist = await operate('owner', { type: 'add-member', username: users.editor.id });
            const left = await operate('editor', { type: 'leave' });
            assert.equal(left.left, true);
            playlist = await read('owner');
            await read('editor', 404);
            await operate('owner', { type: 'leave' }, { status: 400 });
            await request(`/api/collections/users/records/${users.blocked.id}`, {
                token: admin,
                method: 'PATCH',
                body: { access_status: 'banned' },
            });
            await operate('owner', { type: 'add-member', username: 'blocked' }, { status: 403 });
            const removed = await operate('owner', { type: 'delete' });
            assert.equal(removed.deleted, true);
            await read('owner', 404);
        });
    } finally {
        if (processHandle && processHandle.exitCode === null) {
            processHandle.kill('SIGTERM');
            await new Promise((done) => processHandle.once('exit', done));
        }
        await rm(directory, { recursive: true, force: true });
    }
});
