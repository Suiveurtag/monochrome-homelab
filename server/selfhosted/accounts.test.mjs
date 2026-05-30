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

async function createTestServer(options = {}) {
    const dataDir = await mkdtemp(join(tmpdir(), 'monochrome-accounts-'));
    roots.push(dataDir);
    const created = await createSelfHostedServer({
        loadEnv: false,
        dataDir,
        adminSecret: 'test-secret',
        ...options,
    });
    await new Promise((resolve) => created.server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${created.server.address().port}`;
    return {
        ...created,
        baseUrl,
        close: () => new Promise((resolve) => created.server.close(resolve)),
    };
}

function userHeaders(userId, email = `${userId}@example.test`) {
    return {
        'x-monochrome-user-id': userId,
        'x-monochrome-user-email': email,
    };
}

describe('self-hosted account approval', () => {
    it('bootstraps the first user as an approved admin and blocks the next pending user', async () => {
        const app = await createTestServer();
        try {
            const health = await fetch(`${app.baseUrl}/health`);
            const healthBody = await health.json();
            assert.equal(healthBody.config.auth.adminSecret, undefined);
            assert.equal(healthBody.config.auth.adminSecretConfigured, true);

            const first = await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });
            assert.equal(first.status, 200);
            const firstBody = await first.json();
            assert.equal(firstBody.account.status, 'approved');
            assert.equal(firstBody.account.role, 'admin');

            const second = await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('pending') });
            assert.equal(second.status, 403);
            const secondBody = await second.json();
            assert.equal(secondBody.account.status, 'pending');
            assert.equal(secondBody.account.approved, false);
        } finally {
            await app.close();
        }
    });

    it('lets an admin approve and disable accounts', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('listener') });

            const approved = await fetch(`${app.baseUrl}/api/admin/accounts/listener`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    'x-monochrome-admin-secret': 'test-secret',
                },
                body: JSON.stringify({ status: 'approved' }),
            });
            assert.equal(approved.status, 200);
            assert.equal((await approved.json()).account.status, 'approved');

            const allowed = await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('listener') });
            assert.equal(allowed.status, 200);

            const disabled = await fetch(`${app.baseUrl}/api/admin/accounts/listener`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    'x-monochrome-admin-secret': 'test-secret',
                },
                body: JSON.stringify({ status: 'disabled' }),
            });
            assert.equal(disabled.status, 200);

            const blocked = await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('listener') });
            assert.equal(blocked.status, 403);
            assert.equal((await blocked.json()).account.status, 'disabled');
        } finally {
            await app.close();
        }
    });

    it('rejects admin account management from non-admin users', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('listener') });
            await fetch(`${app.baseUrl}/api/admin/accounts/listener`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    'x-monochrome-admin-secret': 'test-secret',
                },
                body: JSON.stringify({ status: 'approved' }),
            });

            const list = await fetch(`${app.baseUrl}/api/admin/accounts`, {
                headers: userHeaders('listener'),
            });
            assert.equal(list.status, 403);

            const update = await fetch(`${app.baseUrl}/api/admin/accounts/admin`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    ...userHeaders('listener'),
                },
                body: JSON.stringify({ role: 'user' }),
            });
            assert.equal(update.status, 403);
        } finally {
            await app.close();
        }
    });
});
