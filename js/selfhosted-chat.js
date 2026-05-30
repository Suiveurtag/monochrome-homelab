import { authManager } from './accounts/auth.js';
import { isClientAuthRequired } from './auth-gate.js';
import { showNotification } from './downloads.js';
import { getSelfHostedServerUrl } from './selfhosted-admin.js';
import { listSelfHostedInvitations } from './selfhosted-invitations.js';

let activeContactUserId = '';

function getSignedInUser() {
    const user = authManager.user;
    if (!user?.$id) {
        throw new Error('Sign in before using chat');
    }
    return user;
}

function getChatHeaders() {
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
        const error = new Error(data.error || `Self-hosted chat request failed (${response.status})`);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getOtherUserId(invitation) {
    const ownUserId = authManager.user?.$id || '';
    return invitation.fromUserId === ownUserId ? invitation.toUserId : invitation.fromUserId;
}

function uniqueContacts(contacts) {
    return [...new Set((contacts || []).map(getOtherUserId).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function listSelfHostedMessages(contactUserId, options = {}) {
    const url = new URL(`${getSelfHostedServerUrl()}/api/messages`);
    url.searchParams.set('contactUserId', contactUserId);
    if (options.limit) url.searchParams.set('limit', String(options.limit));
    if (options.before) url.searchParams.set('before', String(options.before));
    const response = await fetch(url, { headers: getChatHeaders() });
    return (await parseJsonResponse(response)).messages || [];
}

export async function sendSelfHostedMessage(toUserId, body) {
    const response = await fetch(`${getSelfHostedServerUrl()}/api/messages`, {
        method: 'POST',
        headers: getChatHeaders(),
        body: JSON.stringify({ toUserId, body }),
    });
    return (await parseJsonResponse(response)).message;
}

function renderMessage(message) {
    const ownUserId = authManager.user?.$id || '';
    const own = message.fromUserId === ownUserId;
    return `
        <div class="selfhosted-chat-message${own ? ' own' : ''}">
            <div class="selfhosted-chat-message-meta">
                <span>${escapeHtml(own ? 'You' : message.fromUserId)}</span>
                <span>${escapeHtml(new Date(message.createdAt).toLocaleString())}</span>
            </div>
            <div class="selfhosted-chat-message-body">${escapeHtml(message.body)}</div>
        </div>
    `;
}

async function renderConversation(contactUserId) {
    const messagesEl = document.getElementById('selfhosted-chat-messages');
    const messageEl = document.getElementById('selfhosted-chat-message');
    if (!messagesEl) return;
    if (!contactUserId) {
        messagesEl.innerHTML = '<div class="admin-account-empty">Choose a contact to start chatting.</div>';
        if (messageEl) messageEl.textContent = 'No contact selected.';
        return;
    }

    if (messageEl) messageEl.textContent = `Loading chat with ${contactUserId}...`;
    messagesEl.innerHTML = '';
    try {
        const messages = await listSelfHostedMessages(contactUserId);
        messagesEl.innerHTML =
            messages.length > 0
                ? messages.map(renderMessage).join('')
                : '<div class="admin-account-empty">No messages yet.</div>';
        messagesEl.scrollTop = messagesEl.scrollHeight;
        if (messageEl) messageEl.textContent = `Chatting with ${contactUserId}.`;
    } catch (error) {
        console.warn('Failed to render self-hosted chat:', error);
        messagesEl.innerHTML = '<div class="admin-account-empty">Chat is unavailable.</div>';
        if (messageEl) messageEl.textContent = error.message || 'Chat is unavailable.';
    }
}

export async function renderSelfHostedChatPanel() {
    const panel = document.getElementById('selfhosted-chat-panel');
    if (!panel) return;

    if (!isClientAuthRequired() || !authManager.user) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    const contactSelect = document.getElementById('selfhosted-chat-contact-select');
    const composer = document.getElementById('selfhosted-chat-composer');
    const messageEl = document.getElementById('selfhosted-chat-message');

    try {
        const { contacts = [] } = await listSelfHostedInvitations();
        const contactUserIds = uniqueContacts(contacts);
        if (!contactUserIds.includes(activeContactUserId)) activeContactUserId = contactUserIds[0] || '';
        if (contactSelect) {
            contactSelect.innerHTML = contactUserIds
                .map(
                    (contactUserId) =>
                        `<option value="${escapeHtml(contactUserId)}"${contactUserId === activeContactUserId ? ' selected' : ''}>${escapeHtml(contactUserId)}</option>`,
                )
                .join('');
            contactSelect.disabled = contactUserIds.length === 0;
        }
        if (composer) composer.style.display = activeContactUserId ? 'flex' : 'none';
        if (contactUserIds.length === 0) {
            const messagesEl = document.getElementById('selfhosted-chat-messages');
            if (messagesEl) messagesEl.innerHTML = '<div class="admin-account-empty">Accept an invitation before chatting.</div>';
            if (messageEl) messageEl.textContent = 'No contacts yet.';
            return;
        }
        await renderConversation(activeContactUserId);
    } catch (error) {
        console.warn('Failed to render self-hosted chat panel:', error);
        if (messageEl) messageEl.textContent = error.message || 'Chat is unavailable.';
    }
}

export function initializeSelfHostedChatPanel() {
    const panel = document.getElementById('selfhosted-chat-panel');
    if (!panel) return;

    panel.addEventListener('change', async (event) => {
        const contactSelect = event.target.closest('#selfhosted-chat-contact-select');
        if (!contactSelect) return;
        activeContactUserId = contactSelect.value;
        await renderConversation(activeContactUserId);
    });

    panel.addEventListener('click', async (event) => {
        const refreshBtn = event.target.closest('#refresh-selfhosted-chat-btn');
        if (refreshBtn) {
            await renderSelfHostedChatPanel();
        }
    });

    const form = document.getElementById('selfhosted-chat-composer');
    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = document.getElementById('selfhosted-chat-input');
        const body = input?.value.trim() || '';
        if (!activeContactUserId || !body) return;
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
            await sendSelfHostedMessage(activeContactUserId, body);
            input.value = '';
            await renderConversation(activeContactUserId);
        } catch (error) {
            console.error('Failed to send self-hosted message:', error);
            showNotification(error.message || 'Message failed');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    authManager.onAuthStateChanged(() => {
        renderSelfHostedChatPanel().catch(console.error);
    });

    window.addEventListener('selfhosted-contacts-changed', () => {
        renderSelfHostedChatPanel().catch(console.error);
    });

    renderSelfHostedChatPanel().catch(console.error);
}
