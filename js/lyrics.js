//js/lyrics.js
import { getTrackTitle, getTrackArtists, buildTrackFilename, escapeHtml } from './utils.js';
import {
    SVG_CLOSE,
    SVG_GENIUS_ACTIVE,
    SVG_GENIUS_INACTIVE,
    SVG_MINUS,
    SVG_PLUS,
    SVG_RESET,
    SVG_GLOBE,
} from './icons.js';
import { sidePanelManager } from './side-panel.js';
import { isLineOnlyLyrics, isTtml, lyricsToTtml, parseLrc } from './lyrics-format.js';
import { Player } from './player.js';
import { getSpicyLyricsSetting, normalizeSpicyLyricsOffset, setSpicyLyricsSetting } from './spicy-lyrics-settings.js';
import { parseSpicyTtml, repairCachedSpicyTtml } from './spicy-lyrics-ttml.js';
import { createBloomPlaybackClock } from './spicy-lyrics-clock.js';
import { audioContextManager } from './audio-context.js';
import { pb } from './accounts/config.js';

// Hiragana (3040-309F) or Katakana (30A0-30FF) = unambiguously Japanese
function containsJapaneseKana(text) {
    if (!text) return false;
    return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

function trackIsJapanese(track) {
    if (!track) return false;
    const title = track.title || '';
    const artist = getTrackArtists(track) || '';
    return containsJapaneseKana(title) || containsJapaneseKana(artist);
}

class GeniusManager {
    constructor() {
        this.cache = new Map();
        this.loading = false;
    }

    // idgaf anymore im js hardcoding this lmaooo
    getToken() {
        const hostname = window.location.hostname;
        if (hostname.endsWith('monochrome.tf') || hostname === 'monochrome.tf') {
            return 'OpITG-h86oehKYuJJ5QVY5F-HxUWXb31EwGKarx2Tle3W9rBUVnMaUL9qo_Oh9Q7';
        }
        return 'QmS9OvsS-7ifRBKx_ochIPQU7oejIS9Eo_z5iWHmCPyhwLVQID3pYTHJmJTa6z8z';
    }

    async searchTrack(title, artist) {
        const cleanTitle = title.split('(')[0].split('-')[0].trim();
        const query = encodeURIComponent(`${cleanTitle} ${artist}`);
        const token = this.getToken();

        const url = `https://api.genius.com/search?q=${query}&access_token=${token}`;
        const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);

        if (!response.ok) throw new Error('Failed to search Genius');

        const data = await response.json();
        if (data.response.hits.length === 0) return null;

        const normalize = (str) => str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const targetArtist = normalize(artist);

        const hit = data.response.hits.find((h) => {
            const hitArtist = normalize(h.result.primary_artist.name);
            return hitArtist.includes(targetArtist) || targetArtist.includes(hitArtist);
        });

        return hit ? hit.result : data.response.hits[0].result;
    }

    async getReferents(songId) {
        const token = this.getToken();
        const url = `https://api.genius.com/referents?song_id=${songId}&text_format=plain&per_page=50&access_token=${token}`;
        const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);

        if (!response.ok) throw new Error('Failed to fetch annotations');

        const data = await response.json();
        return data.response.referents;
    }

    async getDataForTrack(track) {
        if (this.cache.has(track.id)) return this.cache.get(track.id);

        try {
            this.loading = true;
            const artist = Array.isArray(track.artists) ? track.artists[0].name : track.artist.name;
            const song = await this.searchTrack(track.title, artist);

            if (!song) {
                this.loading = false;
                return null;
            }

            const referents = await this.getReferents(song.id);
            const result = { song, referents };

            this.cache.set(track.id, result);
            this.loading = false;
            return result;
        } catch (error) {
            console.error('Genius Error:', error);
            this.loading = false;
            throw error;
        }
    }

    findAnnotations(lineText, referents) {
        if (!referents || !lineText) return [];

        const normalize = (str) =>
            str
                .toLowerCase()
                .replace(/[^\p{L}\p{N}\s]/gu, '')
                .replace(/\s+/g, ' ')
                .trim();
        const normLine = normalize(lineText);

        const getWordSet = (str) => new Set(str.split(' ').filter((w) => w.length > 0));
        const lineWords = getWordSet(normLine);

        return referents.filter((ref) => {
            const normFragment = normalize(ref.fragment);

            if (normLine.includes(normFragment) || normFragment.includes(normLine)) return true;

            const fragmentWords = getWordSet(normFragment);
            if (fragmentWords.size === 0 || lineWords.size === 0) return false;

            let matchCount = 0;
            fragmentWords.forEach((w) => {
                if (lineWords.has(w)) matchCount++;
            });

            return matchCount / Math.min(fragmentWords.size, lineWords.size) > 0.6;
        });
    }
}

export class LyricsManager {
    static #instance = null;

