import { db } from './db.js';
import { showNotification } from './downloads.js';
import { updateSelfHostedTrack } from './selfhost-server-api.js';
import { createModal, escapeHtml } from './utils.js';
import { EDIT_METADATA_ICON } from './metadata-editor-icon.js';
import { isTtml, parseLrc } from './lyrics-format.js';

function fileToDataUrl(file) {
    if (!file?.size) return Promise.resolve('');
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function value(form, name, fallback = '') {
    return String(form.get(name) ?? fallback).trim();
}

function artworkPicker(name, label, src, round = false) {
    return `
        <label class="metadata-artwork-picker${round ? ' is-round' : ''}" data-artwork-picker="${name}">
            <input type="file" name="${name}" accept="image/png,image/jpeg,image/webp,image/avif" />
            <span class="metadata-artwork-preview">
                <img src="${escapeHtml(src || '/assets/appicon.png')}" alt="" data-artwork-preview="${name}" />
                <span class="metadata-artwork-overlay">${EDIT_METADATA_ICON}Replace</span>
            </span>
            <span class="metadata-artwork-copy"><strong>${label}</strong><small>PNG, JPG, WebP or AVIF</small></span>
        </label>`;
}

function field(label, name, current, options = {}) {
    const { type = 'text', placeholder = '', required = false, min = '', wide = false } = options;
    return `
        <label class="metadata-field${wide ? ' is-wide' : ''}">
            <span>${label}</span>
            <input name="${name}" type="${type}" value="${escapeHtml(current ?? '')}"
                placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''} ${min !== '' ? `min="${min}"` : ''} />
        </label>`;
}

function textarea(label, name, current, placeholder = '', rows = 4) {
    return `
        <label class="metadata-field is-wide">
            <span>${label}</span>
            <textarea name="${name}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(current || '')}</textarea>
        </label>`;
}

function lyricsFilePicker() {
    return `
        <label class="metadata-lyrics-picker" data-lyrics-picker>
            <input type="file" name="lyricsFile" accept=".lrc,.irc,.ttml,text/plain,text/xml,application/xml,application/ttml+xml,application/octet-stream" />
            <span class="metadata-lyrics-picker-icon" aria-hidden="true" data-lyrics-format>LRC</span>
            <span class="metadata-lyrics-picker-copy">
                <strong>Upload synced lyrics</strong>
                <small data-lyrics-file-name>Drop an .LRC, .IRC or .TTML file here, or click to browse</small>
            </span>
            <span class="metadata-lyrics-picker-action">Choose file</span>
        </label>`;
}

function buildTrackForm(track) {
    return `
        <div class="metadata-editor-intro">
            ${artworkPicker('cover', 'Track artwork', track.album?.cover)}
            <div><span class="metadata-editor-kicker">Track</span><h4>${escapeHtml(track.title || 'Untitled')}</h4><p>Changes are applied to your local library.</p></div>
        </div>
        <div class="metadata-editor-section"><h5>Main information</h5><div class="metadata-fields">
            ${field('Title', 'title', track.title, { required: true })}
            ${field('Artist', 'artist', track.artist?.name, { required: true })}
            ${field('Album', 'album', track.album?.title, { required: true })}
            ${field('Release date', 'releaseDate', (track.releaseDate || track.album?.releaseDate || '').slice(0, 10), { type: 'date' })}
            ${field('Track number', 'trackNumber', track.trackNumber, { type: 'number', min: 1 })}
            ${field('Disc number', 'discNumber', track.discNumber || track.volumeNumber, { type: 'number', min: 1 })}
            ${field('Genre', 'genre', track.genre || track.album?.genre, { placeholder: 'Electronic, Jazz…' })}
            ${field('Copyright', 'copyright', track.copyright, { placeholder: '© Label, year' })}
            <label class="metadata-switch is-wide"><input type="checkbox" name="explicit" ${track.explicit ? 'checked' : ''} /><span></span><div><strong>Explicit content</strong><small>Display the E badge in your library</small></div></label>
        </div></div>
        <div class="metadata-editor-section"><h5>Lyrics</h5><div class="metadata-fields">
            ${lyricsFilePicker()}
            ${textarea('Synced lyrics (LRC or TTML)', 'lyrics', track.lyrics, 'Paste LRC or TTML lyrics here…', 7)}
        </div></div>`;
}

function buildAlbumForm(album) {
    return `
        <div class="metadata-editor-intro">
            ${artworkPicker('cover', 'Album artwork', album.cover)}
            <div><span class="metadata-editor-kicker">Album</span><h4>${escapeHtml(album.title || 'Untitled')}</h4><p>Shared fields will be applied to every track.</p></div>
        </div>
        <div class="metadata-editor-section"><h5>Album information</h5><div class="metadata-fields">
            ${field('Title', 'title', album.title, { required: true })}
            ${field('Album artist', 'artist', album.artist?.name, { required: true })}
            ${field('Release date', 'releaseDate', (album.releaseDate || '').slice(0, 10), { type: 'date' })}
            ${field('Genre', 'genre', album.genre, { placeholder: 'Electronic, Jazz…' })}
            ${field('Copyright', 'copyright', album.copyright, { placeholder: '© Label, year', wide: true })}
            ${textarea('Description', 'description', album.description, 'About this album…', 5)}
        </div></div>`;
}

function buildArtistForm(artist) {
    return `
        <div class="metadata-editor-intro metadata-editor-intro--artist">
            ${artworkPicker('picture', 'Profile picture', artist.picture, true)}
            <div><span class="metadata-editor-kicker">Artist</span><h4>${escapeHtml(artist.name || 'Unknown artist')}</h4><p>The new name will be applied across the entire discography.</p></div>
        </div>
        <div class="metadata-editor-section"><h5>Identity</h5><div class="metadata-fields">
            ${field('Name', 'name', artist.name, { required: true })}
            ${field('Genres', 'genres', (artist.genres || artist.tags || []).join?.(', ') || artist.genre || '', { placeholder: 'Ambient, Pop, R&B…' })}
            ${field('Website', 'website', artist.website, { type: 'url', placeholder: 'https://…', wide: true })}
            ${textarea('Biography', 'biography', artist.biography, 'Tell listeners about this artist…', 6)}
        </div></div>
        <div class="metadata-editor-section"><h5>Header artwork</h5>
            ${artworkPicker('banner', 'Artist banner', artist.banner)}
        </div>`;
}

async function persistTrack(track, updated, coverFile = null) {
    let remote = null;
    if (track.isSelfHosted) {
        remote = await updateSelfHostedTrack(track.id, updated, coverFile);
    }
    const persisted = {
        ...(remote || track),
        ...updated,
        serverAudioUrl: remote?.serverAudioUrl || track.serverAudioUrl,
        serverCoverUrl: remote?.serverCoverUrl || track.serverCoverUrl,
    };
    await db.putUploadedTrack(persisted);
    return persisted;
}

async function saveTrack(track, form) {
    const coverFile = form.get('cover');
    const coverData = await fileToDataUrl(coverFile);
    const artist = { ...(track.artist || {}), name: value(form, 'artist') || 'Unknown Artist' };
    const album = {
        ...(track.album || {}),
        title: value(form, 'album') || 'Unknown Album',
        releaseDate: value(form, 'releaseDate'),
        genre: value(form, 'genre'),
        artist,
        cover: coverData || track.album?.cover,
    };
    const updated = {
        ...track,
        title: value(form, 'title') || 'Unknown Title',
        artist,
        artists: (track.artists?.length ? track.artists : [artist]).map((item, index) =>
            index === 0 ? { ...item, ...artist } : item
        ),
        album,
        releaseDate: album.releaseDate,
        trackNumber: Number(form.get('trackNumber')) || null,
        discNumber: Number(form.get('discNumber')) || null,
        volumeNumber: Number(form.get('discNumber')) || null,
        genre: value(form, 'genre'),
        copyright: value(form, 'copyright'),
        explicit: form.get('explicit') === 'on',
        lyrics: String(form.get('lyrics') || ''),
    };
    await persistTrack(track, updated, coverFile?.size ? coverFile : null);
    Object.assign(track, updated);
    window.dispatchEvent(new CustomEvent('track-metadata-updated', { detail: { trackId: track.id } }));
    await Promise.all([db.putLocalArtist(artist), db.putLocalAlbum(album)]);
}

async function saveAlbum(album, tracks, form) {
    const coverFile = form.get('cover');
    const coverData = await fileToDataUrl(coverFile);
    const artist = { ...(album.artist || {}), name: value(form, 'artist') || 'Unknown Artist' };
    const updatedAlbum = {
        ...album,
        title: value(form, 'title') || 'Unknown Album',
        artist,
        artists: [artist],
        releaseDate: value(form, 'releaseDate'),
        genre: value(form, 'genre'),
        copyright: value(form, 'copyright'),
        description: value(form, 'description'),
        cover: coverData || album.cover,
    };
    await db.putLocalAlbum(updatedAlbum);
    await Promise.all(
        tracks.map((track) => {
            const updated = {
                ...track,
                album: { ...track.album, ...updatedAlbum },
                releaseDate: updatedAlbum.releaseDate,
                genre: updatedAlbum.genre || track.genre,
                copyright: updatedAlbum.copyright || track.copyright,
            };
            return persistTrack(track, updated, coverFile?.size ? coverFile : null);
        })
    );
}

async function saveArtist(artist, tracks, form) {
    const pictureFile = form.get('picture');
    const bannerFile = form.get('banner');
    const updatedArtist = {
        ...artist,
        name: value(form, 'name') || 'Unknown Artist',
        genres: value(form, 'genres')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        website: value(form, 'website'),
        biography: value(form, 'biography'),
        picture: (await fileToDataUrl(pictureFile)) || artist.picture,
        banner: (await fileToDataUrl(bannerFile)) || artist.banner,
    };
    await db.putLocalArtist(updatedArtist);
    await Promise.all(
        tracks.map((track) => {
            const replaceArtist = (item) =>
                String(item?.id) === String(artist.id) ? { ...item, ...updatedArtist } : item;
            const updated = {
                ...track,
                artist: replaceArtist(track.artist),
                artists: (track.artists?.length ? track.artists : [track.artist]).map(replaceArtist),
                album: {
                    ...track.album,
                    artist: replaceArtist(track.album?.artist),
                },
            };
            return persistTrack(track, updated);
        })
    );
}

function setupArtworkPreviews(form) {
    form.querySelectorAll('[data-artwork-picker]').forEach((picker) => {
        const input = picker.querySelector('input[type="file"]');
        const preview = picker.querySelector('[data-artwork-preview]');
        const update = () => {
            const file = input.files?.[0];
            if (!file) return;
            preview.src = URL.createObjectURL(file);
            picker.classList.add('has-new-file');
        };
        input.addEventListener('change', update);
        ['dragenter', 'dragover'].forEach((name) =>
            picker.addEventListener(name, (event) => {
                event.preventDefault();
                picker.classList.add('is-dragging');
            })
        );
        ['dragleave', 'drop'].forEach((name) =>
            picker.addEventListener(name, (event) => {
                event.preventDefault();
                picker.classList.remove('is-dragging');
            })
        );
        picker.addEventListener('drop', (event) => {
            const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith('image/'));
            if (!file) return;
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            update();
        });
    });
}

