import { pb } from './accounts/config.js';
import { applyInstancePolicy, getCachedAppConfig } from './access-control.js';

// ↑↑↓↓←→←→ B A Enter on the admin page opens a debug console. Each option is an app_config switch saved on toggle.
const KONAMI = [
    'arrowup',
    'arrowup',
    'arrowdown',
    'arrowdown',
    'arrowleft',
    'arrowright',
    'arrowleft',
    'arrowright',
    'b',
    'a',
    'enter',
];
const OPTIONS = [
    { field: 'debug_recaps_always', label: 'weekly & monthly recap always available' },
    { field: 'debug_fake_users', label: 'fake social users (Overwatch)', count: 'debug_fake_users_count' },
];

const BANNER = String.raw` ____  _____ ____  _   _  ____
|  _ \| ____| __ )| | | |/ ___|
| | | |  _| |  _ \| | | | |  _
| |_| | |___| |_) | |_| | |_| |
|____/|_____|____/ \___/ \____|`;

const BOOT = [
    ['konami sequence accepted', '↑↑↓↓←→←→BA'],
    ['escalating privileges', 'OK'],
    ['mounting /dev/debug', 'OK'],
    ['bending the release schedule', 'OK'],
    ['waking up the gremlins', 'OK'],
];

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduced() ? 0 : ms));

let progress = 0;
let open = false;

async function type(line, text, speed = 14) {
    if (reduced()) return void (line.textContent += text);
    for (const char of text) {
        line.textContent += char;
        await wait(speed);
    }
}

async function save(field, value) {
    const config = getCachedAppConfig();
    const saved = await pb.collection('app_config').update(config.id, { [field]: value });
    applyInstancePolicy({ ...config, ...saved });
}

async function boot(overlay, log) {
    const line = (className = '') => {
        const element = document.createElement('div');
        element.className = className;
        log.append(element);
        log.scrollTop = log.scrollHeight;
        return element;
    };
    for (const [task, result] of BOOT) {
        const row = line('admin-debug-line');
        await type(row, `> ${task} `);
        await type(row, '.'.repeat(Math.max(2, 32 - task.length)), 8);
        const status = document.createElement('b');
        status.textContent = ` [ ${result} ]`;
        row.append(status);
        await wait(120);
    }
    const bar = line('admin-debug-line admin-debug-bar');
    for (let i = 0; i <= 24; i++) {
        bar.textContent = `[${'█'.repeat(i)}${'░'.repeat(24 - i)}] ${Math.round((i / 24) * 100)}%`;
        await wait(28);
    }
    await wait(200);
    overlay.classList.add('is-glitching');
    await wait(380);
    overlay.classList.remove('is-glitching');
    line('admin-debug-banner').textContent = BANNER;
    line('admin-debug-line admin-debug-dim').textContent = '// changes apply instantly to the whole instance';

    const config = getCachedAppConfig();
    const list = document.createElement('div');
    list.className = 'admin-debug-options';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Debug options');
    list.innerHTML = OPTIONS.map(
        ({ field, label, count }, i) =>
            `<label class="admin-debug-option" style="--i:${i}"><input type="checkbox" role="switch" data-debug-field="${field}"${config[field] ? ' checked' : ''} /><span class="admin-debug-box" aria-hidden="true"></span><span>${label}</span>${count ? `<input type="number" class="admin-debug-count" min="1" max="100" step="1" aria-label="number of fake users" data-debug-field="${count}" value="${config[count] || 10}" />` : ''}</label>`
    ).join('');
    log.append(list);
    const status = line('admin-debug-line admin-debug-status');
    status.setAttribute('role', 'status');
    list.addEventListener('change', async (event) => {
        const input = event.target;
        const checkbox = input.type === 'checkbox';
        const value = checkbox ? input.checked : input.valueAsNumber;
        input.disabled = true;
        try {
            await save(input.dataset.debugField, value);
            status.textContent = `> ${input.dataset.debugField} = ${value}`;
        } catch (error) {
            if (checkbox) input.checked = !input.checked;
            else input.value = getCachedAppConfig()[input.dataset.debugField] || 10;
            status.textContent = `> error: ${error.message || 'could not save'}`;
        } finally {
            input.disabled = false;
        }
    });
    list.querySelector('input')?.focus({ preventScroll: true });
}

async function openConsole() {
    open = true;
    const { mountGradientASCII } = await import('./gradient-ascii.js');
    const returnFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'admin-debug';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Debug console');
    overlay.innerHTML = `<div class="admin-debug-bg"></div>
        <div class="admin-debug-scan" aria-hidden="true"></div>
        <section class="admin-debug-term">
            <header class="admin-debug-title"><i></i><i></i><i></i><span>root@monochrome: ~/debug</span><button type="button" id="admin-debug-close" aria-label="Close debug console">esc</button></header>
            <div class="admin-debug-log"></div>
            <footer class="admin-debug-prompt" aria-hidden="true">root@monochrome:~# <span class="admin-debug-cursor"></span></footer>
        </section>`;
    document.body.append(overlay);
    const unmount = mountGradientASCII(overlay.querySelector('.admin-debug-bg'), {
        colors: ['#032b12', '#0d7a35', '#22c55e', '#86efac', '#dcfce7'],
        shape: 'eclipse',
        characters: ' .:-=+*#%@01',
        cellSize: 16,
        glow: 0.5,
        flicker: 0.45,
        clickEffect: 'burst',
        fontFamily: 'ui-monospace, monospace',
    });

    // keyboard-navigation.js owns Escape and focus trapping for [role="dialog"]: Escape clicks the *-close button.
    const button = overlay.querySelector('#admin-debug-close');
    button.addEventListener('click', () => {
        if (overlay.classList.contains('is-closing')) return;
        overlay.classList.add('is-closing');
        const done = () => {
            unmount();
            overlay.remove();
            open = false;
            returnFocus?.focus?.({ preventScroll: true });
        };
        if (reduced()) done();
        else overlay.addEventListener('animationend', (event) => event.animationName === 'admin-debug-fade' && done());
    });
    button.focus({ preventScroll: true });
    await boot(overlay, overlay.querySelector('.admin-debug-log'));
}

export function initDebugConsole() {
    document.addEventListener('keydown', (event) => {
        if (open || !document.getElementById('page-admin')?.classList.contains('active')) return;
        if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        const key = event.key.toLowerCase();
        progress = key === KONAMI[progress] ? progress + 1 : key === KONAMI[0] ? 1 : 0;
        if (progress < KONAMI.length) return;
        progress = 0;
        event.preventDefault();
        void openConsole();
    });
}
