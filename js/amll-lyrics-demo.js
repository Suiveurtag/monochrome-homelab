import { LyricPlayer } from '@applemusic-like-lyrics/core';
import { parseTTML } from '@applemusic-like-lyrics/lyric';
import '@applemusic-like-lyrics/core/style.css';

const audio = document.querySelector('#audio');
const playerHost = document.querySelector('#lyric-player');
const status = document.querySelector('#status');
const shell = document.querySelector('.demo-shell');
const player = new LyricPlayer();

playerHost.appendChild(player.getElement());

let audioUrl = '';
let coverUrl = '';
let frameId = 0;

function setStatus(message) {
    status.textContent = message;
}

function setObjectUrl(kind, file) {
    const previousUrl = kind === 'audio' ? audioUrl : coverUrl;
    if (previousUrl) URL.revokeObjectURL(previousUrl);

    const nextUrl = URL.createObjectURL(file);
    if (kind === 'audio') {
        audioUrl = nextUrl;
        audio.src = nextUrl;
    } else {
        coverUrl = nextUrl;
        shell.style.setProperty('--cover-url', `url("${nextUrl}")`);
    }
}

async function loadLyrics(file) {
    const ttml = await file.text();
    const result = parseTTML(addMissingLineKeys(ttml));
    player.setLyricLines(result.lines, Math.round(audio.currentTime * 1000));
    player.setCurrentTime(Math.round(audio.currentTime * 1000), true);
    setStatus(`${result.lines.length} lignes AMLL chargées · prêt à écouter`);
}

function addMissingLineKeys(ttml) {
    const document = new DOMParser().parseFromString(ttml, 'application/xml');
    const parserError = document.querySelector('parsererror');
    if (parserError) throw new Error('TTML XML invalide');

    const lineNodes = Array.from(document.getElementsByTagNameNS('http://www.w3.org/ns/ttml', 'p'));
    lineNodes.forEach((line, index) => {
        if (!line.hasAttributeNS('http://music.apple.com/lyric-ttml-internal', 'key')) {
            line.setAttributeNS('http://music.apple.com/lyric-ttml-internal', 'itunes:key', `line-${index + 1}`);
        }
    });

    return new XMLSerializer().serializeToString(document);
}

document.querySelector('#audio-file').addEventListener('change', (event) => {
    const [file] = event.target.files;
    if (!file) return;
    setObjectUrl('audio', file);
    setStatus(`Audio chargé : ${file.name}`);
});

document.querySelector('#cover-file').addEventListener('change', (event) => {
    const [file] = event.target.files;
    if (!file) return;
    setObjectUrl('cover', file);
});

document.querySelector('#lyrics-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
        await loadLyrics(file);
    } catch (error) {
        setStatus('Impossible de parser ce fichier TTML.');
        console.error(error);
    }
});

function onFrame() {
    if (!audio.paused) player.setCurrentTime(Math.round(audio.currentTime * 1000));
    player.update(16);
    frameId = requestAnimationFrame(onFrame);
}

audio.addEventListener('play', () => player.resume());
audio.addEventListener('pause', () => player.pause());
audio.addEventListener('ended', () => player.pause());
audio.addEventListener('seeked', () => {
    player.setCurrentTime(Math.round(audio.currentTime * 1000), true);
});

frameId = requestAnimationFrame(onFrame);

window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frameId);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (coverUrl) URL.revokeObjectURL(coverUrl);
});
