import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFilesystemLibraryStorage, getUserHash } from './filesystem-library.mjs';

const tempRoot = await mkdtemp(join(tmpdir(), 'monochrome-storage-'));
after(() => rm(tempRoot, { recursive: true, force: true }));

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
});
