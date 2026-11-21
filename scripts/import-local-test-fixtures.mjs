#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { File } from 'node:buffer';

const baseURL = (process.env.PB_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const host = new URL(baseURL).hostname;
if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) {
    throw new Error('This fixture importer only accepts a PocketBase URL on this machine.');
}
const fixturesRoot = path.resolve(process.argv[2] || '../Documents/GitHub/monochrome-homelab/test-fixtures/music');
const identity = process.env.PB_SUPERUSER_EMAIL || process.env.PB_ADMIN_EMAIL || 'admin@example.com';
const password = process.env.PB_SUPERUSER_PASSWORD || process.env.PB_ADMIN_PASSWORD || 'changeme';
const concurrency = Math.max(1, Math.min(6, Number(process.env.IMPORT_CONCURRENCY || 3)));

async function requestJSON(url, options = {}) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = body?.message || body?.data?.audio?.message || body?.data?.owner?.message || response.statusText;
        throw new Error(`${response.status} ${message}`);
    }
    return body;
}

function keyFor(track) {
    return `${track.deezer_track_id}:${track.source_album_id}`;
}

function extensionMime(filePath) {
    switch (path.extname(filePath).toLowerCase()) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        default:
            return 'application/octet-stream';
    }
}

async function* batches(items, size) {
    for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

const manifest = JSON.parse(await readFile(path.join(fixturesRoot, 'manifest.json'), 'utf8'));
const auth = await requestJSON(`${baseURL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, password }),
});
const token = auth.token;
if (!token) throw new Error('PocketBase authentication returned no token.');
const headers = { Authorization: `Bearer ${token}` };

const existing = await requestJSON(
    `${baseURL}/api/collections/music_tracks/records?perPage=500&filter=${encodeURIComponent("source_provider='monochrome-fixture'")}`,
    { headers }
);
const importedKeys = new Set(
    (existing.items || [])
        .map((record) => record.audio_info?.fixture_key)
        .filter(Boolean)
);
const pending = manifest.tracks.filter((track) => !importedKeys.has(keyFor(track)));
let completed = 0;
let failed = 0;

console.log(`PocketBase: ${baseURL}; ${pending.length} fixture tracks to upload (${manifest.tracks.length - pending.length} already present).`);

for await (const batch of batches(pending, concurrency)) {
    const results = await Promise.allSettled(batch.map(async (track) => {
        const audioPath = path.join(fixturesRoot, track.audio);
        const audio = await readFile(audioPath);
        const form = new FormData();
        const fields = {
            owner: '',
            title: track.title,
            artist: track.artist,
            album: track.album || '',
            album_artist: track.album_artist || track.artist,
            release_date: track.release_date || '',
            duration: String(track.duration_seconds || 0),
            track_number: String(track.track_number || ''),
            disc_number: String(track.disc_number || ''),
            total_tracks: '',
            total_discs: '',
            explicit: String(Boolean(track.explicit_lyrics)),
            spotify_id: '',
            spotify_url: '',
            isrc: track.isrc || '',
            upc: '',
            composer: '',
            publisher: '',
            copyright: '',
            source_provider: 'monochrome-fixture',
            audio_codec: 'MP3',
            audio_bitrate: '24',
            audio_quality: 'SILENT TEST FIXTURE',
            lyrics: await readFile(path.join(fixturesRoot, track.lyrics_ttml), 'utf8'),
            audio_info: JSON.stringify({
                fixture_key: keyFor(track),
                source: 'Deezer public API',
                source_track_id: track.deezer_track_id,
                source_album_id: track.source_album_id,
                generated_silence: true,
            }),
        };
        for (const [field, value] of Object.entries(fields)) form.set(field, value);
        form.set('audio', new File([audio], path.basename(audioPath), { type: 'audio/mpeg' }));
        if (track.artwork) {
            const coverPath = path.join(fixturesRoot, track.artwork);
            const cover = await readFile(coverPath);
            form.set('cover', new File([cover], path.basename(coverPath), { type: extensionMime(coverPath) }));
        }
        const result = await requestJSON(`${baseURL}/api/collections/music_tracks/records`, {
            method: 'POST',
            headers,
            body: form,
        });
        return result.id;
    }));
    for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') completed += 1;
        else {
            failed += 1;
            console.error(`Failed: ${batch[index].artist} — ${batch[index].title}: ${result.reason?.message || result.reason}`);
        }
    }
    console.log(`Progress: ${completed + failed}/${pending.length} processed (${completed} uploaded, ${failed} failed).`);
}

console.log(`Finished: ${completed} uploaded, ${failed} failed, ${manifest.tracks.length - pending.length} already present.`);
if (failed) process.exitCode = 1;
