import { getVibrantColorFromImage } from './vibrant-color.js';
import { showNotification } from './downloads.js';
import { getTrackThemeColor, normalizeTrackThemeColor } from './track-theme-color.js';
import {
    getTrackDisplayAlbum,
    getTrackVersionArtwork,
    getTrackVersionGroup,
    getTrackVersionLabel,
} from './track-versions.js';
import { escapeHtml, formatTime, getTrackArtists } from './utils.js';

// Neutral silver when a cover has no readable color: the surface owns no hue of its own.
const NEUTRAL_ACCENT_RGB = '196 196 196';

function hexToRgb(color) {
    const value = normalizeTrackThemeColor(color);
    if (!value) return null;
    return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16)).join(' ');
}

function coverUrl(api, track) {
    return api.getCoverUrl(getTrackVersionArtwork(track));
}

function discHTML(api, track, className = '') {
    // The face carries the centre hole as a mask; the outer span keeps the drop shadow, which a mask would cut.
    return `<span class="version-disc ${className}" style="--version-accent-rgb: ${hexToRgb(getTrackThemeColor(track)) || NEUTRAL_ACCENT_RGB}">
        <span class="version-disc-face">
            <img src="${escapeHtml(coverUrl(api, track))}" alt="" />
            <span class="version-disc-hub" aria-hidden="true"></span>
            <span class="version-disc-sheen" aria-hidden="true"></span>
        </span>
    </span>`;
}

async function resolveAccent(api, track) {
    const stored = getTrackThemeColor(track) || normalizeTrackThemeColor(track?.album?.vibrantColor);
    if (stored) return hexToRgb(stored);
    return new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
            try {
                resolve(hexToRgb(getVibrantColorFromImage(image)));
            } catch {
                resolve(null);
            }
        };
        image.onerror = () => resolve(null);
        image.src = coverUrl(api, track);
    });
}

function rectSnapshot(element) {
    if (!element || element.hidden || !element.isConnected) return null;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
    };
}