function setupLyricsFilePicker(form) {
    const picker = form.querySelector('[data-lyrics-picker]');
    if (!picker) return;
    const input = picker.querySelector('input[type="file"]');
    const textareaElement = form.elements.lyrics;
    const fileName = picker.querySelector('[data-lyrics-file-name]');
    const formatBadge = picker.querySelector('[data-lyrics-format]');

    const loadFile = async (file) => {
        if (!file) throw new Error('Choose an .LRC, .IRC or .TTML lyrics file.');
        if (!/\.(?:lrc|irc|ttml)$/i.test(file.name)) throw new Error('Choose an .LRC, .IRC or .TTML lyrics file.');
        if (file.size > 1024 * 1024) throw new Error('Lyrics files must be smaller than 1 MB.');
        const content = (await file.text()).replace(/^\uFEFF/, '');
        const isTtmlFile = /\.ttml$/i.test(file.name);
        if (isTtmlFile && !isTtml(content)) throw new Error('This file does not contain valid TTML lyrics.');
        if (!isTtmlFile && !parseLrc(content).length)
            throw new Error('This file does not contain synced LRC timestamps.');
        textareaElement.value = content;
        fileName.textContent = file.name;
        formatBadge.textContent = isTtmlFile ? 'TTML' : 'LRC';
        picker.classList.add('has-file');
    };

    input.addEventListener('change', () => {
        loadFile(input.files?.[0]).catch((error) => {
            input.value = '';
            showNotification(error.message, 'error');
        });
    });
    ['dragenter', 'dragover'].forEach((name) =>
        picker.addEventListener(name, (event) => {
            event.preventDefault();
            picker.classList.add('is-dragging');
        })
    );
    ['dragleave', 'drop'].forEach((name) =>
        picker.addEventListener(name, (event) => {
            event.preventDefault();
            picker.classList.remove('is-dragging');
        })
    );
    picker.addEventListener('drop', (event) => {
        const file = [...(event.dataTransfer?.files || [])].find((item) => /\.(?:lrc|irc|ttml)$/i.test(item.name));
        loadFile(file).catch((error) => showNotification(error.message, 'error'));
    });
}

