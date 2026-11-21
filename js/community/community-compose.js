// Composers for 24-hour notes and polls, plus the music search both use to attach a
// track, album or artist from Monochrome's catalogue.
import I_X from '!lucide/x.svg?svg&icon';
import I_MUSIC from '!lucide/music.svg?svg&icon';
import I_SEARCH from '!lucide/search.svg?svg&icon';
import I_TRASH from '!lucide/trash-2.svg?svg&icon';
import I_PLUS from '!lucide/plus.svg?svg&icon';
import { api, getState, scheduleRefresh } from './community-store.js';
import { attachmentFrom, coverUrl, esc } from './community-format.js';
import { MusicAPI } from '../music-api.js';
import { Player } from '../player.js';
import { showNotification } from '../downloads.js';

const NOTE_MAX = 120;

function attachmentChip(attachment, removable = true) {
    if (!attachment) return '';
    const cover = coverUrl(attachment.cover, '80');
    return `<span class="cm-attach-chip">
        ${cover ? `<img src="${esc(cover)}" alt="" class="${attachment.kind === 'artist' ? 'is-round' : ''}">` : `<span class="cm-attach-icon">${I_MUSIC(14)}</span>`}
        <span class="cm-attach-text"><strong>${esc(attachment.title)}</strong><small>${esc(attachment.subtitle || attachment.kind)}</small></span>
        ${removable ? `<button type="button" class="cm-icon-btn is-quiet is-small" data-detach aria-label="Remove ${esc(attachment.title)}">${I_X(14)}</button>` : ''}
    </span>`;
}

/** Inline catalogue search; calls `onPick(attachment)`. */
function musicSearch(container, onPick) {
    container.innerHTML = `
        <label class="cm-search">${I_SEARCH(16)}<input type="search" placeholder="Search tracks, albums, artists" aria-label="Search music to attach" autocomplete="off"></label>
        <ul class="cm-search-results" role="listbox" aria-label="Music results"></ul>`;
    const input = container.querySelector('input');
    const list = container.querySelector('ul');
    let timer = null;
    let generation = 0;
    const results = [];
    input.addEventListener('input', () => {
        clearTimeout(timer);
        const query = input.value.trim();
        if (query.length < 2) {
            list.innerHTML = '';
            return;
        }
        timer = setTimeout(async () => {
            const current = ++generation;
            list.innerHTML = '<li class="cm-search-empty">Searching…</li>';
            try {
                const found = await MusicAPI.instance.search(query, { limit: 6 });
                if (current !== generation) return;
                results.length = 0;
                for (const track of (found?.tracks?.items || []).slice(0, 5)) results.push(attachmentFrom('track', track));
                for (const album of (found?.albums?.items || []).slice(0, 3)) results.push(attachmentFrom('album', album));
                for (const artist of (found?.artists?.items || []).slice(0, 2)) results.push(attachmentFrom('artist', artist));
                list.innerHTML = results.length
                    ? results
                          .map(
                              (item, index) => `<li><button type="button" class="cm-search-item" data-index="${index}" role="option">
                            ${item.cover ? `<img src="${esc(coverUrl(item.cover, '80'))}" alt="" class="${item.kind === 'artist' ? 'is-round' : ''}" loading="lazy">` : `<span class="cm-attach-icon">${I_MUSIC(14)}</span>`}
                            <span><strong>${esc(item.title)}</strong><small>${esc(item.kind === 'track' ? item.subtitle : `${item.kind[0].toUpperCase()}${item.kind.slice(1)} · ${item.subtitle}`)}</small></span>
                        </button></li>`
                          )
                          .join('')
                    : '<li class="cm-search-empty">Nothing found.</li>';
            } catch {
                if (current === generation) list.innerHTML = '<li class="cm-search-empty">Search is unavailable right now.</li>';
            }
        }, 260);
    });
    list.addEventListener('click', (event) => {
        const button = event.target.closest('[data-index]');
        if (button) onPick(results[Number(button.dataset.index)]);
    });
    return input;
}

function nowPlayingAttachment() {
    const track = Player.instance?.currentTrack;
    return track && !track.isPodcast && track.type !== 'video' ? attachmentFrom('track', track) : null;
}