    static get instance() {
        if (!LyricsManager.#instance) {
            throw new Error('LyricsManager is not initialized. Call LyricsManager.initialize() first.');
        }
        return LyricsManager.#instance;
    }

    /** @private */
    constructor(api) {
        this.api = api;
        this.currentLyrics = null;
        this.syncedLyrics = [];
        this.lyricsCache = new Map();
        this.spicyLookupPromises = new Map();
        this.recentTrackChanges = [];
        this.lastPlayerTrackId = null;
        this.spicySkipCooldownUntil = 0;
        try {
            const currentTrackId = Player.instance.currentTrack?.id;
            this.lastPlayerTrackId = currentTrackId == null ? null : String(currentTrackId);
        } catch {}
        this.componentLoaded = false;
        this.componentLoadPromise = null;
        this.geniusManager = new GeniusManager();
        this.isGeniusMode = false;
        this.timingOffset = 0; // Offset in milliseconds (positive = delay lyrics, negative = advance lyrics)
        try {
            for (const key of Object.keys(localStorage)) {
                if (!key.startsWith('spicy-lyrics:')) continue;
                try {
                    const item = JSON.parse(localStorage.getItem(key) || 'null');
                    if (!item?.expiresAt || Date.parse(item.expiresAt) <= Date.now()) localStorage.removeItem(key);
                } catch {
                    localStorage.removeItem(key);
                }
            }
        } catch {}
        window.addEventListener('player-track-changed', (event) => {
            const id = String(event.detail?.track?.id || '');
            if (!id || id === this.lastPlayerTrackId) return;
            const now = Date.now();
            if (this.lastPlayerTrackId !== null) {
                this.recentTrackChanges = this.recentTrackChanges.filter((at) => now - at < 20000);
                this.recentTrackChanges.push(now);
                if (this.recentTrackChanges.length > 8 || now < this.spicySkipCooldownUntil)
                    this.spicySkipCooldownUntil = now + 20000;
            }
            this.lastPlayerTrackId = id;
        });
        window.addEventListener('track-metadata-updated', (event) => {
            if (event.detail?.trackId != null) this.lyricsCache.delete(event.detail.trackId);
        });
    }

