// Emoji reactions: a chip per emoji with its count, one tap to add the same, a quick bar
// of six music-flavoured emoji and a searchable picker. Server-backed, one reaction per
// person per moment; tapping your own reaction again removes it.
import I_SMILE_PLUS from '!lucide/smile-plus.svg?svg&icon';
import { api, getState, setReactions } from './community-store.js';
import { esc, firstName, reducedMotion } from './community-format.js';
import { showNotification } from '../downloads.js';

export const QUICK = ['🔥', '❤️', '🤯', '😭', '🎧', '🕺'];

const GROUPS = [
    ['Feelings', '😍 🥹 😭 🤯 😮 😌 🥲 😎 🤩 😤 🫠 😴 🤔 🙃 😂 🥰 😱 🫶'],
    ['Music', '🎧 🎶 🎵 🎤 🎸 🥁 🎹 🎷 🎺 🪩 📀 💿 📻 🔊 🎼 🪕'],
    ['Energy', '🔥 ⚡ ✨ 💥 🌊 🌙 ☀️ 🌈 🌧️ ❄️ 🌸 🍂 🚀 💫 🌀 🫧'],
    ['Love', '❤️ 🩷 🧡 💛 💚 🩵 💙 💜 🖤 🤍 💔 ❤️‍🔥 💯 💘'],
    ['Moves', '🕺 💃 🙌 👏 🤘 🫡 👀 🙏 💪 🤝 👌 ✌️ 🫶 🤌'],
];
const NAMES = {
    '🔥': 'fire', '❤️': 'heart love', '🤯': 'mind blown', '😭': 'crying', '🎧': 'headphones', '🕺': 'dance',
    '💃': 'dance', '🎶': 'notes music', '🎵': 'note music', '🎤': 'mic sing', '🎸': 'guitar', '🥁': 'drum', '🎹': 'piano keys',
    '🪩': 'disco ball', '💿': 'cd', '📀': 'dvd', '📻': 'radio', '🔊': 'loud speaker', '😍': 'heart eyes', '🥹': 'touched',
    '😮': 'wow', '😌': 'calm', '😎': 'cool', '🤩': 'star struck', '😂': 'laugh', '🥰': 'love', '😱': 'scream', '🙌': 'hands',
    '👏': 'clap', '🤘': 'rock', '👀': 'eyes', '🙏': 'thanks', '💯': 'hundred', '✨': 'sparkles', '⚡': 'lightning', '🌊': 'wave',
    '🌙': 'moon night', '☀️': 'sun', '💔': 'broken heart', '🖤': 'black heart', '🫠': 'melting', '😴': 'sleep', '🤔': 'thinking',
    '🚀': 'rocket', '💫': 'dizzy', '🌧️': 'rain', '❄️': 'snow cold', '🌸': 'flower', '🍂': 'autumn', '🫶': 'heart hands',
};

/** Aggregates the reactions of several targets (e.g. every listener in a room) by person. */
export function collect(keys) {
    const map = getState().data?.reactions || {};
    const byUser = new Map();
    for (const key of keys) for (const reaction of map[key] || []) byUser.set(reaction.user, reaction.emoji);
    return [...byUser.entries()].map(([user, emoji]) => ({ user, emoji }));
}

export function reactionBar(keys, { label = 'React', compact = false } = {}) {
    const list = collect(keys);
    const me = getState().data?.me?.id;
    const counts = new Map();
    for (const { emoji } of list) counts.set(emoji, (counts.get(emoji) || 0) + 1);
    const mine = list.find((r) => r.user === me)?.emoji || '';
    const users = getState().data?.users || {};
    const chips = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([emoji, count]) => {
            const who = list
                .filter((r) => r.emoji === emoji)
                .map((r) => (r.user === me ? 'You' : firstName(users[r.user])))
                .join(', ');
            return `<button type="button" class="cm-react-chip" data-react="${esc(keys.join(' '))}" data-emoji="${esc(emoji)}" aria-pressed="${emoji === mine}" title="${esc(who)}" aria-label="${esc(`${emoji} ${count}, ${who}`)}"><span class="cm-react-emoji" aria-hidden="true">${emoji}</span><span class="cm-react-count">${count}</span></button>`;
        })
        .join('');
    return `<div class="cm-reactions${compact ? ' is-compact' : ''}" data-react-keys="${esc(keys.join(' '))}">${chips}<button type="button" class="cm-react-add" data-react-open="${esc(keys.join(' '))}" aria-label="${esc(label)}" aria-haspopup="dialog" title="${esc(label)}">${I_SMILE_PLUS(18)}</button></div>`;
}

function targetsOf(keys) {
    return keys.map((key) => {
        const index = key.indexOf(':');
        return { kind: key.slice(0, index), id: key.slice(index + 1) };
    });
}

async function send(keys, emoji, origin) {
    const state = getState();
    const me = state.data?.me?.id;
    if (!me) return;
    const previous = {};
    const optimistic = {};
    for (const key of keys) {
        previous[key] = state.data.reactions[key] || [];
        const others = previous[key].filter((r) => r.user !== me);
        optimistic[key] = emoji ? [...others, { user: me, emoji }] : others;
    }
    setReactions(optimistic);
    if (emoji && origin) burst(origin, emoji);
    try {
        const result = await api('/reactions', { method: 'POST', body: { targets: targetsOf(keys), emoji: emoji || null } });
        const settled = {};
        for (const key of keys) settled[key] = result.reactions?.[key] || [];
        setReactions(settled);
    } catch (error) {
        setReactions(previous);
        showNotification(error?.status === 404 ? 'That moment has passed.' : 'Could not send your reaction.');
    }
}

