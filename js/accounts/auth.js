// js/accounts/auth.js
import { auth, pb } from './config.js';

export class AuthManager {
    constructor() {
        this.user = null;
        this.authListeners = [];
        this.accessCheckInterval = null;
        this.accessSubscription = null;
        this.ready = this.init().catch((error) => {
            console.error(error);
            this.user = null;
        });
    }

    async init() {
        const params = new URLSearchParams(window.location.search);
        const userId = params.get('userId');
        const secret = params.get('secret');
        const isOAuthRedirect = params.get('oauth') === '1';

        if (userId && secret && userId !== 'null' && secret !== 'null') {
            if (window.location.pathname !== '/reset-password') {
                try {
                    await auth.createSession(userId, secret);
                    window.history.replaceState({}, '', window.location.pathname);
                } catch (error) {
                    console.warn('OAuth session handoff failed:', error.message);
                    window.history.replaceState({}, '', window.location.pathname);
                }
            }
        } else if (isOAuthRedirect) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            window.history.replaceState({}, '', window.location.pathname);
        }

        try {
            this.user = await auth.get();
            this.startAccessMonitor();
            this.updateUI(this.user);
            this.authListeners.forEach((listener) => listener(this.user));
        } catch {
            this.user = null;
            this.updateUI(null);
        }
    }

    onAuthStateChanged(callback) {
        this.authListeners.push(callback);
        // If we already have a user state, trigger immediately
        if (this.user !== null) {
            callback(this.user);
        }
    }

    startAccessMonitor() {
        if (!window.__AUTH_GATE__ || !this.user) return;
        this.stopAccessMonitor();

        const userId = this.user.$id;
        const revokeAccess = () => {
            this.stopAccessMonitor();
            pb.authStore.clear();
            this.user = null;
            window.location.reload();
        };
        const validateAccess = async () => {
            try {
                const user = await auth.get();
                if (user.access_status !== 'active') revokeAccess();
            } catch {
                revokeAccess();
            }
        };

        pb.collection('users')
            .subscribe(userId, (event) => {
                if (event.record?.access_status !== 'active') revokeAccess();
            })
            .then((unsubscribe) => {
                this.accessSubscription = unsubscribe;
            })
            .catch((error) => console.warn('Unable to monitor account status:', error));

        this.accessCheckInterval = window.setInterval(validateAccess, 60_000);
        document.addEventListener('visibilitychange', validateAccess, { signal: this.accessMonitorAbort.signal });
    }

    stopAccessMonitor() {
        if (this.accessCheckInterval) window.clearInterval(this.accessCheckInterval);
        this.accessCheckInterval = null;
        void this.accessSubscription?.();
        this.accessSubscription = null;
        this.accessMonitorAbort?.abort();
        this.accessMonitorAbort = new AbortController();
    }

    async signInWithGoogle() {
        try {
            auth.createOAuth2Session(
                'google',
                window.location.origin + '/index.html?oauth=1',
                window.location.origin + '/login.html'
            );
        } catch (error) {
            console.error('Login failed:', error);
            alert(`Login failed: ${error.message}`);
        }
    }

    async signInWithGitHub() {
        try {
            auth.createOAuth2Session(
                'github',
                window.location.origin + '/index.html?oauth=1',
                window.location.origin + '/login.html'
            );
        } catch (error) {
            console.error('Login failed:', error);
            alert(`Login failed: ${error.message}`);
        }
    }

    async signInWithSpotify() {
        try {
            auth.createOAuth2Session(
                'spotify',
                window.location.origin + '/index.html?oauth=1',
                window.location.origin + '/login.html'
            );
        } catch (error) {
            console.error('Login failed:', error);
            alert(`Login failed: ${error.message}`);
        }
    }

    async signInWithDiscord() {
        try {
            auth.createOAuth2Session(
                'discord',
                window.location.origin + '/index.html?oauth=1',
                window.location.origin + '/login.html'
            );
        } catch (error) {
            console.error('Login failed:', error);
            alert(`Login failed: ${error.message}`);
        }
    }

    async signInWithEmail(email, password, { silent = false } = {}) {
        try {
            await auth.createEmailPasswordSession(email, password);
            this.user = await auth.get();
            this.startAccessMonitor();
            this.updateUI(this.user);
            this.authListeners.forEach((listener) => listener(this.user));
            return this.user;
        } catch (error) {
            console.error('Email Login failed:', error);
            if (!silent) alert(`Login failed: ${error.message}`);
            throw error;
        }
    }

    async signUpWithEmail(email, password, { silent = false } = {}) {
        try {
            const user = await auth.create('unique()', email, password);
            if (!silent) alert('Account request created. An administrator must approve it before you can sign in.');
            return user;
        } catch (error) {
            console.error('Sign Up failed:', error);
            if (!silent) alert(`Sign Up failed: ${error.message}`);
            throw error;
        }
    }

    async sendPasswordReset(email) {
        try {
            await auth.createRecovery(email, window.location.origin + '/reset-password');
            alert(`Password reset email sent to ${email}`);
        } catch (error) {
            console.error('Password reset failed:', error);
            alert(`Failed to send reset email: ${error.message}`);
            throw error;
        }
    }

    async resetPassword(userId, secret, password, confirmPassword) {
        if (password !== confirmPassword) {
            throw new Error('Passwords do not match');
        }
        try {
            await auth.updateRecovery(userId, secret, password, password);
        } catch (error) {
            console.error('Password reset failed:', error);
            throw error;
        }
    }

    async signOut() {
        try {
            this.stopAccessMonitor();
            await auth.deleteSession('current');
            this.user = null;
            this.updateUI(null);
            this.authListeners.forEach((listener) => listener(null));

            if (window.__AUTH_GATE__) {
                window.location.href = '/login';
            } else {
                window.location.reload();
            }
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        }
    }

    updateUI(user) {
        const connectBtn = document.getElementById('auth-connect-btn');
        const clearDataBtn = document.getElementById('auth-clear-cloud-btn');
        const statusText = document.getElementById('auth-status');
        const emailContainer = document.getElementById('email-auth-container');
        const emailToggleBtn = document.getElementById('toggle-email-auth-btn');
        const githubBtn = document.getElementById('auth-github-btn');
        const discordBtn = document.getElementById('auth-discord-btn');

        if (!connectBtn) return;

        if (window.__AUTH_GATE__) {
            connectBtn.textContent = 'Sign Out';
            connectBtn.classList.add('danger');
            connectBtn.onclick = () => this.signOut();
            if (clearDataBtn) clearDataBtn.style.display = 'none';
            if (emailContainer) emailContainer.style.display = 'none';
            if (emailToggleBtn) emailToggleBtn.style.display = 'none';
            if (githubBtn) githubBtn.style.display = 'none';
            if (discordBtn) discordBtn.style.display = 'none';
            if (statusText) statusText.textContent = user ? `Signed in as ${user.email}` : 'Signed in';

            const accountPage = document.getElementById('page-account');
            if (accountPage) {
                const title = accountPage.querySelector('.section-title');
                if (title) title.textContent = 'Account';
                accountPage.querySelectorAll('.account-content > p, .account-content > div').forEach((el) => {
                    if (el.id !== 'auth-status' && el.id !== 'auth-buttons-container') {
                        el.style.display = 'none';
                    }
                });
            }

            const customDbBtn = document.getElementById('custom-db-btn');
            if (customDbBtn) {
                const pbFromEnv = !!window.__POCKETBASE_URL__;
                if (pbFromEnv) {
                    const settingItem = customDbBtn.closest('.setting-item');
                    if (settingItem) settingItem.style.display = 'none';
                }
            }

            return;
        }

        if (user) {
            connectBtn.textContent = 'Sign Out';
            connectBtn.classList.add('danger');
            connectBtn.onclick = () => this.signOut();

            if (clearDataBtn) clearDataBtn.style.display = 'block';
            if (emailContainer) emailContainer.style.display = 'none';
            if (emailToggleBtn) emailToggleBtn.style.display = 'none';
            if (githubBtn) githubBtn.style.display = 'none';
            if (discordBtn) discordBtn.style.display = 'none';
            if (statusText) statusText.textContent = `Signed in as ${user.email}`;
        } else {
            connectBtn.textContent = 'Sign in with Email';
            connectBtn.classList.remove('danger');
            connectBtn.onclick = () => emailToggleBtn?.click();

            if (clearDataBtn) clearDataBtn.style.display = 'none';
            if (emailToggleBtn) emailToggleBtn.style.display = 'inline-block';
            if (githubBtn) githubBtn.style.display = 'none';
            if (discordBtn) discordBtn.style.display = 'none';
            if (statusText) statusText.textContent = 'Secure self-hosted sync on this server';
        }
    }
}

export const authManager = new AuthManager();
