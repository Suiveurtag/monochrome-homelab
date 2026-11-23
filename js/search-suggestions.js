// Vanilla port of beui's morphing-search-chips suggestion panel: recents, then live library matches
// (songs, artists, albums) ranked by relevance and by how much the instance streams them.
import { SVG_CLOCK, SVG_CLOSE, SVG_SEARCH } from './icons.js';
import { escapeHtml } from './utils.js';
import { highlightRanges, normalizeSearchText } from './search-engine.js';

const STORAGE_KEY = 'search-history';
const MAX_RECENT_MATCHES = 3;
const MAX_RECENTS = 6;
const LIMITS = { tracks: 10, albums: 3, artists: 3, playlists: 0 };
const SHOWN = { tracks: 4, albums: 3, artists: 3 };
// The glass starts as a small pill tucked behind the bar and springs out to the content size.
const SEED = { width: 112, height: 40, tuck: 28 };

const readRecents = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
};
const writeRecents = (list) => localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

function highlight(text, query) {
    const value = String(text ?? '');
    const ranges = query ? highlightRanges(value, query) : [];
    if (!ranges.length) return escapeHtml(value);
    let html = '';
    let at = 0;
    for (const [start, end] of ranges) {
        html += `${escapeHtml(value.slice(at, start))}<span class="sh-match">${escapeHtml(value.slice(start, end))}</span>`;
        at = end;
    }
    return html + escapeHtml(value.slice(at));
}

const formatPlays = (n) => {
    if (!n) return '';
    const value = n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);
    return `${value} ${n === 1 ? 'play' : 'plays'}`;
};

const artistLine = (item) =>
    (item.artists?.length ? item.artists : [item.artist])
        .map((a) => a?.name)
        .filter(Boolean)
        .join(', ');

const yearOf = (date) => String(date || '').match(/\d{4}/)?.[0] || '';

function trackRow(result, kind = 'track') {
    const { item } = result;
    return {
        id: `track:${item.id}`,
        kind,
        entity: 'track',
        entityId: item.id,
        label: item.title,
        image: item.album?.cover || item.cover,
        lyric: result.field === 'lyrics' ? result.lyric : null,
        sub: [
            kind === 'popular' ? null : 'Song',
            artistLine(item),
            kind === 'popular' ? formatPlays(result.streams) : null,
        ]
            .filter(Boolean)
            .join(' · '),
    };
}

function albumRow({ item }) {
    return {
        id: `album:${item.id}`,
        kind: 'album',
        entity: 'album',
        entityId: item.id,
        label: item.title,
        image: item.cover,
        sub: ['Album', item.artist?.name, yearOf(item.releaseDate)].filter(Boolean).join(' · '),
    };
}

function artistRow({ item }) {
    return {
        id: `artist:${item.id}`,
        kind: 'artist',
        entity: 'artist',
        entityId: item.id,
        label: item.name,
        image: item.picture,
        round: true,
        sub: 'Artist',
    };
}