    static async initialize(api) {
        if (LyricsManager.#instance) {
            throw new Error('LyricsManager is already initialized');
        }
        return (LyricsManager.#instance = new LyricsManager(api));
    }

    // Get timing offset for current track
    getTimingOffset(trackId) {
        try {
            const key = `lyrics-offset-${trackId}`;
            const stored = localStorage.getItem(key);
            return normalizeSpicyLyricsOffset(stored);
        } catch {
            return 0;
        }
    }

    getPlaybackOffset(trackId) {
        if (getSpicyLyricsSetting('reviewer') === 'true') return 0;
        return Number(getSpicyLyricsSetting('offset')) + this.getTimingOffset(trackId);
    }

    // Set timing offset for current track
    setTimingOffset(trackId, offsetMs) {
        try {
            const key = `lyrics-offset-${trackId}`;
            localStorage.setItem(key, String(normalizeSpicyLyricsOffset(offsetMs)));
            window.dispatchEvent(new CustomEvent('spicy-lyrics-offset-changed', { detail: { trackId } }));
        } catch (e) {
            console.warn('Failed to save lyrics timing offset:', e);
        }
    }

    // Reset timing offset for current track
    resetTimingOffset(trackId) {
        this.setTimingOffset(trackId, 0);
    }

    // Get formatted offset display string
    getOffsetDisplayString(offsetMs) {
        const sign = offsetMs >= 0 ? '+' : '';
        const seconds = Math.abs(offsetMs) / 1000;
        return `${sign}${seconds.toFixed(1)}s`;
    }

    async ensureComponentLoaded() {
        if (this.componentLoaded) return;
        if (typeof customElements === 'undefined') return;

        if (!this.componentLoadPromise) {
            this.componentLoadPromise = import('./spicy-lyrics-renderer.js')
                .then(() => customElements.whenDefined('spicy-lyrics'))
                .then(() => {
                    this.componentLoaded = true;
                })
                .catch((error) => {
                    this.componentLoadPromise = null;
                    throw error;
                });
        }

        await this.componentLoadPromise;
    }

    async waitForSpicyPlaybackToSettle(trackId) {
        while (Date.now() < this.spicySkipCooldownUntil) {
            await new Promise((resolve) => setTimeout(resolve, this.spicySkipCooldownUntil - Date.now()));
        }
        return this.lastPlayerTrackId === null || String(trackId) === this.lastPlayerTrackId;
    }

    async fetchLyrics(trackId, track = null) {
        if (track) {
            const source = typeof track.lyrics === 'string' ? track.lyrics.replaceAll('&nbsp;', '&#160;') : '';
            if (isTtml(source)) {
                const lyricsData = {
                    ttml: source,
                    lyricsProvider: 'Local',
                };
                this.lyricsCache.set(trackId, lyricsData);
                return lyricsData;
            }

            if (parseLrc(track.lyrics).length) {
                const lyricsData = {
                    subtitles: track.lyrics,
                    lyricsProvider: 'Local',
                };
                this.lyricsCache.set(trackId, lyricsData);
                return lyricsData;
            }

            if (source.trim() && !source.trimStart().startsWith('<')) {
                const lyricsData = { plain: track.lyrics, lyricsProvider: 'Local' };
                this.lyricsCache.set(trackId, lyricsData);
                return lyricsData;
            }

            // An upload can carry an empty TTML shell while another duplicate
            // of the same recording has imported lyrics. Resolve that local
            // copy without overriding lyrics on this track.
            if (track.isSelfHosted) {
                try {
                    const artist = track.artist?.name || track.artists?.[0]?.name || '';
                    if (artist && track.title) {
                        const records = await pb.collection('music_tracks').getFullList({
                            filter: pb.filter('title = {:title} && artist = {:artist}', {
                                title: track.title,
                                artist,
                            }),
                            fields: 'id,title,artist,album,duration,lyrics',
                            requestKey: null,
                        });
                        const candidates = records
                            .filter((record) => String(record.id) !== String(trackId))
                            .filter((record) => Math.abs(Number(record.duration) - Number(track.duration)) <= 2)
                            .filter((record) => isTtml(record.lyrics) || parseLrc(record.lyrics).length > 0)
                            .sort((a, b) => {
                                const album = track.album?.title || '';
                                return Number(b.album === album) - Number(a.album === album);
                            });
                        if (candidates.length) {
                            const lyrics = candidates[0].lyrics;
                            const lyricsData = isTtml(lyrics)
                                ? { ttml: lyrics, lyricsProvider: 'Local' }
                                : { subtitles: lyrics, lyricsProvider: 'Local' };
                            this.lyricsCache.set(trackId, lyricsData);
                            return lyricsData;
                        }
                    }
                } catch (error) {
                    console.warn('Could not find matching imported lyrics:', error);
                }
            }

            if (this.lyricsCache.has(trackId)) {
                return this.lyricsCache.get(trackId);
            }

            if (track.useSpicyLyrics) {
                try {
                    let lookup = this.spicyLookupPromises.get(trackId);
                    if (!lookup) {
                        lookup = (async () => {
                            const cacheKey = `spicy-lyrics:${trackId}`;
                            let cached = null;
                            try {
                                cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
                            } catch {}
                            if (
                                cached?.expiresAt &&
                                Date.parse(cached.expiresAt) > Date.now() &&
                                cached.ttml &&
                                cached.rawResponse
                            ) {
                                const ttml = cached.wordBoundariesVersion === 1
                                    ? cached.ttml
                                    : repairCachedSpicyTtml(cached.ttml, cached.rawResponse);
                                if (ttml) {
                                    cached.ttml = ttml;
                                    cached.wordBoundariesVersion = 1;
                                    localStorage.setItem(cacheKey, JSON.stringify(cached));
                                    return {
                                        ttml: cached.ttml,
                                        lyricsProvider: cached.provider || 'Spicy Lyrics',
                                        lyricsAttribution: cached.attribution || null,
                                        spicyLyricsResponse: cached.rawResponse,
                                    };
                                }
                            }
                            if (cached) localStorage.removeItem(cacheKey);

                            // Wait out a rapid-skip burst before spending a shared API request.
                            if (!(await this.waitForSpicyPlaybackToSettle(trackId))) return null;
                            const response = await fetch('/api/monochrome/spicy-lyrics/lookup', {
                                method: 'POST',
                                headers: {
                                    Authorization: `Bearer ${pb.authStore.token}`,
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ id: track.id }),
                            });
                            if (!response.ok) return null;
                            const result = await response.json();
                            const repairedTtml = repairCachedSpicyTtml(result.ttml, result.raw);
                            const cache = {
                                ttml: repairedTtml || result.ttml,
                                provider: result.provider || 'Spicy Lyrics',
                                attribution: { uploader: result.uploader, maker: result.maker },
                                // Keep the complete API response, including its key-specific mark.
                                rawResponse: result.raw,
                                expiresAt: result.expiresAt,
                                wordBoundariesVersion: repairedTtml ? 1 : 0,
                            };
                            localStorage.setItem(cacheKey, JSON.stringify(cache));
                            return {
                                ttml: cache.ttml,
                                lyricsProvider: cache.provider,
                                lyricsAttribution: cache.attribution,
                                spicyLyricsResponse: cache.rawResponse,
                            };
                        })();
                        this.spicyLookupPromises.set(trackId, lookup);
                    }
                    const lyricsData = await lookup;
                    if (lyricsData) {
                        this.lyricsCache.set(trackId, lyricsData);
                        return lyricsData;
                    }
                } catch (error) {
                    console.warn('Spicy Lyrics lookup failed:', error);
                } finally {
                    this.spicyLookupPromises.delete(trackId);
                }
            }

        }

        return null;
    }

