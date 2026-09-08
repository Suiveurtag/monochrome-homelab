/** Optional persisted analysis adapter. Import/indexing jobs may call putMany once.
 * Model runners never load in the player. Vectors compare only within the same model/version.
 * A remote adapter can implement getMany(trackIds) => Map<trackId, Embedding[]>.
 */
export function validateEmbedding(entry) {
    if (entry?.trackId == null || !String(entry.trackId).trim() || !String(entry.model || '').trim() || !String(entry.version || '').trim() || !Array.isArray(entry.vector) ||
        entry.vector.length < 2 || entry.vector.length > 8192 || !entry.vector.every(Number.isFinite) ||
        !entry.vector.some((value) => value !== 0)) throw new TypeError('Invalid audio embedding');
    return { trackId: String(entry.trackId), model: String(entry.model), version: String(entry.version),
        vector: [...entry.vector], updatedAt: Date.now() };
}

export class PersistedAudioEmbeddings {
    constructor(name = 'monochrome-audio-embeddings') { this.name = name; this.database = null; }
    async open() {
        if (this.database) return this.database;
        if (typeof indexedDB === 'undefined') return null;
        this.database = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, 1);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore('embeddings', { keyPath: ['trackId', 'model', 'version'] });
                store.createIndex('trackId', 'trackId');
            };
            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => { database.close(); this.database = null; };
                resolve(database);
            };
            request.onerror = () => { this.database = null; reject(request.error); };
        });
        return this.database;
    }
    async putMany(entries) {
        const valid = entries.map(validateEmbedding);
        const database = await this.open();
        if (!database) throw new Error('Audio embedding storage is unavailable');
        await new Promise((resolve, reject) => {
            const transaction = database.transaction('embeddings', 'readwrite');
            const store = transaction.objectStore('embeddings');
            for (const entry of valid) store.put(entry);
            transaction.oncomplete = resolve;
            transaction.onabort = () => reject(transaction.error);
            transaction.onerror = () => reject(transaction.error);
        });
    }
    async getMany(ids) {
        const result = new Map();
        const database = await this.open();
        if (!database) return result;
        await new Promise((resolve, reject) => {
            const transaction = database.transaction('embeddings', 'readonly');
            const index = transaction.objectStore('embeddings').index('trackId');
            for (const id of new Set(ids.map(String))) {
                const request = index.getAll(id);
                request.onsuccess = () => { if (request.result.length) result.set(id, request.result); };
            }
            transaction.oncomplete = resolve;
            transaction.onabort = () => reject(transaction.error);
            transaction.onerror = () => reject(transaction.error);
        });
        return result;
    }
}
export const audioEmbeddings = new PersistedAudioEmbeddings();
