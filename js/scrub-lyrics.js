import { LyricsManager } from './lyrics.js';
import { parseTimedLyrics } from './lyrics-format.js';
import { playerBarEffectsSettings } from './storage.js';

// A silence this long between two lines gets its own "breathing dots" row.
const INTERLUDE_MIN_MS = 3500;
// Clicks shorter than this never open the preview, only real drags do.
const REVEAL_DELAY_MS = 140;
const PANEL_GAP_PX = 46;
const VIEWPORT_GUTTER_PX = 16;
const REEL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function buildItems(lines) {
    const items = [];
    if (lines[0].begin >= INTERLUDE_MIN_MS) items.push({ type: 'gap', begin: 0, end: lines[0].begin });
    lines.forEach((line, index) => {
        items.push({ type: 'line', begin: line.begin, end: line.end, line });
        const next = lines[index + 1];
        if (next && next.begin - line.end >= INTERLUDE_MIN_MS) {
            items.push({ type: 'gap', begin: line.end, end: next.begin });
        }
    });
    return items;
}

function findFocus(items, timeMs) {
    let low = 0;
    let high = items.length - 1;
    let found = 0;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (items[middle].begin <= timeMs) {
            found = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return found;
}

function progressBetween(timeMs, begin, end) {
    if (end <= begin) return timeMs >= end ? 1 : 0;
    return Math.max(0, Math.min(1, (timeMs - begin) / (end - begin)));
}

function buildLineElement(item) {
    const element = document.createElement('div');
    element.className = 'scrub-lyrics-row';

    // Empty slot before the first or after the last line keeps the reel height stable.
    if (!item) {
        element.classList.add('is-spacer');
        element.textContent = '\u00a0';
        return element;
    }

    if (item.type === 'gap') {
        element.classList.add('is-gap');
        for (let index = 0; index < 3; index++) {
            const dot = document.createElement('span');
            dot.className = 'scrub-lyrics-dot';
            element.appendChild(dot);
        }
        return element;
    }

    const text = document.createElement('span');
    text.className = 'scrub-lyrics-text';
    const { words } = item.line;
    if (!words) {
        text.textContent = item.line.text;
    } else {
        // Syllables of one word stay on one line; a space starts the next group.
        let group = null;
        words.forEach((word) => {
            if (!group) {
                group = document.createElement('span');
                group.className = 'scrub-lyrics-group';
                text.appendChild(group);
            }
            const span = document.createElement('span');
            span.className = word.background ? 'scrub-lyrics-word is-background' : 'scrub-lyrics-word';
            span.textContent = word.text;
            group.appendChild(span);
            if (word.space) {
                text.appendChild(document.createTextNode(' '));
                group = null;
            }
        });
    }
    element.appendChild(text);
    return element;
}

/**
 * Lyrics preview shown above the seek bar while it is dragged.
 * Stays silent for tracks without time-synced lyrics.
 */
export function createScrubLyrics({ anchor, getTrack }) {
    let trackKey = null;
    let loadPromise = null;
    let items = null;
    let kind = 'line';

    let panel = null;
    let reel = null;
    let isActive = false;
    let isVisible = false;
    let revealTimer = 0;
    let frame = 0;
    let latestTimeSeconds = 0;
    let focus = null;
    const rows = new Map();

    const ensurePanel = () => {
        if (panel) return;
        panel = document.createElement('div');
        panel.className = 'scrub-lyrics';
        panel.setAttribute('aria-hidden', 'true');
        reel = document.createElement('div');
        reel.className = 'scrub-lyrics-reel';
        panel.appendChild(reel);
        document.body.appendChild(panel);
    };

    const reset = () => {
        trackKey = null;
        loadPromise = null;
        items = null;
        hide();
    };

    const load = () => {
        const track = getTrack();
        if (!track) return Promise.resolve(null);
        const key = `${track.id}:${track.lyrics ? track.lyrics.length : 0}`;
        if (key === trackKey && loadPromise) return loadPromise;

        trackKey = key;
        items = null;
        loadPromise = (async () => {
            let manager;
            try {
                manager = LyricsManager.instance;
            } catch {
                return null;
            }
            const fetched = await manager.fetchLyrics(track.id, track);
            const candidates = [fetched?.ttml, fetched?.subtitles, track.lyrics];
            for (const candidate of candidates) {
                const parsed = parseTimedLyrics(candidate, track.duration);
                if (!parsed) continue;
                if (trackKey === key) {
                    items = buildItems(parsed.lines);
                    kind = parsed.kind;
                    if (isActive && !isVisible && !revealTimer) reveal();
                }
                return parsed;
            }
            return null;
        })().catch((error) => {
            console.warn('Scrub lyrics preview unavailable:', error);
            // Let the next hover or drag retry after a transient failure.
            if (trackKey === key) trackKey = null;
            return null;
        });
        return loadPromise;
    };

    const place = () => {
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(560, window.innerWidth - VIEWPORT_GUTTER_PX * 2);
        const center = rect.left + rect.width / 2;
        const left = Math.max(
            VIEWPORT_GUTTER_PX,
            Math.min(window.innerWidth - VIEWPORT_GUTTER_PX - width, center - width / 2)
        );
        panel.style.width = `${width}px`;
        panel.style.left = `${left}px`;
        panel.style.bottom = `${window.innerHeight - rect.top + PANEL_GAP_PX}px`;
    };

    const timeMs = () => {
        let offset = 0;
        try {
            offset = LyricsManager.instance.timingOffset || 0;
        } catch {
            offset = 0;
        }
        // Same convention as the lyrics panel: a positive offset delays lyrics.
        return latestTimeSeconds * 1000 - offset;
    };

    const ghostOut = (element, direction) => {
        const top = element.offsetTop;
        element.classList.add('is-leaving');
        element.style.top = `${top}px`;
        const animation = element.animate(
            [
                { opacity: 1, transform: 'translateY(0)' },
                { opacity: 0, transform: reduceMotion.matches ? 'none' : `translateY(${direction * -16}px)` },
            ],
            { duration: reduceMotion.matches ? 120 : 220, easing: 'ease-out', fill: 'forwards' }
        );
        animation.onfinish = () => element.remove();
    };

    const renderReel = (nextFocus) => {
        const direction = focus == null ? 0 : Math.sign(nextFocus - focus);
        const animate = isVisible && focus != null && !reduceMotion.matches;
        const firstTops = new Map();
        if (animate) rows.forEach((element, index) => firstTops.set(index, element.getBoundingClientRect().top));

        const wanted = [nextFocus - 1, nextFocus, nextFocus + 1].filter(
            (index) => index >= -1 && index <= items.length
        );
        rows.forEach((element, index) => {
            if (wanted.includes(index)) return;
            rows.delete(index);
            if (animate) ghostOut(element, direction);
            else element.remove();
        });

        wanted.forEach((index) => {
            let element = rows.get(index);
            const isNew = !element;
            if (isNew) {
                element = buildLineElement(items[index]);
                rows.set(index, element);
            }
            element.dataset.role = index < nextFocus ? 'prev' : index > nextFocus ? 'next' : 'current';
            reel.insertBefore(element, reel.querySelector('.scrub-lyrics-row.is-leaving'));
            if (!animate) return;
            if (isNew) {
                element.animate(
                    [
                        { opacity: 0, transform: `translateY(${direction * 18}px)` },
                        { opacity: 1, transform: 'translateY(0)' },
                    ],
                    { duration: 300, easing: REEL_EASING }
                );
            }
        });

        if (animate) {
            rows.forEach((element, index) => {
                if (!firstTops.has(index)) return;
                const delta = firstTops.get(index) - element.getBoundingClientRect().top;
                if (Math.abs(delta) < 0.5) return;
                element.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
                    duration: 340,
                    easing: REEL_EASING,
                });
            });
        }
        focus = nextFocus;
    };

    const paintProgress = (now) => {
        const item = items[focus];
        const element = rows.get(focus);
        if (!item || !element) return;

        if (item.type === 'gap') {
            const progress = progressBetween(now, item.begin, item.end);
            element.querySelectorAll('.scrub-lyrics-dot').forEach((dot, index) => {
                dot.style.setProperty('--p', String(Math.max(0, Math.min(1, progress * 3 - index))));
            });
            return;
        }

        const { words } = item.line;
        if (!words) return;
        element.querySelectorAll('.scrub-lyrics-word').forEach((span, index) => {
            const word = words[index];
            const progress = progressBetween(now, word.begin, word.end);
            span.style.setProperty('--p', progress.toFixed(3));
            span.classList.toggle('is-singing', progress > 0 && progress < 1);
        });
    };

    const paint = () => {
        frame = 0;
        if (!isVisible || !items) return;
        const now = timeMs();
        const nextFocus = findFocus(items, now);
        if (nextFocus !== focus) renderReel(nextFocus);
        paintProgress(now);
    };

    const schedulePaint = () => {
        if (!frame) frame = requestAnimationFrame(paint);
    };

    function reveal() {
        window.clearTimeout(revealTimer);
        revealTimer = 0;
        if (!isActive || !items) return;
        ensurePanel();
        reel.replaceChildren();
        rows.clear();
        focus = null;
        panel.dataset.mode = kind;
        place();
        isVisible = true;
        paint();
        // Force the start state so the entrance transition runs on first show.
        void panel.offsetWidth;
        panel.classList.add('is-visible');
    }

    function hide() {
        window.clearTimeout(revealTimer);
        revealTimer = 0;
        isActive = false;
        if (!isVisible) return;
        isVisible = false;
        panel?.classList.remove('is-visible');
    }

    window.addEventListener('player-track-changed', reset);
    window.addEventListener('resize', () => {
        if (isVisible) place();
    });

    return {
        prefetch: () => {
            if (playerBarEffectsSettings.areScrubLyricsEnabled()) load();
        },
        start(timeSeconds) {
            // Read on every drag so toggling the setting applies without a reload.
            if (!playerBarEffectsSettings.areScrubLyricsEnabled()) return;
            latestTimeSeconds = timeSeconds;
            isActive = true;
            load();
            window.clearTimeout(revealTimer);
            revealTimer = window.setTimeout(reveal, REVEAL_DELAY_MS);
        },
        update(timeSeconds) {
            if (!isActive) return;
            const moved = Math.abs(timeSeconds - latestTimeSeconds) > 0.25;
            latestTimeSeconds = timeSeconds;
            if (!isVisible && moved && revealTimer) reveal();
            schedulePaint();
        },
        end: hide,
    };
}
