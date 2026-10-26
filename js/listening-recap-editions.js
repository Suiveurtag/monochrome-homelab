import { pb } from './accounts/config.js';
import { syncManager } from './accounts/pocketbase.js';

// Collectible share-card editions. Every recap is pressed in one edition, picked per listener and period;
// watching the recap to its end adds that edition to the collection. Weekly and monthly pools never overlap.
// None ship right now. Add one as `id: { name, period: 'week' | 'month', font: [family, axes] | null, face }`,
// where `face` is the CSS font shorthand used to wait for the display font; then skin it in
// listening-recap.css (`.stats-ed-<id>`) and paint its share card in listening-share-themes.js.
export const EDITIONS = {};
export const POOLS = {
    week: Object.keys(EDITIONS).filter((id) => EDITIONS[id].period === 'week'),
    month: Object.keys(EDITIONS).filter((id) => EDITIONS[id].period === 'month'),
};
export const CLASSICS = { aura: 'Aura', vivid: 'Vivid', ink: 'Ink', paper: 'Paper' };

// FNV-1a: the same listener and period always land on the same edition, on every device.
// With no edition in the pool a recap is simply shown in the neutral skin.
export function editionFor(uid, period, anchor) {
    if (!POOLS[period].length) return null;
    let hash = 2166136261;
    for (const char of `${uid}|${period}|${anchor}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return POOLS[period][(hash >>> 0) % POOLS[period].length];
}

const fonts = new Map();
export function loadEditionFont(id) {
    const edition = EDITIONS[id];
    if (!edition?.font) return Promise.resolve();
    const [family, axes] = edition.font;
    if (!fonts.has(family)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}${axes ? `:${axes}` : ''}&display=swap`;
        const loaded = new Promise((resolve) => (link.onload = link.onerror = resolve));
        document.head.append(link);
        // A slow or blocked font never holds a recap back; the fallback stack takes over.
        const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
        fonts.set(
            family,
            Promise.race([loaded.then(() => document.fonts.load(`${edition.face} 40px "${family}"`)), timeout]).catch(
                () => {}
            )
        );
    }
    return fonts.get(family);
}

// ---------- Collection ----------

const STORE = 'monochrome-recaps';
const empty = () => ({ editions: {}, watched: {} });
const readLocal = (uid) => {
    try {
        return { ...empty(), ...JSON.parse(localStorage.getItem(`${STORE}:${uid}`) || '{}') };
    } catch {
        return empty();
    }
};
const merge = (a, b) => ({
    editions: { ...b.editions, ...a.editions },
    watched: { ...b.watched, ...a.watched },
});

let cache;
export function loadCollection() {
    const uid = pb.authStore.record?.id;
    if (!uid) return Promise.resolve(empty());
    if (cache?.uid === uid) return cache.promise;
    const promise = (async () => {
        const local = readLocal(uid);
        let remote;
        try {
            const record = await syncManager._getUserRecord(uid);
            remote = { ...empty(), ...syncManager.safeParseInternal(record?.recaps, 'recaps', {}) };
        } catch {
            /* Offline: this device's copy still counts and syncs on the next unlock. */
        }
        const state = merge(local, remote || empty());
        // Unlocks made offline reach the account once it is reachable again.
        if (remote && JSON.stringify(merge(remote, state)) !== JSON.stringify(remote)) persist(uid, state);
        return state;
    })();
    cache = { uid, promise };
    return promise;
}

function persist(uid, state) {
    try {
        localStorage.setItem(`${STORE}:${uid}`, JSON.stringify(state));
    } catch {
        /* The account copy still holds it. */
    }
    void syncManager._updateUserJSON(uid, 'recaps', state);
}

// Marks a recap as watched to its end and collects its edition; fresh is true the first time.
export async function collectEdition(key, edition) {
    const uid = pb.authStore.record?.id;
    const state = await loadCollection();
    const fresh = Boolean(edition) && !state.editions[edition];
    state.watched[key] ||= Date.now();
    if (fresh) state.editions[edition] = { at: Date.now(), from: key };
    if (uid) persist(uid, state);
    return { fresh, owned: Object.keys(state.editions).filter((id) => EDITIONS[id]).length };
}
