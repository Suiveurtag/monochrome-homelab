function normalizedStem(filename) {
    return String(filename || '')
        .replace(/\.[^/.]+$/, '')
        .replace(/^\s*\d+\s*[-_.]\s*/, '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/gi, '')
        .toLowerCase();
}

function normalizedStemTokenKey(filename) {
    const stem = String(filename || '')
        .replace(/\.[^/.]+$/, '')
        .replace(/^\s*\d+\s*[-_.]\s*/, '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    return [...new Set(stem.match(/[a-z0-9]+/g) || [])].sort().join('');
}

const AUDIO_EXTENSIONS = new Set(['flac', 'mp3', 'm4a', 'mp4', 'aac', 'ogg', 'oga', 'opus', 'wav', 'wave']);
const LYRIC_EXTENSIONS = new Set(['lrc', 'irc', 'ttml', 'txt']);

function extension(file) {
    return (
        String(file?.name || '')
            .split('.')
            .pop()
            ?.toLowerCase() || ''
    );
}

function isAudio(file) {
    return Boolean(
        file &&
        (String(file.type || '')
            .toLowerCase()
            .startsWith('audio/') ||
            AUDIO_EXTENSIONS.has(extension(file)))
    );
}

function isLyrics(file) {
    return Boolean(file && LYRIC_EXTENSIONS.has(extension(file)));
}

async function getMetadataCoverFile(metadata, audioFile) {
    const coverUrl = metadata?.album?.cover;
    if (typeof coverUrl !== 'string' || !coverUrl.startsWith('blob:')) return null;

    const response = await fetch(coverUrl);
    if (!response.ok) throw new Error('Could not read the embedded cover image.');

    const blob = await response.blob();
    if (!blob.size) return null;

    const mimeType = blob.type.toLowerCase() === 'image/jpg' ? 'image/jpeg' : blob.type.toLowerCase();
    const extensionByMimeType = {
        'image/avif': 'avif',
        'image/gif': 'gif',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    const coverExtension = extensionByMimeType[mimeType];
    if (!coverExtension) throw new Error(`Unsupported embedded cover format: ${mimeType || 'unknown'}.`);

    const basename = String(audioFile?.name || 'cover').replace(/\.[^/.]+$/, '') || 'cover';
    return new File([blob], `${basename}-cover.${coverExtension}`, { type: mimeType });
}

export function isSupportedSelfHostedUploadFile(file) {
    return isAudio(file) || isLyrics(file);
}

export function pairSelfHostedUploadFiles(files) {
    const selectedFiles = Array.isArray(files) ? files : [];
    const lyricFiles = selectedFiles.filter(isLyrics);
    const lyricsByStem = new Map(lyricFiles.map((file) => [normalizedStem(file.name), file]));
    const lyricsByTokenKey = new Map();
    lyricFiles.forEach((file) => {
        const key = normalizedStemTokenKey(file.name);
        const matches = lyricsByTokenKey.get(key) || [];
        matches.push(file);
        lyricsByTokenKey.set(key, matches);
    });

    return selectedFiles.filter(isAudio).map((audio) => {
        const tokenMatches = lyricsByTokenKey.get(normalizedStemTokenKey(audio.name)) || [];
        return {
            audio,
            lyrics:
                lyricsByStem.get(normalizedStem(audio.name)) || (tokenMatches.length === 1 ? tokenMatches[0] : null),
        };
    });
}

export async function uploadSelfHostedFilesBatch(
    files,
    { authUser, allowUnauthenticated = false, readTrackMetadata, uploadTrack, notify = () => {} } = {}
) {
    const selectedFiles = Array.isArray(files) ? files : [];
    const uploadPairs = pairSelfHostedUploadFiles(selectedFiles);
    if (selectedFiles.length === 0) {
        return { attemptedCount: 0, successCount: 0, failureCount: 0, authRequired: false, finalMessage: null };
    }

    if (uploadPairs.length === 0) {
        notify('Choose at least one supported music file. LRC, IRC, TTML and TXT files attach by matching name.');
        return { attemptedCount: 0, successCount: 0, failureCount: 0, authRequired: false, finalMessage: null };
    }

    if (!authUser && !allowUnauthenticated) {
        notify('Sign in before uploading music to the server.');
        return {
            attemptedCount: uploadPairs.length,
            successCount: 0,
            failureCount: 0,
            authRequired: true,
            finalMessage: null,
        };
    }

    let successCount = 0;
    let failureCount = 0;

    let lyricsCount = 0;
    for (const { audio: file, lyrics } of uploadPairs) {
        try {
            notify(`Uploading ${file.name}…`);
            const metadata = await readTrackMetadata(file, { filename: file.name, siblings: selectedFiles });
            const coverUrl = metadata?.album?.cover;
            try {
                if (lyrics) {
                    metadata.lyrics = await lyrics.text();
                    if (/\.(?:lrc|irc|txt)$/i.test(lyrics.name)) {
                        const { lyricsToTtml } = await import('./lyrics-format.js');
                        metadata.lyrics = lyricsToTtml(metadata.lyrics, metadata.duration);
                    }
                    lyricsCount += 1;
                }

                const coverFile = await getMetadataCoverFile(metadata, file);
                await uploadTrack(metadata, file, coverFile);
                successCount += 1;
            } finally {
                if (typeof coverUrl === 'string' && coverUrl.startsWith('blob:')) URL.revokeObjectURL(coverUrl);
            }
        } catch (error) {
            failureCount += 1;
            const message = error instanceof Error ? error.message : String(error || 'Unknown upload error');
            notify(`Upload failed for ${file.name}: ${message}`);
        }
    }

    let finalMessage = null;
    if (successCount > 0 && failureCount === 0) {
        finalMessage = `${successCount} music file${successCount === 1 ? '' : 's'} uploaded${lyricsCount ? ` with ${lyricsCount} lyrics file${lyricsCount === 1 ? '' : 's'}` : ''}.`;
    } else if (successCount > 0 && failureCount > 0) {
        finalMessage = `${successCount} music file${successCount === 1 ? '' : 's'} uploaded, ${failureCount} failed.`;
    } else if (failureCount > 0) {
        finalMessage = `Upload failed. No music files were imported (${failureCount} failed).`;
    }

    return {
        attemptedCount: uploadPairs.length,
        successCount,
        failureCount,
        authRequired: false,
        finalMessage,
    };
}
