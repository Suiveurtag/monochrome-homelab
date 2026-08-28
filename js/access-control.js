import { authManager } from './accounts/auth.js';
import { pb } from './accounts/config.js';
import { initializeDotField } from './dot-field.js';

export const DEFAULT_CONFIG = {
    registrations_open: true,
    maintenance_mode: false,
    announcement: '',
    instance_name: 'Monochrome',
    support_email: '',
    feature_social: true,
    feature_stats: true,
    feature_uploads: true,
    feature_parties: true,
    allow_uploads: true,
    allow_catalog_edits: true,
    allow_catalog_deletes: true,
    allow_downloads: true,
    allow_social_posts: true,
    allow_parties: true,
};

let cachedAppConfig = { ...DEFAULT_CONFIG };

const FEATURE_FIELDS = {
    social: 'feature_social',
    stats: 'feature_stats',
    uploads: 'feature_uploads',
    parties: 'feature_parties',
};

const PERMISSION_FIELDS = {
    upload_music: 'allow_uploads',
    edit_catalog: 'allow_catalog_edits',
    delete_catalog: 'allow_catalog_deletes',
    download_music: 'allow_downloads',
    create_social_posts: 'allow_social_posts',
    create_parties: 'allow_parties',
};

export function isAdminAccount(user = authManager.user) {
    return user?.access_status === 'active' && user?.role === 'admin';
}

export function getCachedAppConfig() {
    return cachedAppConfig;
}

export function isFeatureEnabled(feature, user = authManager.user, config = cachedAppConfig) {
    if (isAdminAccount(user)) return true;
    const field = FEATURE_FIELDS[feature];
    return field ? config[field] !== false : true;
}

export function canUsePermission(permission, user = authManager.user, config = cachedAppConfig) {
    if (isAdminAccount(user)) return true;
    if (!user || user.access_status !== 'active') return false;
    const field = PERMISSION_FIELDS[permission];
    if (!field) return true;
    if (permission === 'upload_music' && config.feature_uploads === false) return false;
    if (permission === 'create_social_posts' && config.feature_social === false) return false;
    if (permission === 'create_parties' && config.feature_parties === false) return false;
    return config[field] !== false;
}

export function applyInstancePolicy(config = cachedAppConfig) {
    cachedAppConfig = { ...DEFAULT_CONFIG, ...config };
    const root = document.documentElement;
    const featureTargets = {
        social: document.getElementById('sidebar-nav-social'),
        stats: document.getElementById('sidebar-nav-recent'),
        uploads: document.getElementById('sidebar-nav-upload'),
        parties: document.getElementById('sidebar-nav-party'),
    };
    for (const [feature, element] of Object.entries(featureTargets)) {
        if (element) element.hidden = !isFeatureEnabled(feature);
    }
    root.dataset.canUpload = String(canUsePermission('upload_music'));
    root.dataset.canEditCatalog = String(canUsePermission('edit_catalog'));
    root.dataset.canDeleteCatalog = String(canUsePermission('delete_catalog'));
    root.dataset.canDownload = String(canUsePermission('download_music'));
    root.dataset.canPost = String(canUsePermission('create_social_posts'));
    root.dataset.canHostParties = String(canUsePermission('create_parties'));
    const name = cachedAppConfig.instance_name?.trim() || 'Monochrome';
    document.documentElement.style.setProperty('--instance-name-length', String(name.length));
    window.dispatchEvent(new CustomEvent('instance-policy-applied', { detail: cachedAppConfig }));
    return cachedAppConfig;
}

async function loadAppConfig() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
        const result = await pb.collection('app_config').getList(1, 1, {
            requestKey: null,
            signal: controller.signal,
        });
        cachedAppConfig = { ...DEFAULT_CONFIG, ...(result.items[0] || {}) };
        return cachedAppConfig;
    } catch (error) {
        console.warn('Unable to load app configuration:', error);
        cachedAppConfig = { ...DEFAULT_CONFIG };
        return cachedAppConfig;
    } finally {
        window.clearTimeout(timeout);
    }
}

function setMessage(element, message, kind = '') {
    element.textContent = message;
    element.dataset.kind = kind;
}

function applyAnnouncement(config) {
    const banner = document.getElementById('global-admin-announcement');
    if (!banner) return;
    banner.textContent = config.announcement || '';
    banner.hidden = !config.announcement;
}

