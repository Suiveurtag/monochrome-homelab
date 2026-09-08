import { db } from './db.js';
import { pb } from './accounts/config.js';
import { playlistCollaboration, isPlaylistOwner } from './playlist-collaboration.js';
import './playlist-collaboration.css';

export { isPlaylistOwner } from './playlist-collaboration.js';

const PEOPLE_ICON =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/></svg>';

export function appendCollaborationButton(actions, playlist) {
    const button = document.createElement('button');
    button.id = 'collaborate-playlist-btn';
    button.className = 'btn-secondary';
    button.innerHTML = `${PEOPLE_ICON}<span></span>`;
    button.querySelector('span').textContent = playlist.collaboration
        ? `Collaborators (${playlist.collaboration.members.length + 1})`
        : 'Collaborate';
    button.onclick = () => void openCollaborators(playlist, button);
    actions.append(button);
}

export async function openCollaborators(initialPlaylist, trigger) {
    document.querySelector('.playlist-collaboration-dialog')?.close();
    const dialog = document.createElement('dialog');
    dialog.className = 'playlist-collaboration-dialog';
    dialog.setAttribute('aria-labelledby', 'collaboration-title');
    dialog.innerHTML = `<div class="playlist-collaboration-heading"><h2 id="collaboration-title">Collaborators</h2><button class="btn-icon" type="button" aria-label="Close collaborators">×</button></div>
        <p class="playlist-collaboration-description"></p><ul class="playlist-collaboration-members"></ul>
        <form class="playlist-collaboration-add"><label for="collaboration-username">Add a collaborator</label><div><input id="collaboration-username" name="username" autocomplete="off" placeholder="Username or account ID" required maxlength="128"><button class="btn-primary" type="submit">Add</button></div><p>Collaborators can add, remove and reorder songs. The playlist appears in their library.</p></form>
        <p class="playlist-collaboration-status" role="status" aria-live="polite"></p><div class="playlist-collaboration-footer"></div>`;
    document.body.append(dialog);
    const status = dialog.querySelector('.playlist-collaboration-status');
    const form = dialog.querySelector('form');
    let playlist = initialPlaylist;
    let busy = false;
    const run = async (action, success) => {
        if (busy) return;
        busy = true;
        status.textContent = 'Saving…';
        dialog
            .querySelectorAll(
                'form button, .playlist-collaboration-members button, .playlist-collaboration-footer button'
            )
            .forEach((button) => {
                button.disabled = true;
            });
        try {
            const result = await action();
            if (!dialog.isConnected) return;
            if (!result) {
                dialog.close();
                return;
            }
            playlist = result;
            render();
            status.textContent = success;
        } catch (error) {
            if (!dialog.isConnected) return;
            const cached = await db.getPlaylist(playlist.id);
            if (playlist.collaboration && !cached) {
                dialog.close();
                return;
            }
            playlist = cached || playlist;
            render();
            status.textContent = error.response?.message || error.message;
        } finally {
            busy = false;
            dialog.querySelectorAll('button').forEach((button) => {
                button.disabled = false;
            });
        }
    };
    const render = () => {
        dialog.querySelector('.playlist-collaboration-description').textContent = playlist.name;
        const owner = isPlaylistOwner(playlist);
        const signedIn = pb.authStore.isValid;
        form.hidden = !owner || !signedIn;
        const members = playlist.collaboration?.identities || [
            { id: pb.authStore.record?.id, name: pb.authStore.record?.name || 'You', role: 'owner' },
        ];
        const list = dialog.querySelector('.playlist-collaboration-members');
        list.replaceChildren();
        for (const member of members) {
            const row = document.createElement('li');
            const identity = document.createElement('span');
            const name = document.createElement('strong');
            name.textContent = `${member.name}${member.id === pb.authStore.record?.id ? ' (you)' : ''}`;
            const role = document.createElement('small');
            role.textContent = member.role === 'owner' ? 'Owner' : 'Collaborator';
            identity.append(name, role);
            row.append(identity);
            if (owner && member.role !== 'owner') {
                const remove = document.createElement('button');
                remove.className = 'btn-secondary';
                remove.textContent = 'Remove';
                remove.setAttribute('aria-label', `Remove ${member.name} from playlist`);
                remove.onclick = () =>
                    void run(
                        () => playlistCollaboration.mutate(playlist, { type: 'remove-member', userId: member.id }),
                        'Collaborator removed.'
                    );
                row.append(remove);
            }
            list.append(row);
        }
        const footer = dialog.querySelector('.playlist-collaboration-footer');
        footer.replaceChildren();
        if (!owner) {
            const leave = document.createElement('button');
            leave.className = 'btn-secondary danger';
            leave.textContent = 'Leave playlist';
            leave.onclick = () => void run(() => playlistCollaboration.mutate(playlist, { type: 'leave' }));
            footer.append(leave);
        }
        if (!signedIn) status.textContent = 'Sign in to add collaborators.';
    };
    form.onsubmit = (event) => {
        event.preventDefault();
        const input = form.elements.username;
        const username = input.value.trim();
        if (!username) return;
        void run(async () => {
            playlist = await playlistCollaboration.enable(playlist);
            const saved = await playlistCollaboration.mutate(playlist, { type: 'add-member', username });
            input.value = '';
            return saved;
        }, 'Collaborator added.');
    };
    dialog.querySelector('[aria-label="Close collaborators"]').onclick = () => dialog.close();
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) {
            const rect = dialog.getBoundingClientRect();
            if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
            )
                dialog.close();
        }
    });
    const onChanged = async (event) => {
        if (event.detail?.playlistId !== playlist.id || busy) return;
        const current = await db.getPlaylist(playlist.id);
        if (!dialog.isConnected) return;
        if (!current) {
            dialog.close();
            return;
        }
        playlist = current;
        render();
    };
    window.addEventListener('collaborative-playlist-changed', onChanged);
    const accountId = pb.authStore.record?.id;
    const unsubscribeAuth = pb.authStore.onChange(() => {
        if (pb.authStore.record?.id !== accountId) dialog.close();
    });
    dialog.addEventListener(
        'close',
        () => {
            window.removeEventListener('collaborative-playlist-changed', onChanged);
            unsubscribeAuth();
            dialog.remove();
            if (trigger?.isConnected) trigger.focus();
        },
        { once: true }
    );
    render();
    dialog.showModal();
    if (playlist.collaboration) {
        const current = await playlistCollaboration.refresh(playlist);
        if (!current) {
            dialog.close();
            return;
        }
        playlist = current;
        if (dialog.isConnected) render();
    }
}

