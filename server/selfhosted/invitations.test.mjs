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
    const dataDir = await mkdtemp(join(tmpdir(), 'monochrome-invitations-'));
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
    await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders(userId) });
    await fetch(`${app.baseUrl}/api/admin/accounts/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
            'content-type': 'application/json',
            'x-monochrome-admin-secret': 'test-secret',
        },
        body: JSON.stringify({ status: 'approved' }),
    });
}

describe('self-hosted invitations', () => {
    it('sends, lists, accepts, and rejects invitations', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });
            await approveUser(app, 'listener');
            await approveUser(app, 'third');

            const sent = await fetch(`${app.baseUrl}/api/invitations`, {
                method: 'POST',
                headers: userHeaders('admin'),
                body: JSON.stringify({ toUserId: 'listener', message: 'hi' }),
            });
            assert.equal(sent.status, 201);
            const invitation = (await sent.json()).invitation;
            assert.equal(invitation.status, 'pending');

            const incoming = await fetch(`${app.baseUrl}/api/invitations`, { headers: userHeaders('listener') });
            assert.equal((await incoming.json()).incoming.length, 1);

            const accepted = await fetch(`${app.baseUrl}/api/invitations/${invitation.id}`, {
                method: 'PATCH',
                headers: userHeaders('listener'),
                body: JSON.stringify({ status: 'accepted' }),
            });
            assert.equal(accepted.status, 200);
            assert.equal((await accepted.json()).invitation.status, 'accepted');

            const contactList = await fetch(`${app.baseUrl}/api/invitations`, { headers: userHeaders('admin') });
            assert.equal((await contactList.json()).contacts.length, 1);

            const rejectedCreate = await fetch(`${app.baseUrl}/api/invitations`, {
                method: 'POST',
                headers: userHeaders('third'),
                body: JSON.stringify({ toUserId: 'admin' }),
            });
            const rejectedInvitation = (await rejectedCreate.json()).invitation;
            const rejected = await fetch(`${app.baseUrl}/api/invitations/${rejectedInvitation.id}`, {
                method: 'PATCH',
                headers: userHeaders('admin'),
                body: JSON.stringify({ status: 'rejected' }),
            });
            assert.equal((await rejected.json()).invitation.status, 'rejected');
        } finally {
            await app.close();
        }
    });

    it('prevents duplicates and blocks non-recipients from responding', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });
            await approveUser(app, 'listener');
            await approveUser(app, 'third');

            const sent = await fetch(`${app.baseUrl}/api/invitations`, {
                method: 'POST',
                headers: userHeaders('admin'),
                body: JSON.stringify({ toUserId: 'listener' }),
            });
            const invitation = (await sent.json()).invitation;

            const duplicate = await fetch(`${app.baseUrl}/api/invitations`, {
                method: 'POST',
                headers: userHeaders('listener'),
                body: JSON.stringify({ toUserId: 'admin' }),
            });
            assert.equal(duplicate.status, 409);

            const wrongUser = await fetch(`${app.baseUrl}/api/invitations/${invitation.id}`, {
                method: 'PATCH',
                headers: userHeaders('third'),
                body: JSON.stringify({ status: 'accepted' }),
            });
            assert.equal(wrongUser.status, 403);
        } finally {
            await app.close();
        }
    });
});
