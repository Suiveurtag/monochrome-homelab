import { pb } from './accounts/config.js';

import { ListeningOutbox } from './listening-outbox.js';

const counts = new Map();
let outbox;
let bound = false;
let running = false;
let retryTimer;
let accountId;
const restore = () => outbox.restore(pb.authStore.record?.id);
async function flush() {
    if (running || !pb.authStore.isValid) return;
    running = true;
    clearTimeout(retryTimer);
    try {
        for (const [id, entry] of outbox.entries) {
            const uid = pb.authStore.record?.id;
            if (entry.userId !== uid) continue;
            try {
                const result = await pb.send('/api/monochrome/listening/sessions', {
                    method: 'POST',
                    body: entry.payload,
                    requestKey: null,
                });
                // Never deliver an old account's response into the new account's UI.
                if (pb.authStore.record?.id === uid) {
                    counts.set(result.trackId, result.globalStreams);
                    window.dispatchEvent(new CustomEvent('listening-stream-synced', { detail: result }));
                }
                outbox.acknowledge(id, entry);
            } catch (error) {
                if (error.status === 400 || error.status === 404) {
                    // Invalid/unavailable tracks cannot become streams. Other errors retain the checkpoint.
                    outbox.acknowledge(id, entry);
                    console.warn('Listening sync rejected a session', error);
                    continue;
                }
                break;
            }
        }
    } finally {
        running = false;
        if ([...outbox.entries.values()].some((entry) => entry.userId === pb.authStore.record?.id))
            retryTimer = setTimeout(() => void flush(), 15000);
    }
}
export function initializeListeningSync(tracker) {
    if (bound) return;
    bound = true;
    outbox = new ListeningOutbox();
    accountId = pb.authStore.record?.id;
    tracker.setSessionSink((payload, userId) => {
        outbox.enqueue(userId, payload);
        void flush();
    });
    restore();
    void flush();
    pb.authStore.onChange(() => {
        if (accountId !== pb.authStore.record?.id) counts.clear();
        accountId = pb.authStore.record?.id;
        restore();
        void flush();
    });
    window.addEventListener('online', () => {
        restore();
        void flush();
    });
    window.addEventListener('storage', (event) => {
        if (event.key?.startsWith(outbox.key(pb.authStore.record?.id, ''))) {
            restore();
            void flush();
        }
    });
}
export function getGlobalStreamCount(id) {
    return counts.get(String(id)) || 0;
}
export async function loadGlobalStreamCounts(ids) {
    const unique = [...new Set(ids.map(String))];
    for (let i = 0; i < unique.length; i += 100) {
        const filter = unique
            .slice(i, i + 100)
            .map((id) => pb.filter('track_id = {:id}', { id }))
            .join(' || ');
        if (!filter || !pb.authStore.isValid) continue;
        const result = await pb.collection('listening_totals').getFullList({ filter, requestKey: null });
        for (const record of result) counts.set(record.track_id, record.streams);
    }
}
