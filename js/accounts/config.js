import PocketBase from 'pocketbase';

const getPocketBaseUrl = () => {
    if (typeof window === 'undefined') return 'http://127.0.0.1:8090';
    const local = window.localStorage?.getItem('monochrome-pocketbase-url');
    if (local) return local;
    if (window.__POCKETBASE_URL__) return window.__POCKETBASE_URL__;
    return window.location.origin;
};

const normalizeUser = (model) => {
    if (!model) return null;
    return {
        ...model,
        $id: model.id || model.$id,
        email: model.email,
        name: model.name || model.username || model.email,
    };
};

const pb = new PocketBase(getPocketBaseUrl());
pb.autoCancellation(false);

const account = {
    async get() {
        if (!pb.authStore.isValid || !pb.authStore.model) {
            throw new Error('Not signed in');
        }
        try {
            const refreshed = await pb.collection('users').authRefresh();
            return normalizeUser(refreshed.record || pb.authStore.model);
        } catch {
            pb.authStore.clear();
            throw new Error('Not signed in');
        }
    },

    async create(id, email, password) {
        const username = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || undefined;
        const record = await pb.collection('users').create({
            email,
            password,
            passwordConfirm: password,
            name: username,
        });
        return normalizeUser(record);
    },

    async createEmailPasswordSession(email, password) {
        const result = await pb.collection('users').authWithPassword(email, password);
        return normalizeUser(result.record);
    },

    async deleteSession() {
        pb.authStore.clear();
    },

    async createRecovery(email) {
        await pb.collection('users').requestPasswordReset(email);
    },

    async updateRecovery(token, _secret, password, confirmPassword) {
        await pb.collection('users').confirmPasswordReset(token, password, confirmPassword || password);
    },

    createOAuth2Session(provider) {
        throw new Error(`${provider} OAuth is disabled in self-hosted mode. Use email/password accounts.`);
    },
};

export { pb, account as auth };
