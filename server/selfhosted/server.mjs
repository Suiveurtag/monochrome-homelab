import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createAccountStore, isAccountAllowed } from './accounts.mjs';
import { ensureSelfHostedDataDirs, getSelfHostedConfig, loadEnvFile } from './config.mjs';
import { createInvitationStore } from './invitations.mjs';
import { createMessageStore } from './messages.mjs';
import { createPartyStore } from './parties.mjs';
import { createProfileStore } from './profiles.mjs';
import { createRadioStore } from './radios.mjs';
import { createShareStore } from './shares.mjs';

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
    });
    res.end(body);
}

function setCors(res) {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader(
        'access-control-allow-headers',
        'content-type,authorization,x-monochrome-user-id,x-monochrome-user-email,x-monochrome-user-name,x-monochrome-admin-secret',
    );
}

function publicConfig(config) {
    return {
        dataDir: config.dataDir,
        paths: config.paths,
        auth: {
            required: config.auth.required,
            approvalRequired: config.auth.approvalRequired,
            provider: config.auth.provider,
            bootstrapAdminConfigured: !!config.auth.bootstrapAdminUserId,
            adminSecretConfigured: !!config.auth.adminSecret,
        },
    };
}

async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length === 0) return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        const error = new Error('Invalid JSON body');
        error.statusCode = 400;
        throw error;
    }
}

function getHeader(req, name) {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
}

function getRequestProfile(req) {
    return {
        userId: getHeader(req, 'x-monochrome-user-id'),
        email: getHeader(req, 'x-monochrome-user-email'),
        name: getHeader(req, 'x-monochrome-user-name'),
    };
}

async function requireAdmin(req, config, accountStore) {
    const secret = getHeader(req, 'x-monochrome-admin-secret');
    if (config.auth.adminSecret && secret === config.auth.adminSecret) return;
    if (await accountStore.isApprovedAdmin(getHeader(req, 'x-monochrome-user-id'))) return;

    const error = new Error('Admin approval required');
    error.statusCode = 403;
    throw error;
}

async function requireAllowedAccount(req, config, accountStore) {
    const account = await accountStore.ensureAccount(getRequestProfile(req));
    if (config.auth.approvalRequired && !isAccountAllowed(account)) {
        const error = new Error(`Account is ${account.status}`);
        error.statusCode = 403;
        throw error;
    }
    return account;
}

async function requireAcceptedContact(invitationStore, ownUserId, contactUserId) {
    if (await invitationStore.areContacts(ownUserId, contactUserId)) return;
    const error = new Error('Accepted contact required');
    error.statusCode = 403;
    throw error;
}