    parseSyncedLyrics(subtitles) {
        if (!subtitles) return [];
        const lines = subtitles.split('\n').filter((line) => line.trim());
        return lines
            .map((line) => {
                const match = line.match(/\[(\d+):(\d+)\.(\d+)\]\s*(.+)/);
                if (match) {
                    const [, minutes, seconds, centiseconds, text] = match;
                    const timeInSeconds = parseInt(minutes) * 60 + parseInt(seconds) + parseInt(centiseconds) / 100;
                    return { time: timeInSeconds, text: text.trim() };
                }
                return null;
            })
            .filter(Boolean);
    }

    generateLRCContent(lyricsData, track) {
        if (!lyricsData || !lyricsData.subtitles) return null;

        const trackTitle = getTrackTitle(track);
        const trackArtist = getTrackArtists(track);

        let lrc = `[ti:${trackTitle}]\n`;
        lrc += `[ar:${trackArtist}]\n`;
        lrc += `[al:${track.album?.title || 'Unknown Album'}]\n`;
        lrc += `[by:${lyricsData.lyricsProvider || 'Unknown'}]\n`;
        lrc += '\n';
        lrc += lyricsData.subtitles;

        return lrc;
    }

    getLRC(lyricsData, track) {
        const lrcContent = this.generateLRCContent(lyricsData, track);
        if (!lrcContent) {
            alert('No synced lyrics available for this track');
            return;
        }

        return new File([lrcContent], buildTrackFilename(track, 'LOSSLESS').replace(/\.flac$/, '.lrc'), {
            type: 'application/octet-stream',
        });
    }

