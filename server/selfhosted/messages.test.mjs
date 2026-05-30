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
    const dataDir = await mkdtemp(join(tmpdir(), 'monochrome-messages-'));
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

async function acceptInvitation(app, fromUserId, toUserId) {
    const sent = await fetch(`${app.baseUrl}/api/invitations`, {
        method: 'POST',
        headers: userHeaders(fromUserId),
        body: JSON.stringify({ toUserId }),
    });
    const invitation = (await sent.json()).invitation;
    await fetch(`${app.baseUrl}/api/invitations/${invitation.id}`, {
        method: 'PATCH',
        headers: userHeaders(toUserId),
        body: JSON.stringify({ status: 'accepted' }),
    });
}

describe('self-hosted messages', () => {
    it('lets accepted contacts exchange persistent messages', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });
            await approveUser(app, 'listener');
            await acceptInvitation(app, 'admin', 'listener');

            const first = await fetch(`${app.baseUrl}/api/messages`, {
                method: 'POST',
                headers: userHeaders('admin'),
                body: JSON.stringify({ toUserId: 'listener', body: 'hello there' }),
            });
            assert.equal(first.status, 201);

            const reply = await fetch(`${app.baseUrl}/api/messages`, {
                method: 'POST',
                headers: userHeaders('listener'),
                body: JSON.stringify({ toUserId: 'admin', body: 'hi back' }),
            });
            assert.equal(reply.status, 201);

            const conversation = await fetch(`${app.baseUrl}/api/messages?contactUserId=listener`, {
                headers: userHeaders('admin'),
            });
            assert.equal(conversation.status, 200);
            const { messages } = await conversation.json();
            assert.deepEqual(
                messages.map((message) => message.body),
                ['hello there', 'hi back'],
            );
        } finally {
            await app.close();
        }
    });

    it('blocks messages without an accepted contact relationship', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('admin') });
            await approveUser(app, 'listener');
            await approveUser(app, 'third');

            const pending = await fetch(`${app.baseUrl}/api/invitations`, {
                method: 'POST',
                headers: userHeaders('admin'),
                body: JSON.stringify({ toUserId: 'listener' }),
            });
            assert.equal(pending.status, 201);

            const blockedPending = await fetch(`${app.baseUrl}/api/messages`, {
                method: 'POST',
                headers: userHeaders('admin'),
                body: JSON.stringify({ toUserId: 'listener', body: 'too soon' }),
            });
            assert.equal(blockedPending.status, 403);

            const blockedStranger = await fetch(`${app.baseUrl}/api/messages?contactUserId=third`, {
                headers: userHeaders('admin'),
            });
            assert.equal(blockedStranger.status, 403);
        } finally {
            await app.close();
        }
    });
});
