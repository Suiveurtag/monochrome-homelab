import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { ensureSelfHostedDataDirs, getSelfHostedConfig, loadEnvFile } from './config.mjs';

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
    res.setHeader('access-control-allow-headers', 'content-type,authorization,x-monochrome-user-id');
}

function publicConfig(config) {
    return {
        dataDir: config.dataDir,
        paths: config.paths,
        auth: config.auth,
    };
}

async function route(req, res, config) {
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

    return {
        config,
        server: createServer((req, res) => {
            route(req, res, config).catch((error) => {
                console.error(error);
                sendJson(res, 500, { error: error.message || 'Self-hosted server error' });
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
