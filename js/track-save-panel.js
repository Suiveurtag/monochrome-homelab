// "Add to playlist" popover, opened from a save button (right-click, or click on a saved track).
// Every row is a toggle that applies immediately, so the panel ends on "Done", never "Cancel".
import { db } from './db.js';
import { syncManager } from './accounts/pocketbase.js';
import { showNotification } from './downloads.js';
import { recentActivityManager } from './storage.js';
import { escapeHtml, getTrackArtists, trackDataStore } from './utils.js';
import { createTrackSaveIconHTML, setTrackSaveIconState } from './track-save-ui.js';
import { SVG_CLOSE, SVG_HEART_FILLED, SVG_PLUS, SVG_SEARCH } from './icons.js';

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';
const LOADING_DELAY = 120;
const STAGGER_CAP = 6;
// The sheet's scrim is its own spread shadow, so it fades with the slide instead of snapping in.
const SHEET_HIDDEN = {
    transform: 'translateY(100%)',
    boxShadow: '0 0 0 100vmax rgb(0 0 0 / 0), 0 -8px 32px rgb(0 0 0 / 0)',
};
const SHEET_SHOWN = {
    transform: 'translateY(0)',
    boxShadow: '0 0 0 100vmax rgb(0 0 0 / 0.5), 0 -8px 32px rgb(0 0 0 / 0.35)',
};

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSheet = () => window.matchMedia('(max-width: 600px)').matches;
const songs = (count) => `${count} ${count === 1 ? 'song' : 'songs'}`;
const playlistName = (playlist) => playlist.name || playlist.title || 'Untitled playlist';

function rectOf(element) {
    if (!element?.isConnected) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
}

