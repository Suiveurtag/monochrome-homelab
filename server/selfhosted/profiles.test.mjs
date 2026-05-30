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
    const dataDir = await mkdtemp(join(tmpdir(), 'monochrome-profiles-'));
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

function userHeaders(userId, name = userId) {
    return {
        'content-type': 'application/json',
        'x-monochrome-user-id': userId,
        'x-monochrome-user-email': `${userId}@example.test`,
        'x-monochrome-user-name': name,
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

describe('self-hosted public profiles', () => {
    it('lets approved users update and view public profiles', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin', 'Admin User') });
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('listener', 'Listener User') });
            await approveUser(app, 'listener');

            const updated = await fetch(`${app.baseUrl}/api/profiles/me`, {
                method: 'PATCH',
                headers: userHeaders('listener', 'Listener User'),
                body: JSON.stringify({
                    username: 'listener',
                    display_name: 'Listener',
                    avatar_url: 'https://example.test/avatar.jpg',
                    about: 'Self-hosted music fan',
                    website: 'https://example.test',
                    stats: { uploadedTracks: 3 },
                }),
            });
            assert.equal(updated.status, 200);
            const ownProfile = (await updated.json()).profile;
            assert.equal(ownProfile.username, 'listener');
            assert.equal(ownProfile.display_name, 'Listener');
            assert.equal(ownProfile.about, 'Self-hosted music fan');

            const visible = await fetch(`${app.baseUrl}/api/profiles/listener`, {
                headers: userHeaders('admin', 'Admin User'),
            });
            assert.equal(visible.status, 200);
            const publicProfile = (await visible.json()).profile;
            assert.equal(publicProfile.username, 'listener');
            assert.equal(publicProfile.stats.uploadedTracks, 3);
        } finally {
            await app.close();
        }
    });

    it('blocks pending users from profile reads and rejects duplicate usernames', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin', 'Admin User') });
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('listener', 'Listener User') });
            await approveUser(app, 'listener');

            await fetch(`${app.baseUrl}/api/profiles/me`, {
                method: 'PATCH',
                headers: userHeaders('listener', 'Listener User'),
                body: JSON.stringify({ username: 'shared-name' }),
            });

            const pendingRead = await fetch(`${app.baseUrl}/api/profiles/shared-name`, {
                headers: userHeaders('pending', 'Pending User'),
            });
            assert.equal(pendingRead.status, 403);

            const duplicate = await fetch(`${app.baseUrl}/api/profiles/me`, {
                method: 'PATCH',
                headers: userHeaders('admin', 'Admin User'),
                body: JSON.stringify({ username: 'shared-name' }),
            });
            assert.equal(duplicate.status, 409);
        } finally {
            await app.close();
        }
    });
});
