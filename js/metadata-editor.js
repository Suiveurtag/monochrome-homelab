import { db } from './db.js';
import { showNotification } from './downloads.js';
import { updateSelfHostedTrack } from './selfhost-server-api.js';
import { createModal, escapeHtml } from './utils.js';
import { EDIT_METADATA_ICON } from './metadata-editor-icon.js';
import { isTtml, parseLrc } from './lyrics-format.js';
import { ARTWORK_ACCEPT, MAX_ARTWORK_BYTES, isSupportedArtworkFile, renderArtworkElement } from './animated-artwork.js';
import { getArtworkSources, isSupportedImageArtworkFile } from './artwork-media.js';
import { getTrackThemeColor, normalizeTrackThemeColor } from './track-theme-color.js';

const STATIC_ARTWORK_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif';
const CANVAS_ACCEPT = 'video/mp4,.mp4';

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

function artworkPicker(
    name,
    label,
    src,
    round = false,
    { accept = ARTWORK_ACCEPT, formats = 'PNG, JPG, WebP, AVIF, GIF or MP4', staticOnly = false } = {}
) {
    return `
        <label class="metadata-artwork-picker${round ? ' is-round' : ''}" data-artwork-picker="${name}" ${staticOnly ? 'data-static-artwork' : ''}>
            <input type="file" name="${name}" accept="${accept}" />
            <span class="metadata-artwork-preview">
                <img src="${escapeHtml(src || '/assets/appicon.png')}" alt="" data-artwork-preview="${name}" />
                <span class="metadata-artwork-overlay">${EDIT_METADATA_ICON}Replace</span>
            </span>
            <span class="metadata-artwork-copy"><strong>${label}</strong><small>${formats}</small></span>
        </label>`;
}

