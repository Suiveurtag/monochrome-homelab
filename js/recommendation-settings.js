import { listeningTracker } from './listening-tracker.js';
import { pb } from './accounts/config.js';
import { realRandom, smartRandom } from './recommendation-engine.js';

let stopSignalListeners;

export function getShuffleMode() {
    return localStorage.getItem('shuffle-mode') === 'real' ? 'real' : 'smart';
}

export function setShuffleMode(mode) {
    localStorage.setItem('shuffle-mode', mode === 'real' ? 'real' : 'smart');
    window.dispatchEvent(new Event('shuffle-mode-changed'));
}

export function shuffleTracks(tracks, currentTrack = null) {
    return getShuffleMode() === 'smart'
        ? smartRandom(tracks, { currentTrack, profile: listeningTracker.getTasteProfile() })
        : realRandom(tracks);
}

export function initializeRecommendationSignals() {
    stopSignalListeners?.();
    listeningTracker.setUser(pb.authStore.record?.id);
    const stopAuth = pb.authStore.onChange((_token, record) => listeningTracker.setUser(record?.id));
    const favoritesChanged = ({ detail }) => {
        if (detail?.item)
            listeningTracker.recordSignal('like', detail.item, { type: detail.type, added: detail.added });
    };
    const playlistChanged = ({ detail }) => {
        for (const track of detail?.addedTracks || []) listeningTracker.recordSignal('playlist-add', track);
    };
    const checkpoint = () => listeningTracker.forceFlush();
    const syncShuffleSetting = () => {
        const select = document.getElementById('shuffle-mode-setting');
        if (select) select.value = getShuffleMode();
    };
    const visibilityChanged = () => {
        if (document.visibilityState === 'hidden') checkpoint();
    };
    window.addEventListener('favorites-changed', favoritesChanged);
    window.addEventListener('playlist-tracks-changed', playlistChanged);
    window.addEventListener('pagehide', checkpoint);
    window.addEventListener('shuffle-mode-changed', syncShuffleSetting);
    document.addEventListener('visibilitychange', visibilityChanged);
    stopSignalListeners = () => {
        stopAuth();
        window.removeEventListener('favorites-changed', favoritesChanged);
        window.removeEventListener('playlist-tracks-changed', playlistChanged);
        window.removeEventListener('pagehide', checkpoint);
        window.removeEventListener('shuffle-mode-changed', syncShuffleSetting);
        document.removeEventListener('visibilitychange', visibilityChanged);
    };
    const group = document.querySelector('#settings-tab-player .settings-group');
    if (!group || document.getElementById('shuffle-mode-setting')) return stopSignalListeners;
    const row = document.createElement('div');
    row.className = 'setting-item';
    row.innerHTML = `<div class="info"><label class="label" for="shuffle-mode-setting">Shuffle mode</label>
        <span class="description">Smart Random spaces artists out and moves recently played songs later.</span></div>
        <select id="shuffle-mode-setting"><option value="real">Real Random</option><option value="smart">Smart Random</option></select>`;
    const select = row.querySelector('select');
    select.value = getShuffleMode();
    select.addEventListener('change', () => setShuffleMode(select.value));
    group.appendChild(row);
    return stopSignalListeners;
}
