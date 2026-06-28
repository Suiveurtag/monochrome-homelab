import { pb } from './accounts/config.js';
import { authManager } from './accounts/auth.js';
import { loadAppConfig } from './access-control.js';

const escapeHtml = (value) =>
    String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

function isAdmin() {
    return authManager.user?.access_status === 'active' && authManager.user?.role === 'admin';
}

function userRow(user) {
    const isSelf = user.id === authManager.user?.id || user.id === authManager.user?.$id;
    return `<article class="admin-user-row" data-user-id="${escapeHtml(user.id)}">
        <div class="admin-user-identity">
            <strong>${escapeHtml(user.name || user.email.split('@')[0])}${isSelf ? ' <span>You</span>' : ''}</strong>
            <small>${escapeHtml(user.email)}</small>
        </div>
        <span class="admin-status admin-status-${escapeHtml(user.access_status)}">${escapeHtml(user.access_status)}</span>
        <span class="admin-role">${escapeHtml(user.role)}</span>
        <div class="admin-user-actions">
            ${user.access_status !== 'active' ? '<button class="btn-primary" data-status="active">Approve</button>' : ''}
            ${!isSelf && user.access_status !== 'banned' ? '<button class="btn-secondary danger" data-status="banned">Ban</button>' : ''}
            ${!isSelf && user.access_status === 'banned' ? '<button class="btn-secondary" data-status="pending">Move to pending</button>' : ''}
        </div>
    </article>`;
}

export const adminManager = {
    async renderPage(ui) {
        if (!isAdmin()) {
            window.history.replaceState({}, '', '/');
            await ui.renderHomePage();
            return;
        }

        await ui.showPage('admin');
        const usersContainer = document.getElementById('admin-users-list');
        const count = document.getElementById('admin-users-count');
        const configForm = document.getElementById('admin-config-form');
        const feedback = document.getElementById('admin-feedback');

        const renderUsers = async () => {
            usersContainer.innerHTML = '<p class="admin-loading">Loading accounts...</p>';
            try {
                const result = await pb.collection('users').getFullList({ sort: '-created', requestKey: null });
                usersContainer.innerHTML = result.map(userRow).join('') || '<p>No accounts.</p>';
                count.textContent = String(result.length);
            } catch (error) {
                usersContainer.innerHTML = `<p class="admin-error">${escapeHtml(error.message)}</p>`;
            }
        };

        if (!usersContainer.dataset.bound) {
            usersContainer.dataset.bound = 'true';
            usersContainer.addEventListener('click', async (event) => {
                const button = event.target.closest('[data-status]');
                const row = event.target.closest('[data-user-id]');
                if (!button || !row) return;
                button.disabled = true;
                try {
                    await pb.collection('users').update(row.dataset.userId, { access_status: button.dataset.status });
                    await renderUsers();
                    feedback.textContent = 'Account updated.';
                } catch (error) {
                    feedback.textContent = error.message;
                    button.disabled = false;
                }
            });
        }

        const config = await loadAppConfig();
        document.getElementById('admin-registrations-open').checked = config.registrations_open;
        document.getElementById('admin-maintenance-mode').checked = config.maintenance_mode;
        document.getElementById('admin-announcement').value = config.announcement || '';
        configForm.dataset.recordId = config.id || '';

        if (!configForm.dataset.bound) {
            configForm.dataset.bound = 'true';
            configForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const button = configForm.querySelector('button[type="submit"]');
                button.disabled = true;
                try {
                    await pb.collection('app_config').update(configForm.dataset.recordId, {
                        registrations_open: document.getElementById('admin-registrations-open').checked,
                        maintenance_mode: document.getElementById('admin-maintenance-mode').checked,
                        announcement: document.getElementById('admin-announcement').value.trim(),
                    });
                    feedback.textContent = 'Application settings saved. Reload to apply them locally.';
                } catch (error) {
                    feedback.textContent = error.message;
                } finally {
                    button.disabled = false;
                }
            });
        }

        await renderUsers();
    },

    updateVisibility() {
        const link = document.getElementById('sidebar-nav-admin');
        if (link) link.hidden = !isAdmin();
    },
};
