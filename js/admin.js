import I_CHECK from '!lucide/check.svg?svg&icon';
import I_CHEVRON_RIGHT from '!lucide/chevron-right.svg?svg&icon';
import I_MAIL from '!lucide/mail.svg?svg&icon';
import I_TRASH from '!lucide/trash-2.svg?svg&icon';
import I_X from '!lucide/x.svg?svg&icon';
import { pb } from './accounts/config.js';
import { authManager } from './accounts/auth.js';
import { applyInstancePolicy, isAdminAccount, loadAppConfig } from './access-control.js';

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const CONFIG_FIELDS = {
    instance_name: 'admin-instance-name',
    support_email: 'admin-support-email',
    registrations_open: 'admin-registrations-open',
    maintenance_mode: 'admin-maintenance-mode',
    announcement: 'admin-announcement',
    feature_social: 'admin-feature-social',
    feature_stats: 'admin-feature-stats',
    feature_uploads: 'admin-feature-uploads',
    feature_parties: 'admin-feature-parties',
    allow_uploads: 'admin-allow-uploads',
    allow_catalog_edits: 'admin-allow-catalog-edits',
    allow_catalog_deletes: 'admin-allow-catalog-deletes',
    allow_downloads: 'admin-allow-downloads',
    allow_social_posts: 'admin-allow-social-posts',
    allow_parties: 'admin-allow-parties',
};

const state = {
    users: [],
    profiles: new Map(),
    usersReady: false,
    selected: new Set(),
    inspectedUserId: null,
    config: null,
    metrics: { tracks: null, online: null, imports: null },
    health: { pocketbase: 'unknown', importer: 'unknown', metrics: 'unknown' },
    bulkPending: false,
    inspectorTab: 'details',
    inspectorData: new Map(),
};

let inspectorReturnUserId = null;
let healthRefreshTimer = null;

const ownId = () => authManager.user?.id || authManager.user?.$id;

