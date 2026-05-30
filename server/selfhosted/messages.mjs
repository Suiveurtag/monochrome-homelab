import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function cleanBody(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function publicMessage(message) {
    return {
        id: String(message.id),
        fromUserId: String(message.fromUserId),
        toUserId: String(message.toUserId),
        body: cleanBody(message.body),
        createdAt: message.createdAt,
    };
}

function conversationMatches(message, firstUserId, secondUserId) {
    return (
        (message.fromUserId === firstUserId && message.toUserId === secondUserId) ||
        (message.fromUserId === secondUserId && message.toUserId === firstUserId)
    );
}

function parseLimit(value) {
    const limit = Number(value || DEFAULT_LIMIT);
    if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.floor(limit), MAX_LIMIT);
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

export function createMessageStore(config) {
    const messagesPath = join(config.paths.messages, 'messages.json');

    async function readMessages() {
        const data = await readJson(messagesPath, { messages: [] });
        return Array.isArray(data.messages) ? data.messages.map(publicMessage).filter((message) => message.body) : [];
    }

    async function writeMessages(messages) {
        await writeJsonAtomic(messagesPath, {
            messages: messages.map(publicMessage),
            updatedAt: new Date().toISOString(),
        });
    }

    async function listConversation({ userId, contactUserId, limit, before }) {
        const ownUserId = String(userId || '');
        const otherUserId = String(contactUserId || '');
        if (!ownUserId || !otherUserId || ownUserId === otherUserId) {
            const error = new Error('Invalid conversation target');
            error.statusCode = 400;
            throw error;
        }

        const beforeTime = before ? Date.parse(before) : null;
        const messages = (await readMessages())
            .filter((message) => conversationMatches(message, ownUserId, otherUserId))
            .filter((message) => !beforeTime || Date.parse(message.createdAt) < beforeTime)
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        return messages.slice(-parseLimit(limit));
    }

    async function createMessage({ fromUserId, toUserId, body }) {
        const from = String(fromUserId || '');
        const to = String(toUserId || '');
        const cleanMessageBody = cleanBody(body);
        if (!from || !to || from === to) {
            const error = new Error('Invalid message target');
            error.statusCode = 400;
            throw error;
        }
        if (!cleanMessageBody) {
            const error = new Error('Message body is required');
            error.statusCode = 400;
            throw error;
        }

        const messages = await readMessages();
        const message = publicMessage({
            id: randomBytes(9).toString('base64url'),
            fromUserId: from,
            toUserId: to,
            body: cleanMessageBody,
            createdAt: new Date().toISOString(),
        });
        messages.push(message);
        await writeMessages(messages);
        return message;
    }

    return {
        listConversation,
        createMessage,
    };
}