/** One row per version group: the best-ranked cut stands in for its alternatives. */
function distinctTracks(results) {
    const seen = new Set();
    return results.filter(({ item }) => {
        const key = item.versionGroupId || item.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function entitySections(found) {
    if (!found) return [];
    const groups = [
        { key: 'tracks', title: 'Songs', results: distinctTracks(found.tracks).slice(0, SHOWN.tracks), row: trackRow },
        { key: 'artists', title: 'Artists', results: found.artists.slice(0, SHOWN.artists), row: artistRow },
        { key: 'albums', title: 'Albums', results: found.albums.slice(0, SHOWN.albums), row: albumRow },
    ].filter((g) => g.results.length);
    // The group holding the strongest match leads, so typing an artist's name surfaces the artist first.
    // On a tie (a song matched through its artist), the artist itself wins.
    const lead = { artists: 1, tracks: 0.5, albums: 0 };
    groups.sort((a, b) => b.results[0].relevance + lead[b.key] - (a.results[0].relevance + lead[a.key]));
    return groups.map((g) => ({ key: g.key, title: g.title, rows: g.results.map((r) => g.row(r)) }));
}

const isRelated = (a, b) => {
    const x = normalizeSearchText(a);
    const y = normalizeSearchText(b);
    return x && y && (x.startsWith(y) || y.startsWith(x));
};

export function initSearchSuggestions({ input, form, panel, provider = null, onPick = null }) {
    panel.innerHTML = `
        <div class="sh-glass" aria-hidden="true"></div>
        <div class="sh-content"><div class="sh-rows"></div></div>`;
    const glass = panel.querySelector('.sh-glass');
    const content = panel.querySelector('.sh-content');
    const rowsEl = panel.querySelector('.sh-rows');
    const listId = 'search-suggestions-list';

    let open = false;
    let rows = [];
    let sections = [];
    let cursor = null; // { id, query }: row id stamped with the query it was placed under
    let hideTimer;
    let found = null; // { query, data } latest library matches
    let popular = [];
    let requestSeq = 0;
    let renderedIds = new Set();

    const trimmed = () => input.value.trim();

    const requestMatches = () => {
        const q = trimmed();
        if (!provider || !q) return;
        if (found?.query === q) return;
        const seq = ++requestSeq;
        Promise.resolve()
            .then(() => provider.suggest(q, LIMITS))
            .then((data) => {
                if (seq !== requestSeq || trimmed() !== q) return;
                found = { query: q, data };
                if (open) render();
                else show();
            })
            .catch((error) => console.warn('[Search] Suggestions unavailable:', error));
    };

    const requestPopular = () => {
        if (!provider?.popular) return;
        Promise.resolve()
            .then(() => provider.popular(4))
            .then((list) => {
                popular = list || [];
                if (open && !trimmed()) render();
                else if (!open && !trimmed() && document.activeElement === input && popular.length) show();
            })
            .catch(() => {});
    };

    const buildSections = () => {
        const recents = readRecents();
        const q = trimmed();
        if (!q) {
            const list = [];
            if (recents.length) {
                list.push({
                    key: 'recent',
                    title: 'Recent',
                    clear: true,
                    rows: recents
                        .slice(0, MAX_RECENTS)
                        .map((term) => ({ id: `recent:${term}`, label: term, kind: 'recent' })),
                });
            }
            if (popular.length) {
                list.push({
                    key: 'popular',
                    title: 'Most played here',
                    rows: popular.map((result) => trackRow(result, 'popular')),
                });
            }
            return list;
        }
        const matches = recents
            .filter((term) => term.toLowerCase() !== q.toLowerCase() && isRelated(term, q))
            .slice(0, MAX_RECENT_MATCHES)
            .map((term) => ({ id: `recent:${term}`, label: term, kind: 'recent' }));
        // Keep the previous matches on screen while the next keystroke resolves, if they are still related.
        const shown = found && isRelated(found.query, q) ? found.data : null;
        return [
            { key: 'query', rows: [{ id: `query:${q}`, label: q, kind: 'query' }, ...matches] },
            ...entitySections(shown),
        ];
    };

    const activeIndex = () => {
        if (!cursor || cursor.query !== trimmed()) return 0;
        const i = rows.findIndex((r) => r.id === cursor.id);
        return i < 0 ? 0 : i;
    };

    const syncActive = () => {
        const idx = activeIndex();
        const els = rowsEl.querySelectorAll('.sh-row');
        els.forEach((el, i) => el.setAttribute('aria-selected', String(i === idx)));
        const el = els[idx];
        const bar = rowsEl.querySelector('.sh-active');
        if (el && bar) {
            bar.style.transform = `translateY(${el.offsetTop}px)`;
            bar.style.height = `${el.offsetHeight}px`;
            bar.classList.toggle('is-round', el.classList.contains('sh-row--media'));
            el.scrollIntoView({ block: 'nearest' });
            input.setAttribute('aria-activedescendant', el.id);
        } else input.removeAttribute('aria-activedescendant');
    };

    const size = () => {
        glass.style.width = `${content.offsetWidth}px`;
        glass.style.height = `${content.offsetHeight}px`;
    };

    const rowHtml = (row, i, q, entering) => {
        const attrs = `class="sh-row${row.entity ? ' sh-row--media' : ''}${entering ? ' is-entering' : ''}" style="--i:${entering}" id="${listId}-${i}" role="option" data-id="${escapeHtml(row.id)}" data-label="${escapeHtml(row.label)}"`;
        if (!row.entity) {
            return `<div ${attrs}>
                <span class="sh-icon">${row.kind === 'recent' ? SVG_CLOCK(16) : SVG_SEARCH(16)}</span>
                <span class="sh-label">${row.kind === 'query' ? escapeHtml(row.label) : highlight(row.label, q)}</span>
                ${row.kind === 'recent' ? `<span class="sh-remove" aria-hidden="true">${SVG_CLOSE(14)}</span>` : ''}
            </div>`;
        }
        const sub = row.lyric
            ? `<span class="sh-sub sh-sub--lyric">“${highlight(row.lyric, q)}”</span>`
            : `<span class="sh-sub">${escapeHtml(row.sub)}</span>`;
        return `<div ${attrs}>
            <span class="sh-thumb${row.round ? ' is-round' : ''}">${
                row.image ? `<img src="${escapeHtml(row.image)}" alt="" loading="lazy" decoding="async" />` : ''
            }</span>
            <span class="sh-text">
                <span class="sh-label">${highlight(row.label, q)}</span>
                ${sub}
            </span>
        </div>`;
    };

    const render = () => {
        sections = buildSections();
        rows = sections.flatMap((s) => s.rows);
        const q = trimmed();
        let index = 0;
        let stagger = 0;
        const nextIds = new Set();
        const body = sections
            .map((section) => {
                const title = section.title
                    ? `<div class="sh-group-title" aria-hidden="true"><span>${escapeHtml(section.title)}</span>${
                          section.clear ? '<button type="button" class="sh-clear" tabindex="-1">Clear</button>' : ''
                      }</div>`
                    : '';
                const items = section.rows
                    .map((row) => {
                        nextIds.add(row.id);
                        const entering = row.entity && !renderedIds.has(row.id) ? ++stagger : 0;
                        return rowHtml(row, index++, q, entering);
                    })
                    .join('');
                return `<div class="sh-group" role="group"${
                    section.title ? ` aria-label="${escapeHtml(section.title)}"` : ''
                }>${title}${items}</div>`;
            })
            .join('');
        renderedIds = nextIds;
        rowsEl.innerHTML = rows.length
            ? `<div id="${listId}" role="listbox" aria-label="${q ? 'Suggestions' : 'Recent searches'}" class="sh-list"><span class="sh-active"></span>${body}</div>`
            : '';
        // Cached artwork appears at once; only artwork still downloading fades in.
        rowsEl.querySelectorAll('.sh-thumb img').forEach((img) => {
            if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
        });
        input.setAttribute('aria-controls', listId);
        if (rows.length) syncActive();
        // Nothing to show: the bar still widens, the panel stays shut.
        if (!rows.length) hide();
        else if (open) size();
    };

    const show = () => {
        if (!buildSections().some((s) => s.rows.length)) {
            requestMatches();
            return hide();
        }
        clearTimeout(hideTimer);
        if (!open) {
            open = true;
            cursor = null;
            renderedIds = new Set();
            panel.hidden = false;
            panel.classList.remove('is-open');
            glass.style.transition = 'none';
            render();
            glass.style.opacity = '0';
            glass.style.width = `${SEED.width}px`;
            glass.style.height = `${SEED.height}px`;
            glass.style.transform = `translateX(-50%) translateY(-${SEED.tuck}px)`;
            void glass.offsetWidth; // commit the seed before animating out of it
            glass.style.transition = '';
            panel.classList.add('is-open');
            glass.style.opacity = '1';
            glass.style.transform = 'translateX(-50%)';
            size();
        } else render();
        input.setAttribute('aria-expanded', 'true');
        requestMatches();
    };

    function hide() {
        if (!open) return;
        open = false;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        panel.classList.remove('is-open');
        glass.style.opacity = '0';
        glass.style.width = `${SEED.width}px`;
        glass.style.height = `${SEED.height}px`;
        glass.style.transform = `translateX(-50%) translateY(-${SEED.tuck}px)`;
        hideTimer = setTimeout(() => (panel.hidden = true), 220);
    }

    const select = (label) => {
        input.value = label;
        // No input event: the app's debounced search would navigate a second time.
        form.querySelector('.search-clear-btn')?.style.setProperty('display', 'flex');
        hide();
        form.requestSubmit();
    };

    const activate = (row) => {
        if (!row) return;
        if (!row.entity || !onPick) return select(row.label);
        const query = trimmed();
        hide();
        input.blur();
        onPick({ type: row.entity, id: row.entityId, label: row.label, query });
    };

    const removeRecent = (term, row) => {
        writeRecents(readRecents().filter((r) => r !== term));
        if (!row) return render();

        row.classList.add('is-removing');
        const finishRemoval = (event) => {
            if (event.target !== row || event.propertyName !== 'opacity') return;
            row.removeEventListener('transitionend', finishRemoval);
            render();
        };
        row.addEventListener('transitionend', finishRemoval);
    };

    const move = (direction) => {
        const next = Math.min(Math.max(activeIndex() + direction, 0), rows.length - 1);
        cursor = { id: rows[next].id, query: trimmed() };
        syncActive();
    };

    // Options never take focus: the field drives them, as aria-activedescendant expects.
    panel.addEventListener('pointerdown', (e) => e.preventDefault());
    rowsEl.addEventListener(
        'load',
        (e) => {
            if (e.target.tagName === 'IMG') e.target.classList.add('is-loaded');
        },
        true
    );
    rowsEl.addEventListener(
        'error',
        (e) => {
            if (e.target.tagName !== 'IMG') return;
            e.target.closest('.sh-thumb')?.classList.add('is-broken');
            e.target.remove();
        },
        true
    );
    rowsEl.addEventListener('pointermove', (e) => {
        const row = e.target.closest('.sh-row');
        if (!row || row.getAttribute('aria-selected') === 'true') return;
        cursor = { id: row.dataset.id, query: trimmed() };
        syncActive();
    });
    rowsEl.addEventListener('click', (e) => {
        if (e.target.closest('.sh-clear')) {
            writeRecents([]);
            render();
            input.focus();
            return;
        }
        const el = e.target.closest('.sh-row');
        if (!el) return;
        const row = rows.find((r) => r.id === el.dataset.id);
        if (e.target.closest('.sh-remove')) removeRecent(el.dataset.label, el);
        else activate(row);
    });

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.addEventListener('focus', () => {
        requestPopular();
        show();
    });
    input.addEventListener('click', show);
    input.addEventListener('input', show);
    input.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            hide();
            input.blur();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) show();
            else move(e.key === 'ArrowDown' ? 1 : -1);
        } else if (e.key === 'Enter' && open && rows.length) {
            e.preventDefault();
            activate(rows[activeIndex()]);
        } else if (e.key === 'Delete' && open && rows[activeIndex()]?.kind === 'recent') {
            e.preventDefault();
            removeRecent(rows[activeIndex()].label);
        }
    });
    form.addEventListener('focusout', (e) => {
        if (!form.contains(e.relatedTarget)) hide();
    });
    window.addEventListener(
        'pointerdown',
        (e) => {
            if (open && !form.contains(e.target)) hide();
        },
        true
    );
    new ResizeObserver(() => open && size()).observe(content);

    return { close: hide };
}
