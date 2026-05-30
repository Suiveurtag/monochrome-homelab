import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { extractAudioMetadata } from './audio-metadata.mjs';

const SOURCE_KIND = 'server-local';
const UNKNOWN_ARTIST = 'Unknown Artist';
const SERVER_UPLOADS_ALBUM = { title: 'Server Uploads', cover: '/assets/appicon.png' };
const MAX_METADATA_TEXT_LENGTH = 300;
const MAX_TAGS = 32;

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

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
}

function getTrackSearchText(track) {
    const artistNames = Array.isArray(track.artists)
        ? track.artists.map((artist) => artist?.name).filter(Boolean)
        : [track.artist?.name].filter(Boolean);
    const tags = [
        ...(Array.isArray(track.tags) ? track.tags : []),
        ...(Array.isArray(track.mediaMetadata?.tags) ? track.mediaMetadata.tags : []),
        ...(Array.isArray(track.album?.mediaMetadata?.tags) ? track.album.mediaMetadata.tags : []),
    ];

    return normalizeSearchText([
        track.title,
        track.album?.title,
        track.originalFileName,
        ...artistNames,
        ...tags,
    ].join(' '));
}

function cleanMetadataText(value, maxLength = MAX_METADATA_TEXT_LENGTH) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, maxLength);
}

function normalizeMetadataTags(value) {
    const tags = Array.isArray(value) ? value : String(value || '').split(',');
    return [
        ...new Set(
            tags
                .map((tag) => cleanMetadataText(tag, 64))
                .filter(Boolean),
        ),
    ].slice(0, MAX_TAGS);
}

function normalizeMetadataPatch(patch) {
    const normalized = {};
    if (Object.hasOwn(patch, 'title')) normalized.title = cleanMetadataText(patch.title) || 'Uploaded Track';
    if (Object.hasOwn(patch, 'artist')) normalized.artistName = cleanMetadataText(patch.artist) || UNKNOWN_ARTIST;
    if (Object.hasOwn(patch, 'album')) normalized.albumTitle = cleanMetadataText(patch.album) || SERVER_UPLOADS_ALBUM.title;
    if (Object.hasOwn(patch, 'year')) {
        const year = Number(patch.year);
        normalized.year = Number.isInteger(year) && year >= 0 && year <= 9999 ? year : null;
    }
    if (Object.hasOwn(patch, 'artworkUrl')) normalized.artworkUrl = cleanMetadataText(patch.artworkUrl, 1000);
    if (Object.hasOwn(patch, 'tags')) normalized.tags = normalizeMetadataTags(patch.tags);
    return normalized;
}

function applySharedMetadata(track, patch, userId) {
    const next = { ...track };
    if (Object.hasOwn(patch, 'title')) next.title = patch.title;
    if (Object.hasOwn(patch, 'artistName')) {
        next.artist = { ...(next.artist || {}), name: patch.artistName };
        next.artists = [{ name: patch.artistName }];
    }
    if (Object.hasOwn(patch, 'albumTitle')) {
        next.album = { ...(next.album || SERVER_UPLOADS_ALBUM), title: patch.albumTitle };
    }
    if (Object.hasOwn(patch, 'year')) {
        next.year = patch.year;
        next.releaseDate = patch.year ? `${patch.year}-01-01` : null;
        next.album = { ...(next.album || SERVER_UPLOADS_ALBUM), releaseDate: next.releaseDate };
    }
    if (Object.hasOwn(patch, 'artworkUrl')) {
        if (patch.artworkUrl) {
            next.artworkUrl = patch.artworkUrl;
            next.cover = patch.artworkUrl;
            next.album = { ...(next.album || SERVER_UPLOADS_ALBUM), cover: patch.artworkUrl };
        } else {
            delete next.artworkUrl;
            delete next.cover;
            next.album = { ...(next.album || SERVER_UPLOADS_ALBUM), cover: SERVER_UPLOADS_ALBUM.cover };
        }
    }
    if (Object.hasOwn(patch, 'tags')) {
        next.tags = patch.tags;
        next.mediaMetadata = { ...(next.mediaMetadata || {}), tags: patch.tags };
    }

    const updatedAt = new Date().toISOString();
    next.updatedAt = updatedAt;
    next.sharedMetadata = {
        ...(next.sharedMetadata || {}),
        updatedAt,
        updatedByUserHash: getUserHash(userId),
    };
    return next;
}

