import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MAX_BIO_LENGTH = 1000;

function cleanText(value, maxLength = 200) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeUsername(value) {
    const username = cleanText(value, 60)
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!username || username.length < 2) {
        const error = new Error('Invalid username');
        error.statusCode = 400;
        throw error;
    }
    return username;
}

function normalizeUrl(value) {
    const text = cleanText(value, 1000);
    if (!text) return '';
    let url;
    try {
        url = new URL(text);
    } catch {
        const error = new Error('Invalid URL');
        error.statusCode = 400;
        throw error;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        const error = new Error('URL must use http or https');
        error.statusCode = 400;
        throw error;
    }
    return url.toString();
}

function defaultUsername(account) {
    const candidates = [account.name, account.email?.split('@')[0], account.userId];
    for (const candidate of candidates) {
        try {
            return normalizeUsername(candidate);
        } catch {}
    }
    return `user-${randomBytes(4).toString('hex')}`;
}

function normalizeProfile(profile) {
    const now = new Date().toISOString();
    const username = normalizeUsername(profile.username);
    const privacy = profile.privacy && typeof profile.privacy === 'object' ? profile.privacy : {};
    return {
        userId: String(profile.userId),
        username,
        display_name: cleanText(profile.display_name || profile.displayName || username, 120),
        avatar_url: normalizeUrl(profile.avatar_url || profile.avatarUrl),
        banner: normalizeUrl(profile.banner || profile.bannerUrl),
        about: cleanText(profile.about || profile.bio, MAX_BIO_LENGTH),
        website: normalizeUrl(profile.website),
        privacy: {
            playlists: privacy.playlists === 'private' ? 'private' : 'public',
            stats: privacy.stats === 'private' ? 'private' : 'public',
        },
        stats: profile.stats && typeof profile.stats === 'object' ? profile.stats : {},
        user_playlists: profile.user_playlists && typeof profile.user_playlists === 'object' ? profile.user_playlists : {},
        createdAt: profile.createdAt || now,
        updatedAt: profile.updatedAt || profile.createdAt || now,
    };
}

function publicProfile(profile) {
    const normalized = normalizeProfile(profile);
    return {
        userId: normalized.userId,
        username: normalized.username,
        display_name: normalized.display_name,
        avatar_url: normalized.avatar_url,
        banner: normalized.banner,
        about: normalized.about,
        website: normalized.website,
        privacy: normalized.privacy,
        stats: normalized.privacy.stats === 'private' ? {} : normalized.stats,
        user_playlists: normalized.privacy.playlists === 'private' ? {} : normalized.user_playlists,
        favorite_albums: [],
        createdAt: normalized.createdAt,
        updatedAt: normalized.updatedAt,
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

export function createProfileStore(config) {
    const profilesPath = join(config.paths.profiles, 'profiles.json');

    async function readProfiles() {
        const data = await readJson(profilesPath, { profiles: [] });
        return Array.isArray(data.profiles) ? data.profiles.map(normalizeProfile) : [];
    }

    async function writeProfiles(profiles) {
        await writeJsonAtomic(profilesPath, {
            profiles: profiles.map(normalizeProfile),
            updatedAt: new Date().toISOString(),
        });
    }

    async function ensureProfile(account) {
        const profiles = await readProfiles();
        let profile = profiles.find((candidate) => candidate.userId === account.userId);
        if (profile) return publicProfile(profile);

        const baseUsername = defaultUsername(account);
        const usernames = new Set(profiles.map((candidate) => candidate.username));
        let username = baseUsername;
        let suffix = 2;
        while (usernames.has(username)) {
            username = `${baseUsername}-${suffix}`;
            suffix += 1;
        }

        profile = normalizeProfile({
            userId: account.userId,
            username,
            display_name: account.name || username,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        profiles.push(profile);
        await writeProfiles(profiles);
        return publicProfile(profile);
    }

    async function getOwnProfile(account) {
        return ensureProfile(account);
    }

    async function getProfile(username) {
        const normalizedUsername = normalizeUsername(username);
        const profile = (await readProfiles()).find((candidate) => candidate.username === normalizedUsername);
        return profile ? publicProfile(profile) : null;
    }

    async function updateOwnProfile(account, updates) {
        const profiles = await readProfiles();
        let profile = profiles.find((candidate) => candidate.userId === account.userId);
        if (!profile) {
            profile = normalizeProfile({
                userId: account.userId,
                username: defaultUsername(account),
                display_name: account.name || account.userId,
            });
            profiles.push(profile);
        }

        const next = normalizeProfile({
            ...profile,
            username: updates.username || profile.username,
            display_name: updates.display_name || updates.displayName || profile.display_name,
            avatar_url: Object.hasOwn(updates, 'avatar_url') ? updates.avatar_url : profile.avatar_url,
            banner: Object.hasOwn(updates, 'banner') ? updates.banner : profile.banner,
            about: Object.hasOwn(updates, 'about') ? updates.about : profile.about,
            website: Object.hasOwn(updates, 'website') ? updates.website : profile.website,
            privacy: updates.privacy || profile.privacy,
            stats: updates.stats || profile.stats,
            user_playlists: updates.user_playlists || profile.user_playlists,
            updatedAt: new Date().toISOString(),
        });

        const usernameOwner = profiles.find(
            (candidate) => candidate.username === next.username && candidate.userId !== account.userId,
        );
        if (usernameOwner) {
            const error = new Error('Username is already taken');
            error.statusCode = 409;
            throw error;
        }

        profiles[profiles.findIndex((candidate) => candidate.userId === account.userId)] = next;
        await writeProfiles(profiles);
        return publicProfile(next);
    }

    return {
        getOwnProfile,
        getProfile,
        updateOwnProfile,
    };
}
