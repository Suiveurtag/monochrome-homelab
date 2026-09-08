import { listeningTracker } from './listening-tracker.js';
import { audioEmbeddings } from './audio-embeddings.js';
import { rankTracks } from './recommendation-engine.js';
import { db } from './db.js';
import { contentBlockingSettings } from './storage.js';

export class RecommendationService {
    constructor({ tracker = listeningTracker, favorites = () => db.getFavorites('track'),
        embeddings = audioEmbeddings, shouldHideTrack = (track) => contentBlockingSettings.shouldHideTrack(track),
        embeddingTimeout = 1500 } = {}) {
        this.tracker = tracker;
        this.favorites = favorites;
        this.embeddings = embeddings;
        this.shouldHideTrack = shouldHideTrack;
        this.embeddingTimeout = embeddingTimeout;
    }
    // Optional adapter: getMany(ids) returns a Map of persisted model/version/vector records.
    setEmbeddingAdapter(adapter) {
        if (adapter !== null && typeof adapter?.getMany !== 'function') throw new TypeError('Embedding adapter must implement getMany');
        this.embeddings = adapter;
    }
    async rank(tracks, { seeds = [], limit = 20, ...options } = {}) {
        const generation = this.tracker.accountGeneration;
        let timeout;
        const [favorites, embeddings] = await Promise.all([
            Promise.resolve().then(() => this.favorites()).catch(() => []),
            Promise.race([
                Promise.resolve().then(() => this.embeddings?.getMany([...tracks, ...seeds].map((t) => t.id))),
                new Promise((resolve) => { timeout = setTimeout(() => resolve(new Map()), this.embeddingTimeout); }),
            ]).catch(() => new Map()).finally(() => clearTimeout(timeout)),
        ]);
        // Never deliver an old account's favorites/profile after an async account switch.
        if (generation !== this.tracker.accountGeneration) return [];
        const visible = tracks.filter((track) => track && !this.shouldHideTrack(track));
        return rankTracks(visible, { ...options, seeds, limit, embeddings: embeddings instanceof Map ? embeddings : new Map(),
            favorites: new Set(favorites.map((t) => String(t.id))), profile: this.tracker.getTasteProfile() });
    }
}
export const recommendationService = new RecommendationService();
