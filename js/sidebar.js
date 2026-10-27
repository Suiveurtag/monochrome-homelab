// Sidebar: active-tab indicator, collapse toggle and the Recents shelf (pinned items + recently played sources).
import { db } from './db.js';
import { SVG_HEART_FILLED, SVG_PIN } from './icons.js';
import { sidebarSectionSettings, sidebarSettings } from './storage.js';
import { escapeHtml } from './utils.js';

const RECENTS_KEY = 'monochrome-sidebar-recents';
const VIEW_KEY = 'monochrome-sidebar-library-view';
const RECENTS_HIDDEN_KEY = 'monochrome-sidebar-recents-hidden';
const MAX_RECENTS = 30;
const RECENT_KINDS = new Set(['album', 'playlist', 'artist', 'liked']);
const KIND_LABELS = { album: 'Album', playlist: 'Playlist', artist: 'Artist', liked: 'Playlist' };
const FILTER_LABELS = { playlist: 'playlists', album: 'albums', artist: 'artists' };
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_SETTLE = 'cubic-bezier(0.16, 1, 0.3, 1)';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let player = null;
let api = null;
let renderToken = 0;
let entriesByKey = new Map();

function readJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage full or blocked: Recents simply stop updating.
    }
}

// Pinned items keep their own types ('user-playlist'); the shelf files them under the same filters as recents.
const kindOf = (type) => (type === 'user-playlist' || type === 'mix' ? 'playlist' : type);
const sourceKey = (source) => `${source.kind}:${source.id ?? source.href}`;

function getView() {
    const view = readJson(VIEW_KEY, {});
    return {
        filter: FILTER_LABELS[view.filter] ? view.filter : null,
        sort: view.sort === 'name' ? 'name' : 'recent',
    };
}

/** Puts the source that started playback at the top of Recents. Returns false when nothing changed. */
export function recordRecent(source, track) {
    if (!source?.href || !RECENT_KINDS.has(source.kind)) return false;
    const key = sourceKey(source);
    const recents = readJson(RECENTS_KEY, []);
    if (recents[0]?.key === key) return false;

    const artistPicture =
        source.kind === 'artist'
            ? track?.artists?.find((artist) => String(artist.id) === String(source.id))?.picture
            : null;
    const entry = {
        key,
        kind: source.kind,
        id: source.id,
        title: source.label,
        href: source.href,
        cover: source.cover ?? artistPicture ?? (source.kind === 'artist' ? null : track?.album?.cover) ?? null,
        images: source.images,
    };
    writeJson(RECENTS_KEY, [entry, ...recents.filter((recent) => recent.key !== key)].slice(0, MAX_RECENTS));
    return true;
}

