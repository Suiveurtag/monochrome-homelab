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

test('PocketBase listening stats, stream integrity and locks', { timeout: 60000 }, async (t) => {
    assert.ok(process.env.PB_TEST_BINARY, 'Set PB_TEST_BINARY to a PocketBase 0.30 executable');
    const directory = await mkdtemp(`${tmpdir()}/monochrome-listening-test-`);
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
                `${method} ${path}: ${JSON.stringify(data)}\n${response.status >= 400 ? log.slice(-2000) : ''}`
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

        const config = (await request('/api/collections/app_config/records', { token: admin })).items[0];
        const song = {
            id: 'song',
            title: 'The Song',
            artists: [{ id: 'artist', name: 'Artist' }],
            album: { id: 'album', title: 'Album' },
        };
        const startedAt = Date.now() - 120000;
        const payload = (seconds, sessionId = randomUUID(), extra = {}) => ({
            sessionId,
            track: song,
            startedAt,
            lastAt: startedAt + 120000,
            seconds,
            ended: false,
            slices: [{ at: Math.floor(startedAt / 60000) * 60000, seconds }],
            ...extra,
        });
        const post = (body, who = 'owner', status = 200) =>
            request('/api/monochrome/listening/sessions', { method: 'POST', token: users[who].token, body, status });
        const stats = (who = 'owner', query = '') =>
            request(`/api/monochrome/listening/stats?period=lifetime${query}`, { token: users[who].token });
        const policy = (body) =>
            request(`/api/collections/app_config/records/${config.id}`, { method: 'PATCH', token: admin, body });
        let checkpoint = payload(29);
        await t.test('counts exactly at 30 seconds and updates duration without duplicate streams', async () => {
            assert.equal((await post(checkpoint)).qualified, false);
            assert.equal((await stats()).summary.streams, 0);
            checkpoint = { ...checkpoint, seconds: 30, slices: [{ ...checkpoint.slices[0], seconds: 30 }] };
            assert.equal((await post(checkpoint)).globalStreams, 1);
            const results = await Promise.all(Array.from({ length: 8 }, () => post(checkpoint)));
            assert.ok(results.every((r) => r.globalStreams === 1));
            checkpoint = {
                ...checkpoint,
                seconds: 60,
                slices: [{ ...checkpoint.slices[0], seconds: 60 }],
                ended: true,
            };
            await post(checkpoint);
            const d = await stats();
            assert.equal(d.summary.streams, 1);
            assert.equal(d.summary.seconds, 60);
            assert.equal(d.top.artists[0].name, 'Artist');
            assert.equal(d.history.length, 1);
            await post(payload(30, checkpoint.sessionId)); // late packet is harmless
            assert.equal((await stats()).summary.seconds, 60);
        });
        await t.test('separates users while the shared global count aggregates their listens', async () => {
            await post(payload(30), 'editor');
            assert.equal((await stats('editor')).summary.streams, 1);
            assert.equal((await stats('stranger')).summary.streams, 0);
            const totals = await request('/api/collections/listening_totals/records', { token: users.owner.token });
            assert.equal(totals.items[0].streams, 2);
            await request('/api/collections/listening_sessions/records', {
                token: users.owner.token,
                method: 'POST',
                body: {},
                status: 403,
            });
            await request('/api/collections/listening_sessions/records', { token: users.owner.token, status: 403 });
            await request('/api/collections/listening_totals/records', {
                token: users.owner.token,
                method: 'POST',
                body: {},
                status: 403,
            });
        });
        await t.test('rejects forged time, identity changes, invalid buckets and unauthenticated writes', async () => {
            await request('/api/monochrome/listening/sessions', { method: 'POST', body: payload(30), status: 401 });
            await post(payload(30, randomUUID(), { lastAt: startedAt + 5000 }), 'owner', 400);
            await post({ ...checkpoint, track: { ...song, id: 'changed' } }, 'owner', 400);
            await post(payload(30, randomUUID(), { slices: [{ at: Date.now() + 60000, seconds: 30 }] }), 'owner', 400);
            await request(`/api/collections/users/records/${users.blocked.id}`, {
                token: admin,
                method: 'PATCH',
                body: { access_status: 'banned' },
            });
            await post(payload(30), 'blocked', 403);
        });
        await t.test(
            'long-term locks block members AND administrators including export, while collection continues',
            async () => {
                await request(`/api/collections/users/records/${users.editor.id}`, {
                    token: admin,
                    method: 'PATCH',
                    body: { role: 'admin' },
                });
                await policy({ stats_lock_long_term: true });
                assert.equal((await stats()).locked, 'long-term');
                assert.equal((await stats('editor')).locked, 'long-term');
                assert.equal((await stats('owner', '&export=true')).summary, undefined);
                const week = await request('/api/monochrome/listening/stats?period=week', { token: users.owner.token });
                assert.ok(week.summary);
                await post(payload(30), 'owner');
                await policy({ feature_stats: false });
                assert.equal((await stats()).locked, 'all');
                assert.equal((await stats('editor')).locked, 'all');
                const locked = await request('/api/monochrome/listening/stats?period=day&export=true', {
                    token: users.owner.token,
                });
                assert.equal(locked.locked, 'all');
                assert.equal(locked.history, undefined);
                await post(payload(30), 'owner');
                await policy({ feature_stats: true, stats_lock_long_term: false });
                assert.equal((await stats()).summary.streams, 3);
            }
        );
        await t.test('simultaneous distinct sessions atomically increment a shared global total', async () => {
            const calls = Array.from({ length: 10 }, (_, index) =>
                post(
                    payload(30, randomUUID(), { track: { ...song, id: 'concurrent-song' }, ended: true }),
                    index % 2 ? 'editor' : 'owner'
                )
            );
            const results = await Promise.all(calls);
            assert.deepEqual(
                results.map((r) => r.globalStreams).sort((a, b) => a - b),
                [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            );
            const totals = await request(
                '/api/collections/listening_totals/records?filter=track_id%3D%22concurrent-song%22',
                { token: users.owner.token }
            );
            assert.equal(totals.items[0].streams, 10);
        });
    } finally {
        processHandle?.kill('SIGTERM');
        if (processHandle) await new Promise((done) => processHandle.once('exit', done));
        await rm(directory, { recursive: true, force: true });
    }
});