// Full-viewport layer above the whole UI, with the player cover punched out of it: a flying disc is always
// above the player bar yet passes behind the cover, exactly like the resting disc in the player.
function createFlightLayer() {
    const layer = document.createElement('div');
    Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '2600', pointerEvents: 'none' });
    const cover = document.querySelector('.now-playing-bar .track-info .cover');
    const rect = rectSnapshot(cover);
    if (rect) {
        const radius = Math.min(
            Number.parseFloat(getComputedStyle(cover).borderTopLeftRadius) || 0,
            rect.width / 2,
            rect.height / 2
        );
        const { left: x, top: y, width: w, height: h } = rect;
        const r = radius;
        const hole = `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
        layer.style.clipPath = `path(evenodd, 'M0 0H${window.innerWidth}V${window.innerHeight}H0Z ${hole}')`;
    }
    return layer;
}

// The disc currently in flight. A new flight (re-click mid-animation) takes over from where this one is right now.
let activeFlight = null;

// Resting shadows of the two discs, so the flying clone morphs between them instead of snapping on landing.
const SHADOW_IN_PLAYER = '0 4px 9px rgb(0 0 0 / 0.3)';
const SHADOW_IN_LIST = '0 3px 8px rgb(0 0 0 / 0.36)';

function animateDiscBetween(source, target, { duration = 500, onLand } = {}) {
    let from = rectSnapshot(source);
    let startShade = null;
    let startShadow = null;
    let startTurn = null;
    if (activeFlight) {
        const liveRect = rectSnapshot(activeFlight.clone);
        if (liveRect) from = liveRect;
        startShade = Number.parseFloat(getComputedStyle(activeFlight.shade).opacity);
        startShadow = getComputedStyle(activeFlight.clone).boxShadow;
        const liveCover = activeFlight.clone.querySelector('img');
        startTurn = liveCover ? getComputedStyle(liveCover).transform : null;
        activeFlight.animation.cancel();
        activeFlight.layer.remove();
        activeFlight = null;
    }
    const to = rectSnapshot(target);
    // The list slides up into place while the disc flies; aim for where it settles, not where it starts.
    const list = target?.closest('.track-version-list');
    if (to && list) to.top -= new DOMMatrix(getComputedStyle(list).transform).m42;
    if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const clone = source.cloneNode(true);
    // The source row disc may be hidden (is-in-transit) when a flight is interrupted; the clone must stay visible.
    clone.classList.remove('is-in-transit');
    clone.classList.add('version-disc-flight');
    // Same shade the player button paints under the cover, so landing does not add it in one go.
    const shade = document.createElement('span');
    shade.className = 'version-flight-shade';
    shade.setAttribute('aria-hidden', 'true');
    clone.append(shade);
    const layer = createFlightLayer();
    Object.assign(clone.style, {
        position: 'absolute',
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        margin: '0',
        pointerEvents: 'none',
    });
    layer.append(clone);
    // In the panel the disc rests under its sleeve. The flight layer sits above the whole panel, so a copy of
    // that sleeve rides above the flying disc, tracking the real one every frame (position, scale, fade) while
    // the panel morphs: the disc leaves from and lands behind its sleeve instead of popping over it.
    const sleeve = (source.closest('.track-version-option') || target?.closest('.track-version-option'))?.querySelector(
        '.track-version-sleeve'
    );
    let sleeveFrame = 0;
    let followSleeve = null;
    if (sleeve) {
        const proxy = sleeve.cloneNode(true);
        proxy.classList.add('version-flight-sleeve');
        layer.append(proxy);
        const popover = sleeve.closest('.track-version-popover');
        const list = sleeve.closest('.track-version-list');
        // Stops by itself once the flight layer is removed.
        followSleeve = () => {
            if (!proxy.isConnected) return;
            const rect = sleeve.getBoundingClientRect();
            const alpha =
                (Number.parseFloat(getComputedStyle(popover).opacity) || 0) *
                (Number.parseFloat(getComputedStyle(list).opacity) || 0);
            Object.assign(proxy.style, {
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                opacity: popover.hidden ? '0' : String(alpha),
            });
            sleeveFrame = requestAnimationFrame(followSleeve);
        };
    }
    document.body.append(layer);
    followSleeve?.();
    // A disc keeps its angle when it lifts off and lands at the angle its destination rests at:
    // upright in the player, rolled out of its sleeve in the panel.
    const turnOf = (disc) => {
        const cover = disc?.querySelector('img');
        const turn = cover ? getComputedStyle(cover).transform : 'none';
        return turn === 'none' ? 'rotate(0deg)' : turn;
    };
    // A re-click mid-flight takes over the disc at the angle it has right now.
    const coverTurn = startTurn && startTurn !== 'none' ? startTurn : turnOf(source);
    const landingTurn = turnOf(target);
    if (coverTurn !== landingTurn) {
        clone.querySelector('img')?.animate([{ transform: coverTurn }, { transform: landingTurn }], {
            duration,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'both',
        });
    }
    const scaleX = to.width / from.width;
    const scaleY = to.height / from.height;
    const deltaX = Math.abs(to.left - from.left) < 1 ? 0 : to.left - from.left;
    const deltaY = to.top - from.top;
    const movingIntoPlayer = Boolean(target.closest('.version-switch-button'));
    const animation = clone.animate(
        [
            { transform: 'translate3d(0, 0, 0) scale(1)' },
            { transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})` },
        ],
        { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' }
    );
    const fade = { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' };
    const shadeFrom = Number.isFinite(startShade) ? startShade : movingIntoPlayer ? 0 : 1;
    const shadeTo = movingIntoPlayer ? 1 : 0;
    // The player disc carries a shade where the cover overlaps it; fade both parts of it with the flight.
    clone.classList.add('version-disc-player');
    clone.animate({ opacity: [shadeFrom, shadeTo] }, { ...fade, pseudoElement: '::after' });
    shade.animate({ opacity: [shadeFrom, shadeTo] }, fade);
    clone.animate(
        {
            boxShadow: [
                startShadow || (movingIntoPlayer ? SHADOW_IN_LIST : SHADOW_IN_PLAYER),
                movingIntoPlayer ? SHADOW_IN_PLAYER : SHADOW_IN_LIST,
            ],
        },
        fade
    );
    const flight = { clone, layer, shade, animation };
    activeFlight = flight;
    return animation.finished
        .catch(() => {})
        .finally(() => {
            const landed = activeFlight === flight;
            if (landed) activeFlight = null;
            // Swap clone for the static element in the same synchronous step: no frame between the two.
            if (landed) onLand?.();
            cancelAnimationFrame(sleeveFrame);
            layer.remove();
        });
}

