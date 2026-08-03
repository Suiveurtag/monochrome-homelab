function normalizedStem(filename) {
    return String(filename || '')
        .replace(/\.[^/.]+$/, '')
        .replace(/^\s*\d+\s*[-_.]\s*/, '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/gi, '')
        .toLowerCase();
}

function isFlac(file) {
    return file?.type === 'audio/flac' || file?.name?.toLowerCase().endsWith('.flac');
}

function isTtml(file) {
    return file?.name?.toLowerCase().endsWith('.ttml');
}

export function pairSelfHostedUploadFiles(files) {
    const selectedFiles = Array.isArray(files) ? files : [];
    const lyricsByStem = new Map(selectedFiles.filter(isTtml).map((file) => [normalizedStem(file.name), file]));
    return selectedFiles.filter(isFlac).map((audio) => ({
        audio,
        lyrics: lyricsByStem.get(normalizedStem(audio.name)) || null,
    }));
}

export async function uploadSelfHostedFilesBatch(files, { authUser, readTrackMetadata, uploadTrack, notify = () => {} } = {}) {
    const selectedFiles = Array.isArray(files) ? files : [];
    const uploadPairs = pairSelfHostedUploadFiles(selectedFiles);
    if (selectedFiles.length === 0) {
        return { attemptedCount: 0, successCount: 0, failureCount: 0, authRequired: false, finalMessage: null };
    }

    if (uploadPairs.length === 0) {
        notify('Choose at least one FLAC file. TTML files are attached to matching FLACs.');
        return { attemptedCount: 0, successCount: 0, failureCount: 0, authRequired: false, finalMessage: null };
    }

    if (!authUser) {
        notify('Sign in before uploading music to the server.');
        return { attemptedCount: uploadPairs.length, successCount: 0, failureCount: 0, authRequired: true, finalMessage: null };
    }

    let successCount = 0;
    let failureCount = 0;

    let lyricsCount = 0;
    for (const { audio: file, lyrics } of uploadPairs) {
        try {
            notify(`Uploading ${file.name}…`);
            const metadata = await readTrackMetadata(file, { filename: file.name, siblings: selectedFiles });
            if (lyrics) {
                metadata.lyrics = await lyrics.text();
                lyricsCount += 1;
            }
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
        finalMessage = `${successCount} FLAC file${successCount === 1 ? '' : 's'} uploaded${lyricsCount ? ` with ${lyricsCount} TTML file${lyricsCount === 1 ? '' : 's'}` : ''}.`;
    } else if (successCount > 0 && failureCount > 0) {
        finalMessage = `${successCount} FLAC file${successCount === 1 ? '' : 's'} uploaded, ${failureCount} failed.`;
    } else if (failureCount > 0) {
        finalMessage = `Upload failed. No FLAC files were imported (${failureCount} failed).`;
    }

    return {
        attemptedCount: uploadPairs.length,
        successCount,
        failureCount,
        authRequired: false,
        finalMessage,
    };
}