function canvasPicker(track) {
    const artwork = getArtworkSources({
        cover: track.album?.cover || track.cover,
        animatedCover: track.videoCoverUrl || track.videoUrl || track.album?.videoCoverUrl,
        coverFallback: track.coverFallback || track.album?.coverFallback,
    });
    const source = artwork.animated;
    const poster = artwork.static;
    return `
        <div class="metadata-canvas-picker${source ? ' has-canvas' : ''}" data-canvas-picker data-canvas-poster="${escapeHtml(poster)}">
            <span class="metadata-canvas-preview" data-canvas-preview>
                ${source ? `<video src="${escapeHtml(source)}" poster="${escapeHtml(poster)}" muted loop playsinline preload="metadata" aria-label="Current Canvas preview"></video>` : `<img src="${escapeHtml(poster)}" alt="" />`}
            </span>
            <div class="metadata-canvas-copy">
                <strong>Canvas video</strong>
                <small>Optional portrait MP4 · 9:16 recommended · 100 MB maximum</small>
                <span data-canvas-file-name>${source ? 'Canvas attached' : 'No Canvas attached'}</span>
            </div>
            <div class="metadata-canvas-actions">
                <label class="btn-secondary metadata-canvas-choose">
                    <span>${source ? 'Replace' : 'Choose MP4'}</span>
                    <input type="file" name="canvas" accept="${CANVAS_ACCEPT}" />
                </label>
                <button type="button" class="btn-secondary metadata-canvas-remove" data-canvas-remove ${source ? '' : 'hidden'}>Remove</button>
            </div>
            <input type="hidden" name="removeCanvas" value="false" />
        </div>`;
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

function repeatableRows(label, key, rows, columns) {
    const values = rows?.length ? rows : [{}];
    const renderRow = (row = {}) => `<div class="metadata-repeatable-row" data-repeatable-row>
        ${columns
            .map(
                ({ name, label: columnLabel, type = 'text', placeholder = '' }) =>
                    `<label><span>${escapeHtml(columnLabel)}</span><input type="${type}" name="${key}_${name}[]" value="${escapeHtml(row[name] || '')}" placeholder="${escapeHtml(placeholder)}" /></label>`
            )
            .join('')}
        <button type="button" class="metadata-repeatable-remove" aria-label="Remove ${escapeHtml(label)} row">×</button>
    </div>`;
    return `<div class="metadata-repeatable is-wide" data-repeatable="${key}">
        <div class="metadata-repeatable-heading"><strong>${escapeHtml(label)}</strong><button type="button" data-repeatable-add>Add row</button></div>
        <div data-repeatable-rows>${values.map(renderRow).join('')}</div>
        <template>${renderRow()}</template>
    </div>`;
}

function collectRows(form, key, columns) {
    const values = Object.fromEntries(columns.map((column) => [column, form.getAll(`${key}_${column}[]`)]));
    return (values[columns[0]] || [])
        .map((_, index) =>
            Object.fromEntries(columns.map((column) => [column, String(values[column][index] || '').trim()]))
        )
        .filter((row) => columns.some((column) => row[column]));
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

function themeColorPicker(track) {
    const color = getTrackThemeColor(track);
    return `
        <div class="metadata-theme-color" data-theme-color-control>
            <label class="metadata-theme-color-swatch">
                <span class="sr-only">Song theme color</span>
                <input type="color" name="themeColorPicker" value="${color || '#a78bfa'}" />
            </label>
            <div class="metadata-theme-color-copy">
                <strong>Theme color</strong>
                <small>Overrides the color picked from this song's artwork.</small>
                <output data-theme-color-value aria-live="polite">${color ? color.toUpperCase() : 'Automatic'}</output>
            </div>
            <button type="button" class="btn-secondary metadata-theme-color-reset" data-theme-color-reset>
                Use artwork color
            </button>
            <input type="hidden" name="themeColor" value="${color}" />
        </div>`;
}

function buildTrackForm(track) {
    const staticArtwork = getArtworkSources({
        cover: track.album?.cover || track.cover,
        animatedCover: track.videoCoverUrl || track.videoUrl || track.album?.videoCoverUrl,
        coverFallback: track.coverFallback || track.album?.coverFallback,
    }).static;
    return `
        <div class="metadata-editor-intro">
            ${artworkPicker('cover', 'Track artwork', staticArtwork, false, { accept: STATIC_ARTWORK_ACCEPT, formats: 'PNG, JPG, WebP or AVIF', staticOnly: true })}
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
        <div class="metadata-editor-section"><h5>Song color</h5>
            ${themeColorPicker(track)}
        </div>
        <div class="metadata-editor-section"><h5>Canvas</h5>
            ${canvasPicker(track)}
        </div>
        <div class="metadata-editor-section"><h5>Lyrics</h5><div class="metadata-fields">
            ${lyricsFilePicker()}
            ${textarea('Synced lyrics (LRC or TTML)', 'lyrics', track.lyrics, 'Paste LRC or TTML lyrics here…', 7)}
            ${repeatableRows('Credits', 'credits', track.credits, [
                { name: 'name', label: 'Name', placeholder: 'Contributor name' },
                { name: 'role', label: 'Role', placeholder: 'Producer, Writer…' },
            ])}
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
            ${field('Monthly listeners', 'monthlyListeners', artist.monthlyListeners, { type: 'number', min: 0 })}
            ${textarea('Biography', 'biography', artist.biography, 'Tell listeners about this artist…', 6)}
        </div></div>
        <div class="metadata-editor-section"><h5>Header artwork</h5>
            ${artworkPicker('banner', 'Artist banner', artist.banner)}
        </div>
        <div class="metadata-editor-section"><h5>Now Playing</h5><div class="metadata-fields">
            ${repeatableRows('Related videos', 'relatedVideos', artist.relatedVideos, [
                { name: 'title', label: 'Title', placeholder: 'Video title' },
                { name: 'subtitle', label: 'Subtitle', placeholder: 'Artist or description' },
                { name: 'thumbnail', label: 'Thumbnail', placeholder: 'Image URL' },
                { name: 'href', label: 'External URL', type: 'url', placeholder: 'https://…' },
                { name: 'trackId', label: 'Local track ID', placeholder: 'Optional' },
            ])}
            ${repeatableRows('Tour dates', 'tourDates', artist.tourDates, [
                { name: 'date', label: 'Date', type: 'date' },
                { name: 'time', label: 'Time', type: 'time' },
                { name: 'city', label: 'City' },
                { name: 'venue', label: 'Venue' },
                { name: 'href', label: 'Event URL', type: 'url', placeholder: 'https://…' },
            ])}
        </div></div>`;
}

async function persistTrack(track, updated, coverFile = null, canvasOptions = {}) {
    let remote = null;
    if (track.isSelfHosted) {
        remote = await updateSelfHostedTrack(track.id, updated, coverFile, canvasOptions);
    }
    const persisted = {
        ...(remote || track),
        ...updated,
        album: remote
            ? { ...updated.album, cover: remote.album?.cover, videoCoverUrl: remote.album?.videoCoverUrl || null }
            : updated.album,
        videoCoverUrl: remote?.videoCoverUrl || updated.videoCoverUrl || null,
        serverAudioUrl: remote?.serverAudioUrl || track.serverAudioUrl,
        serverCoverUrl: remote?.serverCoverUrl || track.serverCoverUrl,
    };
    await db.putUploadedTrack(persisted);
    return persisted;
}

async function saveTrack(track, form) {
    const coverFile = form.get('cover');
    const canvasFile = form.get('canvas');
    const removeCanvas = form.get('removeCanvas') === 'true';
    const coverData = await fileToDataUrl(coverFile);
    const canvasData = track.isSelfHosted ? '' : await fileToDataUrl(canvasFile);
    const existingArtwork = getArtworkSources({
        cover: track.album?.cover || track.cover,
        animatedCover: track.videoCoverUrl || track.videoUrl || track.album?.videoCoverUrl,
        coverFallback: track.coverFallback || track.album?.coverFallback,
    });
    const artist = { ...(track.artist || {}), name: value(form, 'artist') || 'Unknown Artist' };
    const album = {
        ...(track.album || {}),
        title: value(form, 'album') || 'Unknown Album',
        releaseDate: value(form, 'releaseDate'),
        genre: value(form, 'genre'),
        artist,
        cover: coverData || existingArtwork.static,
        videoCoverUrl: canvasFile?.size || removeCanvas ? null : track.album?.videoCoverUrl || null,
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
        videoUrl: track.type === 'video' ? track.videoUrl || null : null,
        videoCoverUrl: removeCanvas ? null : canvasData || track.videoCoverUrl || track.videoUrl || null,
        themeColor: normalizeTrackThemeColor(value(form, 'themeColor')),
        lyrics: String(form.get('lyrics') || ''),
        credits: collectRows(form, 'credits', ['name', 'role']),
    };
    const persisted = await persistTrack(track, updated, coverFile?.size ? coverFile : null, {
        canvasFile: canvasFile?.size ? canvasFile : null,
        removeCanvas,
    });
    Object.assign(track, persisted);
    window.dispatchEvent(
        new CustomEvent('track-metadata-updated', { detail: { trackId: track.id, track: persisted } })
    );
    await Promise.all([db.putLocalArtist(artist), db.putLocalAlbum(persisted.album || album)]);
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
        monthlyListeners: Number(form.get('monthlyListeners')) || null,
        relatedVideos: collectRows(form, 'relatedVideos', ['title', 'subtitle', 'thumbnail', 'href', 'trackId']),
        tourDates: collectRows(form, 'tourDates', ['date', 'time', 'city', 'venue', 'href']),
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
    window.dispatchEvent(
        new CustomEvent('artist-metadata-updated', { detail: { artistId: artist.id, artist: updatedArtist } })
    );
}

function setupArtworkPreviews(form) {
    form.querySelectorAll('[data-artwork-picker]').forEach((picker) => {
        const input = picker.querySelector('input[type="file"]');
        let preview = picker.querySelector('[data-artwork-preview]');
        const update = () => {
            const file = input.files?.[0];
            if (!file) return;
            const supportsFile = picker.hasAttribute('data-static-artwork')
                ? isSupportedImageArtworkFile(file)
                : isSupportedArtworkFile(file);
            if (!supportsFile) {
                input.value = '';
                showNotification(
                    picker.hasAttribute('data-static-artwork')
                        ? 'Choose a PNG, JPG, WebP, or AVIF image.'
                        : 'Choose an image, GIF, or MP4 file.',
                    'error'
                );
                return;
            }
            if (file.size > MAX_ARTWORK_BYTES) {
                input.value = '';
                showNotification('Artwork files must be smaller than 100 MB.', 'error');
                return;
            }
            preview = renderArtworkElement(preview, URL.createObjectURL(file), { video: file.type === 'video/mp4' });
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
            const file = [...(event.dataTransfer?.files || [])].find((item) =>
                picker.hasAttribute('data-static-artwork')
                    ? isSupportedImageArtworkFile(item)
                    : isSupportedArtworkFile(item)
            );
            if (!file) return;
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            update();
        });
    });
}

function setupCanvasPicker(form) {
    const picker = form.querySelector('[data-canvas-picker]');
    if (!picker) return;
    const input = picker.querySelector('input[name="canvas"]');
    const removeInput = picker.querySelector('input[name="removeCanvas"]');
    const preview = picker.querySelector('[data-canvas-preview]');
    const fileName = picker.querySelector('[data-canvas-file-name]');
    const chooseCopy = picker.querySelector('.metadata-canvas-choose span');
    const removeButton = picker.querySelector('[data-canvas-remove]');
    let objectUrl = '';

    const renderPoster = () => {
        const image = document.createElement('img');
        image.src = picker.dataset.canvasPoster || '/assets/appicon.png';
        image.alt = '';
        preview.replaceChildren(image);
    };
    const setCanvasState = (hasCanvas, label) => {
        picker.classList.toggle('has-canvas', hasCanvas);
        picker.classList.toggle('is-removed', !hasCanvas && removeInput.value === 'true');
        removeButton.hidden = !hasCanvas;
        chooseCopy.textContent = hasCanvas ? 'Replace' : 'Choose MP4';
        fileName.textContent = label;
    };
    const load = (file) => {
        if (!file) return;
        if (!(file.type === 'video/mp4' || /\.mp4$/i.test(file.name))) {
            input.value = '';
            showNotification('Choose an MP4 video for Canvas.', 'error');
            return;
        }
        if (file.size > MAX_ARTWORK_BYTES) {
            input.value = '';
            showNotification('Canvas videos must be smaller than 100 MB.', 'error');
            return;
        }
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = objectUrl;
        video.poster = picker.dataset.canvasPoster || '';
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('aria-label', 'Selected Canvas preview');
        preview.replaceChildren(video);
        removeInput.value = 'false';
        setCanvasState(true, file.name);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) void video.play().catch(() => {});
    };

    input.addEventListener('change', () => load(input.files?.[0]));
    removeButton.addEventListener('click', () => {
        input.value = '';
        removeInput.value = 'true';
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = '';
        renderPoster();
        setCanvasState(false, 'Canvas will be removed when you save');
    });
    picker.addEventListener('pointerenter', () => {
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
            void preview
                .querySelector('video')
                ?.play()
                .catch(() => {});
    });
    picker.addEventListener('pointerleave', () => preview.querySelector('video')?.pause());
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

function setupThemeColorPicker(form) {
    const control = form.querySelector('[data-theme-color-control]');
    if (!control) return;

    const picker = control.querySelector('input[type="color"]');
    const stored = control.querySelector('input[name="themeColor"]');
    const output = control.querySelector('[data-theme-color-value]');
    const reset = control.querySelector('[data-theme-color-reset]');
    const inheritedColor = normalizeTrackThemeColor(
        getComputedStyle(document.documentElement).getPropertyValue('--highlight')
    );

    if (!stored.value) picker.value = inheritedColor || '#a78bfa';

    const render = (color) => {
        const normalized = normalizeTrackThemeColor(color);
        stored.value = normalized;
        output.value = normalized ? normalized.toUpperCase() : 'Automatic';
        control.classList.toggle('is-custom', Boolean(normalized));
        reset.disabled = !normalized;
    };

    picker.addEventListener('input', () => render(picker.value));
    reset.addEventListener('click', () => {
        picker.value = inheritedColor || '#a78bfa';
        render('');
        picker.focus();
    });
    render(stored.value);
}

function setupRepeatableRows(form) {
    form.querySelectorAll('[data-repeatable]').forEach((group) => {
        group.addEventListener('click', (event) => {
            if (event.target.closest('[data-repeatable-add]')) {
                const fragment = group.querySelector('template').content.cloneNode(true);
                group.querySelector('[data-repeatable-rows]').append(fragment);
                group.querySelector('[data-repeatable-row]:last-child input')?.focus();
            }
            const remove = event.target.closest('.metadata-repeatable-remove');
            if (remove) remove.closest('[data-repeatable-row]')?.remove();
        });
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
    setupCanvasPicker(form);
    setupLyricsFilePicker(form);
    setupThemeColorPicker(form);
    setupRepeatableRows(form);
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
