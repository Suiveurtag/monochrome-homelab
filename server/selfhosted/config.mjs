import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFAULT_PORT = 8790;
const DEFAULT_DATA_DIR = join(process.cwd(), '.storage', 'self-hosted');

function parseEnvLine(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return null;
    const separator = trimmed.indexOf('=');
    if (separator === -1) return null;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, '');
    return key ? [key, value] : null;
}

export async function loadEnvFile(envPath = '.env') {
    try {
        const raw = await readFile(envPath, 'utf8');
        for (const line of raw.split(/\r?\n/)) {
            const parsed = parseEnvLine(line);
            if (!parsed) continue;
            const [key, value] = parsed;
            if (process.env[key] == null) process.env[key] = value;
        }
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

export function getSelfHostedConfig(overrides = {}) {
    const dataDir = resolve(overrides.dataDir || process.env.MONOCHROME_SERVER_DATA || DEFAULT_DATA_DIR);
    const port = Number(overrides.port || process.env.MONOCHROME_SERVER_PORT || DEFAULT_PORT);

    return {
        host: overrides.host || process.env.MONOCHROME_SERVER_HOST || '127.0.0.1',
        port,
        dataDir,
        paths: {
            uploads: join(dataDir, 'uploads'),
            artwork: join(dataDir, 'artwork'),
            metadata: join(dataDir, 'metadata'),
            indexes: join(dataDir, 'indexes'),
            accounts: join(dataDir, 'accounts'),
            profiles: join(dataDir, 'profiles'),
            radios: join(dataDir, 'radios'),
            shares: join(dataDir, 'shares'),
            invitations: join(dataDir, 'invitations'),
            messages: join(dataDir, 'messages'),
            tmp: join(dataDir, 'tmp'),
        },
        auth: {
            required: process.env.MONOCHROME_AUTH_REQUIRED !== 'false',
            approvalRequired: process.env.MONOCHROME_AUTH_APPROVAL_REQUIRED !== 'false',
            provider: process.env.MONOCHROME_AUTH_PROVIDER || 'placeholder',
            adminSecret: overrides.adminSecret || process.env.MONOCHROME_ADMIN_SECRET || null,
            bootstrapAdminUserId: overrides.bootstrapAdminUserId || process.env.MONOCHROME_BOOTSTRAP_ADMIN_USER_ID || null,
        },
    };
}

export async function ensureSelfHostedDataDirs(config) {
    await mkdir(config.dataDir, { recursive: true });
    await Promise.all(Object.values(config.paths).map((dir) => mkdir(dir, { recursive: true })));
}
