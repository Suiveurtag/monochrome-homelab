// Sharing consent and Ghost Mode. Nothing is shared until the member picks an audience;
// closing the dialog without choosing keeps listening private.
import I_LOCK from '!lucide/lock.svg?svg&icon';
import I_USERS from '!lucide/users.svg?svg&icon';
import I_RADIO from '!lucide/radio-tower.svg?svg&icon';
import I_GHOST from '!lucide/ghost.svg?svg&icon';
import I_X from '!lucide/x.svg?svg&icon';
import { api, getState, patchMe, scheduleRefresh } from './community-store.js';
import { esc, untilLabel } from './community-format.js';
import { refreshPresence } from './community-presence.js';
import { getCachedAppConfig } from '../access-control.js';
import { showNotification } from '../downloads.js';

export const VISIBILITY = {
    private: { icon: I_LOCK, label: 'Only me', short: 'Private', text: 'Nobody sees what you play. Your own stats keep working.' },
    friends: { icon: I_USERS, label: 'Friends', short: 'Friends', text: 'Members you follow who follow you back.' },
    instance: { icon: I_RADIO, label: 'Everyone here', short: 'Everyone', text: 'Every member of this instance.' },
};

export function visibilityIcon(value, size = 16) {
    return (VISIBILITY[value] || VISIBILITY.private).icon(size);
}

export function visibilityLabel(value) {
    return (VISIBILITY[value] || VISIBILITY.private).short;
}

export async function saveSettings(body) {
    const result = await api('/settings', { method: 'POST', body });
    patchMe({ visibility: result.visibility, ghostUntil: result.ghostUntil });
    refreshPresence();
    scheduleRefresh(300);
    return result;
}

/** Opens the sharing dialog. `firstRun` explains the choice and preselects nothing. */
export function openSharing({ firstRun = false } = {}) {
    const current = getState().data?.me?.visibility || '';
    const instance = getCachedAppConfig().instance_name?.trim() || 'this instance';
    const dialog = document.createElement('dialog');
    dialog.className = 'cm-dialog cm-sharing';
    dialog.setAttribute('aria-labelledby', 'cm-sharing-title');
    dialog.innerHTML = `
        <form method="dialog" class="cm-dialog-card">
            <button type="submit" disabled hidden aria-hidden="true" tabindex="-1"></button>
            <header class="cm-dialog-head">
                <h2 id="cm-sharing-title">${firstRun ? 'Who hears what you play?' : 'Listening visibility'}</h2>
                <button class="cm-icon-btn is-quiet" value="cancel" aria-label="Close">${I_X(18)}</button>
            </header>
            <p class="cm-dialog-lede">${
                firstRun
                    ? `Social shows what members of ${esc(instance)} are playing. Choose who can see yours: live listening, recent plays, charts and taste matches.`
                    : 'Applies to live listening, recent plays, charts and taste matches. It takes effect right away.'
            }</p>
            <fieldset class="cm-choice-list">
                <legend class="sr-only">Who can see your listening</legend>
                ${Object.entries(VISIBILITY)
                    .map(
                        ([value, option]) => `
                    <label class="cm-choice">
                        <input type="radio" name="visibility" value="${value}" ${current === value ? 'checked' : ''}>
                        <span class="cm-choice-icon" aria-hidden="true">${option.icon(20)}</span>
                        <span class="cm-choice-text"><strong>${esc(value === 'instance' ? `Everyone on ${instance}` : option.label)}</strong><small>${esc(option.text)}</small></span>
                    </label>`
                    )
                    .join('')}
            </fieldset>
            <p class="cm-dialog-note">Your name, avatar and profile stay visible to members either way. Notes and polls pick their own audience when you post them.</p>
            <footer class="cm-dialog-actions">
                ${firstRun ? '<button class="cm-btn is-ghost" value="cancel">Not now</button>' : ''}
                <button class="cm-btn is-primary" value="save" data-save ${current ? '' : 'disabled'}>Save</button>
            </footer>
        </form>`;
    document.body.appendChild(dialog);
    const save = dialog.querySelector('[data-save]');
    dialog.addEventListener('change', () => {
        save.disabled = !dialog.querySelector('input[name="visibility"]:checked');
    });
    dialog.addEventListener('close', async () => {
        const value = dialog.querySelector('input[name="visibility"]:checked')?.value;
        const chosen = dialog.returnValue === 'save' && value;
        dialog.remove();
        if (chosen && value !== current) {
            try {
                await saveSettings({ visibility: value });
                showNotification(value === 'private' ? 'Your listening is private.' : `Sharing with ${visibilityLabel(value).toLowerCase()}.`);
            } catch {
                showNotification('Could not save your choice. Try again.');
            }
        } else if (firstRun && !current) {
            sessionStorage.setItem('cm-consent-deferred', '1');
        }
    });
    dialog.showModal();
}

export function shouldAskConsent() {
    const me = getState().data?.me;
    return !!me && !me.visibility && sessionStorage.getItem('cm-consent-deferred') !== '1';
}

// ---------------------------------------------------------------- Ghost Mode

const GHOST_CHOICES = [
    ['60', 'For 1 hour'],
    ['480', 'For 8 hours'],
    ['1440', 'Until tomorrow'],
    ['forever', 'Until I turn it off'],
];

let menu = null;

function closeMenu() {
    menu?.remove();
    menu = null;
    document.removeEventListener('pointerdown', onOutside, true);
}

function onOutside(event) {
    if (menu && !menu.contains(event.target) && !event.target.closest('[data-cm="ghost"]')) closeMenu();
}

export async function setGhost(value) {
    try {
        await saveSettings({ ghost: value });
        showNotification(value === 'off' ? 'Ghost Mode is off.' : 'Ghost Mode is on. Nothing you play is shared.');
    } catch {
        showNotification('Could not change Ghost Mode.');
    }
}

export function toggleGhostMenu(anchor) {
    if (menu) return closeMenu();
    const ghostUntil = getState().data?.me?.ghostUntil;
    if (ghostUntil) {
        void setGhost('off');
        return;
    }
    menu = document.createElement('div');
    menu.className = 'cm-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Ghost Mode');
    menu.innerHTML = `<p class="cm-menu-title">${I_GHOST(16)} Go ghost</p><p class="cm-menu-hint">Stop sharing what you play. It stays out of Social even after you come back.</p>${GHOST_CHOICES.map(
        ([value, label]) => `<button type="button" role="menuitem" class="cm-menu-item" data-ghost="${value}">${esc(label)}</button>`
    ).join('')}`;
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.left = `${Math.max(12, Math.min(window.innerWidth - menu.offsetWidth - 12, rect.right - menu.offsetWidth))}px`;
    menu.querySelector('button')?.focus();
    menu.addEventListener('click', (event) => {
        const button = event.target.closest('[data-ghost]');
        if (!button) return;
        closeMenu();
        anchor.focus();
        void setGhost(button.dataset.ghost);
    });
    menu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMenu();
            anchor.focus();
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const items = [...menu.querySelectorAll('[data-ghost]')];
            const index = items.indexOf(document.activeElement);
            items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
        }
    });
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
}

export function ghostSummary() {
    const until = getState().data?.me?.ghostUntil;
    return until ? `You're a ghost ${untilLabel(until)}. Nothing you play now is shared, now or later.` : '';
}

/** Small mark on the sidebar Social item while Ghost Mode is on. */
export function syncGhostMark() {
    const until = getState().data?.me?.ghostUntil || 0;
    document.documentElement.classList.toggle('cm-ghosting', until > Date.now());
}
