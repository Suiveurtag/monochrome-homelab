import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSelfHostedServer } from './server.mjs';

const roots = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createTestServer() {
    const dataDir = await mkdtemp(join(tmpdir(), 'monochrome-radios-'));
    roots.push(dataDir);
    const created = await createSelfHostedServer({
        loadEnv: false,
        dataDir,
        adminSecret: 'test-secret',
    });
    await new Promise((resolve) => created.server.listen(0, '127.0.0.1', resolve));
    return {
        ...created,
        baseUrl: `http://127.0.0.1:${created.server.address().port}`,
        close: () => new Promise((resolve) => created.server.close(resolve)),
    };
}

function userHeaders(userId) {
    return {
        'x-monochrome-user-id': userId,
        'x-monochrome-user-email': `${userId}@example.test`,
    };
}

async function approveUser(app, userId) {
    await fetch(`${app.baseUrl}/api/admin/accounts/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
            'content-type': 'application/json',
            'x-monochrome-admin-secret': 'test-secret',
        },
        body: JSON.stringify({ status: 'approved' }),
    });
}

describe('self-hosted radios', () => {
    it('creates, lists, disables, and hides disabled radios', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });

            const created = await fetch(`${app.baseUrl}/api/radios`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...userHeaders('admin'),
                },
                body: JSON.stringify({
                    name: 'Night Radio',
                    streamUrl: 'https://radio.example.test/live.mp3',
                    genre: 'Ambient',
                    country: 'FR',
                    artworkUrl: 'https://radio.example.test/cover.jpg',
                }),
            });
            assert.equal(created.status, 201);
            const radio = (await created.json()).radio;
            assert.equal(radio.name, 'Night Radio');
            assert.equal(radio.enabled, true);
            assert.equal(radio.creatorUserId, 'admin');

            const listed = await fetch(`${app.baseUrl}/api/radios`, { headers: userHeaders('admin') });
            assert.equal((await listed.json()).radios.length, 1);

            const disabled = await fetch(`${app.baseUrl}/api/admin/radios/${radio.id}`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    'x-monochrome-admin-secret': 'test-secret',
                },
                body: JSON.stringify({ enabled: false }),
            });
            assert.equal(disabled.status, 200);
            assert.equal((await disabled.json()).radio.enabled, false);

            const publicList = await fetch(`${app.baseUrl}/api/radios`, { headers: userHeaders('admin') });
            assert.equal((await publicList.json()).radios.length, 0);

            const adminList = await fetch(`${app.baseUrl}/api/admin/radios`, {
                headers: { 'x-monochrome-admin-secret': 'test-secret' },
            });
            assert.equal((await adminList.json()).radios.length, 1);
        } finally {
            await app.close();
        }
    });

    it('rejects invalid stream URLs and pending creators', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });

            const pendingCreate = await fetch(`${app.baseUrl}/api/radios`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...userHeaders('pending'),
                },
                body: JSON.stringify({ name: 'Pending Radio', streamUrl: 'https://radio.example.test/live.mp3' }),
            });
            assert.equal(pendingCreate.status, 403);

            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('listener') });
            await approveUser(app, 'listener');

            const invalid = await fetch(`${app.baseUrl}/api/radios`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...userHeaders('listener'),
                },
                body: JSON.stringify({ name: 'Bad Radio', streamUrl: 'ftp://radio.example.test/live.mp3' }),
            });
            assert.equal(invalid.status, 400);
        } finally {
            await app.close();
        }
    });
});