    downloadLRC(lyricsData, track) {
        const blob = this.getLRC(lyricsData, track);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = blob.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    getCurrentLine(currentTime) {
        if (!this.syncedLyrics || this.syncedLyrics.length === 0) return -1;
        let currentIndex = -1;
        for (let i = 0; i < this.syncedLyrics.length; i++) {
            if (currentTime >= this.syncedLyrics[i].time) {
                currentIndex = i;
            } else {
                break;
            }
        }
        return currentIndex;
    }

    async applyGeniusAnnotations(amLyricsElement, referents) {
        if (!amLyricsElement || !referents) return;

        const lineElements = amLyricsElement.lyricElements;

        if (lineElements.length === 0) return;

        lineElements.forEach((el) => {
            el.classList.remove('genius-annotated', 'genius-multi-start', 'genius-multi-end', 'genius-multi-mid');
            delete el.__geniusAnnotations;
            el.querySelector('.genius-indicator')?.remove();
        });

        const normalize = (str) =>
            str
                .toLowerCase()
                .replace(/[^\p{L}\p{N}\s]/gu, '')
                .replace(/\s+/g, ' ')
                .trim();

        referents.forEach((ref) => {
            const fragment = normalize(ref.fragment);
            if (!fragment) return;

            for (let i = 0; i < lineElements.length; i++) {
                let combinedText = '';
                let currentLines = [];

                for (let j = i; j < lineElements.length; j++) {
                    const line = lineElements[j];

                    const lineClone = line.cloneNode(true);
                    lineClone
                        .querySelectorAll('.RomanizedRow, .genius-indicator')
                        .forEach((n) => n.remove());
                    const text = normalize(lineClone.textContent || '');

                    if (!text) continue;

                    if (currentLines.length > 0) combinedText += ' ';
                    combinedText += text;
                    currentLines.push(line);

                    if (combinedText.includes(fragment)) {
                        currentLines.forEach((el, idx) => {
                            el.classList.add('genius-annotated');
                            if (!el.__geniusAnnotations) el.__geniusAnnotations = [];

                            if (!el.__geniusAnnotations.some((a) => a.id === ref.id)) {
                                el.__geniusAnnotations.push(ref);
                            }

                            if (currentLines.length > 1) {
                                if (idx === 0) el.classList.add('genius-multi-start');
                                else if (idx === currentLines.length - 1) el.classList.add('genius-multi-end');
                                else el.classList.add('genius-multi-mid');
                            }

                            if (!el.querySelector('.genius-indicator')) {
                                const smiley = document.createElement('span');
                                smiley.className = 'genius-indicator';
                                smiley.textContent = ' ☺';
                                smiley.style.color = '#ffff64';
                                smiley.style.marginLeft = '0.5em';
                                el.appendChild(smiley);
                            }
                        });
                        break;
                    }

                    if (combinedText.length > fragment.length + 50) break;
                }
            }
        });
    }
}

export function openLyricsPanel(track, audioPlayer, lyricsManager, forceOpen = false, openOrigin = 'player-button') {
    const manager = lyricsManager || new LyricsManager();
    sidePanelManager.panel.dataset.lyricsOpenOrigin = openOrigin;

    // Load saved timing offset for this track
    manager.timingOffset = manager.getTimingOffset(track.id);

    const renderControls = (container) => {
        const isRomajiMode = getSpicyLyricsSetting('romanization') !== 'off';
        const isGeniusMode = manager.isGeniusMode;
        const offsetDisplay = manager.getOffsetDisplayString(manager.timingOffset);

        container.innerHTML = `
            <div class="lyrics-timing-controls">
                <button id="lyrics-timing-minus-btn" class="btn-icon" title="Decrease delay (lyrics earlier) -0.5s">
                    ${SVG_MINUS(18)}
                </button>
                <span id="lyrics-timing-display" class="lyrics-timing-display" title="Current timing offset">${offsetDisplay}</span>
                <button id="lyrics-timing-plus-btn" class="btn-icon" title="Increase delay (lyrics later) +0.5s">
                    ${SVG_PLUS(18)}
                </button>
                <button id="lyrics-timing-reset-btn" class="btn-icon" title="Reset timing offset">
                    ${SVG_RESET(16)}
                </button>
            </div>
            <button id="romaji-toggle-btn" class="btn-icon" title="Toggle romanization" aria-pressed="${isRomajiMode}" data-enabled="${isRomajiMode}" style="color: ${isRomajiMode ? 'var(--primary)' : ''}">
                ${SVG_GLOBE(20)}
            </button>
            <button id="genius-toggle-btn" class="btn-icon ${isGeniusMode ? 'active-genius' : ''}" title="Genius Mode" style="${isGeniusMode ? 'color: #ffff64;' : ''}">
                ${isGeniusMode ? SVG_GENIUS_ACTIVE(20) : SVG_GENIUS_INACTIVE(20)}
            </button>
            <button id="close-side-panel-btn" class="btn-icon" title="Close">
                ${SVG_CLOSE(20)}
            </button>
        `;

        container.querySelector('#close-side-panel-btn').addEventListener('click', () => {
            sidePanelManager.close();
            clearLyricsPanelSync(audioPlayer, sidePanelManager.panel);
        });

        // Timing adjustment controls
        const updateTimingDisplay = () => {
            const display = container.querySelector('#lyrics-timing-display');
            if (display) {
                display.textContent = manager.getOffsetDisplayString(manager.timingOffset);
            }
        };

        container.querySelector('#lyrics-timing-minus-btn')?.addEventListener('click', () => {
            manager.timingOffset -= 500; // Decrease by 0.5 seconds
            manager.setTimingOffset(track.id, manager.timingOffset);
            updateTimingDisplay();
        });

        container.querySelector('#lyrics-timing-plus-btn')?.addEventListener('click', () => {
            manager.timingOffset += 500; // Increase by 0.5 seconds
            manager.setTimingOffset(track.id, manager.timingOffset);
            updateTimingDisplay();
        });

        container.querySelector('#lyrics-timing-reset-btn')?.addEventListener('click', () => {
            manager.timingOffset = 0;
            manager.resetTimingOffset(track.id);
            updateTimingDisplay();
        });

        const romanizationButton = container.querySelector('#romaji-toggle-btn');
        romanizationButton?.addEventListener('click', () => {
            const enabled = getSpicyLyricsSetting('romanization') === 'off';
            setSpicyLyricsSetting('romanization', enabled ? 'underLine' : 'off');
            romanizationButton.dataset.enabled = String(enabled);
            romanizationButton.setAttribute('aria-pressed', String(enabled));
            romanizationButton.style.color = enabled ? 'var(--primary)' : '';
        });

        // Genius toggle
        const geniusBtn = container.querySelector('#genius-toggle-btn');
        if (geniusBtn) {
            geniusBtn.addEventListener('click', async () => {
                manager.isGeniusMode = !manager.isGeniusMode;
                const enabled = manager.isGeniusMode;

                geniusBtn.classList.toggle('active-genius', enabled);
                geniusBtn.style.color = enabled ? '#ffff64' : '';
                geniusBtn.innerHTML = enabled ? SVG_GENIUS_ACTIVE(20) : SVG_GENIUS_INACTIVE(20);

                if (enabled) {
                    try {
                        geniusBtn.style.opacity = '0.5';
                        await manager.geniusManager.getDataForTrack(track);
                        const amLyrics = sidePanelManager.panel.querySelector('spicy-lyrics');
                        if (amLyrics)
                            manager.applyGeniusAnnotations(
                                amLyrics,
                                manager.geniusManager.cache.get(track.id)?.referents
                            );
                    } catch (e) {
                        alert(e.message);
                        manager.isGeniusMode = false;
                        geniusBtn.classList.remove('active-genius');
                        geniusBtn.style.color = '';
                    } finally {
                        geniusBtn.style.opacity = '1';
                    }
                } else {
                    const lyrics = sidePanelManager.panel.querySelector('spicy-lyrics');
                    void manager.applyGeniusAnnotations(lyrics, []);
                    const modal = document.querySelector('.genius-annotation-modal');
                    if (modal) modal.remove();
                }
            });
        }
    };

    const renderContent = async (container, renderContext = {}) => {
        clearLyricsPanelSync(audioPlayer, sidePanelManager.panel);
        await renderLyricsInSidePanel(track, audioPlayer, manager, container, renderContext);
        if (renderContext.signal?.aborted || (renderContext.isCurrent && !renderContext.isCurrent())) return;
        if (container.lyricsCleanup) {
            sidePanelManager.panel.lyricsCleanup = container.lyricsCleanup;
            sidePanelManager.panel.lyricsManager = container.lyricsManager;
        }
    };

    sidePanelManager.open('lyrics', 'Lyrics', renderControls, renderContent, forceOpen);
}

function getLyricsHighlightColor() {
    // Check if the current theme is light
    const isLight = getComputedStyle(document.documentElement).colorScheme === 'light';
    return isLight ? '#000' : '#fff';
}

function updateLyricsTheme() {
    const highlightColor = getLyricsHighlightColor();
    document.querySelectorAll('spicy-lyrics').forEach((el) => {
        el.style.setProperty('--spicy-lyrics-active-color', highlightColor);
    });
}

// watch for theme changes
const themeObserver = new MutationObserver(() => {
    updateLyricsTheme();
});

themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'style'],
});