function burst(origin, emoji) {
    if (reducedMotion() || !origin?.getBoundingClientRect) return;
    const rect = origin.getBoundingClientRect();
    const node = document.createElement('span');
    node.className = 'cm-react-burst';
    node.textContent = emoji;
    node.style.left = `${rect.left + rect.width / 2}px`;
    node.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(node);
    node.addEventListener('animationend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 1200);
}

// ---------------------------------------------------------------- picker

let picker = null;
let pickerKeys = [];
let pickerOrigin = null;

function closePicker({ restoreFocus = true } = {}) {
    if (!picker) return;
    picker.remove();
    picker = null;
    document.removeEventListener('pointerdown', outside, true);
    if (restoreFocus) pickerOrigin?.focus?.({ preventScroll: true });
}

function outside(event) {
    if (picker && !picker.contains(event.target) && !pickerOrigin?.contains(event.target)) closePicker({ restoreFocus: false });
}

function emojiButton(emoji, mine) {
    return `<button type="button" class="cm-picker-emoji" data-pick="${esc(emoji)}" aria-pressed="${emoji === mine}" aria-label="${esc(NAMES[emoji] || emoji)}">${emoji}</button>`;
}

function renderFull(mine, query = '') {
    const q = query.trim().toLowerCase();
    const groups = GROUPS.map(([name, list]) => {
        const emoji = list.split(' ').filter((e) => !q || (NAMES[e] || '').includes(q) || name.toLowerCase().includes(q));
        if (!emoji.length) return '';
        return `<div class="cm-picker-group" role="group" aria-label="${esc(name)}"><p class="cm-picker-label">${esc(name)}</p><div class="cm-picker-grid">${emoji.map((e) => emojiButton(e, mine)).join('')}</div></div>`;
    }).join('');
    return groups || '<p class="cm-picker-none">No emoji match.</p>';
}

export function openPicker(origin, keys) {
    if (picker && pickerOrigin === origin) return closePicker();
    closePicker({ restoreFocus: false });
    pickerKeys = keys;
    pickerOrigin = origin;
    const me = getState().data?.me?.id;
    const mine = collect(keys).find((r) => r.user === me)?.emoji || '';
    picker = document.createElement('div');
    picker.className = 'cm-picker';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', 'Pick a reaction');
    picker.innerHTML = `
        <div class="cm-picker-quick">${QUICK.map((e) => emojiButton(e, mine)).join('')}
            <button type="button" class="cm-picker-more" data-picker-more aria-expanded="false" aria-label="More emoji">+</button>
        </div>
        <div class="cm-picker-full" hidden>
            <input class="cm-picker-search" type="search" placeholder="Search emoji" aria-label="Search emoji" autocomplete="off">
            <div class="cm-picker-scroll">${renderFull(mine)}</div>
        </div>
        ${mine ? '<button type="button" class="cm-picker-remove" data-pick="">Remove my reaction</button>' : ''}`;
    document.body.appendChild(picker);
    position();
    picker.querySelector('.cm-picker-emoji')?.focus({ preventScroll: true });
    picker.addEventListener('click', (event) => {
        const more = event.target.closest('[data-picker-more]');
        if (more) {
            const full = picker.querySelector('.cm-picker-full');
            full.hidden = !full.hidden;
            more.setAttribute('aria-expanded', String(!full.hidden));
            if (!full.hidden) picker.querySelector('.cm-picker-search').focus();
            position();
            return;
        }
        const button = event.target.closest('[data-pick]');
        if (!button) return;
        const emoji = button.dataset.pick;
        const origin = pickerOrigin;
        closePicker();
        void send(pickerKeys, emoji === mine ? '' : emoji, origin);
    });
    picker.querySelector('.cm-picker-search').addEventListener('input', (event) => {
        picker.querySelector('.cm-picker-scroll').innerHTML = renderFull(mine, event.target.value);
    });
    picker.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            closePicker();
            return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.target.matches('input')) return;
        const buttons = [...picker.querySelectorAll('.cm-picker-emoji, .cm-picker-more')].filter((b) => b.offsetParent);
        const index = buttons.indexOf(document.activeElement);
        if (index < 0) return;
        event.preventDefault();
        const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : 7;
        buttons[Math.max(0, Math.min(buttons.length - 1, index + step))]?.focus();
    });
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
}

function position() {
    if (!picker || !pickerOrigin) return;
    if (window.innerWidth < 600) {
        picker.classList.add('is-sheet');
        return;
    }
    const rect = pickerOrigin.getBoundingClientRect();
    const box = picker.getBoundingClientRect();
    // Grow away from the nearest edge so the picker never runs under side panels.
    const preferRight = rect.left + rect.width / 2 > window.innerWidth / 2;
    const anchored = preferRight ? rect.right - box.width : rect.left;
    const left = Math.max(12, Math.min(window.innerWidth - box.width - 12, anchored));
    const above = rect.top - box.height - 10;
    const top = above > 12 ? above : Math.min(window.innerHeight - box.height - 12, rect.bottom + 10);
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
}

/** Wires chips and the add button inside `root` through one delegated listener. */
export function bindReactions(root) {
    root.addEventListener('click', (event) => {
        const chip = event.target.closest('.cm-react-chip');
        if (chip && root.contains(chip)) {
            event.preventDefault();
            const keys = chip.dataset.react.split(' ');
            const me = getState().data?.me?.id;
            const mine = collect(keys).find((r) => r.user === me)?.emoji || '';
            const emoji = chip.dataset.emoji;
            void send(keys, mine === emoji ? '' : emoji, chip);
            return;
        }
        const add = event.target.closest('[data-react-open]');
        if (add && root.contains(add)) {
            event.preventDefault();
            openPicker(add, add.dataset.reactOpen.split(' '));
        }
    });
}

window.addEventListener('resize', () => closePicker({ restoreFocus: false }));
