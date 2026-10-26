import I_LOCK from '!lucide/lock-keyhole.svg?svg&icon';
import I_OPEN from '!lucide/lock-open.svg?svg&icon';
import { pb } from './accounts/config.js';

// Admin panel for the stats release schedule: presets, per-tab locks and a date scrubber that
// asks the server how the draft plays out, so the preview can never drift from the real rules.
const PRESETS = {
    open: [false, false, false],
    yearly: [false, false, true],
    'monthly-yearly': [false, true, true],
    all: [true, true, true],
};
const LOCKS = ['lock_week', 'lock_month', 'lock_year'];
const FIELDS = [...LOCKS, 'lock_lifetime', 'past_week', 'past_month', 'past_year'];
const TABS = [
    ['day', 'Day'],
    ['week', 'Week'],
    ['month', 'Month'],
    ['year', 'Year'],
    ['lifetime', 'Lifetime'],
];

const $ = (id) => document.getElementById(id);
const idOf = (field) => `admin-${field.replace('_', '-')}`;
const draft = () => Object.fromEntries(FIELDS.map((field) => [field, Boolean($(idOf(field))?.checked)]));

const year = new Date().getFullYear();
const DAYS = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
const keyAt = (index) => new Date(Date.UTC(year, 0, 1 + index)).toISOString().slice(0, 10);
const fmt = (key, options) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...options });
const short = { weekday: 'short', day: 'numeric', month: 'short' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const cache = new Map();
let token = 0;
let bound = false;

function drawTicks() {
    const svg = $('admin-sim-ticks');
    const parts = [];
    // Warped season: December, and January until the end of its window.
    parts.push(`<rect class="season" x="0" y="0" width="31" height="20"/>`);
    parts.push(`<rect class="season" x="${DAYS - 31}" y="0" width="31" height="20"/>`);
    for (let i = 0; i < DAYS; i++) {
        const date = new Date(Date.UTC(year, 0, 1 + i));
        const monthEnd = new Date(+date + 86400000).getUTCDate() === 1;
        if (monthEnd) parts.push(`<line class="month" x1="${i + 0.5}" x2="${i + 0.5}" y1="3" y2="20"/>`);
        else if (date.getUTCDay() === 0)
            parts.push(`<line class="week" x1="${i + 0.5}" x2="${i + 0.5}" y1="13" y2="20"/>`);
    }
    svg.setAttribute('viewBox', `0 0 ${DAYS} 20`);
    svg.innerHTML = parts.join('');
    const months = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(year, m + 1, 0)).getUTCDate());
    const labels = $('admin-sim-months');
    labels.style.gridTemplateColumns = months.map((d) => `${d}fr`).join(' ');
    labels.innerHTML = months
        .map(
            (_, m) =>
                `<span>${new Date(Date.UTC(year, m, 1)).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short' })}</span>`
        )
        .join('');
}

function buildTabs() {
    $('admin-sim-tabs').innerHTML = TABS.map(
        ([id, name]) => `<div class="admin-sim-tab" data-tab="${id}">
            <span class="admin-sim-lock" aria-hidden="true"><i class="is-closed">${I_LOCK(16)}</i><i class="is-open">${I_OPEN(16)}</i></span>
            <strong>${name}</strong><small></small></div>`
    ).join('');
}

