import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createAccountStore, isAccountAllowed } from './accounts.mjs';
import { ensureSelfHostedDataDirs, getSelfHostedConfig, loadEnvFile } from './config.mjs';
import { createRadioStore } from './radios.mjs';

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

async function route(req, res, config, accountStore, radioStore) {
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
    const radioStore = createRadioStore(config);

    return {
        config,
        server: createServer((req, res) => {
            route(req, res, config, accountStore, radioStore).catch((error) => {
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