function initials(user) {
    const source = user.name || user.email?.split('@')[0] || '?';
    return source
        .split(/[\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
}

function displayName(user) {
    return user.name || user.email?.split('@')[0] || 'Unnamed member';
}

function profileFor(user) {
    return state.profiles.get(String(user.id)) || null;
}

function avatarUrl(user) {
    return profileFor(user)?.avatar_url || '';
}

function avatarMarkup(user, size = '') {
    const url = avatarUrl(user);
    const className = `admin-avatar${size ? ` admin-avatar-${size}` : ''}`;
    return url
        ? `<img class="${className}" src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.src='/assets/appicon.png'; this.onerror=null;" />`
        : `<span class="${className}" aria-hidden="true">${escapeHtml(initials(user))}</span>`;
}

function formatDate(value) {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function formatCount(value) {
    return new Intl.NumberFormat().format(Number(value || 0));
}

function isSelf(user) {
    return String(user.id) === String(ownId());
}

function statusLabel(status) {
    return status === 'active' ? 'Active' : status === 'pending' ? 'Pending' : 'Suspended';
}

function showFeedback(message, kind = '') {
    const feedback = document.getElementById('admin-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.dataset.kind = kind;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

function renderMetrics() {
    const pending = state.users.filter((user) => user.access_status === 'pending').length;
    setText('admin-users-count', state.usersReady ? formatCount(state.users.length) : '—');
    setText('admin-pending-count', state.usersReady ? formatCount(pending) : '—');
    setText('admin-tracks-count', state.metrics.tracks === null ? '—' : formatCount(state.metrics.tracks));
    setText('admin-online-count', state.metrics.online === null ? '—' : formatCount(state.metrics.online));
    const importCount = state.metrics.imports === null ? '—' : formatCount(state.metrics.imports);
    const importHealth = state.health.importer === 'healthy' ? '' : ` · ${state.health.importer}`;
    setText('admin-import-state', `${importCount} running${importHealth}`);
    setText('admin-pending-nav-count', pending);
    const pendingNav = document.getElementById('admin-pending-nav-count');
    if (pendingNav) pendingNav.hidden = pending === 0;
    const approveAll = document.getElementById('admin-approve-all');
    if (approveAll) approveAll.hidden = pending === 0;
}

function renderHealth() {
    const states = Object.values(state.health);
    const overall = states.includes('degraded')
        ? 'degraded'
        : states.every((value) => value === 'healthy')
          ? 'healthy'
          : 'unknown';
    const labels = {
        healthy: ['Instance online', 'All systems operational'],
        degraded: ['Instance degraded', 'Some services need attention'],
        unknown: ['Checking instance…', 'Checking services…'],
    };
    const pocketbaseLabel =
        state.health.pocketbase === 'healthy'
            ? 'Healthy'
            : state.health.pocketbase === 'degraded'
              ? 'Unavailable'
              : 'Checking';
    setText('admin-instance-health-label', labels[overall][0]);
    setText('admin-system-status-label', labels[overall][1]);
    setText('admin-pocketbase-health', pocketbaseLabel);
    setText(
        'admin-nav-health',
        state.health.pocketbase === 'healthy'
            ? 'PocketBase connected'
            : state.health.pocketbase === 'degraded'
              ? 'PocketBase unavailable'
              : 'Checking PocketBase…'
    );
    document.getElementById('admin-instance-health')?.setAttribute('data-state', overall);
    document.getElementById('admin-system-status')?.setAttribute('data-state', overall);
    document.getElementById('admin-nav-health-dot')?.setAttribute('data-state', state.health.pocketbase);
}

function filteredUsers() {
    const query = document.getElementById('admin-user-search')?.value.trim().toLowerCase() || '';
    const status = document.getElementById('admin-status-filter')?.value || 'all';
    const role = document.getElementById('admin-role-filter')?.value || 'all';
    return state.users.filter((user) => {
        const matchesQuery = !query || `${displayName(user)} ${user.email || ''}`.toLowerCase().includes(query);
        return (
            matchesQuery &&
            (status === 'all' || user.access_status === status) &&
            (role === 'all' || user.role === role)
        );
    });
}

function userRow(user) {
    const self = isSelf(user);
    const selected = state.selected.has(user.id);
    const inspected = state.inspectedUserId === user.id;
    return `<tr class="admin-user-row${inspected ? ' is-inspected' : ''}" data-user-id="${escapeHtml(user.id)}">
        <td><label class="admin-check-cell" aria-label="Select ${escapeHtml(displayName(user))}">
            <input type="checkbox" data-select-user="${escapeHtml(user.id)}" ${selected ? 'checked' : ''} ${self ? 'disabled' : ''} />
        </label></td>
        <td><button class="admin-user-identity" type="button" data-inspect-user="${escapeHtml(user.id)}">
            ${avatarMarkup(user)}
            <span><strong>${escapeHtml(displayName(user))}${self ? '<em>You</em>' : ''}</strong><small>${escapeHtml(user.email || 'No email')}</small></span>
        </button></td>
        <td><span class="admin-status admin-status-${escapeHtml(user.access_status)}"><i aria-hidden="true"></i>${escapeHtml(statusLabel(user.access_status))}</span></td>
        <td><span class="admin-role">${escapeHtml(user.role === 'admin' ? 'Administrator' : 'Member')}</span></td>
        <td><time datetime="${escapeHtml(user.created || '')}">${escapeHtml(formatDate(user.created))}</time></td>
        <td><button class="admin-row-open" type="button" data-inspect-user="${escapeHtml(user.id)}" aria-label="Inspect ${escapeHtml(displayName(user))}">${I_CHEVRON_RIGHT(17)}</button></td>
    </tr>`;
}

function renderUsers() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;
    const users = filteredUsers();
    setText('admin-filter-count', `${users.length} member${users.length === 1 ? '' : 's'}`);
    const html = users.length
        ? users.map(userRow).join('')
        : '<tr><td colspan="6"><div class="admin-empty-state"><strong>No members found</strong><span>Change the search or filters to see more accounts.</span></div></td></tr>';
    if (container.innerHTML !== html) container.innerHTML = html;
    renderBulkBar();
}

function renderBulkBar() {
    const bar = document.getElementById('admin-bulk-bar');
    if (!bar) return;
    bar.hidden = state.selected.size === 0;
    setText('admin-selected-count', state.selected.size);
    bar.querySelectorAll('button').forEach((button) => {
        button.disabled = state.bulkPending;
    });
}

function inspectorHtml(user) {
    const self = isSelf(user);
    const tab = state.inspectorTab;
    const data = state.inspectorData.get(user.id) || {};
    const activity = data.activity || null;
    const library = data.library || null;
    let tabContent = '';
    if (tab === 'activity') {
        const activityContent = activity?.track
            ? `<div class="admin-activity-now"><span class="admin-activity-pulse" aria-hidden="true"></span><div><strong>${escapeHtml(activity.track.title || 'Untitled track')}</strong><small>${escapeHtml(activity.track.subtitle || 'Playing in Monochrome')} · ${activity.is_playing ? 'Listening now' : 'Paused'}</small></div></div>`
            : activity
              ? '<p class="admin-inspector-empty">No listening activity in the last 90 seconds.</p>'
              : '<p class="admin-inspector-loading">Loading activity…</p>';
        tabContent = `<section class="admin-inspector-panel" aria-live="polite"><h3>Recent activity</h3>${activityContent}</section>`;
    } else if (tab === 'library') {
        const libraryContent =
            library === null
                ? '<p class="admin-inspector-loading">Loading library…</p>'
                : library.length
                  ? `<ul class="admin-library-list">${library
                        .slice(0, 8)
                        .map(
                            (track) =>
                                `<li><span><strong>${escapeHtml(track.title || 'Untitled track')}</strong><small>${escapeHtml(track.artist || 'Unknown artist')}${track.album ? ` · ${escapeHtml(track.album)}` : ''}</small></span></li>`
                        )
                        .join(
                            ''
                        )}</ul>${library.length > 8 ? `<p class="admin-inspector-note">Showing 8 of ${formatCount(library.length)} uploaded tracks.</p>` : ''}`
                  : '<p class="admin-inspector-empty">No uploaded tracks yet.</p>';
        tabContent = `<section class="admin-inspector-panel" aria-live="polite"><div class="admin-inspector-panel-heading"><h3>Uploaded library</h3><span>${library === null ? '—' : formatCount(library.length)} tracks</span></div>${libraryContent}</section>`;
    } else {
        tabContent = `<dl class="admin-member-facts">
        <div><dt>Email</dt><dd>${escapeHtml(user.email || 'Not set')}</dd></div>
        <div><dt>Joined</dt><dd>${escapeHtml(formatDate(user.created))}</dd></div>
        <div><dt>Verified</dt><dd>${user.verified ? 'Yes' : 'No'}</dd></div>
        <div><dt>Account ID</dt><dd title="${escapeHtml(user.id)}">${escapeHtml(user.id)}</dd></div>
    </dl>
    <div class="admin-inspector-fields">
        <label><span>Role</span><select data-member-role ${self ? 'disabled' : ''}><option value="member" ${user.role === 'member' ? 'selected' : ''}>Member</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option></select></label>
        <label><span>Status</span><select data-member-status ${self ? 'disabled' : ''}><option value="pending" ${user.access_status === 'pending' ? 'selected' : ''}>Pending</option><option value="active" ${user.access_status === 'active' ? 'selected' : ''}>Active</option><option value="banned" ${user.access_status === 'banned' ? 'selected' : ''}>Suspended</option></select></label>
    </div>
    <div class="admin-inspector-actions">
        <button class="btn-primary" type="button" data-save-member ${self ? 'disabled' : ''}>${I_CHECK(16)}Save member</button>
        <button class="btn-secondary" type="button" data-reset-member>${I_MAIL(16)}Send password reset</button>
        <button class="btn-secondary danger" type="button" data-delete-member ${self ? 'disabled' : ''}>${I_TRASH(16)}Delete account</button>
    </div>
    ${self ? '<p class="admin-inspector-note">Your own role and access cannot be changed from this console.</p>' : ''}`;
    }
    return `<div class="admin-inspector-head">
        ${avatarMarkup(user, 'large')}
        <div><strong id="admin-inspector-title">${escapeHtml(displayName(user))}</strong><span>${escapeHtml(user.email || 'No email')}</span></div>
        <button type="button" data-close-inspector aria-label="Close member details">${I_X(18)}</button>
    </div>
    <div class="admin-inspector-tabs" role="tablist" aria-label="Member detail sections">
        ${['details', 'activity', 'library'].map((value) => `<button class="${tab === value ? 'is-active' : ''}" type="button" role="tab" aria-selected="${tab === value}" data-inspector-tab="${value}">${value[0].toUpperCase()}${value.slice(1)}</button>`).join('')}
    </div>
    ${tabContent}`;
}

function renderInspector() {
    const inspector = document.getElementById('admin-member-inspector');
    if (!inspector) return;
    const user = state.users.find((candidate) => candidate.id === state.inspectedUserId);
    inspector.hidden = !user;
    if (!user) {
        inspector.innerHTML = '';
        return;
    }
    const html = inspectorHtml(user);
    if (inspector.innerHTML !== html) inspector.innerHTML = html;
}

function setInspectorBackgroundInert(enabled) {
    if (!window.matchMedia('(max-width: 560px)').matches && enabled) return;
    document
        .querySelectorAll(
            '#page-admin .admin-local-nav, #page-admin .admin-page-header, #page-admin .admin-overview-section, #page-admin .admin-member-toolbar, #page-admin .admin-table-shell, #page-admin .admin-config-form'
        )
        .forEach((element) => {
            element.inert = enabled;
        });
    document.body.classList.toggle('admin-inspector-open', enabled);
}

function trapInspectorFocus(event) {
    if (event.key !== 'Tab' || !state.inspectedUserId || !window.matchMedia('(max-width: 560px)').matches) return;
    const inspector = document.getElementById('admin-member-inspector');
    const focusable = [
        ...inspector.querySelectorAll(
            'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function openInspector(userId) {
    inspectorReturnUserId = userId;
    state.inspectedUserId = userId;
    state.inspectorTab = 'details';
    renderUsers();
    renderInspector();
    const inspector = document.getElementById('admin-member-inspector');
    const modal = window.matchMedia('(max-width: 560px)').matches;
    inspector?.setAttribute('aria-modal', String(modal));
    setInspectorBackgroundInert(modal);
    inspector?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest',
    });
    window.requestAnimationFrame(() => inspector?.querySelector('[data-close-inspector]')?.focus());
}

function closeInspector() {
    const returnUserId = inspectorReturnUserId;
    state.inspectedUserId = null;
    renderUsers();
    renderInspector();
    setInspectorBackgroundInert(false);
    if (returnUserId) {
        document.querySelector(`[data-inspect-user="${CSS.escape(returnUserId)}"]`)?.focus();
    }
    inspectorReturnUserId = null;
}

async function fetchMetric(collection, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
        const result = await pb.collection(collection).getList(1, 1, {
            fields: 'id',
            requestKey: null,
            signal: controller.signal,
            ...options,
        });
        return { value: result.totalItems || 0, ok: true };
    } catch {
        return { value: null, ok: false };
    } finally {
        window.clearTimeout(timeout);
    }
}

async function probeHealth(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
        const response = await fetch(url, {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        return response.ok ? 'healthy' : 'degraded';
    } catch {
        return 'degraded';
    } finally {
        window.clearTimeout(timeout);
    }
}

function scheduleHealthRefresh() {
    window.clearTimeout(healthRefreshTimer);
    healthRefreshTimer = window.setTimeout(async () => {
        const page = document.getElementById('page-admin');
        if (!page || page.hidden || getComputedStyle(page).display === 'none') return;
        await loadMetrics();
        scheduleHealthRefresh();
    }, 30_000);
}

async function loadMetrics() {
    const activeThreshold = new Date(Date.now() - 90_000).toISOString().replace('T', ' ');
    const [tracks, online, imports, pocketbase, importer] = await Promise.all([
        fetchMetric('music_tracks'),
        fetchMetric('social_presence', { filter: `last_seen >= "${activeThreshold}"` }),
        fetchMetric('music_import_jobs', {
            filter: 'status = "queued" || status = "resolving" || status = "downloading"',
        }),
        probeHealth('/api/health'),
        probeHealth('/api/selfhost/health'),
    ]);
    state.metrics = { tracks: tracks.value, online: online.value, imports: imports.value };
    state.health = {
        pocketbase,
        importer,
        metrics: tracks.ok && online.ok && imports.ok ? 'healthy' : 'degraded',
    };
    renderHealth();
    renderMetrics();
}

async function loadUsers() {
    const container = document.getElementById('admin-users-list');
    if (container)
        container.innerHTML =
            '<tr><td colspan="6"><div class="admin-loading"><span></span><span>Loading members…</span></div></td></tr>';
    try {
        const [users, profiles] = await Promise.all([
            pb.collection('users').getFullList({ sort: '-created', requestKey: null }),
            pb
                .collection('social_profiles')
                .getFullList({ fields: 'user,avatar_url', requestKey: null })
                .catch(() => []),
        ]);
        state.users = users;
        state.profiles = new Map(profiles.map((profile) => [String(profile.user), profile]));
        state.usersReady = true;
        state.selected = new Set([...state.selected].filter((id) => state.users.some((user) => user.id === id)));
        if (state.inspectedUserId && !state.users.some((user) => user.id === state.inspectedUserId)) {
            state.inspectedUserId = null;
        }
        renderMetrics();
        renderUsers();
        renderInspector();
    } catch (error) {
        state.usersReady = false;
        renderMetrics();
        if (container) {
            container.innerHTML = `<tr><td colspan="6"><div class="admin-empty-state is-error"><strong>Members could not be loaded</strong><span>${escapeHtml(error.message)}</span></div></td></tr>`;
        }
    }
}

async function loadInspectorTab(user, tab) {
    if (tab === 'details' || state.inspectorData.get(user.id)?.[tab]) return;
    const current = state.inspectorData.get(user.id) || {};
    state.inspectorData.set(user.id, { ...current, [tab]: null });
    renderInspector();
    try {
        const value =
            tab === 'activity'
                ? await pb
                      .collection('social_presence')
                      .getFirstListItem(`user="${user.id}"`, { fields: 'track,is_playing,last_seen' })
                      .catch(() => null)
                : await pb
                      .collection('music_tracks')
                      .getFullList({
                          filter: `owner="${user.id}"`,
                          fields: 'id,title,artist,album',
                          sort: '-created',
                          requestKey: null,
                      });
        let normalized = value || [];
        if (tab === 'activity' && value) {
            let track = value.track;
            if (typeof track === 'string') {
                try {
                    track = JSON.parse(track || 'null');
                } catch {
                    track = null;
                }
            }
            normalized = { ...value, track };
        }
        state.inspectorData.set(user.id, { ...current, [tab]: normalized });
    } catch {
        state.inspectorData.set(user.id, { ...current, [tab]: [] });
    }
    renderInspector();
}

async function updateUsers(ids, data, successMessage) {
    const targets = state.users.filter((user) => ids.includes(user.id) && !isSelf(user));
    if (!targets.length) return;
    state.bulkPending = targets.length > 1;
    renderBulkBar();
    const approveAll = document.getElementById('admin-approve-all');
    if (approveAll) approveAll.disabled = state.bulkPending;
    const results = await Promise.allSettled(targets.map((user) => pb.collection('users').update(user.id, data)));
    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    try {
        state.selected.clear();
        await loadUsers();
        if (failed === 0) showFeedback(successMessage, 'success');
        else if (succeeded > 0)
            showFeedback(`${succeeded} updated; ${failed} failed. The list has been refreshed.`, 'error');
        else showFeedback('No accounts were updated. The list has been refreshed.', 'error');
    } finally {
        state.bulkPending = false;
        renderBulkBar();
        if (approveAll) approveAll.disabled = false;
    }
}

async function deleteUser(user) {
    if (!user || isSelf(user)) return;
    const admins = state.users.filter((candidate) => candidate.role === 'admin');
    if (user.role === 'admin' && admins.length <= 1) {
        showFeedback('Keep at least one administrator on the instance.', 'error');
        return;
    }
    if (!window.confirm(`Delete ${displayName(user)} and their account data? This cannot be undone.`)) return;
    try {
        await pb.collection('users').delete(user.id);
        closeInspector();
        await loadUsers();
        showFeedback(`${displayName(user)} was deleted.`, 'success');
    } catch (error) {
        showFeedback(error.message || 'The account could not be deleted.', 'error');
    }
}

function populateConfig(config) {
    state.config = config;
    for (const [field, id] of Object.entries(CONFIG_FIELDS)) {
        const input = document.getElementById(id);
        if (!input) continue;
        if (input.type === 'checkbox') input.checked = Boolean(config[field]);
        else input.value = config[field] || '';
    }
    setText('admin-instance-name-nav', config.instance_name?.trim() || 'Monochrome');
    setText(
        'admin-access-state',
        config.maintenance_mode ? 'Admins only' : config.registrations_open ? 'Open' : 'Invite only'
    );
    setText('admin-announcement-count', String(config.announcement || '').length);
}

function readConfigForm() {
    const data = {};
    for (const [field, id] of Object.entries(CONFIG_FIELDS)) {
        const input = document.getElementById(id);
        if (!input) continue;
        data[field] = input.type === 'checkbox' ? input.checked : input.value.trim();
    }
    if (!data.instance_name) data.instance_name = 'Monochrome';
    return data;
}

function bindPage() {
    const usersContainer = document.getElementById('admin-users-list');
    const inspector = document.getElementById('admin-member-inspector');
    const configForm = document.getElementById('admin-config-form');
    if (!usersContainer || usersContainer.dataset.bound) return;
    usersContainer.dataset.bound = 'true';

    document.getElementById('admin-user-search')?.addEventListener('input', renderUsers);
    document.getElementById('admin-status-filter')?.addEventListener('change', renderUsers);
    document.getElementById('admin-role-filter')?.addEventListener('change', renderUsers);
    document.getElementById('admin-approve-all')?.addEventListener('click', () => {
        const ids = state.users.filter((user) => user.access_status === 'pending').map((user) => user.id);
        void updateUsers(
            ids,
            { access_status: 'active' },
            `${ids.length} pending account${ids.length === 1 ? '' : 's'} approved.`
        );
    });

    usersContainer.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-inspect-user]');
        if (trigger) openInspector(trigger.dataset.inspectUser);
    });
    usersContainer.addEventListener('change', (event) => {
        const checkbox = event.target.closest('[data-select-user]');
        if (!checkbox) return;
        if (checkbox.checked) state.selected.add(checkbox.dataset.selectUser);
        else state.selected.delete(checkbox.dataset.selectUser);
        renderBulkBar();
    });

    document.getElementById('admin-bulk-bar')?.addEventListener('click', (event) => {
        const status = event.target.closest('[data-bulk-status]')?.dataset.bulkStatus;
        if (status) {
            void updateUsers(
                [...state.selected],
                { access_status: status },
                `Selected accounts marked ${statusLabel(status).toLowerCase()}.`
            );
        }
        if (event.target.closest('[data-bulk-clear]')) {
            state.selected.clear();
            renderUsers();
        }
    });

    inspector?.addEventListener('click', async (event) => {
        const user = state.users.find((candidate) => candidate.id === state.inspectedUserId);
        if (!user) return;
        if (event.target.closest('[data-close-inspector]')) return closeInspector();
        const tab = event.target.closest('[data-inspector-tab]')?.dataset.inspectorTab;
        if (tab) {
            state.inspectorTab = tab;
            renderInspector();
            void loadInspectorTab(user, tab);
            return;
        }
        if (event.target.closest('[data-delete-member]')) return void deleteUser(user);
        if (event.target.closest('[data-reset-member]')) {
            try {
                await pb.collection('users').requestPasswordReset(user.email);
                showFeedback(`Password reset sent to ${user.email}.`, 'success');
            } catch (error) {
                showFeedback(error.message || 'The reset email could not be sent.', 'error');
            }
            return;
        }
        if (event.target.closest('[data-save-member]')) {
            const role = inspector.querySelector('[data-member-role]').value;
            const accessStatus = inspector.querySelector('[data-member-status]').value;
            const admins = state.users.filter((candidate) => candidate.role === 'admin');
            if (user.role === 'admin' && role !== 'admin' && admins.length <= 1) {
                return showFeedback('Keep at least one administrator on the instance.', 'error');
            }
            await updateUsers([user.id], { role, access_status: accessStatus }, `${displayName(user)} was updated.`);
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.inspectedUserId) closeInspector();
        else trapInspectorFocus(event);
    });

    configForm?.addEventListener('input', (event) => {
        configForm.classList.add('is-dirty');
        if (event.target.id === 'admin-announcement') setText('admin-announcement-count', event.target.value.length);
    });
    configForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = configForm.querySelector('button[type="submit"]');
        button.disabled = true;
        showFeedback('Saving instance policy…');
        try {
            const saved = await pb.collection('app_config').update(configForm.dataset.recordId, readConfigForm());
            const config = applyInstancePolicy(saved);
            populateConfig(config);
            configForm.classList.remove('is-dirty');
            showFeedback('Instance policy saved and applied.', 'success');
        } catch (error) {
            showFeedback(error.message || 'The instance policy could not be saved.', 'error');
        } finally {
            button.disabled = false;
        }
    });

    document.querySelectorAll('[data-admin-section]').forEach((link) => {
        link.addEventListener('click', () => {
            document
                .querySelectorAll('[data-admin-section]')
                .forEach((candidate) => candidate.classList.remove('is-active'));
            link.classList.add('is-active');
        });
    });
}

export const adminManager = {
    async renderPage(ui) {
        if (!isAdminAccount()) {
            window.history.replaceState({}, '', '/');
            await ui.renderHomePage();
            return;
        }

        await ui.showPage('admin');
        bindPage();
        showFeedback('Changes are applied to the whole instance.');
        try {
            const config = await loadAppConfig();
            populateConfig(config);
            const form = document.getElementById('admin-config-form');
            if (form) form.dataset.recordId = config.id || '';
        } catch (error) {
            showFeedback(error.message || 'Instance policy could not be loaded.', 'error');
        }
        await Promise.all([loadUsers(), loadMetrics()]);
        scheduleHealthRefresh();
    },

    updateVisibility() {
        const link = document.getElementById('sidebar-nav-admin');
        if (link) link.hidden = !isAdminAccount();
    },
};
