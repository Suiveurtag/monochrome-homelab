import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFilesystemLibraryStorage, getUserHash } from './filesystem-library.mjs';

const tempRoot = await mkdtemp(join(tmpdir(), 'monochrome-storage-'));
after(() => rm(tempRoot, { recursive: true, force: true }));

function wavChunk(id, data) {
    const chunk = Buffer.alloc(8 + data.length + (data.length % 2));
    chunk.write(id, 0, 'ascii');
    chunk.writeUInt32LE(data.length, 4);
    data.copy(chunk, 8);
    return chunk;
}

function wavInfoTag(id, value) {
    return wavChunk(id, Buffer.from(`${value}\0`, 'ascii'));
}

function createTaggedWav({
    title = 'Tagged Title',
    artist = 'Tagged Artist',
    album = 'Tagged Album',
    year = '2026',
} = {}) {
    const format = Buffer.alloc(16);
    format.writeUInt16LE(1, 0);
    format.writeUInt16LE(1, 2);
    format.writeUInt32LE(8000, 4);
    format.writeUInt32LE(16000, 8);
    format.writeUInt16LE(2, 12);
    format.writeUInt16LE(16, 14);

    const audio = Buffer.alloc(1600);
    const info = Buffer.concat([
        Buffer.from('INFO', 'ascii'),
        wavInfoTag('INAM', title),
        wavInfoTag('IART', artist),
        wavInfoTag('IPRD', album),
        wavInfoTag('ICRD', year),
        wavInfoTag('IGNR', 'Test Genre'),
    ]);
    const body = Buffer.concat([
        Buffer.from('WAVE', 'ascii'),
        wavChunk('fmt ', format),
        wavChunk('data', audio),
        wavChunk('LIST', info),
    ]);
    const riff = Buffer.alloc(8 + body.length);
    riff.write('RIFF', 0, 'ascii');
    riff.writeUInt32LE(body.length, 4);
    body.copy(riff, 8);
    return riff;
}

