import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

function cleanText(value, maxLength = 200) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeUrl(value, { required = false } = {}) {
    const text = cleanText(value, 1000);
    if (!text) {
        if (required) {
            const error = new Error('Missing URL');
            error.statusCode = 400;
            throw error;
        }
        return null;
    }

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

function publicRadio(radio) {
    return {
        id: String(radio.id),
        name: radio.name,
        streamUrl: radio.streamUrl,
        genre: radio.genre || null,
        country: radio.country || null,
        artworkUrl: radio.artworkUrl || null,
        enabled: radio.enabled !== false,
        creatorUserId: radio.creatorUserId || null,
        createdAt: radio.createdAt,
        updatedAt: radio.updatedAt,
    };
}

function normalizeRadio(radio) {
    const now = new Date().toISOString();
    return publicRadio({
        id: radio.id || randomUUID(),
        name: cleanText(radio.name) || 'Untitled Radio',
        streamUrl: normalizeUrl(radio.streamUrl, { required: true }),
        genre: cleanText(radio.genre, 80) || null,
        country: cleanText(radio.country, 80) || null,
        artworkUrl: normalizeUrl(radio.artworkUrl),
        enabled: radio.enabled !== false,
        creatorUserId: radio.creatorUserId || null,
        createdAt: radio.createdAt || now,
        updatedAt: radio.updatedAt || radio.createdAt || now,
    });
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

export function createRadioStore(config) {
    const radiosPath = join(config.paths.radios, 'radios.json');

    async function readRadios() {
        const data = await readJson(radiosPath, { radios: [] });
        return Array.isArray(data.radios) ? data.radios.map(normalizeRadio) : [];
    }

    async function writeRadios(radios) {
        await writeJsonAtomic(radiosPath, {
            radios: radios.map(normalizeRadio),
            updatedAt: new Date().toISOString(),
        });
    }

    async function listRadios(options = {}) {
        const radios = await readRadios();
        return (options.includeDisabled ? radios : radios.filter((radio) => radio.enabled)).map(publicRadio);
    }

    async function createRadio(input, creatorUserId) {
        const radios = await readRadios();
        const radio = normalizeRadio({
            ...input,
            id: randomUUID(),
            creatorUserId,
            enabled: input.enabled !== false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        radios.push(radio);
        await writeRadios(radios);
        return publicRadio(radio);
    }

    async function updateRadio(id, updates) {
        const radios = await readRadios();
        const radio = radios.find((candidate) => candidate.id === id);
        if (!radio) {
            const error = new Error('Radio not found');
            error.statusCode = 404;
            throw error;
        }

        const next = normalizeRadio({
            ...radio,
            ...updates,
            id: radio.id,
            creatorUserId: radio.creatorUserId,
            createdAt: radio.createdAt,
            updatedAt: new Date().toISOString(),
        });
        const index = radios.findIndex((candidate) => candidate.id === id);
        radios[index] = next;
        await writeRadios(radios);
        return publicRadio(next);
    }

    return {
        listRadios,
        createRadio,
        updateRadio,
    };
}
