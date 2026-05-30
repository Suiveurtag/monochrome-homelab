import { authManager } from './accounts/auth.js';
import { isClientAuthRequired } from './auth-gate.js';

const DEFAULT_SELF_HOSTED_SERVER_URL = 'http://localhost:8790';

export function getSelfHostedServerUrl() {
    const configured =
        window.__MONOCHROME_SELF_HOSTED_SERVER_URL__ ||
        localStorage.getItem('monochrome-selfhosted-server-url') ||
        DEFAULT_SELF_HOSTED_SERVER_URL;
    return String(configured).replace(/\/+$/, '');
}

function getSignedInUser() {
    const user = authManager.user;
    if (!user?.$id) {
        throw new Error('Sign in before managing self-hosted accounts');
    }
    return user;
}

function getAccountHeaders() {
    const user = getSignedInUser();
    return {
        'content-type': 'application/json',
        'x-monochrome-user-id': user.$id,
        'x-monochrome-user-email': user.email || '',
        'x-monochrome-user-name': user.name || user.email || '',
    };
}

async function parseJsonResponse(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        const error = new Error(data.error || `Self-hosted account request failed (${response.status})`);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
}

export async function getSelfHostedAccount() {
    try {
        const response = await fetch(`${getSelfHostedServerUrl()}/api/accounts/me`, {
            headers: getAccountHeaders(),
        });
        return {
            allowed: response.ok,
            ...(await parseJsonResponse(response)),
        };
    } catch (error) {
        if (error.status === 403 && error.data?.account) {
            return {
                allowed: false,
                account: error.data.account,
                error: error.message,
            };
        }
        throw error;
    }
}

export async function listAdminAccounts() {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/admin/accounts`, {
        headers: getAccountHeaders(),
    });
    const data = await parseJsonResponse(response);
    return data.accounts || [];
}

export async function updateAdminAccount(userId, updates) {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/admin/accounts/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: getAccountHeaders(),
        body: JSON.stringify(updates),
    });
    return (await parseJsonResponse(response)).account;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatDate(value) {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString();
}

function renderAccountRow(account) {
    const isCurrentUser = account.userId === authManager.user?.$id;
    const displayName = account.name || account.email || account.userId;
    return `
        <div class="admin-account-row" data-admin-account-id="${escapeHtml(account.userId)}">
            <div class="admin-account-main">
                <div class="admin-account-name">${escapeHtml(displayName)}</div>
                <div class="admin-account-meta">
                    <span>${escapeHtml(account.email || 'No email')}</span>
                    <span>${escapeHtml(account.userId)}</span>
                    <span>Created ${escapeHtml(formatDate(account.createdAt))}</span>
                    ${isCurrentUser ? '<span>Current user</span>' : ''}
                </div>
            </div>
            <div class="admin-account-controls">
                <span class="admin-account-status" data-status="${escapeHtml(account.status)}">
                    ${escapeHtml(account.status)}
                </span>
                <select class="admin-account-role-select" data-admin-account-role="${escapeHtml(account.userId)}">
                    <option value="user" ${account.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="admin" ${account.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                <button class="btn-secondary" data-admin-account-action="approve" data-user-id="${escapeHtml(account.userId)}">
                    Approve
                </button>
                <button class="btn-secondary" data-admin-account-action="reject" data-user-id="${escapeHtml(account.userId)}">
                    Reject
                </button>
                <button class="btn-secondary danger" data-admin-account-action="disable" data-user-id="${escapeHtml(account.userId)}">
                    Disable
                </button>
            </div>
        </div>
    `;
}

function setPanelMessage(panel, message) {
    const messageEl = panel.querySelector('#selfhosted-admin-message');
    if (messageEl) messageEl.textContent = message;
}

export async function renderSelfHostedAdminPanel() {
    const panel = document.getElementById('selfhosted-admin-panel');
    if (!panel) return;

    if (!isClientAuthRequired() || !authManager.user) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    setPanelMessage(panel, 'Checking self-hosted account status...');

    const accountSummary = panel.querySelector('#selfhosted-account-summary');
    const listEl = panel.querySelector('#selfhosted-admin-list');
    const adminTools = panel.querySelector('#selfhosted-admin-tools');
    if (listEl) listEl.innerHTML = '';
    if (adminTools) adminTools.style.display = 'none';

    try {
        const { account, allowed } = await getSelfHostedAccount();
        if (!account) {
            throw new Error('Self-hosted account response did not include an account');
        }

        if (accountSummary) {
            accountSummary.innerHTML = `
                <span class="admin-account-status" data-status="${escapeHtml(account.status)}">
                    ${escapeHtml(account.status)}
                </span>
                <span>${account.admin ? 'Admin' : 'User'}</span>
                <span>${escapeHtml(getSelfHostedServerUrl())}</span>
            `;
        }

        if (!allowed) {
            setPanelMessage(panel, `Your account is ${account.status}. An admin must approve it before you can use this instance.`);
            return;
        }

        if (!account.admin) {
            setPanelMessage(panel, 'Your account is approved. Admin account management is only available to admins.');
            return;
        }

        if (adminTools) adminTools.style.display = 'block';
        setPanelMessage(panel, 'Loading accounts...');
        const accounts = await listAdminAccounts();
        if (listEl) {
            listEl.innerHTML = accounts.length > 0
                ? accounts.map(renderAccountRow).join('')
                : '<div class="admin-account-empty">No accounts found.</div>';
        }
        setPanelMessage(panel, `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'} on this instance.`);
    } catch (error) {
        console.warn('Failed to render self-hosted admin panel:', error);
        setPanelMessage(panel, error.message || 'Self-hosted account management is unavailable.');
    }
}

export function initializeSelfHostedAdminPanel() {
    const panel = document.getElementById('selfhosted-admin-panel');
    if (!panel) return;

    panel.addEventListener('click', async (event) => {
        const refreshBtn = event.target.closest('#refresh-selfhosted-admin-btn');
        if (refreshBtn) {
            await renderSelfHostedAdminPanel();
            return;
        }

        const actionBtn = event.target.closest('[data-admin-account-action]');
        if (!actionBtn) return;

        const userId = actionBtn.dataset.userId;
        const action = actionBtn.dataset.adminAccountAction;
        const statusByAction = {
            approve: 'approved',
            reject: 'rejected',
            disable: 'disabled',
        };
        const status = statusByAction[action];
        if (!userId || !status) return;

        actionBtn.disabled = true;
        setPanelMessage(panel, `Updating ${userId}...`);
        try {
            await updateAdminAccount(userId, { status });
            await renderSelfHostedAdminPanel();
        } catch (error) {
            console.error('Failed to update account:', error);
            setPanelMessage(panel, error.message || 'Account update failed.');
        } finally {
            actionBtn.disabled = false;
        }
    });

    panel.addEventListener('change', async (event) => {
        const roleSelect = event.target.closest('[data-admin-account-role]');
        if (!roleSelect) return;

        const userId = roleSelect.dataset.adminAccountRole;
        const role = roleSelect.value;
        if (!userId || !role) return;

        roleSelect.disabled = true;
        setPanelMessage(panel, `Updating ${userId}...`);
        try {
            await updateAdminAccount(userId, { role });
            await renderSelfHostedAdminPanel();
        } catch (error) {
            console.error('Failed to update account role:', error);
            setPanelMessage(panel, error.message || 'Role update failed.');
        } finally {
            roleSelect.disabled = false;
        }
    });

    authManager.onAuthStateChanged(() => {
        renderSelfHostedAdminPanel().catch(console.error);
    });

    renderSelfHostedAdminPanel().catch(console.error);
}
