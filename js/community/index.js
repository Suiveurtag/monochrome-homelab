// Social bootstrapping: presence publishing, message badge, and the "send to a friend" /
// "write a note" entry points used across the app (context menu, player).
import { authManager } from '../accounts/auth.js';
import { isFeatureEnabled } from '../access-control.js';
import { startPresence } from './community-presence.js';
import { startMessages, stopMessages, shareWithFriend } from './community-messages.js';
import { attachmentFrom } from './community-format.js';
import { load, getState } from './community-store.js';

let started = false;

function setSidebarBadge(count) {
    const link = document.querySelector('#sidebar-nav-social a');
    if (!link) return;
    let badge = link.querySelector('.cm-nav-badge');
    if (!count) return badge?.remove();
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'cm-nav-badge';
        link.appendChild(badge);
    }
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.setAttribute('aria-label', `${count} unread conversations`);
}

async function noteAbout(attachment) {
    if (!getState().data) await load({ quiet: true });
    const { openNoteComposer } = await import('./community-compose.js');
    openNoteComposer({ attachment });
}

export function initCommunity(player) {
    if (started) return;
    started = true;
    window.addEventListener('community-unread', (event) => setSidebarBadge(event.detail?.count || 0));
    window.addEventListener('community-share', (event) => {
        const { action, type, item } = event.detail || {};
        const kind = type === 'album' || type === 'artist' ? type : 'track';
        const attachment = attachmentFrom(kind, item);
        if (!attachment) return;
        if (action === 'note-about') void noteAbout(attachment);
        else shareWithFriend(attachment);
    });
    authManager.onAuthStateChanged((user) => {
        const enabled = !!user && isFeatureEnabled('social', user);
        document.documentElement.classList.toggle('cm-on', enabled);
        if (!enabled) {
            stopMessages();
            return;
        }
        startPresence(player);
        void startMessages();
    });
}