async function mountSpicyLyrics(
    container,
    track,
    playbackSource,
    lyricsManager,
    localTtml,
    { signal, lineOnly = false, provider = '' } = {}
) {
    await lyricsManager.ensureComponentLoaded();
    if (signal?.aborted) return null;

    container.innerHTML = '';
    const amLyrics = document.createElement('spicy-lyrics');
    amLyrics.provider = provider;
    amLyrics.lineOnly = lineOnly;
    amLyrics.ttml = localTtml;
    amLyrics.style.setProperty('--spicy-lyrics-active-color', getLyricsHighlightColor());
    if (trackIsJapanese(track)) amLyrics.setAttribute('lang', 'ja');
    amLyrics.style.height = '100%';
    amLyrics.style.width = '100%';

    container.appendChild(amLyrics);
    void amLyrics.setTrack(track, lyricsManager.api);
    if (signal?.aborted) {
        amLyrics.remove();
        return null;
    }

    const cleanup = setupSync(track, playbackSource, amLyrics, lyricsManager);

    // Attach cleanup to container for easy access
    container.lyricsCleanup = cleanup;
    signal?.addEventListener('abort', cleanup, { once: true });

    return amLyrics;
}

function plainLyricsToTtml(text) {
    const lines = text?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines?.length) return '';
    const doc = document.implementation.createDocument('http://www.w3.org/ns/ttml', 'tt');
    const body = doc.createElementNS(doc.documentElement.namespaceURI, 'body');
    const div = doc.createElementNS(body.namespaceURI, 'div');
    for (const line of lines) {
        const paragraph = doc.createElementNS(body.namespaceURI, 'p');
        paragraph.textContent = line;
        div.append(paragraph);
    }
    body.append(div);
    doc.documentElement.append(body);
    return new XMLSerializer().serializeToString(doc);
}

const LYRICS_SKELETON_LINE_WIDTHS = [74, 58, 86, 49, 68, 81, 55, 72, 63, 84, 52, 77, 66, 88, 57, 70];

function createLyricsLoadingSkeleton() {
    const lines = LYRICS_SKELETON_LINE_WIDTHS
        .map((width, index) => `<div class="SkeletonLine" style="width: ${width}%; --i: ${index}"></div>`)
        .join('');
    return `<div class="LyricsSkeleton active">
        <div class="SkeletonLines" aria-hidden="true">${lines}</div>
        <div class="SkeletonStatus" role="status" aria-live="polite">
            <span class="SkeletonLabel">Loading Lyrics</span><span class="SkeletonDots" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
    </div>`;
}

