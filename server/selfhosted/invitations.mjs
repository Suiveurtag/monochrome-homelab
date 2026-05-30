import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const INVITATION_STATUSES = ['pending', 'accepted', 'rejected'];

function publicInvitation(invitation) {
    return {
        id: String(invitation.id),
        fromUserId: String(invitation.fromUserId),
        toUserId: String(invitation.toUserId),
        status: INVITATION_STATUSES.includes(invitation.status) ? invitation.status : 'pending',
        message: invitation.message || '',
        createdAt: invitation.createdAt,
        updatedAt: invitation.updatedAt || invitation.createdAt,
        respondedAt: invitation.respondedAt || null,
    };
}

function cleanText(value, maxLength = 300) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function readJson(path, fallback) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return fallback;
        throw error;
    }
}

async function writeJsonAtomic(path, value) {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(tempPath, JSON.stringify(value, null, 2));
    try {
        await rename(tempPath, path);
    } catch (error) {
        await unlink(tempPath).catch(() => {});
        throw error;
    }
}

export function createInvitationStore(config) {
    const invitationsPath = join(config.paths.invitations, 'invitations.json');

    async function readInvitations() {
        const data = await readJson(invitationsPath, { invitations: [] });
        return Array.isArray(data.invitations) ? data.invitations.map(publicInvitation) : [];
    }

    async function writeInvitations(invitations) {
        await writeJsonAtomic(invitationsPath, {
            invitations: invitations.map(publicInvitation),
            updatedAt: new Date().toISOString(),
        });
    }

    async function listInvitations(userId) {
        const ownUserId = String(userId);
        const invitations = await readInvitations();
        return {
            incoming: invitations.filter((invitation) => invitation.toUserId === ownUserId),
            outgoing: invitations.filter((invitation) => invitation.fromUserId === ownUserId),
            contacts: invitations.filter(
                (invitation) =>
                    invitation.status === 'accepted' &&
                    (invitation.fromUserId === ownUserId || invitation.toUserId === ownUserId),
            ),
        };
    }

    async function areContacts(firstUserId, secondUserId) {
        const first = String(firstUserId || '');
        const second = String(secondUserId || '');
        if (!first || !second || first === second) return false;
        const invitations = await readInvitations();
        return invitations.some(
            (invitation) =>
                invitation.status === 'accepted' &&
                ((invitation.fromUserId === first && invitation.toUserId === second) ||
                    (invitation.fromUserId === second && invitation.toUserId === first)),
        );
    }

    async function createInvitation({ fromUserId, toUserId, message = '' }) {
        const from = String(fromUserId || '');
        const to = String(toUserId || '');
        if (!from || !to || from === to) {
            const error = new Error('Invalid invitation target');
            error.statusCode = 400;
            throw error;
        }

        const invitations = await readInvitations();
        const existing = invitations.find(
            (invitation) =>
                (invitation.fromUserId === from && invitation.toUserId === to) ||
                (invitation.fromUserId === to && invitation.toUserId === from),
        );
        if (existing && existing.status !== 'rejected') {
            const error = new Error(`Invitation already ${existing.status}`);
            error.statusCode = 409;
            throw error;
        }

        const now = new Date().toISOString();
        const invitation = publicInvitation({
            id: randomBytes(9).toString('base64url'),
            fromUserId: from,
            toUserId: to,
            message: cleanText(message, 500),
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        });
        invitations.unshift(invitation);
        await writeInvitations(invitations);
        return invitation;
    }

    async function updateInvitation({ invitationId, userId, status }) {
        if (!['accepted', 'rejected'].includes(status)) {
            const error = new Error('Invalid invitation status');
            error.statusCode = 400;
            throw error;
        }

        const invitations = await readInvitations();
        const invitation = invitations.find((candidate) => candidate.id === String(invitationId));
        if (!invitation) {
            const error = new Error('Invitation not found');
            error.statusCode = 404;
            throw error;
        }
        if (invitation.toUserId !== String(userId)) {
            const error = new Error('Only the invited user can respond');
            error.statusCode = 403;
            throw error;
        }

        invitation.status = status;
        invitation.updatedAt = new Date().toISOString();
        invitation.respondedAt = invitation.updatedAt;
        await writeInvitations(invitations);
        return publicInvitation(invitation);
    }

    return {
        listInvitations,
        areContacts,
        createInvitation,
        updateInvitation,
    };
}