export function openMetadataEditor({ type, entity, tracks = [], onSaved }) {
    const form = document.createElement('form');
    form.className = 'metadata-editor-form';
    form.innerHTML = `
        <div class="metadata-editor-scroll">
            ${type === 'track' ? buildTrackForm(entity) : type === 'album' ? buildAlbumForm(entity) : buildArtistForm(entity)}
        </div>
        <div class="metadata-editor-footer">
            <span class="metadata-save-status" role="status"></span>
            <button type="button" class="btn-secondary" data-metadata-cancel>Cancel</button>
            <button type="submit" class="btn-primary">${EDIT_METADATA_ICON}Save changes</button>
        </div>`;

    const labels = { track: 'Edit track', album: 'Edit album', artist: 'Edit artist' };
    const { modal, close } = createModal({ title: labels[type], content: form, className: 'metadata-editor-modal' });
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    setupArtworkPreviews(form);
    setupLyricsFilePicker(form);
    form.querySelector('[data-metadata-cancel]').addEventListener('click', close);

    const escapeHandler = (event) => {
        if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', escapeHandler, { once: true });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        const status = form.querySelector('.metadata-save-status');
        submit.disabled = true;
        form.classList.add('is-saving');
        status.textContent = 'Saving…';
        try {
            const data = new FormData(form);
            if (type === 'track') await saveTrack(entity, data);
            if (type === 'album') await saveAlbum(entity, tracks, data);
            if (type === 'artist') await saveArtist(entity, tracks, data);
            status.textContent = 'Saved';
            form.classList.add('is-saved');
            await onSaved?.();
            setTimeout(close, 260);
            showNotification('Metadata saved.', 'success');
        } catch (error) {
            console.error('[MetadataEditor] Save failed:', error);
            status.textContent = error.message || 'Could not save changes';
            form.classList.remove('is-saving');
            submit.disabled = false;
            showNotification(`Could not save metadata: ${error.message}`, 'error');
        }
    });

    requestAnimationFrame(() => form.querySelector('input:not([type="file"])')?.focus());
    return { modal, close };
}
