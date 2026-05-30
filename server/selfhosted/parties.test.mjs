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
    const dataDir = await mkdtemp(join(tmpdir(), 'monochrome-parties-'));
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

describe('self-hosted listening parties', () => {
    it('lets accepted contacts join and follow host playback state', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('host') });
            await approveUser(app, 'guest');
            await acceptInvitation(app, 'host', 'guest');

            const created = await fetch(`${app.baseUrl}/api/parties`, {
                method: 'POST',
                headers: userHeaders('host'),
                body: JSON.stringify({
                    name: 'Saturday Room',
                    currentTrack: { id: 'track-1', title: 'First Track', source: { kind: 'external' } },
                    isPlaying: true,
                    playbackTime: 12,
                    queue: [{ id: 'track-1', title: 'First Track' }],
                }),
            });
            assert.equal(created.status, 201);
            const party = (await created.json()).party;

            const joined = await fetch(`${app.baseUrl}/api/parties/${party.id}/join`, {
                method: 'POST',
                headers: userHeaders('guest'),
                body: JSON.stringify({ memberName: 'Guest' }),
            });
            assert.equal(joined.status, 200);
            assert.equal((await joined.json()).party.members.length, 2);

            const updated = await fetch(`${app.baseUrl}/api/parties/${party.id}/playback`, {
                method: 'PATCH',
                headers: userHeaders('host'),
                body: JSON.stringify({
                    currentTrack: { id: 'upload-1', title: 'Uploaded Song', source: { kind: 'server-local' } },
                    isPlaying: false,
                    playbackTime: 42,
                    queue: [{ id: 'upload-1', title: 'Uploaded Song', source: { kind: 'server-local' } }],
                }),
            });
            assert.equal(updated.status, 200);

            const fetched = await fetch(`${app.baseUrl}/api/parties/${party.id}`, { headers: userHeaders('guest') });
            assert.equal(fetched.status, 200);
            const fetchedParty = (await fetched.json()).party;
            assert.equal(fetchedParty.currentTrack.title, 'Uploaded Song');
            assert.equal(fetchedParty.isPlaying, false);
            assert.equal(fetchedParty.playbackTime, 42);
        } finally {
            await app.close();
        }
    });

    it('blocks strangers and non-host playback controls', async () => {
        const app = await createTestServer();
        try {
            await fetch(`${app.baseUrl}/api/accounts/me`, { headers: userHeaders('host') });
            await approveUser(app, 'guest');
            await approveUser(app, 'stranger');
            await acceptInvitation(app, 'host', 'guest');

            const created = await fetch(`${app.baseUrl}/api/parties`, {
                method: 'POST',
                headers: userHeaders('host'),
                body: JSON.stringify({ name: 'Private Room' }),
            });
            const party = (await created.json()).party;

            const blockedStranger = await fetch(`${app.baseUrl}/api/parties/${party.id}/join`, {
                method: 'POST',
                headers: userHeaders('stranger'),
                body: JSON.stringify({ memberName: 'Nope' }),
            });
            assert.equal(blockedStranger.status, 403);

            await fetch(`${app.baseUrl}/api/parties/${party.id}/join`, {
                method: 'POST',
                headers: userHeaders('guest'),
                body: JSON.stringify({ memberName: 'Guest' }),
            });
            const blockedGuestControl = await fetch(`${app.baseUrl}/api/parties/${party.id}/playback`, {
                method: 'PATCH',
                headers: userHeaders('guest'),
                body: JSON.stringify({ isPlaying: true, playbackTime: 1 }),
            });
            assert.equal(blockedGuestControl.status, 403);
        } finally {
            await app.close();
        }
    });
});
