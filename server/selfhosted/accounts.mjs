import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const ACCOUNT_STATUSES = ['pending', 'approved', 'rejected', 'disabled'];
export const ACCOUNT_ROLES = ['user', 'admin'];

function normalizeAccount(account) {
    return {
        userId: String(account.userId),
        email: account.email || null,
        name: account.name || null,
        status: ACCOUNT_STATUSES.includes(account.status) ? account.status : 'pending',
        role: ACCOUNT_ROLES.includes(account.role) ? account.role : 'user',
        createdAt: account.createdAt || new Date().toISOString(),
        updatedAt: account.updatedAt || account.createdAt || new Date().toISOString(),
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

function publicAccount(account) {
    const normalized = normalizeAccount(account);
    return {
        userId: normalized.userId,
        email: normalized.email,
        name: normalized.name,
        status: normalized.status,
        role: normalized.role,
        createdAt: normalized.createdAt,
        updatedAt: normalized.updatedAt,
        approved: normalized.status === 'approved',
        admin: normalized.role === 'admin',
    };
}

export function createAccountStore(config) {
    const accountsPath = join(config.paths.accounts, 'accounts.json');

    async function readAccounts() {
        const data = await readJson(accountsPath, { accounts: [] });
        return Array.isArray(data.accounts) ? data.accounts.map(normalizeAccount) : [];
    }

    async function writeAccounts(accounts) {
        await writeJsonAtomic(accountsPath, {
            accounts: accounts.map(normalizeAccount),
            updatedAt: new Date().toISOString(),
        });
    }

    function shouldBootstrapAdmin(userId, accounts) {
        if (config.auth.bootstrapAdminUserId) {
            return userId === config.auth.bootstrapAdminUserId;
        }
        return accounts.length === 0;
    }

    async function ensureAccount(profile) {
        const userId = String(profile.userId || '');
        if (!userId) {
            const error = new Error('Missing user id');
            error.statusCode = 401;
            throw error;
        }

        const accounts = await readAccounts();
        const existing = accounts.find((account) => account.userId === userId);
        if (existing) {
            const changedEmail = profile.email && profile.email !== existing.email;
            const changedName = profile.name && profile.name !== existing.name;
            if (changedEmail || changedName) {
                existing.email = profile.email || existing.email;
                existing.name = profile.name || existing.name;
                existing.updatedAt = new Date().toISOString();
                await writeAccounts(accounts);
            }
            return publicAccount(existing);
        }

        const now = new Date().toISOString();
        const bootstrap = shouldBootstrapAdmin(userId, accounts);
        const account = normalizeAccount({
            userId,
            email: profile.email || null,
            name: profile.name || null,
            status: bootstrap ? 'approved' : 'pending',
            role: bootstrap ? 'admin' : 'user',
            createdAt: now,
            updatedAt: now,
        });
        accounts.push(account);
        await writeAccounts(accounts);
        return publicAccount(account);
    }

    async function listAccounts() {
        return (await readAccounts()).map(publicAccount);
    }

    async function updateAccount(userId, updates) {
        const accounts = await readAccounts();
        const account = accounts.find((candidate) => candidate.userId === userId);
        if (!account) {
            const error = new Error('Account not found');
            error.statusCode = 404;
            throw error;
        }

        if (updates.status != null) {
            if (!ACCOUNT_STATUSES.includes(updates.status)) {
                const error = new Error('Invalid account status');
                error.statusCode = 400;
                throw error;
            }
            account.status = updates.status;
        }

        if (updates.role != null) {
            if (!ACCOUNT_ROLES.includes(updates.role)) {
                const error = new Error('Invalid account role');
                error.statusCode = 400;
                throw error;
            }
            account.role = updates.role;
        }

        account.updatedAt = new Date().toISOString();
        await writeAccounts(accounts);
        return publicAccount(account);
    }

    async function isApprovedAdmin(userId) {
        if (!userId) return false;
        const account = (await readAccounts()).find((candidate) => candidate.userId === String(userId));
        return account?.status === 'approved' && account?.role === 'admin';
    }

    return {
        ensureAccount,
        listAccounts,
        updateAccount,
        isApprovedAdmin,
    };
}

export function isAccountAllowed(account) {
    return account?.status === 'approved';
}
