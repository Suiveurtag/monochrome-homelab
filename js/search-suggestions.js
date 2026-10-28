// Vanilla port of beui's morphing-search-chips suggestion panel (recents + typed matches).
import { SVG_CLOCK, SVG_CLOSE, SVG_SEARCH } from './icons.js';
import { escapeHtml } from './utils.js';

const STORAGE_KEY = 'search-history';
const MAX_SUGGESTIONS = 6;
// The glass starts as a small pill tucked behind the bar and springs out to the content size.
const SEED = { width: 112, height: 40, tuck: 28 };

const contains = (term, query) => term.toLowerCase().includes(query.toLowerCase());

const readRecents = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
};
const writeRecents = (list) => localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

function highlight(text, query) {
    const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
    if (at < 0) return escapeHtml(text);
    const end = at + query.length;
    return `${escapeHtml(text.slice(0, at))}<span class="sh-match">${escapeHtml(text.slice(at, end))}</span>${escapeHtml(text.slice(end))}`;
}

export function initSearchSuggestions({ input, form, panel }) {
    panel.innerHTML = `
        <div class="sh-glass" aria-hidden="true"></div>
        <div class="sh-content"><div class="sh-rows"></div></div>`;
    const glass = panel.querySelector('.sh-glass');
    const content = panel.querySelector('.sh-content');
    const rowsEl = panel.querySelector('.sh-rows');
    const listId = 'search-suggestions-list';

    let open = false;
    let rows = [];
    let cursor = null; // { id, query }: row id stamped with the query it was placed under
    let floor = 0; // tallest the panel has been this session, so narrowing a search never pulls the card up
    let hideTimer;

    const trimmed = () => input.value.trim();

    const buildRows = () => {
        const recents = readRecents();
        const q = trimmed();
        if (!q) return recents.map((term) => ({ id: `recent:${term}`, label: term, kind: 'recent' }));
        const matches = recents
            .filter((term) => term.toLowerCase() !== q.toLowerCase() && contains(term, q))
            .slice(0, MAX_SUGGESTIONS)
            .map((term) => ({ id: `recent:${term}`, label: term, kind: 'recent' }));
        return [{ id: `query:${q}`, label: q, kind: 'query' }, ...matches];
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
            el.scrollIntoView({ block: 'nearest' });
            input.setAttribute('aria-activedescendant', el.id);
        } else input.removeAttribute('aria-activedescendant');
    };

    const size = () => {
        floor = Math.max(floor, content.offsetHeight);
        content.style.minHeight = `${floor}px`;
        glass.style.width = `${content.offsetWidth}px`;
        glass.style.height = `${content.offsetHeight}px`;
    };

    const render = () => {
        rows = buildRows();
        const q = trimmed();
        const header =
            `<div class="sh-header"><span>${q ? 'Suggestions' : 'Recent'}</span>` +
            (!q && rows.length ? '<button type="button" class="sh-clear">Clear</button>' : '') +
            '</div>';
        const list = rows
            .map(
                (row, i) => `
            <div class="sh-row" id="${listId}-${i}" role="option" data-id="${escapeHtml(row.id)}" data-label="${escapeHtml(row.label)}">
                <span class="sh-icon">${row.kind === 'recent' ? SVG_CLOCK(16) : SVG_SEARCH(16)}</span>
                <span class="sh-label">${row.kind === 'query' ? escapeHtml(row.label) : highlight(row.label, q)}</span>
                ${row.kind === 'recent' ? `<span class="sh-remove" aria-hidden="true">${SVG_CLOSE(14)}</span>` : ''}
            </div>`
            )
            .join('');
        rowsEl.innerHTML =
            header +
            (rows.length
                ? `<div id="${listId}" role="listbox" aria-label="${q ? 'Suggestions' : 'Recent searches'}" class="sh-list"><span class="sh-active"></span>${list}</div>`
                : '');
        input.setAttribute('aria-controls', listId);
        if (rows.length) syncActive();
        // An empty "Recent" list has nothing to show: the bar still widens, the panel stays shut.
        if (!rows.length) hide();
        else if (open) size();
    };

    const show = () => {
        rows = buildRows();
        if (!rows.length) return hide();
        clearTimeout(hideTimer);
        if (!open) {
            open = true;
            cursor = null;
            floor = 0;
            content.style.minHeight = '';
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

    const removeRecent = (term) => {
        writeRecents(readRecents().filter((r) => r !== term));
        render();
    };

    const move = (direction) => {
        const next = Math.min(Math.max(activeIndex() + direction, 0), rows.length - 1);
        cursor = { id: rows[next].id, query: trimmed() };
        syncActive();
    };

    // Options never take focus: the field drives them, as aria-activedescendant expects.
    panel.addEventListener('pointerdown', (e) => e.preventDefault());
    rowsEl.addEventListener('pointermove', (e) => {
        const row = e.target.closest('.sh-row');
        if (!row || row.getAttribute('aria-selected') === 'true') return;
        cursor = { id: row.dataset.id, query: trimmed() };
        syncActive();
    });
    rowsEl.addEventListener('click', (e) => {
        if (e.target.closest('.sh-clear')) {
            writeRecents([]);
            hide();
            input.focus();
            return;
        }
        const row = e.target.closest('.sh-row');
        if (!row) return;
        if (e.target.closest('.sh-remove')) removeRecent(row.dataset.label);
        else select(row.dataset.label);
    });

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.addEventListener('focus', show);
    input.addEventListener('click', show);
    input.addEventListener('input', show);
    input.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Escape' && input.value !== '') {
            // One press undoes typing, the next leaves.
            e.preventDefault();
            e.stopPropagation();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (e.key === 'Escape') hide();
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) show();
            else move(e.key === 'ArrowDown' ? 1 : -1);
        } else if (e.key === 'Enter' && open && rows.length) {
            e.preventDefault();
            select(rows[activeIndex()].label);
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