export function setupTrackVersionPicker(player, api) {
    const trigger = document.getElementById('version-switch-button');
    const panel = document.getElementById('track-version-popover');
    if (!trigger || !panel) return;

    let versions = [];
    let currentTrack = null;
    let panelAnimation = null;
    let loadRun = 0;
    let animationRun = 0;
    let selectionInFlight = false;
    let unsleeveTimer = 0;
    const backdrop = document.createElement('div');
    backdrop.className = 'quality-floating-backdrop track-version-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    panel.before(backdrop);

    const applyAccent = async (element, track, run = loadRun) => {
        const rgb = await resolveAccent(api, track);
        if (run !== loadRun || !rgb || !element?.isConnected) return;
        element.style.setProperty('--version-accent-rgb', rgb);
    };

    const syncTrigger = (track, { entrance = false } = {}) => {
        currentTrack = track;
        const available = versions.length > 1;
        trigger.hidden = !available;
        trigger.disabled = !available;
        trigger.setAttribute('aria-expanded', String(!panel.hidden));
        if (!available) return;
        trigger.setAttribute('aria-label', `Choose another version of ${track.title || 'this track'}`);
        trigger.innerHTML = discHTML(api, track, 'version-disc-player');
        trigger.classList.toggle('is-entering', entrance && !matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (entrance) window.setTimeout(() => trigger.classList.remove('is-entering'), 1050);
        void applyAccent(trigger.querySelector('.version-disc'), track);
    };

    const isPlaying = () => Boolean(player.activeElement && !player.activeElement.paused);

    // The header names the song every row is a version of, so drop a trailing "(Live)" / "- Radio Edit".
    const songTitle = (track) => {
        const title = String(track?.title || '').trim();
        const label = getTrackVersionLabel(track, { fallback: '' });
        if (!label) return title;
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const suffix = new RegExp(`\\s*(?:[(\\[][^)\\]]*${escaped}[^)\\]]*[)\\]]|[-–]\\s*${escaped}.*)$`, 'i');
        return title.replace(suffix, '').trim() || title;
    };

    const releaseYear = (album) => {
        const year = new Date(album?.releaseDate || '').getFullYear();
        return Number.isFinite(year) ? year : null;
    };

    const optionHTML = (track, { currentArtists, showYears, order }) => {
        const active = String(track.id) === String(currentTrack?.id);
        const unavailable = Boolean(track.isUnavailable);
        const album = getTrackDisplayAlbum(track, versions);
        // The header already names the song; a row leads with what makes it different.
        const name = getTrackVersionLabel(track, { fallback: '' }) || track.title || 'Untitled';
        const year = showYears ? releaseYear(album) : null;
        const artists = getTrackArtists(track, { fallback: '' });
        const source = unavailable
            ? 'Not on this server'
            : [album?.title, year].filter(Boolean).join(', ') || 'No album';
        const duration = Number(track.duration) > 0 ? formatTime(track.duration) : '';
        return `<button type="button" class="track-version-option${active ? ' is-active' : ''}" role="option"
            aria-selected="${active}" ${active ? 'aria-current="true"' : ''} ${unavailable ? 'disabled' : ''}
            data-version-id="${escapeHtml(String(track.id))}" style="--version-accent-rgb: ${hexToRgb(getTrackThemeColor(track)) || NEUTRAL_ACCENT_RGB}">
            <span class="track-version-art" style="--pull-order: ${order}" aria-hidden="true">
                <span class="track-version-sleeve"><img src="${escapeHtml(coverUrl(api, track))}" alt="" /></span>
                ${discHTML(api, track, 'version-disc-row')}
            </span>
            <span class="track-version-copy">
                <strong>${escapeHtml(name)}</strong>
                <span>${escapeHtml(source)}</span>
                ${artists && artists !== currentArtists ? `<span>${escapeHtml(artists)}</span>` : ''}
            </span>
            <span class="track-version-meta">
                ${duration ? `<span class="track-version-duration">${escapeHtml(duration)}</span>` : ''}
                ${active ? '<span class="track-version-state"></span>' : ''}
            </span>
        </button>`;
    };

    // The current version's disc turns only while it is heard, like a deck on the Social booth.
    const syncPlayState = () => {
        const playing = isPlaying();
        panel.classList.toggle('is-playing', playing);
        const state = panel.querySelector('.track-version-state');
        if (state) state.textContent = playing ? 'Playing' : 'Paused';
    };

    const render = () => {
        const currentArtists = getTrackArtists(currentTrack, { fallback: '' });
        const years = new Set(versions.map((track) => releaseYear(getTrackDisplayAlbum(track, versions))));
        const showYears = years.size > 1;
        panel.innerHTML = `<div class="track-version-panel-shell">
            <header class="track-version-panel-header">
                <h3 id="track-version-popover-title">Choose a version</h3>
                <p>${escapeHtml(songTitle(currentTrack) || 'Current track')}${currentArtists ? `<span>${escapeHtml(currentArtists)}</span>` : ''}</p>
            </header>
            <div class="track-version-list" role="listbox" aria-label="Versions of this track">
                ${versions.map((track, order) => optionHTML(track, { currentArtists, showYears, order })).join('')}
            </div>
        </div>`;
        syncPlayState();
        const run = loadRun;
        for (const track of versions) {
            const option = panel.querySelector(`[data-version-id="${CSS.escape(String(track.id))}"]`);
            void applyAccent(option, track, run);
        }
    };

    const position = () => {
        const triggerRect = rectSnapshot(trigger);
        if (!triggerRect) return null;
        const gutter = 10;
        const mobile = matchMedia('(max-width: 600px)').matches;
        const width = Math.min(408, window.innerWidth - gutter * 2);
        panel.style.width = `${width}px`;
        panel.style.maxHeight = `${Math.min(560, window.innerHeight - gutter * 2)}px`;
        const height = panel.offsetHeight;
        const playerRect = document.querySelector('.now-playing-bar')?.getBoundingClientRect();
        let left = Math.min(Math.max(gutter, triggerRect.left - 16), window.innerWidth - width - gutter);
        let top = Math.max(gutter, triggerRect.top - height - 18);
        if (mobile) {
            left = gutter;
            top = Math.max(gutter, (playerRect?.top || window.innerHeight) - height - 10);
        }
        const optionInlinePadding = 8;
        const panelBorder = Number.parseFloat(getComputedStyle(panel).borderLeftWidth) || 0;
        const listInset = Math.max(0, Math.round(triggerRect.left - left - optionInlinePadding - panelBorder));
        panel.style.setProperty('--track-version-disc-size', `${triggerRect.width}px`);
        panel.style.setProperty('--track-version-list-inset', `${listInset}px`);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        return triggerRect;
    };

    const frames = (triggerRect) => {
        const panelRect = panel.getBoundingClientRect();
        return {
            collapsed: {
                opacity: 0,
                borderRadius: '999px',
                clipPath: 'inset(0 round 999px)',
                transform: `translate(${triggerRect.left - panelRect.left}px, ${triggerRect.top - panelRect.top}px) scale(${Math.max(0.08, triggerRect.width / panelRect.width)}, ${Math.max(0.06, triggerRect.height / panelRect.height)})`,
            },
            expanded: { opacity: 1, borderRadius: '16px', clipPath: 'inset(0 round 16px)', transform: 'none' },
        };
    };

    // Where the panel visually is right now, so a re-click mid-animation reverses from there instead of jumping.
    const currentFrame = () => {
        if (panel.hidden) return null;
        const computed = getComputedStyle(panel);
        return {
            opacity: Number.parseFloat(computed.opacity) || 0,
            borderRadius: computed.borderRadius,
            clipPath: computed.clipPath === 'none' ? 'inset(0 round 16px)' : computed.clipPath,
            transform: computed.transform === 'none' ? 'none' : computed.transform,
        };
    };

    const finishClose = (restoreFocus) => {
        panel.hidden = true;
        backdrop.hidden = true;
        trigger.classList.remove('is-panel-open');
        if (!activeFlight) trigger.style.removeProperty('opacity');
        trigger.setAttribute('aria-expanded', 'false');
        if (restoreFocus) trigger.focus({ preventScroll: true });
    };

    const close = ({ restoreFocus = false, animateDisc = true, selectedTrack = currentTrack } = {}) => {
        if (panel.hidden) return Promise.resolve();
        const run = ++animationRun;
        const triggerRect = rectSnapshot(trigger);
        const source = panel.querySelector(
            `[data-version-id="${CSS.escape(String(selectedTrack?.id || ''))}"] .version-disc`
        );
        if (selectedTrack) {
            trigger.innerHTML = discHTML(api, selectedTrack, 'version-disc-player');
            void applyAccent(trigger.querySelector('.version-disc'), selectedTrack);
        }
        const target = trigger.querySelector('.version-disc');
        const discMotion =
            animateDisc && source
                ? animateDiscBetween(source, target, {
                      duration: 460,
                      onLand: () => {
                          if (run !== animationRun) return;
                          trigger.classList.add('is-landing');
                          trigger.style.removeProperty('opacity');
                          window.setTimeout(() => trigger.classList.remove('is-landing'), 120);
                      },
                  })
                : Promise.resolve();
        source?.classList.add('is-in-transit');
        window.clearTimeout(unsleeveTimer);
        panel.classList.remove('is-open', 'is-unsleeving');
        backdrop.classList.remove('is-open');
        const fromFrame = currentFrame();
        panelAnimation?.cancel();

        if (!triggerRect || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            finishClose(restoreFocus);
            return discMotion;
        }
        const panelFrames = frames(triggerRect);
        panelAnimation = panel.animate([fromFrame || panelFrames.expanded, panelFrames.collapsed], {
            duration: 250,
            easing: 'cubic-bezier(0.4, 0, 0.7, 0.2)',
            fill: 'both',
        });
        const panelDone = panelAnimation.finished
            .then(() => {
                if (run === animationRun) finishClose(restoreFocus);
            })
            .catch(() => {});
        return Promise.all([discMotion, panelDone]).then(() => {
            // Only reveal the real trigger disc once the flying one has landed on it.
            if (run === animationRun && panel.hidden) trigger.style.removeProperty('opacity');
        });
    };

    const open = () => {
        if (versions.length < 2 || !currentTrack) return;
        const run = ++animationRun;
        const resumeFrame = currentFrame();
        render();
        panel.hidden = false;
        backdrop.hidden = false;
        panel.style.visibility = 'hidden';
        const triggerRect = position();
        if (!triggerRect) {
            panel.hidden = true;
            backdrop.hidden = true;
            return;
        }
        const activeDisc = panel.querySelector('.track-version-option.is-active .version-disc');
        panel.style.visibility = '';
        panel.classList.add('is-open');
        // The pull-out-of-sleeve entrance plays once per opening, never again when rows change state.
        window.clearTimeout(unsleeveTimer);
        panel.classList.add('is-unsleeving');
        unsleeveTimer = window.setTimeout(
            () => panel.classList.remove('is-unsleeving'),
            150 + versions.length * 60 + 640
        );
        backdrop.classList.add('is-open');
        trigger.classList.add('is-panel-open');
        trigger.setAttribute('aria-expanded', 'true');
        panelAnimation?.cancel();
        const panelFrames = frames(triggerRect);
        const discMotion = animateDiscBetween(trigger.querySelector('.version-disc'), activeDisc, {
            duration: 520,
            onLand: () => {
                if (run === animationRun) activeDisc?.classList.remove('is-in-transit');
            },
        });
        trigger.style.opacity = '0';
        activeDisc?.classList.add('is-in-transit');

        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            activeDisc?.classList.remove('is-in-transit');
            panel.querySelector('.track-version-option.is-active')?.focus({ preventScroll: true });
            return;
        }
        panelAnimation = panel.animate([resumeFrame || panelFrames.collapsed, panelFrames.expanded], {
            duration: 380,
            easing: 'cubic-bezier(0.2, 0.9, 0.24, 1.04)',
            fill: 'both',
        });
        void Promise.all([panelAnimation.finished.catch(() => {}), discMotion]).then(() => {
            if (run !== animationRun) return;
            panelAnimation?.cancel();
            activeDisc?.classList.remove('is-in-transit');
            panel.querySelector('.track-version-option.is-active')?.focus({ preventScroll: true });
        });
    };

    const loadForTrack = async (track) => {
        const run = ++loadRun;
        if (!track) {
            versions = [];
            currentTrack = null;
            trigger.hidden = true;
            if (!panel.hidden) await close({ animateDisc: false });
            return;
        }
        const allTracks = await api
            .getAPI()
            .getTracks()
            .catch(() => [track]);
        if (run !== loadRun) return;
        versions = getTrackVersionGroup(track, allTracks);
        syncTrigger(track, {
            entrance:
                versions.length > 1 && String(trigger.dataset.groupId || '') !== String(track.versionGroupId || ''),
        });
        trigger.dataset.groupId = track.versionGroupId || '';
    };

    trigger.addEventListener('click', () => {
        if (panel.hidden) open();
        else void close({ restoreFocus: true });
    });
    panel.addEventListener('click', async (event) => {
        const option = event.target.closest('[data-version-id]');
        if (!option || selectionInFlight) return;
        const selected = versions.find((track) => String(track.id) === option.dataset.versionId);
        if (!selected || selected.isUnavailable) return;
        selectionInFlight = true;
        panel.setAttribute('aria-busy', 'true');
        panel.querySelectorAll('.track-version-option').forEach((row) => {
            const active = row === option;
            row.classList.toggle('is-active', active);
            row.setAttribute('aria-selected', String(active));
        });
        const changed = String(selected.id) !== String(currentTrack.id);
        await close({ selectedTrack: selected });
        if (changed) {
            try {
                await player.switchTrackVersion(selected);
            } catch (error) {
                console.error('[TrackVersions] Could not switch version:', error);
                showNotification(`Could not play ${selected.title || 'this version'}. Try another version.`, 'error');
                window.dispatchEvent(
                    new CustomEvent('player-version-switch-error', { detail: { error, track: selected } })
                );
            }
        }
        panel.removeAttribute('aria-busy');
        selectionInFlight = false;
    });
    backdrop.addEventListener('click', () => void close({ restoreFocus: true }));

    // Hologram: the pointer is the lamp. Moving across the panel turns the light source, so the spectrum
    // on the rim of the lit discs (playing, hovered) slides round like a CD tilted under a light.
    const setLight = (angle) => {
        panel.style.setProperty('--holo-angle', `${angle}deg`);
    };
    let lightFrame = 0;
    panel.addEventListener('pointermove', (event) => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches || event.pointerType === 'touch') return;
        cancelAnimationFrame(lightFrame);
        lightFrame = requestAnimationFrame(() => {
            const rect = panel.getBoundingClientRect();
            const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
            setLight(120 + x * 200 - y * 50);
        });
    });
    panel.addEventListener('pointerleave', () => {
        cancelAnimationFrame(lightFrame);
        panel.style.removeProperty('--holo-angle');
    });
    // Keyboard: the light follows the focused row down the list.
    panel.addEventListener('focusin', (event) => {
        const option = event.target.closest?.('.track-version-option');
        if (!option || !option.matches(':focus-visible')) return;
        const index = [...panel.querySelectorAll('.track-version-option')].indexOf(option);
        setLight(150 + index * 42);
    });
    // Media events don't bubble and the player swaps audio decks, so listen in capture on the document.
    for (const type of ['play', 'pause', 'ended']) {
        document.addEventListener(
            type,
            () => {
                if (!panel.hidden) syncPlayState();
            },
            true
        );
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) void close({ restoreFocus: true });
    });
    window.addEventListener('resize', () => {
        if (!panel.hidden) position();
    });
    window.addEventListener('player-track-changed', (event) => void loadForTrack(event.detail?.track));
    window.addEventListener('track-metadata-updated', (event) => {
        if (String(event.detail?.trackId) === String(currentTrack?.id)) void loadForTrack(event.detail.track);
    });
    void loadForTrack(player.currentTrack);
}
