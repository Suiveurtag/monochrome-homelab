// A separate key per session prevents two browser tabs from overwriting each
// other's offline listens. Server-side session IDs make cross-tab retries safe.
export class ListeningOutbox {
    constructor(storage = localStorage) {
        this.storage = storage;
        this.entries = new Map();
    }
    key(userId, sessionId) {
        return `monochrome-listening-outbox:${userId}:${sessionId}`;
    }
    enqueue(userId, payload) {
        if (!userId || !payload.sessionId) return;
        const id = this.key(userId, payload.sessionId);
        const previous = this.entries.get(id);
        if (previous && previous.payload.lastAt > payload.lastAt) return;
        const entry = { userId, payload };
        this.entries.set(id, entry);
        try {
            this.storage.setItem(id, JSON.stringify(entry));
        } catch (error) {
            console.warn('Listening outbox save failed', error);
        }
    }
    restore(userId) {
        if (!userId) return;
        const prefix = this.key(userId, '');
        try {
            for (const id of this.entries.keys()) {
                if (id.startsWith(prefix) && this.storage.getItem(id) === null) this.entries.delete(id);
            }
            const keys = Array.from({ length: this.storage.length }, (_, i) => this.storage.key(i)).filter((id) =>
                id?.startsWith(prefix)
            );
            for (const id of keys) {
                let entry;
                try {
                    entry = JSON.parse(this.storage.getItem(id));
                } catch {
                    continue;
                }
                if (entry?.userId !== userId || !entry.payload?.sessionId) continue;
                if (entry.payload.startedAt < Date.now() - 31 * 86400000) {
                    this.storage.removeItem(id);
                    this.entries.delete(id);
                    continue;
                }
                const current = this.entries.get(id);
                if (
                    !current ||
                    current.payload.lastAt < entry.payload.lastAt ||
                    (current.payload.lastAt === entry.payload.lastAt && entry.payload.ended)
                )
                    this.entries.set(id, entry);
            }
        } catch (error) {
            console.warn('Listening outbox restore failed', error);
        }
    }
    acknowledge(id, entry) {
        if (this.entries.get(id) === entry) this.entries.delete(id);
        try {
            const saved = JSON.parse(this.storage.getItem(id) || 'null');
            // A newer checkpoint may have arrived while the previous request was in flight.
            if (
                saved?.payload.lastAt === entry.payload.lastAt &&
                saved.payload.seconds === entry.payload.seconds &&
                saved.payload.ended === entry.payload.ended
            )
                this.storage.removeItem(id);
        } catch {
            /* In-memory retries still remain available. */
        }
    }
}