async function renderLyricsComponent(container, track, playbackSource, lyricsManager, { signal, skeleton = false } = {}) {
    if (signal?.aborted) return null;
    clearFullscreenLyricsSync(container);
    container.innerHTML = skeleton
        ? createLyricsLoadingSkeleton()
        : '<div class="lyrics-loading" role="status">Loading lyrics…</div>';

    try {
        const data = await lyricsManager.fetchLyrics(track.id, track);
        if (signal?.aborted) return null;
        const source = data?.ttml || data?.subtitles || track.lyrics || '';
        const lineOnly = isLineOnlyLyrics(source);
        const sourceIsStatic = isTtml(source) && parseSpicyTtml(source, { lineOnly })[0]?.syncType === 'Static';
        const ttml = sourceIsStatic ? source : lyricsToTtml(source, track.duration) ||
            plainLyricsToTtml(data?.plain || source);
        if (!ttml || !parseSpicyTtml(ttml, { lineOnly }).length) {
            container.innerHTML = '<div class="lyrics-empty">Lyrics are not available for this track.</div>';
            return null;
        }
        const element = await mountSpicyLyrics(container, track, playbackSource, lyricsManager, ttml, {
            signal,
            lineOnly,
            provider: data?.lyricsProvider,
        });
        if (element && data?.lyricsAttribution) {
            const credits = document.createElement('div');
            credits.className = 'spicy-lyrics-attribution';
            const appendPerson = (label, person) => {
                if (!person?.username || !person?.url) return;
                if (credits.childNodes.length) credits.append(document.createTextNode(' · '));
                const link = document.createElement('a');
                link.href = person.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = `${label}: ${person.username}`;
                credits.append(link);
            };
            const provider = document.createElement('span');
            provider.textContent = `Lyrics: ${data.lyricsProvider || 'Spicy Lyrics'}`;
            credits.append(provider);
            appendPerson('Uploader', data.lyricsAttribution.uploader);
            appendPerson('Maker', data.lyricsAttribution.maker);
            container.append(credits);
        }
        return element;
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') return null;
        console.error('Failed to load lyrics:', error);
        container.innerHTML = '<div class="lyrics-error" role="status">Failed to load lyrics</div>';
        return null;
    }
}

function setupSync(track, playbackSource, amLyrics, lyricsManager) {
    const view = amLyrics.ownerDocument.defaultView ?? window;
    const bloomClock = createBloomPlaybackClock();
    const getAudioPlayer = typeof playbackSource === 'function' ? playbackSource : () => playbackSource;
    let currentAudioPlayer;
    let frame = null;
    let visible = true;
    let staticPace = null;
    let lastSample = -Infinity;
    let waveform;
    let offset = 0;
    let bloom = false;

    const updateOffset = () => {
        const useBloom = getSpicyLyricsSetting('style') === 'bloom';
        if (useBloom !== bloom) bloomClock.reset();
        bloom = useBloom;
        offset = lyricsManager.getPlaybackOffset(track.id);
        updateTime();
    };
    const updateTime = () => {
        if (!visible) return;
        const audioPlayer = syncPlaybackSource();
        if (!audioPlayer) return;
        const staticLyrics = amLyrics.lyricsType === 'Static';
        const currentTime = bloom && !staticLyrics
            ? bloomClock.read(audioPlayer, view.performance.now()) / 1000
            : audioPlayer.currentTime;
        amLyrics.currentTime = currentTime * 1000 - offset;
        if (!staticLyrics) return;
        const duration = audioPlayer.duration || track.duration;
        const mode = getSpicyLyricsSetting('staticScroll');
        if (mode === 'off' || !(duration > 0)) return;
        let progress = Math.min(1, Math.max(0, currentTime / duration));
        if (!staticPace || Math.abs(currentTime - staticPace.time) > 0.5) staticPace = { time: currentTime, progress };
        if (performance.now() - lastSample >= 100 || currentTime === 0) {
            const analyser = audioContextManager.getAnalyser();
            let strength = 1;
            if (analyser && !audioPlayer.paused) {
                if (waveform?.length !== analyser.fftSize) waveform = new Uint8Array(analyser.fftSize);
                analyser.getByteTimeDomainData(waveform);
                let energy = 0;
                for (const sample of waveform) energy += ((sample - 128) / 128) ** 2;
                strength = Math.sqrt(energy / waveform.length) > 0.018 ? 1 : 0;
            }
            staticPace.progress = Math.min(1, staticPace.progress +
                Math.max(0, currentTime - staticPace.time) / Math.max(1, duration - staticPace.time) *
                (1 - staticPace.progress) * strength);
            staticPace.time = currentTime;
            lastSample = performance.now();
        }
        progress = Math.max(staticPace.progress, currentTime >= duration - 0.25 ? 1 : 0);
        amLyrics.setPlaybackProgress(progress);
    };
    const stop = () => {
        if (frame !== null) view.cancelAnimationFrame(frame);
        frame = null;
    };
    const tick = () => {
        frame = null;
        if (!visible) return;
        updateTime();
        frame = view.requestAnimationFrame(tick);
    };
    const start = () => {
        if (frame === null) tick();
    };
    const resetClock = () => {
        bloomClock.reset();
        updateTime();
    };
    const onPlaying = () => {
        bloomClock.reset();
        start();
    };
    const observer = new view.IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        bloomClock.reset();
        if (visible) {
            updateTime();
            start();
        } else {
            stop();
        }
    });
    observer.observe(amLyrics);

    const onLineClick = async (e) => {
        if (e.detail && e.detail.timestamp !== undefined) {
            const audioPlayer = syncPlaybackSource();
            if (!audioPlayer) return;
            amLyrics.resync();
            const genius = lyricsManager.isGeniusMode && lyricsManager.geniusManager.cache.get(track.id);
            if (genius && e.detail.text) {
                const annotations = lyricsManager.geniusManager.findAnnotations(e.detail.text, genius.referents);
                showGeniusAnnotations(annotations, e.detail.text);
            }

            const compensation = getSpicyLyricsSetting('seekCompensation') === 'true' ? 0.3 : 0;
            const timestampSeconds = Math.max(0, (e.detail.timestamp + offset) / 1000 - compensation);
            audioPlayer.currentTime = timestampSeconds;
            updateTime();

            try {
                const player = Player.instance;
                const started = await player.playFromTimestamp(timestampSeconds);
                if (!started) {
                    console.warn('Playback was blocked after seeking from lyrics');
                }
            } catch (error) {
                // Keep the lyrics view usable if it is mounted without the
                // application Player (for example in an isolated preview).
                try {
                    await audioPlayer.play();
                } catch (playError) {
                    console.error('Failed to start playback from lyrics:', playError ?? error);
                }
            }
        }
    };

    const refreshAnnotations = () => {
        const genius = lyricsManager.isGeniusMode && lyricsManager.geniusManager.cache.get(track.id);
        if (genius) void lyricsManager.applyGeniusAnnotations(amLyrics, genius.referents);
    };
    amLyrics.addEventListener('lyrics-rendered', refreshAnnotations);
    refreshAnnotations();

    const clockResetEvents = ['seeking', 'seeked', 'pause', 'waiting', 'ratechange'];
    const detachPlayback = () => {
        currentAudioPlayer?.removeEventListener('playing', onPlaying);
        for (const event of clockResetEvents) currentAudioPlayer?.removeEventListener(event, resetClock);
    };
    const syncPlaybackSource = () => {
        const next = getAudioPlayer();
        if (next === currentAudioPlayer) return next;
        detachPlayback();
        currentAudioPlayer = next;
        bloomClock.reset();
        staticPace = null;
        lastSample = -Infinity;
        if (next) {
            amLyrics.connectPlayback(next, () => audioContextManager.getAnalyser());
            next.addEventListener('playing', onPlaying);
            for (const event of clockResetEvents) next.addEventListener(event, resetClock);
        }
        return next;
    };
    amLyrics.addEventListener('line-click', onLineClick);
    window.addEventListener('spicy-lyrics-settings-changed', updateOffset);
    window.addEventListener('spicy-lyrics-offset-changed', updateOffset);
    updateOffset();
    start();

    return () => {
        stop();
        observer.disconnect();
        detachPlayback();
        amLyrics.removeEventListener('line-click', onLineClick);
        amLyrics.removeEventListener('lyrics-rendered', refreshAnnotations);
        window.removeEventListener('spicy-lyrics-settings-changed', updateOffset);
        window.removeEventListener('spicy-lyrics-offset-changed', updateOffset);
    };
}