function makeTrackKey(uploadId) {
    return `v1:${SOURCE_KIND}:none:${encodeURIComponent(uploadId)}`;
}

function tokenIndexName(token) {
    return `${hashValue(token, 64)}.json`;
}

function artworkExtension(mimeType) {
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    return '.jpg';
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

    function trackArtworkPath(trackId, mimeType) {
        return safeJoin(layout.artwork, ...shardId(trackId), `${trackId}${artworkExtension(mimeType)}`);
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

    async function userCanAccessTrack(userId, trackId) {
        return (await readUserTrackIds(userId)).includes(trackId);
    }

    async function searchTracks(userId, options = {}) {
        const normalizedQuery = normalizeSearchText(options.query);
        const requestedLimit = Number(options.limit || 50);
        const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 200)) : 50;
        const tracks = await listTracks(userId);

        if (!normalizedQuery) {
            return tracks.slice(0, limit);
        }

        return tracks
            .filter((track) => getTrackSearchText(track).includes(normalizedQuery))
            .slice(0, limit);
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
        const extracted = await extractAudioMetadata({ content, filename }).catch(() => null);
        const artistName = extracted?.artist || UNKNOWN_ARTIST;
        const albumTitle = extracted?.album || SERVER_UPLOADS_ALBUM.title;
        const tags = Array.isArray(extracted?.tags) ? extracted.tags : [];
        let artwork = null;
        if (extracted?.artwork?.data?.length) {
            const artworkPath = trackArtworkPath(uploadId, extracted.artwork.mimeType);
            await mkdir(dirname(artworkPath), { recursive: true });
            await writeFile(artworkPath, extracted.artwork.data);
            artwork = {
                path: relative(layout.root, artworkPath).split(sep).join('/'),
                mimeType: extracted.artwork.mimeType,
                size: extracted.artwork.data.length,
            };
        }

        const track = {
            id: uploadId,
            trackKey: makeTrackKey(uploadId),
            source: { kind: SOURCE_KIND, sourceId: uploadId },
            type: 'track',
            title: extracted?.title || normalizeTitle(filename),
            duration: extracted?.duration || null,
            artist: { name: artistName },
            artists: [{ name: artistName }],
            album: {
                ...SERVER_UPLOADS_ALBUM,
                title: albumTitle,
                releaseDate: extracted?.year ? `${extracted.year}-01-01` : null,
            },
            year: extracted?.year || null,
            releaseDate: extracted?.year ? `${extracted.year}-01-01` : null,
            tags,
            mediaMetadata: { tags },
            artwork,
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

    async function updateTrackMetadata(userId, trackId, patch) {
        if (!(await userCanAccessTrack(userId, trackId))) {
            return null;
        }

        const track = await readTrack(trackId);
        if (!track) {
            return null;
        }

        const nextTrack = applySharedMetadata(track, normalizeMetadataPatch(patch || {}), userId);
        await writeJsonAtomic(trackMetadataPath(trackId), nextTrack);
        return nextTrack;
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

    async function getArtworkInfo(uploadId, token) {
        const match = await findTrackByStreamToken(uploadId, token);
        if (!match?.track?.artwork?.path) return null;
        const filePath = safeJoin(layout.root, match.track.artwork.path);
        return {
            track: match.track,
            filePath,
            stat: await stat(filePath),
            createReadStream: (options) => createReadStream(filePath, options),
        };
    }

    return {
        layout,
        ensure: () => ensureStorageLayout(layout),
        listTracks,
        searchTracks,
        saveUpload,
        updateTrackMetadata,
        getStreamInfo,
        getArtworkInfo,
    };
}
