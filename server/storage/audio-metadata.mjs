import { FileRef } from '@dantheman827/taglib-ts/fileRef.js';
import { readTags } from '@dantheman827/taglib-ts/simpleApi.js';

const MAX_ARTWORK_BYTES = 8 * 1024 * 1024;

function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeYear(value) {
    const year = Number(value || 0);
    return Number.isInteger(year) && year > 0 && year <= 9999 ? year : null;
}

function getPictureBytes(picture) {
    const data = picture?.get('data')?.toByteVector?.().data;
    return data && data.length > 0 && data.length <= MAX_ARTWORK_BYTES ? data : null;
}

function getPictureMimeType(picture, data) {
    const mimeType = cleanText(picture?.get('mimeType')?.toString?.());
    if (mimeType) return mimeType;
    if (data?.[0] === 0xff && data?.[1] === 0xd8) return 'image/jpeg';
    if (data?.[0] === 0x89 && data?.[1] === 0x50 && data?.[2] === 0x4e && data?.[3] === 0x47) return 'image/png';
    if (data?.[0] === 0x52 && data?.[1] === 0x49 && data?.[2] === 0x46 && data?.[3] === 0x46) return 'image/webp';
    return 'application/octet-stream';
}

async function extractArtwork(data, filename) {
    try {
        const ref = await FileRef.fromByteArray(data, filename, false);
        if (!ref?.isValid) return null;

        const pictures = ref.complexProperties('PICTURE');
        const picture =
            pictures.find((candidate) => Number(candidate.get('pictureType')?.toInt?.()) === 3) || pictures[0];
        const bytes = getPictureBytes(picture);
        if (!bytes) return null;

        return {
            data: Buffer.from(bytes),
            mimeType: getPictureMimeType(picture, bytes),
        };
    } catch {
        return null;
    }
}

export async function extractAudioMetadata({ content, filename }) {
    const data = content instanceof Uint8Array ? content : new Uint8Array(content || []);
    const tags = await readTags({ data, filename }, true);
    const year = normalizeYear(tags.year);
    const durationSeconds = Number(tags.audioProperties?.lengthInSeconds || 0);
    const durationMilliseconds = Number(tags.audioProperties?.lengthInMilliseconds || 0);
    const duration = durationSeconds > 0 ? durationSeconds : durationMilliseconds / 1000;

    return {
        title: cleanText(tags.title),
        artist: cleanText(tags.artist),
        album: cleanText(tags.album),
        year,
        duration: Number.isFinite(duration) && duration > 0 ? duration : null,
        tags: cleanText(tags.genre) ? [cleanText(tags.genre)] : [],
        artwork: await extractArtwork(data, filename),
    };
}
