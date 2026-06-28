import { authManager } from './accounts/auth.js';
import { pb } from './accounts/config.js';
import { initializeDotField } from './dot-field.js';

const DEFAULT_CONFIG = {
    registrations_open: true,
    maintenance_mode: false,
    announcement: '',
};

async function loadAppConfig() {
    try {
        const result = await pb.collection('app_config').getList(1, 1, { requestKey: null });
        return result.items[0] || DEFAULT_CONFIG;
    } catch (error) {
        console.warn('Unable to load app configuration:', error);
        return DEFAULT_CONFIG;
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

export async function enforceAccessGate({ onReady } = {}) {
    await authManager.ready;
    const config = await loadAppConfig();
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