function dialogShell(title, inner, className = '') {
    const dialog = document.createElement('dialog');
    dialog.className = `cm-dialog ${className}`;
    dialog.innerHTML = `<form method="dialog" class="cm-dialog-card">
        <button type="submit" disabled hidden aria-hidden="true" tabindex="-1"></button>
        <header class="cm-dialog-head"><h2>${esc(title)}</h2><button class="cm-icon-btn is-quiet" value="cancel" aria-label="Close">${I_X(18)}</button></header>
        ${inner}
    </form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    return dialog;
}

function audienceField(name, value) {
    return `<fieldset class="cm-segment" aria-label="Who can see it">
        <legend class="sr-only">Who can see it</legend>
        <label><input type="radio" name="${name}" value="friends" ${value === 'friends' ? 'checked' : ''}><span>Friends</span></label>
        <label><input type="radio" name="${name}" value="instance" ${value === 'instance' ? 'checked' : ''}><span>Everyone here</span></label>
    </fieldset>`;
}

// ---------------------------------------------------------------- notes

export function openNoteComposer({ attachment = null } = {}) {
    const state = getState().data;
    if (!state) return;
    if (!state.me.canPost) {
        showNotification('Posting is turned off on this instance.');
        return;
    }
    const mine = state.notes.find((note) => note.user === state.me.id);
    const playing = nowPlayingAttachment();
    let attached = attachment || null;
    const defaultAudience = mine?.audience || (state.me.visibility === 'instance' ? 'instance' : 'friends');
    const dialog = dialogShell(
        mine ? 'Your note' : 'Leave a note',
        `<p class="cm-dialog-lede">A thought about what you're hearing. It disappears after 24 hours.</p>
        <div class="cm-note-editor">
            <textarea name="body" maxlength="${NOTE_MAX}" rows="3" placeholder="This outro is unreal…" aria-label="Note">${esc(mine?.body || '')}</textarea>
            <span class="cm-counter" aria-live="polite"></span>
        </div>
        <div class="cm-attach-slot"></div>
        <div class="cm-attach-actions">
            ${playing ? `<button type="button" class="cm-btn is-soft" data-attach-playing>${I_MUSIC(15)}<span>Attach ${esc(playing.title)}</span></button>` : ''}
            <button type="button" class="cm-btn is-soft" data-attach-search>${I_SEARCH(15)}<span>Find music</span></button>
        </div>
        <div class="cm-attach-search" hidden></div>
        ${audienceField('audience', defaultAudience)}
        <footer class="cm-dialog-actions">
            ${mine ? `<button type="button" class="cm-btn is-ghost is-danger" data-delete>${I_TRASH(15)}<span>Delete note</span></button>` : ''}
            <button class="cm-btn is-primary" value="post" data-post>Share note</button>
        </footer>`,
        'cm-note-dialog'
    );
    const textarea = dialog.querySelector('textarea');
    const counter = dialog.querySelector('.cm-counter');
    const slot = dialog.querySelector('.cm-attach-slot');
    const post = dialog.querySelector('[data-post]');
    const searchBox = dialog.querySelector('.cm-attach-search');
    if (!attached && mine?.attachment) attached = mine.attachment;
    const sync = () => {
        const left = NOTE_MAX - textarea.value.length;
        counter.textContent = left <= 20 ? `${left}` : '';
        slot.innerHTML = attachmentChip(attached);
        post.disabled = !textarea.value.trim() && !attached;
    };
    textarea.addEventListener('input', sync);
    dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-detach]')) {
            attached = null;
            sync();
        } else if (event.target.closest('[data-attach-playing]')) {
            attached = playing;
            sync();
        } else if (event.target.closest('[data-attach-search]')) {
            searchBox.hidden = !searchBox.hidden;
            if (!searchBox.hidden) {
                musicSearch(searchBox, (pick) => {
                    attached = pick;
                    searchBox.hidden = true;
                    sync();
                    textarea.focus();
                }).focus();
            }
        } else if (event.target.closest('[data-delete]')) {
            event.preventDefault();
            dialog.close();
            api('/notes', { method: 'DELETE' })
                .then(() => {
                    showNotification('Note deleted.');
                    scheduleRefresh(0);
                })
                .catch(() => showNotification('Could not delete your note.'));
        }
    });
    dialog.querySelector('form').addEventListener('submit', async (event) => {
        if (event.submitter?.value !== 'post') return;
        event.preventDefault();
        post.disabled = true;
        try {
            await api('/notes', {
                method: 'POST',
                body: { body: textarea.value, attachment: attached, audience: dialog.querySelector('input[name="audience"]:checked')?.value },
            });
            dialog.close();
            scheduleRefresh(0);
        } catch (error) {
            post.disabled = false;
            showNotification(error?.response?.message || 'Could not share your note.');
        }
    });
    sync();
    dialog.showModal();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

// ---------------------------------------------------------------- polls

export function openPollComposer() {
    const state = getState().data;
    if (!state) return;
    if (!state.me.canPost) {
        showNotification('Posting is turned off on this instance.');
        return;
    }
    const options = [
        { label: '', ref: null },
        { label: '', ref: null },
    ];
    const dialog = dialogShell(
        'Ask the room',
        `<label class="cm-field"><span>Question</span><input name="question" maxlength="160" placeholder="Best track on the new album?" required autocomplete="off"></label>
        <div class="cm-poll-options" role="group" aria-label="Answers"></div>
        <button type="button" class="cm-btn is-soft" data-add-option>${I_PLUS(15)}<span>Add an answer</span></button>
        <div class="cm-attach-search" hidden></div>
        <div class="cm-poll-meta">
            <label class="cm-field is-inline"><span>Open for</span>
                <select name="hours"><option value="1">1 hour</option><option value="24" selected>1 day</option><option value="72">3 days</option><option value="168">1 week</option></select>
            </label>
            ${audienceField('poll-audience', 'instance')}
        </div>
        <footer class="cm-dialog-actions"><button class="cm-btn is-primary" value="post" data-post>Post poll</button></footer>`,
        'cm-poll-dialog'
    );
    const list = dialog.querySelector('.cm-poll-options');
    const searchBox = dialog.querySelector('.cm-attach-search');
    const question = dialog.querySelector('input[name="question"]');
    const post = dialog.querySelector('[data-post]');
    let searchingFor = -1;
    const render = () => {
        list.innerHTML = options
            .map(
                (option, index) => `<div class="cm-poll-option-edit" data-option="${index}">
                ${option.ref ? attachmentChip(option.ref) : `<input maxlength="80" value="${esc(option.label)}" placeholder="Answer ${index + 1}" aria-label="Answer ${index + 1}" autocomplete="off">`}
                ${option.ref ? '' : `<button type="button" class="cm-icon-btn is-quiet" data-option-music aria-label="Use a track, album or artist for answer ${index + 1}" title="Pick music">${I_MUSIC(16)}</button>`}
                ${options.length > 2 ? `<button type="button" class="cm-icon-btn is-quiet" data-option-remove aria-label="Remove answer ${index + 1}">${I_X(16)}</button>` : ''}
            </div>`
            )
            .join('');
        dialog.querySelector('[data-add-option]').hidden = options.length >= 4;
        validate();
    };
    const validate = () => {
        const filled = options.filter((o) => o.ref || o.label.trim()).length;
        post.disabled = question.value.trim().length < 3 || filled < 2;
    };
    question.addEventListener('input', validate);
    list.addEventListener('input', (event) => {
        const row = event.target.closest('[data-option]');
        if (row) options[Number(row.dataset.option)].label = event.target.value;
        validate();
    });
    dialog.addEventListener('click', (event) => {
        const row = event.target.closest('[data-option]');
        const index = row ? Number(row.dataset.option) : -1;
        if (event.target.closest('[data-add-option]') && options.length < 4) {
            options.push({ label: '', ref: null });
            render();
            list.querySelector(`[data-option="${options.length - 1}"] input`)?.focus();
        } else if (event.target.closest('[data-option-remove]')) {
            options.splice(index, 1);
            render();
        } else if (event.target.closest('[data-detach]') && index >= 0) {
            options[index].ref = null;
            render();
        } else if (event.target.closest('[data-option-music]')) {
            searchingFor = index;
            searchBox.hidden = false;
            musicSearch(searchBox, (pick) => {
                if (searchingFor >= 0 && pick) options[searchingFor] = { label: pick.title, ref: pick };
                searchBox.hidden = true;
                render();
            }).focus();
        }
    });
    dialog.querySelector('form').addEventListener('submit', async (event) => {
        if (event.submitter?.value !== 'post') return;
        event.preventDefault();
        post.disabled = true;
        try {
            await api('/polls', {
                method: 'POST',
                body: {
                    question: question.value,
                    options: options.map((o) => ({ label: o.label, ref: o.ref })),
                    hours: Number(dialog.querySelector('select[name="hours"]').value),
                    audience: dialog.querySelector('input[name="poll-audience"]:checked')?.value,
                },
            });
            dialog.close();
            scheduleRefresh(0);
        } catch (error) {
            post.disabled = false;
            showNotification(error?.response?.message || 'Could not post your poll.');
        }
    });
    render();
    dialog.showModal();
    question.focus();
}
