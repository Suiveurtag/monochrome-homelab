import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

const SOURCE_KIND = 'server-local';
const UNKNOWN_ARTIST = 'Unknown Artist';
const SERVER_UPLOADS_ALBUM = { title: 'Server Uploads', cover: '/assets/appicon.png' };

function hashValue(value, length = 32) {
    return createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function assertInside(root, path) {
    const relativePath = relative(root, path);
    if (relativePath.startsWith('..') || relativePath === '..' || relativePath.includes(`..${sep}`)) {
        throw new Error('Resolved storage path escaped the storage root');
    }
    return path;
}

function safeJoin(root, ...parts) {
    return assertInside(root, resolve(root, ...parts));
}

function shardId(id) {
    const hash = hashValue(id, 4);
    return [hash.slice(0, 2), hash.slice(2, 4)];
}

function stripExtension(filename) {
    return filename.replace(/\.[^.]+$/, '');
}

function normalizeTitle(filename) {
    return stripExtension(filename).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Uploaded Track';
}

function makeTrackKey(uploadId) {
    return `v1:${SOURCE_KIND}:none:${encodeURIComponent(uploadId)}`;
}

function tokenIndexName(token) {
    return `${hashValue(token, 64)}.json`;
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

export function getStorageLayout(root) {
    const storageRoot = resolve(root);
    return {
        root: storageRoot,
        audio: safeJoin(storageRoot, 'audio'),
        artwork: safeJoin(storageRoot, 'artwork'),
        metadata: safeJoin(storageRoot, 'metadata'),
        trackMetadata: safeJoin(storageRoot, 'metadata', 'tracks'),
        indexes: safeJoin(storageRoot, 'indexes'),
        userIndexes: safeJoin(storageRoot, 'indexes', 'users'),
        streamIndexes: safeJoin(storageRoot, 'indexes', 'streams'),
        tmp: safeJoin(storageRoot, 'tmp'),
        legacyUsers: storageRoot,
    };
}

export async function ensureStorageLayout(layout) {
    await Promise.all([
        mkdir(layout.audio, { recursive: true }),
        mkdir(layout.artwork, { recursive: true }),
        mkdir(layout.trackMetadata, { recursive: true }),
        mkdir(layout.userIndexes, { recursive: true }),
        mkdir(layout.streamIndexes, { recursive: true }),
        mkdir(layout.tmp, { recursive: true }),
    ]);
}

export function getUserHash(userId) {
    return hashValue(userId, 32);
}

export function createFilesystemLibraryStorage(options = {}) {
    const layout = getStorageLayout(options.root || join(process.cwd(), '.storage', 'server-uploads'));

    function userIndexPath(userId) {
        return safeJoin(layout.userIndexes, getUserHash(userId), 'uploads.json');
    }

    function legacyUserDir(userId) {
        return safeJoin(layout.legacyUsers, getUserHash(userId));
    }

    function legacyManifestPath(userId) {
        return safeJoin(legacyUserDir(userId), 'manifest.json');
    }

    function trackMetadataPath(trackId) {
        return safeJoin(layout.trackMetadata, ...shardId(trackId), `${trackId}.json`);
    }

    function trackAudioDir(trackId) {
        return safeJoin(layout.audio, ...shardId(trackId), trackId);
    }

    function streamIndexPath(token) {
        return safeJoin(layout.streamIndexes, tokenIndexName(token));
    }

    async function readUserTrackIds(userId) {
        const index = await readJson(userIndexPath(userId), { tracks: [] });
        return Array.isArray(index.tracks) ? index.tracks : [];
    }

    async function writeUserTrackIds(userId, trackIds) {
        const uniqueTrackIds = [...new Set(trackIds.filter(Boolean))];
        await writeJsonAtomic(userIndexPath(userId), {
            userHash: getUserHash(userId),
            tracks: uniqueTrackIds,
            updatedAt: new Date().toISOString(),
        });
    }

    async function readLegacyManifest(userId) {
        const manifest = await readJson(legacyManifestPath(userId), { tracks: [] });
        return Array.isArray(manifest.tracks) ? manifest.tracks : [];
    }

    async function readTrack(trackId) {
        return readJson(trackMetadataPath(trackId), null);
    }

    async function listTracks(userId) {
        const tracks = [];
        const seen = new Set();

        for (const trackId of await readUserTrackIds(userId)) {
            const track = await readTrack(trackId);
            if (track) {
                tracks.push(track);
                seen.add(track.id);
            }
        }

        for (const track of await readLegacyManifest(userId)) {
            if (track?.id && !seen.has(track.id)) {
                tracks.push({ ...track, storageVersion: track.storageVersion || 1 });
            }
        }

        return tracks;
    }

    async function saveUpload({ userId, filename, mimeType, content }) {
        const uploadId = randomUUID();
        const extension = extname(filename).toLowerCase() || '.audio';
        const storedFileName = `${uploadId}${extension}`;
        const audioDir = trackAudioDir(uploadId);
        await mkdir(audioDir, { recursive: true });
        await mkdir(layout.tmp, { recursive: true });

        const tempPath = safeJoin(layout.tmp, `${uploadId}.${randomBytes(6).toString('hex')}.tmp`);
        const finalPath = safeJoin(audioDir, storedFileName);
        await writeFile(tempPath, content);

        try {
            await rename(tempPath, finalPath);
        } catch (error) {
            await unlink(tempPath).catch(() => {});
            throw error;
        }

        const createdAt = new Date().toISOString();
        const streamToken = randomBytes(24).toString('base64url');
        const track = {
            id: uploadId,
            trackKey: makeTrackKey(uploadId),
            source: { kind: SOURCE_KIND, sourceId: uploadId },
            type: 'track',
            title: normalizeTitle(filename),
            duration: null,
            artist: { name: UNKNOWN_ARTIST },
            artists: [{ name: UNKNOWN_ARTIST }],
            album: SERVER_UPLOADS_ALBUM,
            mimeType,
            size: content.length,
            originalFileName: filename,
            storedFileName,
            storageVersion: 2,
            storage: {
                blobPath: relative(layout.root, finalPath).split(sep).join('/'),
                metadataPath: relative(layout.root, trackMetadataPath(uploadId)).split(sep).join('/'),
            },
            streamToken,
            createdAt,
            updatedAt: createdAt,
        };

        await writeJsonAtomic(trackMetadataPath(uploadId), track);
        await writeJsonAtomic(streamIndexPath(streamToken), {
            trackId: uploadId,
            userHash: getUserHash(userId),
            createdAt,
        });

        await writeUserTrackIds(userId, [uploadId, ...(await readUserTrackIds(userId))]);
        return track;
    }

    async function findTrackByStreamToken(uploadId, token) {
        const indexed = await readJson(streamIndexPath(token), null);
        if (indexed?.trackId === uploadId) {
            const track = await readTrack(uploadId);
            if (track?.streamToken === token) {
                return { track, filePath: safeJoin(layout.root, track.storage.blobPath) };
            }
        }

        const users = await readdir(layout.legacyUsers, { withFileTypes: true }).catch(() => []);
        for (const user of users) {
            if (!user.isDirectory()) continue;
            const manifestPath = safeJoin(layout.legacyUsers, user.name, 'manifest.json');
            try {
                const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
                const track = manifest.tracks?.find(
                    (candidate) => candidate.id === uploadId && candidate.streamToken === token,
                );
                if (track) {
                    return { track, filePath: safeJoin(layout.legacyUsers, user.name, track.storedFileName) };
                }
            } catch {}
        }

        return null;
    }

    async function getStreamInfo(uploadId, token) {
        const match = await findTrackByStreamToken(uploadId, token);
        if (!match) return null;
        return {
            track: match.track,
            filePath: match.filePath,
            stat: await stat(match.filePath),
            createReadStream: (options) => createReadStream(match.filePath, options),
        };
    }

    return {
        layout,
        ensure: () => ensureStorageLayout(layout),
        listTracks,
        saveUpload,
        getStreamInfo,
    };
}
