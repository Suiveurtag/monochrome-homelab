import { describe, expect, test, vi } from 'vitest';
import { pairSelfHostedUploadFiles, uploadSelfHostedFilesBatch } from './selfhost-upload-batch.js';

describe('uploadSelfHostedFilesBatch', () => {
    test('pairs TTML sidecars with FLACs, including numbered audio filenames', () => {
        const audio = new File(['audio'], '13 - Tame Impala - New Person.flac', { type: 'audio/flac' });
        const lyrics = new File(['<tt/>'], 'Tame Impala - New Person.ttml', { type: 'application/ttml+xml' });

        expect(pairSelfHostedUploadFiles([audio, lyrics])).toEqual([{ audio, lyrics }]);
    });

    test('stores matching TTML content in uploaded metadata', async () => {
        const audio = new File(['audio'], 'Song.flac', { type: 'audio/flac' });
        const lyrics = new File(['<tt><body /></tt>'], 'Song.ttml', { type: 'application/ttml+xml' });
        const uploadTrack = vi.fn(async () => ({}));

        const result = await uploadSelfHostedFilesBatch([audio, lyrics], {
            authUser: { id: 'user1' },
            readTrackMetadata: vi.fn(async () => ({ title: 'Song' })),
            uploadTrack,
        });

        expect(uploadTrack.mock.calls[0][0].lyrics).toBe('<tt><body /></tt>');
        expect(result.finalMessage).toBe('1 FLAC file uploaded with 1 TTML file.');
    });

    test('requires authentication before uploading', async () => {
        const notify = vi.fn();
        const readTrackMetadata = vi.fn();
        const uploadTrack = vi.fn();
        const files = [new File(['a'], 'song.flac', { type: 'audio/flac' })];

        const result = await uploadSelfHostedFilesBatch(files, {
            authUser: null,
            readTrackMetadata,
            uploadTrack,
            notify,
        });

        expect(result).toMatchObject({ authRequired: true, successCount: 0, failureCount: 0 });
        expect(readTrackMetadata).not.toHaveBeenCalled();
        expect(uploadTrack).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Sign in before uploading music to the server.');
    });

    test('reports a success summary when all uploads succeed', async () => {
        const notify = vi.fn();
        const readTrackMetadata = vi.fn(async (file) => ({ title: file.name }));
        const uploadTrack = vi.fn(async () => ({}));
        const files = [
            new File(['a'], 'one.flac', { type: 'audio/flac' }),
            new File(['b'], 'two.flac', { type: 'audio/flac' }),
        ];

        const result = await uploadSelfHostedFilesBatch(files, {
            authUser: { id: 'user1' },
            readTrackMetadata,
            uploadTrack,
            notify,
        });

        expect(result).toMatchObject({ successCount: 2, failureCount: 0, finalMessage: '2 FLAC files uploaded.' });
        expect(uploadTrack).toHaveBeenCalledTimes(2);
        expect(notify).toHaveBeenCalledWith('Uploading one.flac…');
        expect(notify).toHaveBeenCalledWith('Uploading two.flac…');
    });

    test('does not claim success when every upload fails', async () => {
        const notify = vi.fn();
        const readTrackMetadata = vi.fn(async () => ({ title: 'Broken' }));
        const uploadTrack = vi.fn(async () => {
            throw new Error('PocketBase rejected audio');
        });
        const files = [new File(['a'], 'broken.flac', { type: 'audio/flac' })];

        const result = await uploadSelfHostedFilesBatch(files, {
            authUser: { id: 'user1' },
            readTrackMetadata,
            uploadTrack,
            notify,
        });

        expect(result).toMatchObject({
            successCount: 0,
            failureCount: 1,
            finalMessage: 'Upload failed. No FLAC files were imported (1 failed).',
        });
        expect(notify).toHaveBeenCalledWith('Upload failed for broken.flac: PocketBase rejected audio');
    });

    test('reports partial success accurately', async () => {
        const notify = vi.fn();
        const readTrackMetadata = vi.fn(async (file) => ({ title: file.name }));
        const uploadTrack = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('timeout'));
        const files = [
            new File(['a'], 'good.flac', { type: 'audio/flac' }),
            new File(['b'], 'bad.flac', { type: 'audio/flac' }),
        ];

        const result = await uploadSelfHostedFilesBatch(files, {
            authUser: { id: 'user1' },
            readTrackMetadata,
            uploadTrack,
            notify,
        });

        expect(result).toMatchObject({
            successCount: 1,
            failureCount: 1,
            finalMessage: '1 FLAC file uploaded, 1 failed.',
        });
        expect(notify).toHaveBeenCalledWith('Upload failed for bad.flac: timeout');
    });
});