export function setupTrackSavePanel({ player, api, ui, handleTrackAction }) {
    const panel = document.getElementById('track-save-floating-panel');
    if (!panel || panel.dataset.initialized === 'true') return;
    panel.dataset.initialized = 'true';
    panel.tabIndex = -1;

    let track = null;
    let trigger = null;
    let query = '';
    // Loaded once per opening; toggles update it in place so rows never jump while you click them.
    let data = null;
    let order = [];
    let openRun = 0;
    let motion = null;
    const busy = new Set();

    const trackType = () => (track?.type === 'video' ? 'video' : 'track');

    const coverUrl = (playlist) => {
        const candidate =
            playlist.cover ||
            playlist.images?.[0] ||
            playlist.tracks?.find((item) => item.album?.cover)?.album?.cover ||
            null;
        if (!candidate) return '';
        const value = String(candidate);
        if (/^(?:data:|blob:|https?:|\/)/.test(value)) return value;
        return api.getCoverUrl(candidate, '160');
    };

    const trackCoverUrl = () => {
        const cover = track?.album?.cover || track?.image || track?.cover;
        if (!cover) return '';
        const value = String(cover);
        return /^(?:data:|blob:|https?:|\/)/.test(value) ? value : api.getCoverUrl(cover, '160');
    };

    const recencyRank = () =>
        new Map(
            (recentActivityManager.getRecents().playlists || []).map((playlist, index) => [String(playlist.id), index])
        );

    const load = async () => {
        const [playlists, likedTracks, likedVideos, saveState] = await Promise.all([
            db.getPlaylists(true),
            db.getFavorites('track'),
            db.getFavorites('video'),
            ui.getTrackSaveState(trackType(), track.id),
        ]);
        const savedIds = new Set(saveState.playlistIds.map(String));
        const rank = recencyRank();
        const byRecency = [...playlists].sort((a, b) => {
            const rankA = rank.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER;
            const rankB = rank.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER;
            if (rankA !== rankB) return rankA - rankB;
            return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
        });
        const liked = {
            key: 'liked',
            name: 'Liked Songs',
            count: (trackType() === 'video' ? likedVideos : likedTracks).length,
            saved: saveState.isFavorite,
        };
        const items = byRecency.map((playlist) => ({
            key: `playlist:${playlist.id}`,
            id: String(playlist.id),
            name: playlistName(playlist),
            count: playlist.tracks?.length ?? playlist.numberOfTracks ?? 0,
            cover: coverUrl(playlist),
            saved: savedIds.has(String(playlist.id)),
        }));
        // Where the track already lives comes first; the order is frozen until the panel closes.
        const all = [liked, ...items];
        const savedAtOpen = new Set(all.filter((item) => item.saved).map((item) => item.key));
        order = [...all.filter((item) => item.saved), ...all.filter((item) => !item.saved)];
        return { all, savedAtOpen, byKey: new Map(all.map((item) => [item.key, item])) };
    };

    const statusText = () => {
        if (!data) return '';
        const saved = order.filter((item) => item.saved);
        if (saved.length === 0) return 'Not saved yet';
        if (saved.length === 1) return `Saved in ${saved[0].name}`;
        return `Saved in ${saved.length} places`;
    };

    const artHTML = (item) => {
        if (item.key === 'liked') {
            return `<span class="track-save-row-art track-save-row-art--liked" aria-hidden="true">${SVG_HEART_FILLED(18)}</span>`;
        }
        return `<span class="track-save-row-art" aria-hidden="true">${item.cover ? `<img src="${escapeHtml(item.cover)}" alt="" loading="lazy" decoding="async" />` : ''}</span>`;
    };

    const rowHTML = (item) => `
        <button type="button" class="track-save-row${item.saved ? ' is-saved' : ''}" data-key="${escapeHtml(item.key)}" role="checkbox" aria-checked="${item.saved}">
            ${artHTML(item)}
            <span class="track-save-row-copy">
                <span class="track-save-row-name">${escapeHtml(item.name)}</span>
                <span class="track-save-row-meta"><span class="track-save-row-count">${songs(item.count)}</span></span>
            </span>
            ${createTrackSaveIconHTML(item.saved, 20)}
        </button>
    `;

    const newPlaylistHTML = () => {
        const name = query.trim();
        return `
            <button type="button" class="track-save-row track-save-row--create">
                <span class="track-save-row-art track-save-row-art--create" aria-hidden="true">${SVG_PLUS(18)}</span>
                <span class="track-save-row-copy">
                    <span class="track-save-row-name">${name ? `New playlist “${escapeHtml(name)}”` : 'New playlist'}</span>
                    <span class="track-save-row-meta">Starts with this track</span>
                </span>
            </button>
        `;
    };

    const listHTML = () => {
        if (!data) {
            return `<p class="track-save-panel-note" role="status">Loading your playlists…</p>`;
        }
        const needle = query.trim().toLocaleLowerCase();
        if (needle) {
            const matches = order.filter((item) => item.name.toLocaleLowerCase().includes(needle));
            return `
                ${newPlaylistHTML()}
                ${
                    matches.length
                        ? `<div class="track-save-group" role="group" aria-label="Matching playlists">${matches.map(rowHTML).join('')}</div>`
                        : `<p class="track-save-panel-note">No playlist called “${escapeHtml(query.trim())}”.</p>`
                }
            `;
        }
        const savedItems = order.filter((item) => data.savedAtOpen.has(item.key));
        const otherItems = order.filter((item) => !data.savedAtOpen.has(item.key));
        const groups = [];
        if (savedItems.length) {
            groups.push(`
                <div class="track-save-group" role="group" aria-labelledby="track-save-group-saved">
                    <h4 class="track-save-group-label" id="track-save-group-saved">Saved in</h4>
                    ${savedItems.map(rowHTML).join('')}
                </div>
            `);
        }
        groups.push(`
            <div class="track-save-group" role="group" aria-labelledby="track-save-group-all">
                <h4 class="track-save-group-label" id="track-save-group-all">${savedItems.length ? 'Your playlists' : 'Save to'}</h4>
                ${otherItems.map(rowHTML).join('')}
            </div>
        `);
        const noPlaylists = data.all.length === 1;
        return `
            ${newPlaylistHTML()}
            ${groups.join('')}
            ${noPlaylists ? '<p class="track-save-panel-note">No playlists yet. Start one with this track.</p>' : ''}
        `;
    };

    const errorHTML = () => `
        <div class="track-save-panel-note track-save-panel-note--error" role="alert">
            <p>Your playlists didn’t load.</p>
            <button type="button" class="track-save-retry">Try again</button>
        </div>
    `;

    const renderShell = ({ failed = false } = {}) => {
        const title = track?.title || 'Current track';
        const artists = getTrackArtists(track || {}, { fallback: '' });
        const cover = trackCoverUrl();
        panel.setAttribute('aria-label', `Add “${title}” to a playlist`);
        panel.removeAttribute('aria-labelledby');
        panel.innerHTML = `
            <header class="track-save-panel-head">
                <span class="track-save-panel-cover" aria-hidden="true">${cover ? `<img src="${escapeHtml(cover)}" alt="" />` : ''}</span>
                <span class="track-save-panel-track">
                    <span class="track-save-panel-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
                    ${artists ? `<span class="track-save-panel-artist">${escapeHtml(artists)}</span>` : ''}
                </span>
            </header>
            <label class="track-save-search">
                <span class="track-save-search-icon" aria-hidden="true">${SVG_SEARCH(16)}</span>
                <input type="search" value="${escapeHtml(query)}" placeholder="Find a playlist" aria-label="Find a playlist" autocomplete="off" spellcheck="false" />
                <button type="button" class="track-save-search-clear" aria-label="Clear search"${query ? '' : ' hidden'}>${SVG_CLOSE(14)}</button>
            </label>
            <div class="track-save-panel-list">${failed ? errorHTML() : listHTML()}</div>
            <footer class="track-save-panel-foot">
                <span class="track-save-panel-status" role="status" aria-live="polite">${statusText()}</span>
                <button type="button" class="track-save-panel-done" data-dismiss="modal">Done</button>
            </footer>
        `;
    };

    // Typing re-renders only the list, so the input keeps focus, caret and IME state.
    const renderList = () => {
        const list = panel.querySelector('.track-save-panel-list');
        if (list) list.innerHTML = listHTML();
        panel.querySelector('.track-save-search-clear')?.toggleAttribute('hidden', !query);
    };

    const updateStatus = () => {
        const status = panel.querySelector('.track-save-panel-status');
        if (status) status.textContent = statusText();
    };

    const position = () => {
        const anchor = rectOf(trigger);
        if (isSheet()) {
            panel.style.left = '0px';
            panel.style.top = '';
            panel.style.width = '';
            panel.style.maxHeight = '';
            panel.dataset.placement = 'sheet';
            return true;
        }
        if (!anchor) return false;
        const gutter = 12;
        const width = Math.min(340, window.innerWidth - gutter * 2);
        panel.style.width = `${width}px`;
        panel.style.maxHeight = `${Math.min(480, window.innerHeight - gutter * 2)}px`;
        const height = panel.offsetHeight;
        const left = Math.min(Math.max(gutter, anchor.right - width), window.innerWidth - width - gutter);
        const above = anchor.top - height - 8 >= gutter;
        let top = above ? anchor.top - height - 8 : anchor.bottom + 8;
        top = Math.min(Math.max(gutter, top), window.innerHeight - height - gutter);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.dataset.placement = above ? 'above' : 'below';
        // Grow out of the button that opened it.
        const originX = Math.min(Math.max(anchor.left + anchor.width / 2 - left, 0), width);
        panel.style.transformOrigin = `${originX}px ${above ? '100%' : '0%'}`;
        return true;
    };

    const staggerRows = () => {
        if (reduceMotion()) return;
        const list = panel.querySelector('.track-save-panel-list');
        if (!list) return;
        // Only what is on screen enters; the delay caps so lower rows never land before upper ones.
        const visibleEnd = list.getBoundingClientRect().bottom;
        const rows = [...list.querySelectorAll(':scope > *, .track-save-group > *')].filter(
            (row) => !row.matches('.track-save-group') && row.getBoundingClientRect().top < visibleEnd
        );
        rows.forEach((row, index) => {
            row.animate(
                [
                    { opacity: 0, transform: 'translateY(4px)' },
                    { opacity: 1, transform: 'none' },
                ],
                {
                    duration: 220,
                    delay: 50 + Math.min(index, STAGGER_CAP) * 22,
                    easing: EASE_OUT,
                    fill: 'backwards',
                }
            );
        });
    };

    const playOpen = () => {
        motion?.cancel();
        if (reduceMotion()) return;
        const sheet = panel.dataset.placement === 'sheet';
        motion = panel.animate(
            sheet
                ? [SHEET_HIDDEN, SHEET_SHOWN]
                : [
                      { opacity: 0, transform: 'scale(0.96)' },
                      { opacity: 1, transform: 'scale(1)' },
                  ],
            { duration: sheet ? 380 : 200, easing: sheet ? EASE_DRAWER : EASE_OUT }
        );
        staggerRows();
    };

    const focusSearch = () => {
        // On touch, focusing would throw the keyboard over the list the user came to tap.
        if (window.matchMedia('(pointer: fine)').matches) {
            panel.querySelector('.track-save-search input')?.focus({ preventScroll: true });
        } else {
            panel.focus({ preventScroll: true });
        }
    };

    const close = ({ restoreFocus = false } = {}) => {
        if (panel.hidden || panel.classList.contains('is-closing')) return;
        const run = ++openRun;
        trigger?.setAttribute('aria-expanded', 'false');
        trigger?.classList.remove('is-floating-panel-open');
        const finish = () => {
            if (run !== openRun) return;
            panel.hidden = true;
            panel.classList.remove('is-open', 'is-closing');
            // The exit holds its last frame (fill: forwards); drop it or the next open stays invisible.
            motion?.cancel();
            motion = null;
            if (restoreFocus) trigger?.focus({ preventScroll: true });
        };
        motion?.cancel();
        if (reduceMotion()) {
            finish();
            return;
        }
        panel.classList.add('is-closing');
        const sheet = panel.dataset.placement === 'sheet';
        motion = panel.animate(
            sheet
                ? [SHEET_SHOWN, SHEET_HIDDEN]
                : [
                      { opacity: 1, transform: 'scale(1)' },
                      { opacity: 0, transform: 'scale(0.97)' },
                  ],
            { duration: sheet ? 240 : 140, easing: sheet ? EASE_DRAWER : EASE_OUT, fill: 'forwards' }
        );
        void motion.finished.then(finish).catch(() => {});
    };

    const show = () => {
        panel.classList.remove('is-closing');
        panel.hidden = false;
        if (!position()) {
            panel.hidden = true;
            return false;
        }
        panel.classList.add('is-open');
        trigger.classList.add('is-floating-panel-open');
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-expanded', 'true');
        return true;
    };

    const open = async (nextTrack, nextTrigger) => {
        const run = ++openRun;
        if (trigger && trigger !== nextTrigger) {
            trigger.classList.remove('is-floating-panel-open');
            trigger.setAttribute('aria-expanded', 'false');
        }
        motion?.cancel();
        track = nextTrack;
        trigger = nextTrigger;
        query = '';
        data = null;
        busy.clear();

        const loading = load();
        // IndexedDB answers in a few ms; only a slow load shows the loading line first.
        const early = await Promise.race([
            loading.then(
                () => 'ready',
                () => 'failed'
            ),
            new Promise((resolve) => window.setTimeout(() => resolve('slow'), LOADING_DELAY)),
        ]);
        if (run !== openRun) return;

        if (early === 'slow') {
            renderShell();
            if (!show()) return;
            playOpen();
            focusSearch();
        }

        try {
            data = await loading;
        } catch (error) {
            console.error('[track-save-panel] could not load playlists', error);
            if (run !== openRun) return;
            renderShell({ failed: true });
            if (early !== 'slow' && show()) playOpen();
            else position();
            return;
        }
        if (run !== openRun) return;

        if (early === 'slow') {
            const typed = panel.querySelector('.track-save-search input')?.value ?? '';
            query = typed;
            renderList();
            updateStatus();
            position();
            staggerRows();
            return;
        }
        renderShell();
        if (!show()) return;
        playOpen();
        focusSearch();
    };

    const rollCount = (row, count) => {
        const counter = row.querySelector('.track-save-row-count');
        if (!counter) return;
        counter.textContent = songs(count);
        if (reduceMotion()) return;
        counter.animate(
            [
                { opacity: 0, transform: 'translateY(45%)' },
                { opacity: 1, transform: 'none' },
            ],
            {
                duration: 200,
                easing: EASE_OUT,
            }
        );
    };

    const paintRow = (row, item, { animate }) => {
        row.classList.toggle('is-saved', item.saved);
        row.setAttribute('aria-checked', String(item.saved));
        setTrackSaveIconState(row.querySelector('.track-save-icon'), item.saved, { animate });
        rollCount(row, item.count);
    };

    const syncRows = (item, { animate }) => {
        panel.querySelectorAll(`.track-save-row[data-key="${CSS.escape(item.key)}"]`).forEach((row) => {
            paintRow(row, item, { animate });
        });
        updateStatus();
    };

    const toggle = async (row) => {
        const item = data?.byKey.get(row.dataset.key);
        if (!item || !track || busy.has(item.key)) return;
        busy.add(item.key);
        row.setAttribute('aria-busy', 'true');
        const subject = track;
        const type = trackType();
        const wasSaved = item.saved;

        // Optimistic: the row answers at once and rolls back if the write fails.
        item.saved = !wasSaved;
        item.count = Math.max(0, item.count + (item.saved ? 1 : -1));
        syncRows(item, { animate: true });

        try {
            if (item.key === 'liked') {
                const added = await db.toggleFavorite(type, subject);
                await syncManager.syncLibraryItem(type, subject, added);
            } else {
                if (wasSaved) await db.removeTrackFromPlaylist(item.id, subject.id, type);
                else await db.addTrackToPlaylist(item.id, subject);
                const updated = await db.getPlaylist(item.id);
                await syncManager.syncUserPlaylist(updated, 'update');
            }
            await ui.refreshTrackSaveButtons(type, subject.id, { animate: true });
        } catch (error) {
            console.error('[track-save-panel] save failed', error);
            item.saved = wasSaved;
            item.count = Math.max(0, item.count + (wasSaved ? 1 : -1));
            if (track === subject) syncRows(item, { animate: true });
            showNotification(`Couldn’t update ${item.name}. Try again.`);
        } finally {
            busy.delete(item.key);
            row.removeAttribute('aria-busy');
        }
    };

    const resolveTrack = (button) => {
        if (
            button.id === 'now-playing-like-btn' ||
            button.id === 'fs-like-btn' ||
            button.classList.contains('now-playing-panel-save')
        )
            return player.currentTrack;
        const queueItem = button.closest('.queue-track-row');
        if (queueItem) return player.getCurrentQueue()[Number(queueItem.dataset.queueIndex)];
        const itemElement = button.closest('.track-item, .card');
        return trackDataStore.get(itemElement) || trackDataStore.get(button) || null;
    };

    const removeFromSourcePlaylist = async (button, item) => {
        const playlistId = button.dataset.sourcePlaylistId;
        if (!playlistId) return false;
        const type = item.type === 'video' ? 'video' : 'track';
        await db.removeTrackFromPlaylist(playlistId, item.id, type);
        const updatedPlaylist = await db.getPlaylist(playlistId);
        await syncManager.syncUserPlaylist(updatedPlaylist, 'update');
        showNotification(`Removed from playlist: ${updatedPlaylist.name}`);
        await ui.renderPlaylistPage(playlistId, 'user');
        return true;
    };

    const openCreatePlaylist = () => {
        const createModal = document.getElementById('playlist-modal');
        if (!createModal || !track) return;
        document.getElementById('playlist-modal-title').textContent = 'Create Playlist';
        document.getElementById('playlist-name-input').value = query.trim();
        document.getElementById('playlist-cover-input').value = '';
        document.getElementById('playlist-cover-file-input').value = '';
        document.getElementById('playlist-description-input').value = '';
        createModal.dataset.editingId = '';
        document.getElementById('import-section').style.display = 'none';
        createModal._pendingTracks = [track];
        createModal.classList.add('active');
        document.getElementById('playlist-name-input').focus();
    };

    document.addEventListener(
        'contextmenu',
        async (event) => {
            const button = event.target.closest('.track-save-btn');
            if (!button) return;
            const item = resolveTrack(button);
            if (!item) return;
            event.preventDefault();
            event.stopImmediatePropagation();

            const type = item.type === 'video' ? 'video' : 'track';
            if (await db.isFavorite(type, item.id)) {
                if (await removeFromSourcePlaylist(button, item)) return;
                await handleTrackAction('toggle-like', item, player, api, null, type, ui, null);
                return;
            }
            void open(item, button);
        },
        true
    );

    document.addEventListener('track-save-panel-open', (event) => {
        const button = event.detail?.button;
        const item = button && resolveTrack(button);
        if (item) void open(item, button);
    });

    panel.addEventListener('input', (event) => {
        if (!event.target.matches('.track-save-search input')) return;
        query = event.target.value;
        renderList();
    });

    panel.addEventListener('click', (event) => {
        if (event.target.closest('.track-save-panel-done')) {
            close({ restoreFocus: true });
            return;
        }
        if (event.target.closest('.track-save-search-clear')) {
            query = '';
            const input = panel.querySelector('.track-save-search input');
            if (input) input.value = '';
            renderList();
            input?.focus({ preventScroll: true });
            return;
        }
        if (event.target.closest('.track-save-retry')) {
            if (track && trigger) void open(track, trigger);
            return;
        }
        if (event.target.closest('.track-save-row--create')) {
            openCreatePlaylist();
            close();
            return;
        }
        const row = event.target.closest('.track-save-row[data-key]');
        if (row) void toggle(row);
    });

    // Tab trapping and Escape belong to keyboard-navigation.js, which handles every aria-modal
    // dialog (Escape clicks the [data-dismiss] Done button). Arrows walk search → rows.
    panel.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const stops = [panel.querySelector('.track-save-search input'), ...panel.querySelectorAll('.track-save-row')];
        const at = stops.indexOf(document.activeElement);
        if (at === -1) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        stops[Math.min(Math.max(at + step, 0), stops.length - 1)]?.focus();
    });

    document.addEventListener('pointerdown', (event) => {
        if (panel.hidden || panel.contains(event.target) || trigger?.contains(event.target)) return;
        close();
    });
    window.addEventListener('resize', () => {
        if (!panel.hidden && !panel.classList.contains('is-closing')) position();
    });
}
