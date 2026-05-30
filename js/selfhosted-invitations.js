import { authManager } from './accounts/auth.js';
import { isClientAuthRequired } from './auth-gate.js';
import { showNotification } from './downloads.js';
import { getSelfHostedServerUrl } from './selfhosted-admin.js';

function getSignedInUser() {
    const user = authManager.user;
    if (!user?.$id) {
        throw new Error('Sign in before using invitations');
    }
    return user;
}

function getInvitationHeaders() {
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
        const error = new Error(data.error || `Self-hosted invitation request failed (${response.status})`);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
}

export async function listSelfHostedInvitations() {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/invitations`, {
        headers: getInvitationHeaders(),
    });
    return parseJsonResponse(response);
}

export async function sendSelfHostedInvitation(target) {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/invitations`, {
        method: 'POST',
        headers: getInvitationHeaders(),
        body: JSON.stringify(target || {}),
    });
    return (await parseJsonResponse(response)).invitation;
}

export async function respondToSelfHostedInvitation(invitationId, status) {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/invitations/${encodeURIComponent(invitationId)}`, {
        method: 'PATCH',
        headers: getInvitationHeaders(),
        body: JSON.stringify({ status }),
    });
    return (await parseJsonResponse(response)).invitation;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderInvitationRow(invitation, direction) {
    const otherUserId = direction === 'incoming' ? invitation.fromUserId : invitation.toUserId;
    const actions =
        direction === 'incoming' && invitation.status === 'pending'
            ? `
                <button class="btn-secondary" data-invitation-action="accepted" data-invitation-id="${escapeHtml(invitation.id)}">Accept</button>
                <button class="btn-secondary danger" data-invitation-action="rejected" data-invitation-id="${escapeHtml(invitation.id)}">Reject</button>
            `
            : '';
    return `
        <div class="admin-account-row invitation-row">
            <div class="admin-account-main">
                <div class="admin-account-name">${escapeHtml(otherUserId)}</div>
                <div class="admin-account-meta">
                    <span>${escapeHtml(direction)}</span>
                    <span>${escapeHtml(invitation.status)}</span>
                    ${invitation.message ? `<span>${escapeHtml(invitation.message)}</span>` : ''}
                </div>
            </div>
            <div class="admin-account-controls">${actions}</div>
        </div>
    `;
}

export async function renderSelfHostedInvitationsPanel() {
    const panel = document.getElementById('selfhosted-invitations-panel');
    if (!panel) return;

    if (!isClientAuthRequired() || !authManager.user) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    const listEl = panel.querySelector('#selfhosted-invitations-list');
    const messageEl = panel.querySelector('#selfhosted-invitations-message');
    if (messageEl) messageEl.textContent = 'Loading invitations...';
    if (listEl) listEl.innerHTML = '';

    try {
        const { incoming = [], outgoing = [], contacts = [] } = await listSelfHostedInvitations();
        if (listEl) {
            const rows = [
                ...incoming.map((invitation) => renderInvitationRow(invitation, 'incoming')),
                ...outgoing.map((invitation) => renderInvitationRow(invitation, 'outgoing')),
            ];
            listEl.innerHTML = rows.length > 0 ? rows.join('') : '<div class="admin-account-empty">No invitations yet.</div>';
        }
        if (messageEl) {
            messageEl.textContent = `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}, ${incoming.length} incoming, ${outgoing.length} outgoing.`;
        }
    } catch (error) {
        console.warn('Failed to render self-hosted invitations:', error);
        if (messageEl) messageEl.textContent = error.message || 'Invitations are unavailable.';
    }
}

export function initializeSelfHostedInvitationsPanel() {
    const panel = document.getElementById('selfhosted-invitations-panel');
    if (!panel) return;

    panel.addEventListener('click', async (event) => {
        const refreshBtn = event.target.closest('#refresh-selfhosted-invitations-btn');
        if (refreshBtn) {
            await renderSelfHostedInvitationsPanel();
            return;
        }

        const actionBtn = event.target.closest('[data-invitation-action]');
        if (!actionBtn) return;
        actionBtn.disabled = true;
        try {
            await respondToSelfHostedInvitation(actionBtn.dataset.invitationId, actionBtn.dataset.invitationAction);
            showNotification(`Invitation ${actionBtn.dataset.invitationAction}`);
            window.dispatchEvent(new CustomEvent('selfhosted-contacts-changed'));
            await renderSelfHostedInvitationsPanel();
        } catch (error) {
            console.error('Failed to update invitation:', error);
            showNotification(error.message || 'Invitation update failed');
        } finally {
            actionBtn.disabled = false;
        }
    });

    authManager.onAuthStateChanged(() => {
        renderSelfHostedInvitationsPanel().catch(console.error);
    });

    renderSelfHostedInvitationsPanel().catch(console.error);
}
