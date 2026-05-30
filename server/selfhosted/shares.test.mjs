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
    const dataDir = await mkdtemp(join(tmpdir(), 'monochrome-shares-'));
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
        'content-type': 'application/json',
        'x-monochrome-user-id': userId,
        'x-monochrome-user-email': `${userId}@example.test`,
        'x-monochrome-user-name': userId,
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

describe('self-hosted sharing', () => {
    it('creates and reads shared track links for approved users', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('listener') });
            await approveUser(app, 'listener');

            const created = await fetch(`${app.baseUrl}/api/shares`, {
                method: 'POST',
                headers: userHeaders('admin'),
                body: JSON.stringify({
                    type: 'track',
                    title: 'Shared Song',
                    href: '/track/t/123',
                    track: {
                        id: '123',
                        trackKey: 'v1:external:tidal:123',
                        source: { kind: 'external', provider: 'tidal', sourceId: '123' },
                        title: 'Shared Song',
                        artist: { name: 'Artist' },
                        artists: [{ name: 'Artist' }],
                    },
                }),
            });
            assert.equal(created.status, 201);
            const share = (await created.json()).share;
            assert.equal(share.title, 'Shared Song');
            assert.equal(share.track.trackKey, 'v1:external:tidal:123');

            const read = await fetch(`${app.baseUrl}/api/shares/${share.id}`, {
                headers: userHeaders('listener'),
            });
            assert.equal(read.status, 200);
            assert.equal((await read.json()).share.href, '/track/t/123');
        } finally {
            await app.close();
        }
    });

    it('shares playlist snapshots and blocks pending users', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });

            const pendingCreate = await fetch(`${app.baseUrl}/api/shares`, {
                method: 'POST',
                headers: userHeaders('pending'),
                body: JSON.stringify({ type: 'track', title: 'Nope' }),
            });
            assert.equal(pendingCreate.status, 403);

            const created = await fetch(`${app.baseUrl}/api/shares`, {
                method: 'POST',
                headers: userHeaders('admin'),
                body: JSON.stringify({
                    type: 'playlist',
                    href: '/userplaylist/mix-1',
                    playlist: {
                        id: 'mix-1',
                        name: 'Road Mix',
                        tracks: [{ id: 'a', title: 'A', artist: { name: 'Artist' } }],
                    },
                }),
            });
            assert.equal(created.status, 201);
            const share = (await created.json()).share;
            assert.equal(share.playlist.name, 'Road Mix');
            assert.equal(share.playlist.tracks.length, 1);
        } finally {
            await app.close();
        }
    });
});