async function getEntries({ filter, sort }) {
    const pinned = (await db.getPinned()).map((item) => ({
        key: `${kindOf(item.type)}:${item.id}`,
        kind: kindOf(item.type),
        pinType: item.type,
        id: item.id,
        title: item.name,
        href: item.href,
        cover: item.cover,
        images: item.images,
        pinned: true,
    }));
    const pinnedKeys = new Set(pinned.map((item) => item.key));
    const recents = readJson(RECENTS_KEY, []).filter((item) => !pinnedKeys.has(item.key));

    const byName = (a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' });
    const groups = sort === 'name' ? [pinned.sort(byName), recents.sort(byName)] : [pinned, recents];
    return groups.flat().filter((item) => !filter || item.kind === filter || (filter === 'playlist' && item.kind === 'liked'));
}

function artHtml(entry) {
    if (entry.kind === 'liked') {
        return `<span class="sidebar-library-art is-liked">${SVG_HEART_FILLED(16)}</span>`;
    }
    if (!entry.cover && entry.images?.length) {
        const tiles = entry.images
            .slice(0, 4)
            .map((src) => `<img src="${escapeHtml(api.getCoverUrl(src, '80'))}" alt="" loading="lazy">`)
            .join('');
        return `<span class="sidebar-library-art is-collage">${tiles}</span>`;
    }
    if (!entry.cover) {
        return `<span class="sidebar-library-art is-empty">${escapeHtml(String(entry.title || '').trim().charAt(0))}</span>`;
    }
    const isArtist = entry.kind === 'artist';
    const src = isArtist ? api.getArtistPictureUrl(entry.cover, '160') : api.getCoverUrl(entry.cover, '160');
    return `<span class="sidebar-library-art${isArtist ? ' is-artist' : ''}"><img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async"></span>`;
}

function rowHtml(entry) {
    const title = escapeHtml(entry.title || '');
    const pinAction = entry.pinned ? 'Unpin' : 'Pin';
    const pinButton =
        entry.kind === 'liked'
            ? ''
            : `<button type="button" class="sidebar-library-pin" aria-pressed="${entry.pinned}" aria-label="${pinAction} ${title}" title="${pinAction}">${SVG_PIN(14)}</button>`;
    return `<li class="sidebar-library-item${entry.pinned ? ' is-pinned' : ''}" data-key="${escapeHtml(entry.key)}">
        <a class="sidebar-library-link" href="${escapeHtml(entry.href)}" title="${title}">
            ${artHtml(entry)}
            <span class="sidebar-library-text">
                <span class="sidebar-library-title">${title}</span>
                <span class="sidebar-library-meta">${entry.pinned ? `<span class="sidebar-library-pinned">${SVG_PIN(11)}<span class="sr-only">Pinned</span></span>` : ''}${KIND_LABELS[entry.kind]}</span>
            </span>
            <span class="sidebar-library-eq" aria-hidden="true"><i></i><i></i><i></i></span>
        </a>
        ${pinButton}
    </li>`;
}

function markCurrent() {
    const source = player?.sourceContext;
    const key = source && RECENT_KINDS.has(source.kind) ? sourceKey(source) : null;
    document.querySelectorAll('.sidebar-library-item').forEach((item) => {
        item.classList.toggle('is-current', item.dataset.key === key);
    });
}

/** Re-renders the Recents shelf. Rows that survive slide to their new place; new rows cascade in. */
export async function renderSidebarLibrary({ cascade = false, toggledKey = null } = {}) {
    const list = document.getElementById('sidebar-library-list');
    const empty = document.getElementById('sidebar-library-empty');
    if (!list || !api) return;

    const token = ++renderToken;
    const view = getView();
    const entries = await getEntries(view);
    if (token !== renderToken) return;

    const before = new Map([...list.children].map((item) => [item.dataset.key, item.getBoundingClientRect().top]));
    entriesByKey = new Map(entries.map((entry) => [entry.key, entry]));
    list.innerHTML = entries.map(rowHtml).join('');
    markCurrent();

    empty.hidden = entries.length > 0;
    empty.textContent = view.filter
        ? `No ${FILTER_LABELS[view.filter]} in Recents yet.`
        : 'Play an album, playlist or artist and it shows up here.';

    list.querySelector(`[data-key="${CSS.escape(toggledKey ?? '')}"]`)?.classList.add('is-just-toggled');
    if (reducedMotion.matches) return;
    let entering = 0;
    [...list.children].forEach((item) => {
        const top = before.get(item.dataset.key);
        if (cascade || top === undefined) {
            item.animate(
                [
                    { opacity: 0, transform: 'translateY(-6px)', filter: 'blur(3px)' },
                    { opacity: 1, transform: 'none', filter: 'blur(0)' },
                ],
                { duration: 220, delay: Math.min(entering++, 10) * 35, easing: EASE_OUT, fill: 'backwards' }
            );
            return;
        }
        const offset = top - item.getBoundingClientRect().top;
        if (offset) {
            item.animate([{ transform: `translateY(${offset}px)` }, { transform: 'none' }], {
                duration: 380,
                easing: EASE_SETTLE,
            });
        }
    });
}

function syncFilters() {
    const { filter } = getView();
    const group = document.querySelector('.sidebar-library-filters');
    const pill = group?.querySelector('.sidebar-library-filter-pill');
    let active = null;
    group?.querySelectorAll('button[data-filter]').forEach((button) => {
        const on = button.dataset.filter === filter;
        button.setAttribute('aria-pressed', String(on));
        if (on) active = button;
    });
    if (pill) {
        pill.classList.toggle('is-visible', Boolean(active));
        if (active) {
            pill.style.width = `${active.offsetWidth}px`;
            pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
        }
    }

}

function syncRecentsHidden() {
    const hidden = readJson(RECENTS_HIDDEN_KEY, false) === true;
    document.querySelector('.sidebar-library')?.classList.toggle('is-hidden', hidden);
    const toggle = document.getElementById('sidebar-library-hide');
    if (!toggle) return;
    const label = hidden ? 'Show Recents' : 'Hide Recents';
    toggle.setAttribute('aria-expanded', String(!hidden));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
}

function setView(patch, renderOptions) {
    writeJson(VIEW_KEY, { ...getView(), ...patch });
    syncFilters();
    void renderSidebarLibrary(renderOptions);
}

// One pill per nav list slides to the active link; it fades out when the current page lives elsewhere.
function initNavIndicators() {
    document.querySelectorAll('.sidebar-nav').forEach((nav) => {
        const indicator = document.createElement('span');
        indicator.className = 'sidebar-nav-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        nav.prepend(indicator);

        let frame = 0;
        const sync = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const link = [...nav.querySelectorAll('a.active')].find((a) => a.offsetParent !== null);
                // The pill only slides between links; showing up from nowhere is a fade in place.
                indicator.classList.toggle('is-instant', !indicator.classList.contains('is-visible'));
                indicator.classList.toggle('is-visible', Boolean(link));
                if (!link) return;
                const top = link.getBoundingClientRect().top - nav.getBoundingClientRect().top - nav.clientTop;
                indicator.style.transform = `translateY(${top}px)`;
                indicator.style.height = `${link.offsetHeight}px`;
            });
        };
        new MutationObserver(sync).observe(nav, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden'],
        });
        sync();
    });
}

