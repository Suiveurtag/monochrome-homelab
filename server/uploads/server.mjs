import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFilesystemLibraryStorage } from '../storage/filesystem-library.mjs';

const PORT = Number(process.env.MONOCHROME_UPLOAD_PORT || 8789);
const STORAGE_ROOT = process.env.MONOCHROME_UPLOAD_STORAGE || join(process.cwd(), '.storage', 'server-uploads');
const MAX_UPLOAD_BYTES = Number(process.env.MONOCHROME_UPLOAD_MAX_BYTES || 250 * 1024 * 1024);
const ALLOWED_EXTENSIONS = new Set(['.flac', '.mp3', '.m4a', '.mp4', '.wav', '.ogg', '.opus', '.aac']);

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
    });
    res.end(body);
}

function setCors(req, res) {
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) {
        res.setHeader('access-control-allow-origin', origin);
    } else {
        res.setHeader('access-control-allow-origin', '*');
    }
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-methods', 'GET,HEAD,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type,x-monochrome-user-id,x-monochrome-user-email');
}

function getRequestUser(req) {
    const userId = req.headers['x-monochrome-user-id'];
    return Array.isArray(userId) ? userId[0] : userId;
}

function getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    return `${proto}://${req.headers.host}`;
}

function publicTrack(req, track) {
    const audioUrl = `${getBaseUrl(req)}/uploads/${encodeURIComponent(track.id)}/stream?token=${encodeURIComponent(track.streamToken)}`;
    return {
        id: track.id,
        trackKey: track.trackKey,
        source: track.source,
        type: 'track',
        title: track.title,
        duration: track.duration,
        artist: track.artist,
        artists: track.artists,
        album: track.album,
        mimeType: track.mimeType,
        size: track.size,
        createdAt: track.createdAt,
        audioUrl,
        remoteUrl: audioUrl,
        playback: { mode: 'remote-url', url: audioUrl, mimeType: track.mimeType },
    };
}

async function readBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        total += chunk.length;
        if (total > MAX_UPLOAD_BYTES) {
            const error = new Error('Upload too large');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function parseMultipart(req, body) {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) {
        const error = new Error('Missing multipart boundary');
        error.statusCode = 400;
        throw error;
    }

    const boundary = Buffer.from(`--${match[1] || match[2]}`);
    const parts = [];
    let cursor = body.indexOf(boundary);

    while (cursor !== -1) {
        cursor += boundary.length;
        if (body[cursor] === 45 && body[cursor + 1] === 45) break;
        if (body[cursor] === 13 && body[cursor + 1] === 10) cursor += 2;

        const nextBoundary = body.indexOf(boundary, cursor);
        if (nextBoundary === -1) break;

        let part = body.subarray(cursor, nextBoundary);
        if (part.at(-2) === 13 && part.at(-1) === 10) {
            part = part.subarray(0, -2);
        }

        const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
        if (headerEnd !== -1) {
            const headersText = part.subarray(0, headerEnd).toString('utf8');
            const content = part.subarray(headerEnd + 4);
            const disposition = headersText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || '';
            const type = headersText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream';
            const name = disposition.match(/name="([^"]+)"/i)?.[1] || '';
            const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || '';
            parts.push({ name, filename, type, content });
        }

        cursor = nextBoundary;
    }

    return parts;
}

function assertAudioFile(file) {
    const extension = extname(file.filename).toLowerCase();
    if (!file.type.startsWith('audio/') && !ALLOWED_EXTENSIONS.has(extension)) {
        const error = new Error('Only audio files are accepted');
        error.statusCode = 415;
        throw error;
    }
}

async function handleList(req, res, storage, userId) {
    await storage.ensure();
    const tracks = await storage.listTracks(userId);
    sendJson(res, 200, { tracks: tracks.map((track) => publicTrack(req, track)) });
}

async function handleUpload(req, res, storage, userId) {
    const body = await readBody(req);
    const file = parseMultipart(req, body).find((part) => part.filename && part.content.length > 0);
    if (!file) {
        sendJson(res, 400, { error: 'Missing audio file' });
        return;
    }

    assertAudioFile(file);

    await storage.ensure();
    const track = await storage.saveUpload({
        userId,
        filename: file.filename,
        mimeType: file.type,
        content: file.content,
    });

    sendJson(res, 201, { track: publicTrack(req, track) });
}

async function handleStream(req, res, storage, uploadId, token) {
    if (!token) {
        sendJson(res, 401, { error: 'Missing stream token' });
        return;
    }

    await storage.ensure();
    const stream = await storage.getStreamInfo(uploadId, token);
    if (!stream) {
        sendJson(res, 404, { error: 'Upload not found' });
        return;
    }

    const range = req.headers.range;
    const headers = {
        'accept-ranges': 'bytes',
        'content-type': stream.track.mimeType || 'application/octet-stream',
        'cache-control': 'private, max-age=3600',
    };

    if (range) {
        const rangeMatch = range.match(/bytes=(\d*)-(\d*)/);
        const start = rangeMatch?.[1] ? Number(rangeMatch[1]) : 0;
        const end = rangeMatch?.[2] ? Number(rangeMatch[2]) : stream.stat.size - 1;
        if (start >= stream.stat.size || end >= stream.stat.size || start > end) {
            res.writeHead(416, { ...headers, 'content-range': `bytes */${stream.stat.size}` });
            res.end();
            return;
        }
        res.writeHead(206, {
            ...headers,
            'content-range': `bytes ${start}-${end}/${stream.stat.size}`,
            'content-length': end - start + 1,
        });
        if (req.method !== 'HEAD') stream.createReadStream({ start, end }).pipe(res);
        else res.end();
        return;
    }

    res.writeHead(200, { ...headers, 'content-length': stream.stat.size });
    if (req.method !== 'HEAD') stream.createReadStream().pipe(res);
    else res.end();
}

async function route(req, res, storage) {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/health') {
        sendJson(res, 200, { ok: true, storageRoot: storage.layout.root });
        return;
    }

    const streamMatch = url.pathname.match(/^\/uploads\/([^/]+)\/stream$/);
    if (streamMatch && (req.method === 'GET' || req.method === 'HEAD')) {
        await handleStream(req, res, storage, decodeURIComponent(streamMatch[1]), url.searchParams.get('token'));
        return;
    }

    if (url.pathname === '/uploads' && req.method === 'GET') {
        const userId = getRequestUser(req);
        if (!userId) {
            sendJson(res, 401, { error: 'Missing x-monochrome-user-id header' });
            return;
        }
        await handleList(req, res, storage, userId);
        return;
    }

    if (url.pathname === '/uploads' && req.method === 'POST') {
        const userId = getRequestUser(req);
        if (!userId) {
            sendJson(res, 401, { error: 'Missing x-monochrome-user-id header' });
            return;
        }
        await handleUpload(req, res, storage, userId);
        return;
    }

    sendJson(res, 404, { error: 'Not found' });
}

export function createUploadServer(options = {}) {
    const storage = options.storage || createFilesystemLibraryStorage({ root: options.storageRoot || STORAGE_ROOT });
    return createServer((req, res) => {
        route(req, res, storage).catch((error) => {
            console.error(error);
            sendJson(res, error.statusCode || 500, { error: error.message || 'Upload server error' });
        });
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    createUploadServer().listen(PORT, () => {
        console.log(`Monochrome local upload server listening on http://localhost:${PORT}`);
        console.log(`Storage root: ${STORAGE_ROOT}`);
    });
}