export function watchCollaborativePlaylist(ui, playlistId) {
    if (ui._collaborationListener)
        window.removeEventListener('collaborative-playlist-changed', ui._collaborationListener);
    clearTimeout(ui._collaborationRefreshTimer);
    ui._collaborationListener = (event) => {
        if (
            event.detail?.playlistId !== playlistId ||
            !document.getElementById('page-playlist')?.classList.contains('active')
        )
            return;
        clearTimeout(ui._collaborationRefreshTimer);
        ui._collaborationRefreshTimer = setTimeout(async () => {
            if (!document.getElementById('page-playlist')?.classList.contains('active')) return;
            const routeId = decodeURIComponent(
                window.location.pathname.match(/^\/(?:userplaylist|playlist)\/([^/]+)\/?$/)?.[1] || ''
            );
            if (routeId !== playlistId) return;
            if (document.querySelector('.track-item.dragging')) {
                ui._collaborationListener(event);
                return;
            }
            const search = document.getElementById('track-list-search-input')?.value || '';
            const scroller = document.querySelector('.main-content');
            const scrollTop = scroller?.scrollTop || 0;
            const focusedId = document.activeElement?.id;
            await ui.renderPlaylistPage(playlistId, 'user');
            const input = document.getElementById('track-list-search-input');
            if (input && search) {
                input.value = search;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (scroller) scroller.scrollTop = scrollTop;
            if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
        }, 150);
    };
    window.addEventListener('collaborative-playlist-changed', ui._collaborationListener);
}