async function route(
    req,
    res,
    config,
    accountStore,
    profileStore,
    radioStore,
    shareStore,
    invitationStore,
    messageStore,
    partyStore,
) {
    setCors(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/health' && req.method === 'GET') {
        sendJson(res, 200, {
            ok: true,
            service: 'monochrome-self-hosted',
            config: publicConfig(config),
        });
        return;
    }

    if (url.pathname === '/api/accounts/me' && req.method === 'GET') {
        const account = await accountStore.ensureAccount(getRequestProfile(req));
        if (config.auth.approvalRequired && !isAccountAllowed(account)) {
            sendJson(res, 403, {
                error: `Account is ${account.status}`,
                account,
            });
            return;
        }
        sendJson(res, 200, { account });
        return;
    }

    if (url.pathname === '/api/admin/accounts' && req.method === 'GET') {
        await requireAdmin(req, config, accountStore);
        sendJson(res, 200, { accounts: await accountStore.listAccounts() });
        return;
    }

    const accountUpdateMatch = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)$/);
    if (accountUpdateMatch && req.method === 'PATCH') {
        await requireAdmin(req, config, accountStore);
        const body = await readJsonBody(req);
        const account = await accountStore.updateAccount(decodeURIComponent(accountUpdateMatch[1]), body);
        sendJson(res, 200, { account });
        return;
    }

    if (url.pathname === '/api/profiles/me' && req.method === 'GET') {
        const account = await requireAllowedAccount(req, config, accountStore);
        sendJson(res, 200, { profile: await profileStore.getOwnProfile(account) });
        return;
    }

    if (url.pathname === '/api/profiles/me' && req.method === 'PATCH') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        sendJson(res, 200, { profile: await profileStore.updateOwnProfile(account, body) });
        return;
    }

    const profileMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)$/);
    if (profileMatch && req.method === 'GET') {
        await requireAllowedAccount(req, config, accountStore);
        const profile = await profileStore.getProfile(decodeURIComponent(profileMatch[1]));
        if (!profile) {
            sendJson(res, 404, { error: 'Profile not found' });
            return;
        }
        sendJson(res, 200, { profile });
        return;
    }

    if (url.pathname === '/api/radios' && req.method === 'GET') {
        await requireAllowedAccount(req, config, accountStore);
        sendJson(res, 200, { radios: await radioStore.listRadios() });
        return;
    }

    if (url.pathname === '/api/radios' && req.method === 'POST') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        const radio = await radioStore.createRadio(body, account.userId);
        sendJson(res, 201, { radio });
        return;
    }

    if (url.pathname === '/api/admin/radios' && req.method === 'GET') {
        await requireAdmin(req, config, accountStore);
        sendJson(res, 200, { radios: await radioStore.listRadios({ includeDisabled: true }) });
        return;
    }

    const radioUpdateMatch = url.pathname.match(/^\/api\/admin\/radios\/([^/]+)$/);
    if (radioUpdateMatch && req.method === 'PATCH') {
        await requireAdmin(req, config, accountStore);
        const body = await readJsonBody(req);
        const radio = await radioStore.updateRadio(decodeURIComponent(radioUpdateMatch[1]), body);
        sendJson(res, 200, { radio });
        return;
    }

    if (url.pathname === '/api/shares' && req.method === 'POST') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        const share = await shareStore.createShare(body, account.userId);
        sendJson(res, 201, { share });
        return;
    }

    const shareMatch = url.pathname.match(/^\/api\/shares\/([^/]+)$/);
    if (shareMatch && req.method === 'GET') {
        await requireAllowedAccount(req, config, accountStore);
        const share = await shareStore.getShare(decodeURIComponent(shareMatch[1]));
        if (!share) {
            sendJson(res, 404, { error: 'Share not found' });
            return;
        }
        sendJson(res, 200, { share });
        return;
    }

    if (url.pathname === '/api/invitations' && req.method === 'GET') {
        const account = await requireAllowedAccount(req, config, accountStore);
        sendJson(res, 200, await invitationStore.listInvitations(account.userId));
        return;
    }

    if (url.pathname === '/api/invitations' && req.method === 'POST') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        let toUserId = body.toUserId ? String(body.toUserId) : '';
        if (!toUserId && body.username) {
            const profile = await profileStore.getProfile(String(body.username));
            toUserId = profile?.userId || '';
        }
        const invitation = await invitationStore.createInvitation({
            fromUserId: account.userId,
            toUserId,
            message: body.message,
        });
        sendJson(res, 201, { invitation });
        return;
    }

    const invitationMatch = url.pathname.match(/^\/api\/invitations\/([^/]+)$/);
    if (invitationMatch && req.method === 'PATCH') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        const invitation = await invitationStore.updateInvitation({
            invitationId: decodeURIComponent(invitationMatch[1]),
            userId: account.userId,
            status: body.status,
        });
        sendJson(res, 200, { invitation });
        return;
    }

    if (url.pathname === '/api/messages' && req.method === 'GET') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const contactUserId = url.searchParams.get('contactUserId') || '';
        await requireAcceptedContact(invitationStore, account.userId, contactUserId);
        const messages = await messageStore.listConversation({
            userId: account.userId,
            contactUserId,
            limit: url.searchParams.get('limit'),
            before: url.searchParams.get('before'),
        });
        sendJson(res, 200, { messages });
        return;
    }

    if (url.pathname === '/api/messages' && req.method === 'POST') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        const toUserId = String(body.toUserId || '');
        await requireAcceptedContact(invitationStore, account.userId, toUserId);
        const message = await messageStore.createMessage({
            fromUserId: account.userId,
            toUserId,
            body: body.body,
        });
        sendJson(res, 201, { message });
        return;
    }

    if (url.pathname === '/api/parties' && req.method === 'POST') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        sendJson(res, 201, { party: await partyStore.createParty(account, body) });
        return;
    }

    const partyJoinMatch = url.pathname.match(/^\/api\/parties\/([^/]+)\/join$/);
    if (partyJoinMatch && req.method === 'POST') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const partyId = decodeURIComponent(partyJoinMatch[1]);
        const party = await partyStore.getParty(partyId);
        if (!party) {
            sendJson(res, 404, { error: 'Party not found' });
            return;
        }
        if (party.hostUserId !== account.userId) {
            await requireAcceptedContact(invitationStore, account.userId, party.hostUserId);
        }
        const body = await readJsonBody(req);
        sendJson(res, 200, { party: await partyStore.joinParty(account, partyId, body) });
        return;
    }

    const partyPlaybackMatch = url.pathname.match(/^\/api\/parties\/([^/]+)\/playback$/);
    if (partyPlaybackMatch && req.method === 'PATCH') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        const party = await partyStore.updatePlayback(account.userId, decodeURIComponent(partyPlaybackMatch[1]), body);
        sendJson(res, 200, { party });
        return;
    }

    const partyHeartbeatMatch = url.pathname.match(/^\/api\/parties\/([^/]+)\/heartbeat$/);
    if (partyHeartbeatMatch && req.method === 'POST') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        const party = await partyStore.heartbeat(account.userId, decodeURIComponent(partyHeartbeatMatch[1]), body);
        sendJson(res, 200, { party });
        return;
    }

    const partyMessageMatch = url.pathname.match(/^\/api\/parties\/([^/]+)\/messages$/);
    if (partyMessageMatch && req.method === 'POST') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        const party = await partyStore.createMessage(account.userId, decodeURIComponent(partyMessageMatch[1]), body);
        sendJson(res, 201, { party });
        return;
    }

    const partyRequestsMatch = url.pathname.match(/^\/api\/parties\/([^/]+)\/requests$/);
    if (partyRequestsMatch && req.method === 'POST') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const body = await readJsonBody(req);
        const party = await partyStore.createRequest(account.userId, decodeURIComponent(partyRequestsMatch[1]), body);
        sendJson(res, 201, { party });
        return;
    }

    const partyRequestDeleteMatch = url.pathname.match(/^\/api\/parties\/([^/]+)\/requests\/([^/]+)$/);
    if (partyRequestDeleteMatch && req.method === 'DELETE') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const party = await partyStore.deleteRequest(
            account.userId,
            decodeURIComponent(partyRequestDeleteMatch[1]),
            decodeURIComponent(partyRequestDeleteMatch[2]),
        );
        sendJson(res, 200, { party });
        return;
    }

    const partyLeaveMatch = url.pathname.match(/^\/api\/parties\/([^/]+)\/leave$/);
    if (partyLeaveMatch && req.method === 'POST') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const party = await partyStore.leaveParty(account.userId, decodeURIComponent(partyLeaveMatch[1]));
        sendJson(res, 200, { party });
        return;
    }

    const partyMatch = url.pathname.match(/^\/api\/parties\/([^/]+)$/);
    if (partyMatch && req.method === 'GET') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const party = await partyStore.getParty(decodeURIComponent(partyMatch[1]));
        if (!party) {
            sendJson(res, 404, { error: 'Party not found' });
            return;
        }
        if (party.hostUserId !== account.userId) {
            await requireAcceptedContact(invitationStore, account.userId, party.hostUserId);
        }
        sendJson(res, 200, { party });
        return;
    }

    if (partyMatch && req.method === 'DELETE') {
        const account = await requireAllowedAccount(req, config, accountStore);
        const party = await partyStore.endParty(account.userId, decodeURIComponent(partyMatch[1]));
        sendJson(res, 200, { party });
        return;
    }

    if (url.pathname.startsWith('/api/auth/')) {
        sendJson(res, 501, {
            error: 'Self-hosted auth endpoints are not implemented yet',
            auth: config.auth,
        });
        return;
    }

    sendJson(res, 404, { error: 'Not found' });
}

export async function createSelfHostedServer(options = {}) {
    if (options.loadEnv !== false) {
        await loadEnvFile(options.envPath);
    }

    const config = getSelfHostedConfig(options);
    await ensureSelfHostedDataDirs(config);
    const accountStore = createAccountStore(config);
    const profileStore = createProfileStore(config);
    const radioStore = createRadioStore(config);
    const shareStore = createShareStore(config);
    const invitationStore = createInvitationStore(config);
    const messageStore = createMessageStore(config);
    const partyStore = createPartyStore(config);

    return {
        config,
        server: createServer((req, res) => {
            route(
                req,
                res,
                config,
                accountStore,
                profileStore,
                radioStore,
                shareStore,
                invitationStore,
                messageStore,
                partyStore,
            ).catch((error) => {
                    console.error(error);
                    sendJson(res, error.statusCode || 500, { error: error.message || 'Self-hosted server error' });
                });
        }),
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { config, server } = await createSelfHostedServer();
    server.listen(config.port, config.host, () => {
        console.log(`Monochrome self-hosted server listening on http://${config.host}:${config.port}`);
        console.log(`Data directory: ${config.dataDir}`);
    });
}
