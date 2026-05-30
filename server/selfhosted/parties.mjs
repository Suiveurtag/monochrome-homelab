import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MAX_NAME_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_QUEUE_LENGTH = 200;

function cleanText(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanTrack(track) {
    if (!track || typeof track !== 'object') return null;
    return { ...track };
}

function cleanQueue(queue) {
    return Array.isArray(queue) ? queue.map(cleanTrack).filter(Boolean).slice(0, MAX_QUEUE_LENGTH) : [];
}

function normalizeParty(party) {
    const now = new Date().toISOString();
    return {
        id: String(party.id),
        name: cleanText(party.name, MAX_NAME_LENGTH) || 'Listening Party',
        hostUserId: String(party.hostUserId || ''),
        currentTrack: cleanTrack(party.currentTrack),
        isPlaying: !!party.isPlaying,
        playbackTime: Math.max(0, Number(party.playbackTime || 0)),
        playbackTimestamp: Number(party.playbackTimestamp || Date.now()),
        queue: cleanQueue(party.queue),
        createdAt: party.createdAt || now,
        updatedAt: party.updatedAt || party.createdAt || now,
        endedAt: party.endedAt || null,
    };
}

function normalizeMember(member) {
    const now = new Date().toISOString();
    return {
        id: String(member.id),
        partyId: String(member.partyId),
        userId: String(member.userId || ''),
        name: cleanText(member.name, 80) || String(member.userId || 'Member'),
        avatarUrl: String(member.avatarUrl || ''),
        isHost: !!member.isHost,
        lastSeen: Number(member.lastSeen || Date.now()),
        joinedAt: member.joinedAt || now,
        typingUntil: Number(member.typingUntil || 0),
    };
}

function normalizeMessage(message) {
    return {
        id: String(message.id),
        partyId: String(message.partyId),
        senderUserId: String(message.senderUserId || ''),
        senderName: cleanText(message.senderName, 80) || String(message.senderUserId || 'Member'),
        content: cleanText(message.content, MAX_MESSAGE_LENGTH),
        createdAt: message.createdAt,
    };
}

function normalizeRequest(request) {
    return {
        id: String(request.id),
        partyId: String(request.partyId),
        requesterUserId: String(request.requesterUserId || ''),
        requestedBy: cleanText(request.requestedBy, 80) || String(request.requesterUserId || 'Member'),
        track: cleanTrack(request.track),
        createdAt: request.createdAt,
    };
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

export function createPartyStore(config) {
    const partiesPath = join(config.paths.parties, 'parties.json');

    async function readState() {
        const state = await readJson(partiesPath, { parties: [], members: [], messages: [], requests: [] });
        return {
            parties: Array.isArray(state.parties) ? state.parties.map(normalizeParty) : [],
            members: Array.isArray(state.members) ? state.members.map(normalizeMember) : [],
            messages: Array.isArray(state.messages) ? state.messages.map(normalizeMessage).filter((message) => message.content) : [],
            requests: Array.isArray(state.requests)
                ? state.requests.map(normalizeRequest).filter((request) => request.track)
                : [],
        };
    }

    async function writeState(state) {
        await writeJsonAtomic(partiesPath, {
            parties: state.parties.map(normalizeParty),
            members: state.members.map(normalizeMember),
            messages: state.messages.map(normalizeMessage).filter((message) => message.content),
            requests: state.requests.map(normalizeRequest).filter((request) => request.track),
            updatedAt: new Date().toISOString(),
        });
    }

    function publicParty(state, partyId) {
        const party = state.parties.find((candidate) => candidate.id === String(partyId) && !candidate.endedAt);
        if (!party) return null;
        return {
            ...party,
            members: state.members.filter((member) => member.partyId === party.id),
            messages: state.messages
                .filter((message) => message.partyId === party.id)
                .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
                .slice(-50),
            requests: state.requests
                .filter((request) => request.partyId === party.id)
                .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
        };
    }

    function requireParty(state, partyId) {
        const party = state.parties.find((candidate) => candidate.id === String(partyId) && !candidate.endedAt);
        if (party) return party;
        const error = new Error('Party not found');
        error.statusCode = 404;
        throw error;
    }

    function requireMember(state, partyId, userId) {
        const member = state.members.find(
            (candidate) => candidate.partyId === String(partyId) && candidate.userId === String(userId),
        );
        if (member) return member;
        const error = new Error('Join the party first');
        error.statusCode = 403;
        throw error;
    }

    function requireHost(party, userId) {
        if (party.hostUserId === String(userId)) return;
        const error = new Error('Host controls required');
        error.statusCode = 403;
        throw error;
    }

    async function createParty(account, input = {}) {
        const state = await readState();
        const now = new Date().toISOString();
        const party = normalizeParty({
            id: randomBytes(9).toString('base64url'),
            name: input.name,
            hostUserId: account.userId,
            currentTrack: cleanTrack(input.currentTrack),
            isPlaying: !!input.isPlaying,
            playbackTime: input.playbackTime,
            playbackTimestamp: Date.now(),
            queue: input.queue,
            createdAt: now,
            updatedAt: now,
        });
        const member = normalizeMember({
            id: randomBytes(9).toString('base64url'),
            partyId: party.id,
            userId: account.userId,
            name: input.memberName || account.name || account.email || account.userId,
            avatarUrl: input.avatarUrl,
            isHost: true,
            lastSeen: Date.now(),
            joinedAt: now,
        });
        state.parties.unshift(party);
        state.members.push(member);
        await writeState(state);
        return publicParty(state, party.id);
    }

    async function getParty(partyId) {
        return publicParty(await readState(), partyId);
    }

    async function joinParty(account, partyId, input = {}) {
        const state = await readState();
        const party = requireParty(state, partyId);
        let member = state.members.find((candidate) => candidate.partyId === party.id && candidate.userId === account.userId);
        if (!member) {
            member = normalizeMember({
                id: randomBytes(9).toString('base64url'),
                partyId: party.id,
                userId: account.userId,
                name: input.memberName || account.name || account.email || account.userId,
                avatarUrl: input.avatarUrl,
                isHost: party.hostUserId === account.userId,
                lastSeen: Date.now(),
                joinedAt: new Date().toISOString(),
            });
            state.members.push(member);
        } else {
            member.lastSeen = Date.now();
            member.name = cleanText(input.memberName || member.name, 80) || member.name;
            member.avatarUrl = String(input.avatarUrl || member.avatarUrl || '');
            member.isHost = party.hostUserId === account.userId;
        }
        await writeState(state);
        return publicParty(state, party.id);
    }

    async function updatePlayback(userId, partyId, input = {}) {
        const state = await readState();
        const party = requireParty(state, partyId);
        requireHost(party, userId);
        party.currentTrack = cleanTrack(input.currentTrack);
        party.isPlaying = !!input.isPlaying;
        party.playbackTime = Math.max(0, Number(input.playbackTime || 0));
        party.playbackTimestamp = Date.now();
        party.queue = cleanQueue(input.queue);
        party.updatedAt = new Date().toISOString();
        await writeState(state);
        return publicParty(state, party.id);
    }

    async function heartbeat(userId, partyId, input = {}) {
        const state = await readState();
        const party = requireParty(state, partyId);
        const member = requireMember(state, party.id, userId);
        member.lastSeen = Date.now();
        member.typingUntil = Math.max(0, Number(input.typingUntil || member.typingUntil || 0));
        await writeState(state);
        return publicParty(state, party.id);
    }

    async function createMessage(userId, partyId, input = {}) {
        const state = await readState();
        const party = requireParty(state, partyId);
        const member = requireMember(state, party.id, userId);
        const content = cleanText(input.content, MAX_MESSAGE_LENGTH);
        if (!content) {
            const error = new Error('Message content is required');
            error.statusCode = 400;
            throw error;
        }
        state.messages.push(
            normalizeMessage({
                id: randomBytes(9).toString('base64url'),
                partyId: party.id,
                senderUserId: userId,
                senderName: member.name,
                content,
                createdAt: new Date().toISOString(),
            }),
        );
        await writeState(state);
        return publicParty(state, party.id);
    }

    async function createRequest(userId, partyId, input = {}) {
        const state = await readState();
        const party = requireParty(state, partyId);
        const member = requireMember(state, party.id, userId);
        const track = cleanTrack(input.track);
        if (!track) {
            const error = new Error('Request track is required');
            error.statusCode = 400;
            throw error;
        }
        state.requests.push(
            normalizeRequest({
                id: randomBytes(9).toString('base64url'),
                partyId: party.id,
                requesterUserId: userId,
                requestedBy: member.name,
                track,
                createdAt: new Date().toISOString(),
            }),
        );
        await writeState(state);
        return publicParty(state, party.id);
    }

    async function deleteRequest(userId, partyId, requestId) {
        const state = await readState();
        const party = requireParty(state, partyId);
        requireHost(party, userId);
        state.requests = state.requests.filter(
            (request) => !(request.partyId === party.id && request.id === String(requestId)),
        );
        await writeState(state);
        return publicParty(state, party.id);
    }

    async function leaveParty(userId, partyId) {
        const state = await readState();
        const party = requireParty(state, partyId);
        state.members = state.members.filter(
            (member) => !(member.partyId === party.id && member.userId === String(userId)),
        );
        await writeState(state);
        return publicParty(state, party.id);
    }

    async function endParty(userId, partyId) {
        const state = await readState();
        const party = requireParty(state, partyId);
        requireHost(party, userId);
        party.endedAt = new Date().toISOString();
        party.updatedAt = party.endedAt;
        state.members = state.members.filter((member) => member.partyId !== party.id);
        state.messages = state.messages.filter((message) => message.partyId !== party.id);
        state.requests = state.requests.filter((request) => request.partyId !== party.id);
        await writeState(state);
        return normalizeParty(party);
    }

    return {
        createParty,
        getParty,
        joinParty,
        updatePlayback,
        heartbeat,
        createMessage,
        createRequest,
        deleteRequest,
        leaveParty,
        endParty,
    };
}