function render(policy) {
    for (const [id] of TABS) {
        const tab = document.querySelector(`.admin-sim-tab[data-tab="${id}"]`);
        const rule = policy.periods[id];
        const locked = Boolean(rule?.locked);
        let note = 'Always open';
        if (rule?.locked) note = rule.opensAt ? `Opens ${fmt(rule.opensAt, short)}` : 'Opens with Warped';
        else if (rule) {
            note = policy.warped.open
                ? 'Open for Warped'
                : rule.closesAt
                  ? `Locks again ${fmt(rule.closesAt, short)}`
                  : rule.earliest
                    ? 'Newest only'
                    : 'Open';
        }
        const state = locked ? 'locked' : 'open';
        if (tab.dataset.state && tab.dataset.state !== state && !reduced.matches) {
            tab.classList.remove('is-flip');
            void tab.offsetWidth; // Restart the animation when the state flips again quickly.
            tab.classList.add('is-flip');
        }
        tab.dataset.state = state;
        tab.querySelector('small').textContent = note;
        tab.setAttribute('aria-label', `${tab.querySelector('strong').textContent}: ${note}`);
    }
    const { items, pausedUntil } = policy.recaps;
    $('admin-sim-recaps').textContent = !$('admin-feature-recaps').checked
        ? 'Recaps are turned off for this instance.'
        : pausedUntil
          ? `Weekly and monthly recaps are paused until ${fmt(pausedUntil, { day: 'numeric', month: 'long' })}.`
          : items.length
            ? `Recaps ready: ${items
                  .map((item) =>
                      item.period === 'week'
                          ? `week of ${fmt(item.anchor, { day: 'numeric', month: 'short' })}`
                          : fmt(item.anchor, { month: 'long' })
                  )
                  .join(' and ')}.`
            : 'No recap drops on this day.';
}

function refresh() {
    const index = Number($('admin-sim-range').value);
    const on = keyAt(index);
    $('admin-sim-date').textContent = fmt(on, { weekday: 'long', day: 'numeric', month: 'long' });
    $('admin-sim-today').hidden = index === todayIndex();
    $('admin-sim-range').style.setProperty('--at', `${((index + 0.5) / DAYS) * 100}%`);
    const body = { on, warped: $('admin-sim-warped').checked, config: draft() };
    const key = JSON.stringify(body);
    const mine = ++token;
    const ready = cache.has(key)
        ? Promise.resolve(cache.get(key))
        : pb.send('/api/monochrome/listening/schedule-preview', { method: 'POST', body, requestKey: null });
    ready
        .then((policy) => {
            cache.set(key, policy);
            if (mine === token) render(policy);
        })
        .catch(() => {
            if (mine === token) $('admin-sim-recaps').textContent = 'The preview needs the server to be restarted.';
        });
}

const todayIndex = () => Math.floor((Date.now() - Date.UTC(year, 0, 1)) / 86400000);

function syncPresets() {
    const locks = LOCKS.map((field) => Boolean($(idOf(field)).checked));
    let match = null;
    for (const [name, preset] of Object.entries(PRESETS)) if (preset.every((v, i) => v === locks[i])) match = name;
    for (const chip of document.querySelectorAll('[data-preset]'))
        chip.setAttribute('aria-checked', String(chip.dataset.preset === match));
    document.querySelector('.admin-release-custom').hidden = Boolean(match);
}

export function syncRelease() {
    if (!bound) return;
    syncPresets();
    refresh();
}

export function initRelease(form) {
    if (bound || !form) return;
    bound = true;
    const range = $('admin-sim-range');
    range.max = String(DAYS - 1);
    range.value = String(todayIndex());
    drawTicks();
    buildTabs();
    form.addEventListener('input', (event) => {
        if (!event.target.closest('.admin-release')) return;
        syncPresets();
        refresh();
    });
    document.querySelector('.admin-release-presets').addEventListener('click', (event) => {
        const chip = event.target.closest('[data-preset]');
        if (!chip || !PRESETS[chip.dataset.preset]) return;
        LOCKS.forEach((field, i) => {
            const input = $(idOf(field));
            if (input.checked === PRESETS[chip.dataset.preset][i]) return;
            input.checked = PRESETS[chip.dataset.preset][i];
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const row = input.closest('.admin-release-row');
            row.classList.remove('is-pulse');
            void row.offsetWidth;
            row.classList.add('is-pulse');
        });
    });
    $('admin-sim-today').addEventListener('click', () => {
        range.value = String(todayIndex());
        refresh();
    });
    syncRelease();
}