describe('filesystem library storage', () => {
    it('stores uploads in structured deterministic paths and lists them by user', async () => {
        const storage = createFilesystemLibraryStorage({ root: tempRoot });
        await storage.ensure();

        const track = await storage.saveUpload({
            userId: 'user-1',
            filename: '../unsafe name.flac',
            mimeType: 'audio/flac',
            content: Buffer.from('audio-bytes'),
        });

        assert.equal(track.source.kind, 'server-local');
        assert.equal(track.trackKey, `v1:server-local:none:${track.id}`);
        assert.equal(track.storageVersion, 2);
        assert.match(track.storage.blobPath, /^audio\/[a-f0-9]{2}\/[a-f0-9]{2}\//);
        assert.ok(!track.storage.blobPath.includes('unsafe name'));

        const listed = await storage.listTracks('user-1');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].id, track.id);

        const stream = await storage.getStreamInfo(track.id, track.streamToken);
        assert.equal(stream.stat.size, 11);
        assert.equal(await readFile(stream.filePath, 'utf8'), 'audio-bytes');
    });

    it('keeps legacy manifest uploads listable and streamable', async () => {
        const storage = createFilesystemLibraryStorage({ root: tempRoot });
        const userHash = getUserHash('legacy-user');
        const legacyDir = join(tempRoot, userHash);
        const legacyTrack = {
            id: 'legacy-track',
            title: 'Legacy Track',
            mimeType: 'audio/wav',
            storedFileName: 'legacy-track.wav',
            streamToken: 'legacy-token',
        };

        await mkdir(legacyDir, { recursive: true });
        await writeFile(join(legacyDir, 'legacy-track.wav'), 'legacy-audio');
        await writeFile(join(legacyDir, 'manifest.json'), JSON.stringify({ tracks: [legacyTrack] }));

        const listed = await storage.listTracks('legacy-user');
        assert.equal(listed.some((track) => track.id === legacyTrack.id), true);

        const stream = await storage.getStreamInfo('legacy-track', 'legacy-token');
        assert.equal(stream.stat.size, 12);
    });

    it('searches uploads by normalized title, artist, album, filename, and tags with a bounded limit', async () => {
        const storage = createFilesystemLibraryStorage({ root: tempRoot });
        await storage.ensure();

        const firstTrack = await storage.saveUpload({
            userId: 'search-user',
            filename: 'Cafe_Night.wav',
            mimeType: 'audio/wav',
            content: Buffer.from('first-audio'),
        });
        const secondTrack = await storage.saveUpload({
            userId: 'search-user',
            filename: 'Morning_Piano.wav',
            mimeType: 'audio/wav',
            content: Buffer.from('second-audio'),
        });

        await writeFile(
            join(tempRoot, firstTrack.storage.metadataPath),
            JSON.stringify({
                ...firstTrack,
                title: 'Cafe Night',
                artist: { name: 'Anais Belle' },
                artists: [{ name: 'Anais Belle' }],
                album: { title: 'Blue Rooms', cover: '/assets/appicon.png' },
                mediaMetadata: { tags: ['late-night', 'jazz'] },
            }),
        );
        await writeFile(
            join(tempRoot, secondTrack.storage.metadataPath),
            JSON.stringify({
                ...secondTrack,
                title: 'Morning Piano',
                artist: { name: 'Lina' },
                artists: [{ name: 'Lina' }],
                album: { title: 'Window Light', cover: '/assets/appicon.png' },
                tags: ['focus'],
            }),
        );

        assert.deepEqual((await storage.searchTracks('search-user', { query: 'anais' })).map((track) => track.id), [
            firstTrack.id,
        ]);
        assert.deepEqual((await storage.searchTracks('search-user', { query: 'blue rooms' })).map((track) => track.id), [
            firstTrack.id,
        ]);
        assert.deepEqual((await storage.searchTracks('search-user', { query: 'late night' })).map((track) => track.id), [
            firstTrack.id,
        ]);
        assert.deepEqual((await storage.searchTracks('search-user', { query: 'café' })).map((track) => track.id), [
            firstTrack.id,
        ]);
        assert.equal((await storage.searchTracks('search-user', { query: 'wav', limit: 1 })).length, 1);
        assert.equal((await storage.searchTracks('other-user', { query: 'anais' })).length, 0);
    });

    it('updates shared metadata for tracks in the requesting user library', async () => {
        const storage = createFilesystemLibraryStorage({ root: tempRoot });
        await storage.ensure();

        const track = await storage.saveUpload({
            userId: 'metadata-user',
            filename: 'Raw_Title.wav',
            mimeType: 'audio/wav',
            content: Buffer.from('metadata-audio'),
        });

        const updated = await storage.updateTrackMetadata('metadata-user', track.id, {
            title: 'Shared Title',
            artist: 'Shared Artist',
            album: 'Shared Album',
            year: '2026',
            artworkUrl: 'https://example.test/cover.jpg',
            tags: ['demo', 'demo', 'self-hosted'],
        });

        assert.equal(updated.title, 'Shared Title');
        assert.equal(updated.artist.name, 'Shared Artist');
        assert.deepEqual(updated.artists, [{ name: 'Shared Artist' }]);
        assert.equal(updated.album.title, 'Shared Album');
        assert.equal(updated.album.cover, 'https://example.test/cover.jpg');
        assert.equal(updated.year, 2026);
        assert.deepEqual(updated.tags, ['demo', 'self-hosted']);
        assert.equal(typeof updated.sharedMetadata.updatedAt, 'string');

        const listed = await storage.listTracks('metadata-user');
        assert.equal(listed[0].title, 'Shared Title');
        assert.equal((await storage.searchTracks('metadata-user', { query: 'self hosted' }))[0].id, track.id);
        assert.equal(await storage.updateTrackMetadata('other-user', track.id, { title: 'Nope' }), null);
    });

    it('uses embedded audio metadata as upload defaults before manual edits', async () => {
        const storage = createFilesystemLibraryStorage({ root: tempRoot });
        await storage.ensure();

        const track = await storage.saveUpload({
            userId: 'tagged-user',
            filename: 'fallback-name.wav',
            mimeType: 'audio/wav',
            content: createTaggedWav(),
        });

        assert.equal(track.title, 'Tagged Title');
        assert.equal(track.artist.name, 'Tagged Artist');
        assert.equal(track.album.title, 'Tagged Album');
        assert.equal(track.year, 2026);
        assert.equal(track.duration, 0.1);
        assert.deepEqual(track.tags, ['Test Genre']);

        const updated = await storage.updateTrackMetadata('tagged-user', track.id, { title: 'Manual Title' });
        assert.equal(updated.title, 'Manual Title');
    });
});