function showGeniusAnnotations(annotations, lineText) {
    const existing = document.querySelector('.genius-annotation-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'genius-annotation-modal';

    let contentHtml = `
        <div class="genius-modal-content">
            <div class="genius-header">
                <span class="genius-line">"${lineText}"</span>
                <button class="close-genius">×</button>
            </div>
            <div class="genius-body">
    `;

    if (annotations.length === 0) {
        contentHtml += `
            <div class="annotation-item">
                <div class="annotation-text" style="color: var(--muted-foreground); font-style: italic;">No Genius annotation found for this line.</div>
            </div>
        `;
    } else {
        annotations.forEach((ann) => {
            const body = ann.annotations[0].body.plain;
            contentHtml += `
                <div class="annotation-item">
                    <div class="annotation-text">${escapeHtml(body).replace(/\n/g, '<br>')}</div>
                </div>
            `;
        });
    }

    contentHtml += `</div></div>`;
    modal.innerHTML = contentHtml;

    document.body.appendChild(modal);

    modal.querySelector('.close-genius').addEventListener('click', () => modal.remove());

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

export async function renderLyricsInContainer(track, playbackSource, lyricsManager, container, options = {}) {
    return renderLyricsComponent(container, track, playbackSource, lyricsManager, options);
}

export const renderLyricsInFullscreen = renderLyricsInContainer;
export const renderSpicyLyricsInFullscreen = renderLyricsInContainer;
export const renderLyricsInSidePanel = renderLyricsInContainer;
export const renderLyricsInNowPanel = renderLyricsInContainer;

export function clearFullscreenLyricsSync(container) {
    if (container && container.lyricsCleanup) {
        container.lyricsCleanup();
        container.lyricsCleanup = null;
    }
}

export const clearLyricsContainerSync = clearFullscreenLyricsSync;

export function clearLyricsPanelSync(_audioPlayer, panel) {
    if (panel && panel.lyricsCleanup) {
        panel.lyricsCleanup();
        panel.lyricsCleanup = null;
    }
}
