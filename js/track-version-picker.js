import { getVibrantColorFromImage } from './vibrant-color.js';
import { showNotification } from './downloads.js';
import { getTrackThemeColor, normalizeTrackThemeColor } from './track-theme-color.js';
import {
    getTrackDisplayAlbum,
    getTrackVersionArtwork,
    getTrackVersionGroup,
    getTrackVersionLabel,
} from './track-versions.js';
import { escapeHtml, getTrackArtists } from './utils.js';

function hexToRgb(color) {
    const value = normalizeTrackThemeColor(color);
    if (!value) return null;
    return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16)).join(' ');
}

function coverUrl(api, track) {
    return api.getCoverUrl(getTrackVersionArtwork(track));
}

function discHTML(api, track, className = '') {
    return `<span class="version-disc ${className}" style="--version-accent-rgb: ${hexToRgb(getTrackThemeColor(track)) || '167 139 250'}">
        <img src="${escapeHtml(coverUrl(api, track))}" alt="" />
        <span class="version-disc-sheen" aria-hidden="true"></span>
        <span class="version-disc-hub" aria-hidden="true"></span>
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

function animateDiscBetween(source, target, { duration = 500 } = {}) {
    const from = rectSnapshot(source);
    const to = rectSnapshot(target);
    if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const clone = source.cloneNode(true);
    clone.classList.add('version-disc-flight');
    Object.assign(clone.style, {
        position: 'fixed',
        zIndex: '2600',
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        margin: '0',
        pointerEvents: 'none',
    });
    document.body.append(clone);
    const scaleX = to.width / from.width;
    const scaleY = to.height / from.height;
    const deltaX = Math.abs(to.left - from.left) < 1 ? 0 : to.left - from.left;
    const deltaY = to.top - from.top;
    const movingIntoPlayer = deltaY > 0;
    const layerSwitch = movingIntoPlayer ? 0.84 : 0.16;
    const switchTransform = `translate3d(${deltaX * layerSwitch}px, ${deltaY * layerSwitch}px, 0) scale(${1 + (scaleX - 1) * layerSwitch}, ${1 + (scaleY - 1) * layerSwitch})`;
    const animation = clone.animate(
        movingIntoPlayer
            ? [
                  { transform: 'translate3d(0, 0, 0) scale(1)', zIndex: '2600' },
                  { offset: layerSwitch, transform: switchTransform, zIndex: '2600' },
                  { offset: layerSwitch + 0.001, transform: switchTransform, zIndex: '2099' },
                  {
                      transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`,
                      zIndex: '2099',
                  },
              ]
            : [
                  { transform: 'translate3d(0, 0, 0) scale(1)', zIndex: '2099' },
                  { offset: layerSwitch, transform: switchTransform, zIndex: '2099' },
                  { offset: layerSwitch + 0.001, transform: switchTransform, zIndex: '2600' },
                  {
                      transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`,
                      zIndex: '2600',
                  },
              ],
        { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' }
    );
    return animation.finished.catch(() => {}).finally(() => clone.remove());
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

    const render = () => {
        panel.innerHTML = `<div class="track-version-panel-shell">
            <header class="track-version-panel-header">
                <div>
                    <h3 id="track-version-popover-title">Choose a version</h3>
                    <p>${escapeHtml(currentTrack?.title || 'Current track')}</p>
                </div>
                <span class="track-version-count">${versions.length} versions</span>
            </header>
            <div class="track-version-list" role="listbox" aria-label="Available track versions">
                ${versions
                    .map((track) => {
                        const active = String(track.id) === String(currentTrack?.id);
                        const unavailable = Boolean(track.isUnavailable);
                        const album = getTrackDisplayAlbum(track, versions);
                        return `<button type="button" class="track-version-option${active ? ' is-active' : ''}" role="option"
                            aria-selected="${active}" ${active ? 'aria-current="true"' : ''} ${unavailable ? 'disabled' : ''}
                            data-version-id="${escapeHtml(String(track.id))}" style="--version-accent-rgb: ${hexToRgb(getTrackThemeColor(track)) || '167 139 250'}">
                            ${discHTML(api, track, 'version-disc-row')}
                            <span class="track-version-copy">
                                <strong>${escapeHtml(getTrackVersionLabel(track, { fallback: active ? 'Current version' : 'Alternative version' }))}</strong>
                                <span>${escapeHtml(track.title || 'Untitled')}</span>
                                <small>${unavailable ? 'Unavailable' : `${escapeHtml(getTrackArtists(track))} · ${escapeHtml(album?.title || 'No album')}`}</small>
                            </span>
                            <span class="track-version-state">${active ? '<i aria-hidden="true"></i> Current' : ''}</span>
                        </button>`;
                    })
                    .join('')}
            </div>
        </div>`;
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

    const finishClose = (restoreFocus) => {
        panel.hidden = true;
        backdrop.hidden = true;
        trigger.classList.remove('is-panel-open');
        trigger.style.removeProperty('opacity');
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
            animateDisc && source ? animateDiscBetween(source, target, { duration: 460 }) : Promise.resolve();
        source?.classList.add('is-in-transit');
        panel.classList.remove('is-open');
        backdrop.classList.remove('is-open');
        panelAnimation?.cancel();

        if (!triggerRect || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            finishClose(restoreFocus);
            return discMotion;
        }
        const panelFrames = frames(triggerRect);
        panelAnimation = panel.animate([panelFrames.expanded, panelFrames.collapsed], {
            duration: 250,
            easing: 'cubic-bezier(0.4, 0, 0.7, 0.2)',
            fill: 'both',
        });
        const panelDone = panelAnimation.finished
            .then(() => {
                if (run === animationRun) finishClose(restoreFocus);
            })
            .catch(() => {});
        return Promise.all([discMotion, panelDone]).then(() => undefined);
    };

    const open = () => {
        if (versions.length < 2 || !currentTrack) return;
        const run = ++animationRun;
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
        backdrop.classList.add('is-open');
        trigger.classList.add('is-panel-open');
        trigger.setAttribute('aria-expanded', 'true');
        panelAnimation?.cancel();
        const panelFrames = frames(triggerRect);
        const discMotion = animateDiscBetween(trigger.querySelector('.version-disc'), activeDisc, { duration: 520 });
        trigger.style.opacity = '0';
        activeDisc?.classList.add('is-in-transit');

        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            activeDisc?.classList.remove('is-in-transit');
            panel.querySelector('.track-version-option.is-active')?.focus({ preventScroll: true });
            return;
        }
        panelAnimation = panel.animate([panelFrames.collapsed, panelFrames.expanded], {
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
