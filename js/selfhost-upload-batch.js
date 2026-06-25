export async function uploadSelfHostedFilesBatch(files, { authUser, readTrackMetadata, uploadTrack, notify = () => {} } = {}) {
    const uploadFiles = Array.isArray(files) ? files : [];
    if (uploadFiles.length === 0) {
        return { attemptedCount: 0, successCount: 0, failureCount: 0, authRequired: false, finalMessage: null };
    }

    if (!authUser) {
        notify('Sign in before uploading music to the server.');
        return { attemptedCount: uploadFiles.length, successCount: 0, failureCount: 0, authRequired: true, finalMessage: null };
    }

    let successCount = 0;
    let failureCount = 0;

    for (const file of uploadFiles) {
        try {
            notify(`Uploading ${file.name}…`);
            const metadata = await readTrackMetadata(file, { filename: file.name });
            await uploadTrack(metadata, file);
            successCount += 1;
        } catch (error) {
            failureCount += 1;
            const message = error instanceof Error ? error.message : String(error || 'Unknown upload error');
            notify(`Upload failed for ${file.name}: ${message}`);
        }
    }

    let finalMessage = null;
    if (successCount > 0 && failureCount === 0) {
        finalMessage = `${successCount} FLAC file${successCount === 1 ? '' : 's'} uploaded.`;
    } else if (successCount > 0 && failureCount > 0) {
        finalMessage = `${successCount} FLAC file${successCount === 1 ? '' : 's'} uploaded, ${failureCount} failed.`;
    } else if (failureCount > 0) {
        finalMessage = `Upload failed. No FLAC files were imported (${failureCount} failed).`;
    }

    return {
        attemptedCount: uploadFiles.length,
        successCount,
        failureCount,
        authRequired: false,
        finalMessage,
    };
}