function syncToggle() {
    const toggle = document.getElementById('sidebar-toggle');
    if (!toggle) return;
    const collapsed = document.body.classList.contains('sidebar-collapsed');
    const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
}

export function initSidebar(playerInstance, apiInstance) {
    player = playerInstance;
    api = apiInstance;

    syncToggle();
    sidebarSectionSettings.applyAccentActive();
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        sidebarSettings.setCollapsed(collapsed);
        syncToggle();
        const motion = collapsed ? 'sidebar-collapsing' : 'sidebar-expanding';
        document.body.classList.add(motion);
        setTimeout(() => document.body.classList.remove(motion), 800);
    });

    initNavIndicators();

    const filters = document.querySelector('.sidebar-library-filters');
    // Chip offsets change when the sidebar collapses, resizes or its font loads.
    if (filters) new ResizeObserver(syncFilters).observe(filters);
    filters?.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-filter]');
        if (!button) return;
        // Chips toggle: pressing the active one shows everything again.
        const filter = button.dataset.filter === getView().filter ? null : button.dataset.filter;
        setView({ filter }, { cascade: true });
    });

    document.getElementById('sidebar-library-hide')?.addEventListener('click', () => {
        writeJson(RECENTS_HIDDEN_KEY, !readJson(RECENTS_HIDDEN_KEY, false));
        syncRecentsHidden();
    });
    syncRecentsHidden();

    document.getElementById('sidebar-library-list')?.addEventListener('click', async (event) => {
        const button = event.target.closest('.sidebar-library-pin');
        if (!button) return;
        event.preventDefault();
        const entry = entriesByKey.get(button.closest('.sidebar-library-item')?.dataset.key);
        if (!entry) return;
        const item = {
            id: entry.id,
            title: entry.title,
            name: entry.title,
            cover: entry.cover,
            picture: entry.cover,
            image: entry.cover,
            images: entry.images,
        };
        await db.togglePinned(item, entry.pinType ?? entry.kind);
        await renderSidebarLibrary({ toggledKey: entry.key });
    });

    window.addEventListener('player-track-changed', (event) => {
        if (recordRecent(player?.sourceContext, event.detail?.track)) void renderSidebarLibrary();
        else markCurrent();
    });

    // A queue restored from the last session counts as the latest source.
    recordRecent(player?.sourceContext, player?.currentTrack);
    syncFilters();
    // The shelf's first paint is the sidebar's one orchestrated moment: rows cascade in.
    void renderSidebarLibrary({ cascade: true });
}