function wait(duration) {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function initializeLockClickAnimation(card) {
    const icon = card?.querySelector('.access-card-icon');
    if (!icon) return;

    let animationTimer = null;
    const triggerAnimation = () => {
        if (animationTimer) {
            window.clearTimeout(animationTimer);
            animationTimer = null;
        }
        icon.classList.remove('is-lock-clicked');
        window.requestAnimationFrame(() => {
            icon.classList.add('is-lock-clicked');
            animationTimer = window.setTimeout(() => {
                icon.classList.remove('is-lock-clicked');
                animationTimer = null;
            }, 560);
        });
    };

    icon.addEventListener('click', triggerAnimation);
}

async function playAccessGrantedAnimation(card, message) {
    if (!card) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const icon = card.querySelector('.access-card-icon');
    if (icon) {
        const cardRect = card.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        icon.style.setProperty(
            '--access-success-x',
            `${cardRect.left + cardRect.width / 2 - iconRect.left - iconRect.width / 2}px`
        );
        icon.style.setProperty(
            '--access-success-y',
            `${cardRect.top + cardRect.height / 2 - iconRect.top - iconRect.height / 2}px`
        );
    }
    setMessage(message, 'Access granted', 'success');
    card.setAttribute('aria-busy', 'true');
    card.classList.add('is-auth-success');
    await wait(reducedMotion ? 250 : 1650);
    card.removeAttribute('aria-busy');
}

export async function enforceAccessGate({ onReady } = {}) {
    await authManager.ready;
    const config = await loadAppConfig();
    applyInstancePolicy(config);
    applyAnnouncement(config);

    if (!window.__AUTH_GATE__) {
        await onReady?.({ gateVisible: false });
        return;
    }

    const gate = document.getElementById('access-gate');
    const form = document.getElementById('access-gate-form');
    const email = document.getElementById('access-email');
    const password = document.getElementById('access-password');
    const submit = document.getElementById('access-signin');
    const signup = document.getElementById('access-signup');
    const message = document.getElementById('access-message');
    const maintenance = document.getElementById('access-maintenance');
    const maintenanceSignout = document.getElementById('access-maintenance-signout');
    const card = gate?.querySelector('.access-card');

    const canEnter =
        authManager.user?.access_status === 'active' &&
        (!config.maintenance_mode || authManager.user?.role === 'admin');
    if (canEnter) {
        gate.hidden = true;
        await onReady?.({ gateVisible: false });
        return;
    }

    gate.hidden = false;
    document.body.classList.add('access-gated');
    initializeDotField(document.getElementById('access-dot-field'), {
        dotRadius: 1.5,
        dotSpacing: 14,
        bulgeStrength: 67,
        glowRadius: 160,
        sparkle: false,
        waveAmplitude: 0,
        cursorRadius: 500,
        cursorForce: 0.1,
        bulgeOnly: true,
        gradientFrom: '#8300ff',
        gradientTo: '#B497CF',
        glowColor: '#120F17',
    });
    initializeLockClickAnimation(card);
    signup.disabled = !config.registrations_open;
    signup.title = config.registrations_open ? '' : 'Registrations are closed';

    if (config.maintenance_mode && authManager.user?.role !== 'admin') {
        form.hidden = true;
        maintenance.hidden = false;
        await onReady?.({ gateVisible: true });
        maintenanceSignout.onclick = async () => {
            await authManager.signOut();
            window.location.reload();
        };
        return new Promise(() => {});
    }

    await onReady?.({ gateVisible: true });

    return new Promise((resolve) => {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            submit.disabled = true;
            setMessage(message, 'Checking your account...');
            try {
                const user = await authManager.signInWithEmail(email.value.trim(), password.value, { silent: true });
                if (user.access_status !== 'active') throw new Error('Account not active');
                await playAccessGrantedAnimation(card, message);
                gate.hidden = true;
                document.body.classList.remove('access-gated');
                resolve();
            } catch {
                setMessage(
                    message,
                    'Access refused. Your account may still be pending or may have been banned.',
                    'error'
                );
            } finally {
                submit.disabled = false;
            }
        });

        signup.addEventListener('click', async () => {
            if (!config.registrations_open) return;
            if (!form.reportValidity()) return;
            signup.disabled = true;
            setMessage(message, 'Creating your request...');
            try {
                await authManager.signUpWithEmail(email.value.trim(), password.value, { silent: true });
                password.value = '';
                setMessage(
                    message,
                    'Request created. An administrator must approve your account before you can sign in.',
                    'success'
                );
            } catch (error) {
                setMessage(message, error?.message || 'Unable to create this account.', 'error');
            } finally {
                signup.disabled = false;
            }
        });
    });
}

export { loadAppConfig };
