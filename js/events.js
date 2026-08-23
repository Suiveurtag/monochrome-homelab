//js/events.js
import {
    REPEAT_MODE,
    trackDataStore,
    formatTime,
    getTrackArtists,
    positionMenu,
    prepareContextMenu,
    escapeHtml,
} from './utils.js';
import { buildSharePath, copyShareLink } from './share.js';
import {
    lastFMStorage,
    libreFmSettings,
    listenBrainzSettings,
    waveformSettings,
    keyboardShortcuts,
    recentActivityManager,
} from './storage.js';
import { showNotification, downloadTrackWithMetadata, downloadAlbum, downloadPlaylist } from './downloads.js';
import { downloadQualitySettings } from './storage.js';
import { updateTabTitle, navigate } from './router.js';
import { db } from './db.js';
import { syncManager } from './accounts/pocketbase.js';
import { waveformGenerator } from './waveform.js';
import { audioContextManager } from './audio-context.js';
import { hapticLongPress, hapticMedium, hapticLight } from './haptics.js';
import {
    SVG_BIN,
    SVG_CHECK,
    SVG_CHECKBOX,
    SVG_CHECKBOX_CHECKED,
    SVG_CLOSE,
    SVG_INFORMATION_CIRCLE,
    SVG_LEFT_ARROW,
    SVG_PLUS,
    SVG_SEARCH,
    SVG_MUTE,
    SVG_QUALITY_LOSSLESS,
    SVG_QUALITY_WAVE_SAW,
    SVG_QUALITY_WAVE_SINE,
    SVG_QUALITY_WAVE_SQUARE,
    SVG_QUALITY_WAVES_ELECTRICITY,
    SVG_REPEAT,
    SVG_SETTINGS,
    SVG_SHUFFLE,
    SVG_VOLUME,
    SVG_USER,
} from './icons.js';
import { partyManager } from './listening-party.js';
import { MusicAPI } from './music-api.js';
import { LyricsManager } from './lyrics.js';
import { Player } from './player.js';
import { playerBarEffects } from './player-bar-effects.js';
import { initializePlayerActionLayout, PLAYER_ACTIONS } from './player-bar-layout.js';
import { socialManager } from './social.js';
import { canvasSettings } from './canvas-settings.js';
import { setupTrackVersionPicker } from './track-version-picker.js';
import { getTrackDisplayAlbum } from './track-versions.js';

let currentTrackIdForWaveform = null;

const trackSelection = {
    selectedIds: new Set(),
    lastClickedId: null,
    isSelecting: false,
};

let longPressTimer = null;
let isLongPress = false;
let longPressTrackItem = null;
const LONG_PRESS_DURATION = 500;

function handleTrackTouchStart(e) {
    if (!('ontouchstart' in window)) return;
    const trackItem = e.target.closest('.track-item');
    if (!trackItem || trackItem.classList.contains('unavailable')) return;

    isLongPress = false;
    longPressTrackItem = trackItem;

    longPressTimer = setTimeout(async () => {
        isLongPress = true;
        toggleTrackSelection(trackItem, true, false);
        await hapticLongPress();
    }, LONG_PRESS_DURATION);
}

function handleTrackTouchMove(_e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

function handleTrackTouchEnd(_e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    setTimeout(() => {
        isLongPress = false;
        longPressTrackItem = null;
    }, 100);
}

function isMultiSelectToggle(e) {
    const shortcut = keyboardShortcuts.getShortcutForAction('multiSelectToggle');
    if (!shortcut) return e.ctrlKey || e.metaKey;
    const key = e.key?.toLowerCase();
    const shortcutKey = shortcut.key?.toLowerCase();

    if (['control', 'shift', 'alt', 'meta'].includes(shortcutKey)) {
        if (shortcut.ctrl && !(e.ctrlKey || e.metaKey)) return false;
        if (shortcut.shift && !e.shiftKey) return false;
        if (shortcut.alt && !e.altKey) return false;
        return true;
    }

    return (
        (shortcut.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey) &&
        (shortcut.shift ? e.shiftKey : !e.shiftKey) &&
        (shortcut.alt ? e.altKey : !e.altKey) &&
        key === shortcutKey
    );
}

function isMultiSelectRange(e) {
    const shortcut = keyboardShortcuts.getShortcutForAction('multiSelectRange');
    if (!shortcut) return e.shiftKey;
    const key = e.key?.toLowerCase();
    const shortcutKey = shortcut.key?.toLowerCase();

    if (['control', 'shift', 'alt', 'meta'].includes(shortcutKey)) {
        if (shortcut.ctrl && !(e.ctrlKey || e.metaKey)) return false;
        if (shortcut.shift && !e.shiftKey) return false;
        if (shortcut.alt && !e.altKey) return false;
        return true;
    }

    return (
        (shortcut.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey) &&
        (shortcut.shift ? e.shiftKey : !e.shiftKey) &&
        (shortcut.alt ? e.altKey : !e.altKey) &&
        key === shortcutKey
    );
}

function getSelectedTracks() {
    return Array.from(trackSelection.selectedIds);
}

function updateCheckbox(checkbox, checked) {
    if (checkbox) {
        checkbox.innerHTML = checked ? SVG_CHECKBOX_CHECKED(18) : SVG_CHECKBOX(18);
        checkbox.classList.toggle('checked', checked);
    }
}

function toggleTrackSelection(trackItem, ctrlHeld, shiftHeld) {
    const trackId = trackItem.dataset.trackId;
    const isSelected = trackSelection.selectedIds.has(trackId);

    if (ctrlHeld) {
        if (isSelected) {
            trackSelection.selectedIds.delete(trackId);
            trackItem.classList.remove('selected');
            updateCheckbox(trackItem.querySelector('.track-checkbox'), false);
        } else {
            trackSelection.selectedIds.add(trackId);
            trackItem.classList.add('selected');
            updateCheckbox(trackItem.querySelector('.track-checkbox'), true);
        }
        trackSelection.lastClickedId = trackId;
    } else if (shiftHeld && trackSelection.lastClickedId && trackSelection.lastClickedId !== trackId) {
        const parentList = trackItem.closest('.track-list') || trackItem.closest('#main-content');
        const allTrackElements = Array.from(parentList.querySelectorAll('.track-item'));
        const lastIndex = allTrackElements.findIndex((el) => el.dataset.trackId === trackSelection.lastClickedId);
        const currentIndex = allTrackElements.findIndex((el) => el.dataset.trackId === trackId);

        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            for (let i = start; i <= end; i++) {
                const el = allTrackElements[i];
                trackSelection.selectedIds.add(el.dataset.trackId);
                el.classList.add('selected');
                updateCheckbox(el.querySelector('.track-checkbox'), true);
            }
        }
    } else {
        if (!isSelected) {
            trackSelection.selectedIds.add(trackId);
            trackItem.classList.add('selected');
            updateCheckbox(trackItem.querySelector('.track-checkbox'), true);
        } else {
            trackSelection.selectedIds.delete(trackId);
            trackItem.classList.remove('selected');
            updateCheckbox(trackItem.querySelector('.track-checkbox'), false);
        }
        trackSelection.lastClickedId = trackId;
    }

    trackSelection.isSelecting = trackSelection.selectedIds.size > 0;
    document.body.classList.toggle('multi-select-mode', trackSelection.isSelecting);
}

async function showMultiSelectPlaylistModal(tracks) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText =
        'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
        <div class="modal-content" style="background: var(--card); border-radius: var(--radius); padding: 1.5rem; min-width: 350px; max-width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.75rem;">
                <h3 style="margin: 0;">Add to Playlist</h3>
                <button class="modal-close" style="background: none; border: none; color: var(--foreground); font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
            </div>
            <div class="playlist-body" style="max-height: 300px; overflow-y: auto;">
                <div class="create-new-playlist" style="padding: 12px; cursor: pointer; border-bottom: 1px solid var(--border); color: var(--primary); font-weight: 500;">
                    + Create new playlist
                </div>
                <div class="playlist-list"></div>
            </div>
        </div>
    `;

    const closeModal = () => {
        modal.remove();
        document.body.style.overflow = '';
    };

    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    await db.getPlaylists(true).then((playlists) => {
        const listEl = modal.querySelector('.playlist-list');
        if (playlists.length === 0) {
            listEl.innerHTML = '<div style="padding: 12px; color: var(--muted-foreground);">No playlists yet</div>';
        } else {
            listEl.innerHTML = playlists
                .map(
                    (p) => `
                <div class="playlist-item" data-playlist-id="${p.id}" style="padding: 12px; cursor: pointer; border-bottom: 1px solid var(--border);">
                    <span>${escapeHtml(p.name)}</span>
                    <span style="color: var(--muted-foreground); font-size: 0.85rem; margin-left: 8px;">${p.tracks?.length || 0} tracks</span>
                </div>
            `
                )
                .join('');
        }

        listEl.querySelectorAll('.playlist-item').forEach((item) => {
            item.addEventListener('click', async () => {
                const playlistId = item.dataset.playlistId;
                for (const track of tracks) {
                    await db.addTrackToPlaylist(playlistId, track);
                }
                await syncManager.syncUserPlaylist(await db.getPlaylist(playlistId), 'update');
                showNotification(`Added ${tracks.length} tracks to playlist`);
                closeModal();
            });
        });
    });

    modal.querySelector('.create-new-playlist').addEventListener('click', async () => {
        const name = prompt('Playlist name:');
        if (name) {
            await db.createPlaylist(name, tracks).then((_playlist) => {
                showNotification(`Created playlist "${name}" with ${tracks.length} tracks`);
                closeModal();
            });
        }
    });
}

const playPauseBtn = document.querySelector('.now-playing-bar .play-pause-btn');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const shuffleBtn = document.getElementById('shuffle-btn');
const repeatBtn = document.getElementById('repeat-btn');
const homeStartRadioBtn = document.getElementById('home-start-infinite-radio-btn');
const sleepTimerBtnDesktop = document.getElementById('sleep-timer-btn-desktop');

const _volumeBar = document.getElementById('volume-bar');
const volumeFill = document.getElementById('volume-fill');
const volumeBtn = document.getElementById('volume-btn');

initializePlayerActionLayout();

const updateVolumeUI = () => {
    const activeEl = Player.instance.activeElement;
    const { muted } = activeEl;
    const volume = Player.instance.userVolume;
    volumeBtn.innerHTML = muted || volume === 0 ? SVG_MUTE(20) : SVG_VOLUME(20);
    const effectiveVolume = muted ? 0 : volume * 100;
    volumeFill.style.setProperty('--volume-level', `${effectiveVolume}%`);
    volumeFill.style.width = `${effectiveVolume}%`;
    _volumeBar?.style.setProperty('--volume-level', `${effectiveVolume}%`);
    const slider = document.getElementById('volume-slider');
    if (slider) slider.value = String(effectiveVolume);
};

function getRectSnapshot(element) {
    if (!element?.isConnected) return null;
    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || rect.width <= 0 || rect.height <= 0) return null;
    return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
    };
}

function positionPlayerPopover(panel, triggerRect, preferredWidth = 320) {
    if (!triggerRect) return false;
    const gutter = 12;
    const width = Math.min(preferredWidth, window.innerWidth - gutter * 2);
    const panelHeight = panel.offsetHeight || 360;
    const left = Math.min(
        Math.max(gutter, triggerRect.left + triggerRect.width / 2 - width / 2),
        window.innerWidth - width - gutter
    );
    const fitsAbove = triggerRect.top - panelHeight - gutter > gutter;
    const top = fitsAbove
        ? triggerRect.top - panelHeight - 10
        : Math.min(triggerRect.bottom + 10, window.innerHeight - panelHeight - gutter);

    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(gutter, top)}px`;
    panel.style.setProperty('--panel-origin-x', `${triggerRect.left + triggerRect.width / 2 - left}px`);
    panel.style.setProperty('--panel-origin-y', fitsAbove ? '100%' : '0%');
    return true;
}

function revealCurrentQualityBadge(player) {
    player.updateAdaptiveQualityBadge();
    const badge = document.querySelector('.now-playing-bar .title .shaka-quality-badge');
    if (!badge) return;
    badge.classList.remove('dia-text-reveal');
    requestAnimationFrame(() => badge.classList.add('dia-text-reveal'));
}

function setupQualityPopover(player) {
    const title = document.querySelector('.now-playing-bar .title');
    const panel = document.getElementById('quality-popover');
    if (!title || !panel) return;

    let trigger = null;
    let panelAnimation = null;
    let animationRun = 0;
    let qualityChangeInFlight = false;
    let selectionRun = 0;
    let losslessMagicTimer = 0;
    let lastTriggerRect = null;
    let lastTriggerRadius = '999px';
    const backdrop = document.createElement('div');
    backdrop.className = 'quality-floating-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    panel.before(backdrop);

    const qualityVisuals = {
        auto: { rgb: '148 163 184', icon: SVG_SETTINGS(20) },
        LOWEST: { rgb: '148 163 184', icon: SVG_QUALITY_WAVE_SINE(20) },
        LOW: { rgb: '96 165 250', icon: SVG_QUALITY_WAVE_SQUARE(20) },
        NORMAL: { rgb: '168 85 247', icon: SVG_QUALITY_WAVE_SAW(20) },
        HIGH: { rgb: '249 115 22', icon: SVG_QUALITY_WAVES_ELECTRICITY(20) },
        LOSSLESS: { rgb: '45 212 191', icon: SVG_QUALITY_LOSSLESS(20) },
        HI_RES_LOSSLESS: { rgb: '45 212 191', icon: SVG_QUALITY_LOSSLESS(20) },
    };

    const getConnectionMessage = (state) => {
        const effectiveLabel =
            state.options.find((option) => option.id === state.effective)?.label || 'a lower quality';
        if (state.fallbackReason) {
            return `${escapeHtml(state.fallbackReason)}. Playing at ${escapeHtml(effectiveLabel)} for now.`;
        }
        if (state.requested === 'auto') {
            return `Auto is using ${escapeHtml(effectiveLabel)} for this track and connection.`;
        }
        return 'Monochrome may temporarily step down if playback cannot keep up.';
    };

    const syncSelectionIndicator = () => {
        const indicator = panel.querySelector('.quality-selection-indicator');
        const selected = panel.querySelector('.quality-radio-option.is-selected');
        if (!indicator || !selected) return;
        indicator.style.setProperty('--quality-tier-rgb', selected.dataset.tierRgb || '148 163 184');
        indicator.style.height = `${selected.offsetHeight}px`;
        indicator.style.transform = `translateY(${selected.offsetTop}px)`;
        panel.dataset.selectedQuality = selected.dataset.qualityProfile;
    };

    const playLosslessMagic = () => {
        window.clearTimeout(losslessMagicTimer);
        panel.classList.remove('is-lossless-magic');
        void panel.offsetWidth;
        panel.classList.add('is-lossless-magic');
        losslessMagicTimer = window.setTimeout(() => panel.classList.remove('is-lossless-magic'), 720);
    };

    const getCurrentTrigger = () => {
        if (getRectSnapshot(trigger)) return trigger;
        return [...title.querySelectorAll('.quality-badge')].find((badge) => getRectSnapshot(badge)) || null;
    };

    const refreshTriggerRect = () => {
        const currentTrigger = getCurrentTrigger();
        const currentRect = getRectSnapshot(currentTrigger);
        if (currentRect) {
            trigger = currentTrigger;
            lastTriggerRect = currentRect;
            if (!panel.hidden) {
                trigger.classList.add('is-floating-panel-open');
                trigger.setAttribute('aria-expanded', 'true');
            }
        }
        return lastTriggerRect;
    };

    const syncTriggerElement = () => {
        const currentTrigger = getCurrentTrigger();
        if (!currentTrigger) return null;
        if (trigger !== currentTrigger) trigger?.classList.remove('is-floating-panel-open');
        trigger = currentTrigger;
        if (!panel.hidden) {
            trigger.classList.add('is-floating-panel-open');
            trigger.setAttribute('aria-expanded', 'true');
        }
        return trigger;
    };

    const animateSelection = async (profile) => {
        const group = panel.querySelector('.quality-radio-group');
        const indicator = panel.querySelector('.quality-selection-indicator');
        const next = panel.querySelector(`.quality-radio-option[data-quality-profile="${profile}"]`);
        const previous = panel.querySelector('.quality-radio-option.is-selected');
        if (!group || !indicator || !next || previous === next) return;

        const previousY = previous?.offsetTop ?? next.offsetTop;
        const previousHeight = previous?.offsetHeight ?? next.offsetHeight;

        group.querySelectorAll('.quality-radio-option').forEach((option) => {
            const isSelected = option === next;
            option.classList.toggle('is-selected', isSelected);
            const input = option.querySelector('input');
            if (input) input.checked = isSelected;
        });

        indicator.style.height = `${next.offsetHeight}px`;
        indicator.style.transform = `translateY(${next.offsetTop}px)`;
        indicator.style.setProperty('--quality-tier-rgb', next.dataset.tierRgb || '148 163 184');
        panel.dataset.selectedQuality = profile;

        if (profile.endsWith('LOSSLESS')) playLosslessMagic();

        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        const selectionTransition = indicator.animate(
            [
                {
                    height: `${previousHeight}px`,
                    transform: `translateY(${previousY}px)`,
                },
                {
                    height: `${next.offsetHeight}px`,
                    transform: `translateY(${next.offsetTop}px)`,
                },
            ],
            { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        );
        await selectionTransition.finished.catch(() => {});
    };

    const getFloatingPanelFrames = (triggerRect = lastTriggerRect) => {
        const panelRect = panel.getBoundingClientRect();
        const safeTriggerRect = triggerRect || {
            left: panelRect.left + panelRect.width / 2,
            top: panelRect.top + panelRect.height,
            width: 1,
            height: 1,
        };
        return {
            collapsed: {
                opacity: 0,
                borderRadius: lastTriggerRadius,
                clipPath: 'inset(0 round 999px)',
                transform: `translate(${safeTriggerRect.left - panelRect.left}px, ${
                    safeTriggerRect.top - panelRect.top
                }px) scale(${Math.max(0.08, safeTriggerRect.width / panelRect.width)}, ${Math.max(
                    0.04,
                    safeTriggerRect.height / panelRect.height
                )})`,
            },
            expanded: {
                opacity: 1,
                borderRadius: '16px',
                clipPath: 'inset(0 round 16px)',
                transform: 'translate(0, 0) scale(1)',
            },
        };
    };

    const setPanelFrameStyles = (frame) => {
        panel.style.opacity = String(frame.opacity);
        panel.style.borderRadius = frame.borderRadius;
        panel.style.clipPath = frame.clipPath;
        panel.style.transform = frame.transform;
    };

    const clearPanelFrameStyles = () => {
        panel.style.removeProperty('opacity');
        panel.style.removeProperty('border-radius');
        panel.style.removeProperty('clip-path');
        panel.style.removeProperty('transform');
    };

    const close = ({ restoreFocus = false } = {}) => {
        if (panel.hidden) return;
        const run = ++animationRun;
        const shouldRestoreFocus = restoreFocus || panel.contains(document.activeElement);
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const currentTrigger = getCurrentTrigger();
        const targetRect = getRectSnapshot(currentTrigger) || lastTriggerRect;
        const { collapsed, expanded } = getFloatingPanelFrames(targetRect);
        const computedPanel = getComputedStyle(panel);
        const currentFrame = {
            opacity: Number.parseFloat(computedPanel.opacity) || 0,
            borderRadius: computedPanel.borderRadius || expanded.borderRadius,
            clipPath: computedPanel.clipPath === 'none' ? expanded.clipPath : computedPanel.clipPath,
            transform: computedPanel.transform === 'none' ? expanded.transform : computedPanel.transform,
        };
        panelAnimation?.cancel();
        panel.classList.remove('is-open');
        backdrop.classList.remove('is-open');
        trigger?.classList.remove('is-floating-panel-open');
        currentTrigger?.classList.remove('is-floating-panel-open');
        currentTrigger?.setAttribute('aria-expanded', 'false');
        if (reduceMotion) {
            panel.hidden = true;
            backdrop.hidden = true;
            if (shouldRestoreFocus) currentTrigger?.focus({ preventScroll: true });
            return;
        }
        panelAnimation = panel.animate([currentFrame, collapsed], {
            duration: 200,
            easing: 'cubic-bezier(0.4, 0, 1, 1)',
            fill: 'both',
        });
        void panelAnimation.finished
            .then(() => {
                if (run !== animationRun) return;
                panel.hidden = true;
                backdrop.hidden = true;
                panelAnimation?.cancel();
                if (shouldRestoreFocus) getCurrentTrigger()?.focus({ preventScroll: true });
            })
            .catch(() => {});
    };
    const render = () => {
        const state = player.getQualityState();
        const choices = [
            {
                id: 'auto',
                label: 'Auto',
                description: 'Adjusts to the track and your connection',
                detail: 'Recommended',
            },
            ...state.options,
        ];
        panel.innerHTML = `
            <div class="player-popover-header">
                <h3 id="quality-popover-title">Playback quality</h3>
            </div>
            <div class="quality-radio-group" role="radiogroup" aria-label="Playback quality">
                <span class="quality-selection-indicator" aria-hidden="true"></span>
                ${choices
                    .map((option) => {
                        const isSelected = option.id === state.requested;
                        const visual = qualityVisuals[option.id] || qualityVisuals.auto;
                        return `
                            <label class="quality-radio-option ${isSelected ? 'is-selected' : ''} ${
                                option.id.endsWith('LOSSLESS') ? 'is-lossless' : ''
                            }"
                                data-quality-profile="${option.id}"
                                data-tier-rgb="${visual.rgb}"
                                style="--quality-tier-rgb: ${visual.rgb}">
                                <input type="radio" name="playback-quality" value="${option.id}" ${
                                    isSelected ? 'checked' : ''
                                } />
                                <span class="quality-tier-icon" aria-hidden="true">${visual.icon}</span>
                                <span class="quality-radio-copy">
                                    <strong>${option.label}</strong>
                                    <span>${option.description}</span>
                                </span>
                                <span class="quality-radio-meta">
                                    <small class="quality-radio-bitrate">${option.detail}</small>
                                    <span class="quality-radio-check" aria-hidden="true">${SVG_CHECK(18)}</span>
                                </span>
                            </label>`;
                    })
                    .join('')}
            </div>
            <div class="quality-connection-note ${state.fallbackReason ? 'is-fallback' : ''}" role="status" aria-live="polite">
                <span class="quality-connection-icon" aria-hidden="true">${SVG_INFORMATION_CIRCLE(18)}</span>
                <span class="quality-connection-copy">${getConnectionMessage(state)}</span>
            </div>`;
    };
    const open = (badge) => {
        const run = ++animationRun;
        trigger = badge;
        lastTriggerRect = getRectSnapshot(badge);
        if (!lastTriggerRect) return;
        lastTriggerRadius = getComputedStyle(badge).borderRadius || '999px';
        render();
        panel.style.visibility = 'hidden';
        panel.hidden = false;
        backdrop.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        positionPlayerPopover(panel, lastTriggerRect, 420);
        syncSelectionIndicator();
        const { collapsed, expanded } = getFloatingPanelFrames(lastTriggerRect);
        panelAnimation?.cancel();
        setPanelFrameStyles(collapsed);
        void panel.offsetWidth;
        backdrop.classList.add('is-open');
        trigger.classList.add('is-floating-panel-open');
        panel.classList.add('is-open');
        clearPanelFrameStyles();
        panel.style.removeProperty('visibility');
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            panel.querySelector('input:checked')?.focus({ preventScroll: true });
            return;
        }
        panelAnimation = panel.animate([collapsed, expanded], {
            duration: 320,
            easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
            fill: 'both',
        });
        void panelAnimation.finished
            .then(() => {
                if (run !== animationRun) return;
                panelAnimation?.cancel();
                panel.querySelector('input:checked')?.focus({ preventScroll: true });
            })
            .catch(() => {});
    };

    title.addEventListener('click', (event) => {
        const badge = event.target.closest('.quality-badge');
        if (!badge) return;
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent('player-actions-close'));
        if (!panel.hidden) close({ restoreFocus: true });
        else open(badge);
    });
    title.addEventListener('keydown', (event) => {
        const badge = event.target.closest('.quality-badge');
        if (!badge || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        if (!panel.hidden) close({ restoreFocus: true });
        else open(badge);
    });
    panel.addEventListener('change', async (event) => {
        const input = event.target.closest('input[name="playback-quality"]');
        if (!input || qualityChangeInFlight) return;
        const run = ++selectionRun;
        qualityChangeInFlight = true;
        const group = panel.querySelector('.quality-radio-group');
        group?.setAttribute('aria-busy', 'true');
        panel.querySelectorAll('input[name="playback-quality"]').forEach((radio) => {
            radio.disabled = true;
        });
        try {
            void animateSelection(input.value);
            await player.selectPlaybackQuality(input.value);
            if (run !== selectionRun || panel.hidden) return;
            const state = player.getQualityState();
            const note = panel.querySelector('.quality-connection-note');
            const noteCopy = panel.querySelector('.quality-connection-copy');
            if (note) {
                note.classList.toggle('is-fallback', Boolean(state.fallbackReason));
            }
            if (noteCopy) noteCopy.innerHTML = getConnectionMessage(state);
            syncTriggerElement();
        } catch (error) {
            if (run !== selectionRun || panel.hidden) return;
            render();
            syncSelectionIndicator();
            const note = panel.querySelector('.quality-connection-note');
            const noteCopy = panel.querySelector('.quality-connection-copy');
            note?.classList.add('is-fallback');
            if (noteCopy)
                noteCopy.textContent = 'Could not change quality. Playback is still using the previous setting.';
            console.error('Failed to change playback quality:', error);
        } finally {
            if (run === selectionRun) {
                qualityChangeInFlight = false;
                group?.removeAttribute('aria-busy');
                panel.querySelectorAll('input[name="playback-quality"]').forEach((radio) => {
                    radio.disabled = false;
                });
            }
        }
    });
    document.addEventListener('pointerdown', (event) => {
        if (panel.hidden || panel.contains(event.target) || getCurrentTrigger()?.contains(event.target)) return;
        close();
    });
    document.addEventListener('keydown', (event) => {
        if (panel.hidden) return;
        if (event.key === 'Escape') {
            close({ restoreFocus: true });
            return;
        }
        if (event.key === 'Tab') {
            event.preventDefault();
            panel.querySelector('input:checked:not(:disabled)')?.focus({ preventScroll: true });
        }
    });
    window.addEventListener('resize', () => {
        if (!panel.hidden) positionPlayerPopover(panel, refreshTriggerRect(), 420);
    });
    window.addEventListener('player-quality-changed', () => {
        if (!panel.hidden && !qualityChangeInFlight) {
            render();
            syncTriggerElement();
            syncSelectionIndicator();
        }
    });
}

function setupPlayerStatus(player) {
    const bar = document.querySelector('.now-playing-bar');
    const status = document.getElementById('player-status');
    const message = document.getElementById('player-status-message');
    const progress = bar?.querySelector('.progress-container');
    if (!bar || !status || !message || !progress) return () => {};

    let successTimer = 0;
    const setStatus = ({ state = 'ready', message: nextMessage = '', actions = [] } = {}) => {
        window.clearTimeout(successTimer);
        bar.dataset.playerState = state;
        status.dataset.state = state;
        const isReady = state === 'ready';
        status.hidden = isReady;
        progress.hidden = !isReady;
        if (nextMessage) message.textContent = nextMessage;
        status.querySelectorAll('[data-player-recovery]').forEach((button) => {
            button.hidden = !actions.includes(button.dataset.playerRecovery);
            button.disabled = false;
        });
        if (state === 'success') {
            successTimer = window.setTimeout(() => setStatus({ state: 'ready' }), 3200);
        }
    };

    window.addEventListener('player-playback-status', (event) => setStatus(event.detail));
    status.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-player-recovery]');
        if (!button) return;
        const action = button.dataset.playerRecovery;
        button.disabled = true;
        try {
            if (action === 'browse') {
                navigate('/search');
                return;
            }
            if (action === 'retry') {
                const currentTime = Number.isFinite(player.activeElement?.currentTime)
                    ? player.activeElement.currentTime
                    : 0;
                setStatus({ state: 'loading', message: 'Retrying playback…', actions: ['skip'] });
                await player.playTrackFromQueue(currentTime, 0, true);
                return;
            }
            if (action === 'lower-quality') {
                const recovered = await player.fallbackPlaybackQuality('Lower quality selected');
                if (!recovered) {
                    setStatus({
                        state: 'error',
                        message: 'No lower quality is available',
                        actions: ['retry', 'skip'],
                    });
                }
                return;
            }
            if (action === 'skip') {
                setStatus({ state: 'loading', message: 'Skipping to the next track…' });
                await player.playNext(0, { preserveGestureToken: true });
            }
        } catch (error) {
            console.error('Player recovery action failed:', error);
            setStatus({
                state: 'error',
                message: 'Playback still isn’t available',
                actions: ['retry', 'lower-quality', 'skip'],
            });
        } finally {
            button.disabled = false;
        }
    });

    setStatus(
        player.currentTrack
            ? { state: 'ready' }
            : { state: 'idle', message: 'Choose something to play', actions: ['browse'] }
    );
    return setStatus;
}

function setupPlayerActionsPopover() {
    const trigger = document.getElementById('more-player-actions-btn');
    const panel = document.getElementById('player-actions-popover');
    if (!trigger || !panel) return;

    let animation = null;
    const backdrop = document.createElement('div');
    backdrop.className = 'quality-floating-backdrop player-actions-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    panel.before(backdrop);

    const findSourceButton = (actionId) => {
        if (actionId === 'shuffle') return document.getElementById('shuffle-btn');
        if (actionId === 'repeat') return document.getElementById('repeat-btn');
        const buttons = [...document.querySelectorAll(`.now-playing-bar [data-player-action="${actionId}"]`)];
        const preferredId =
            actionId === 'sleep-timer'
                ? window.innerWidth <= 768
                    ? 'sleep-timer-btn'
                    : 'sleep-timer-btn-desktop'
                : null;
        return (
            buttons.find(
                (button) =>
                    (!preferredId || button.id === preferredId) &&
                    !button.classList.contains('player-action-user-hidden') &&
                    button.style.display !== 'none'
            ) ||
            buttons.find(
                (button) => !button.classList.contains('player-action-user-hidden') && button.style.display !== 'none'
            )
        );
    };

    const render = () => {
        const transportActions =
            window.innerWidth <= 900
                ? [
                      {
                          id: 'shuffle',
                          label: document.getElementById('shuffle-btn')?.classList.contains('active')
                              ? 'Shuffle on'
                              : 'Shuffle',
                          icon: SVG_SHUFFLE(20),
                      },
                      {
                          id: 'repeat',
                          label: document.getElementById('repeat-btn')?.classList.contains('repeat-one')
                              ? 'Repeat one'
                              : document.getElementById('repeat-btn')?.classList.contains('active')
                                ? 'Repeat queue'
                                : 'Repeat',
                          icon: SVG_REPEAT(20),
                      },
                  ]
                : [];
        const actions = [...transportActions, ...PLAYER_ACTIONS]
            .map((action) => ({ action, source: findSourceButton(action.id) }))
            .filter(({ source }) => source && !source.disabled);
        panel.innerHTML = `
            <div class="player-popover-header">
                <h3 id="player-actions-popover-title">Player actions</h3>
            </div>
            <div class="player-actions-popover-list">
                ${actions
                    .map(
                        ({ action }) => `
                            <button type="button" class="player-actions-popover-item" data-player-action-proxy="${action.id}">
                                <span aria-hidden="true">${action.icon}</span>
                                <span>${action.label}</span>
                            </button>`
                    )
                    .join('')}
            </div>`;
    };

    const close = ({ restoreFocus = false } = {}) => {
        if (panel.hidden) return;
        animation?.cancel();
        panel.classList.remove('is-open');
        backdrop.classList.remove('is-open');
        trigger.classList.remove('is-floating-panel-open');
        trigger.setAttribute('aria-expanded', 'false');
        const finish = () => {
            panel.hidden = true;
            backdrop.hidden = true;
            if (restoreFocus) trigger.focus({ preventScroll: true });
        };
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            finish();
            return;
        }
        animation = panel.animate(
            [
                { opacity: 1, transform: 'translateY(0) scale(1)', clipPath: 'inset(0 round 16px)' },
                { opacity: 0, transform: 'translateY(12px) scale(0.92)', clipPath: 'inset(48% round 999px)' },
            ],
            { duration: 180, easing: 'cubic-bezier(0.4, 0, 1, 1)' }
        );
        void animation.finished.then(finish).catch(() => {});
    };

    const open = () => {
        window.dispatchEvent(new CustomEvent('player-actions-opening'));
        document.querySelector('.quality-badge[aria-expanded="true"]')?.click();
        render();
        const rect = getRectSnapshot(trigger);
        if (!rect || !panel.querySelector('.player-actions-popover-item')) return;
        panel.hidden = false;
        backdrop.hidden = false;
        positionPlayerPopover(panel, rect, 300);
        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add('is-floating-panel-open');
        panel.classList.add('is-open');
        backdrop.classList.add('is-open');
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            panel.querySelector('button')?.focus({ preventScroll: true });
            return;
        }
        animation?.cancel();
        animation = panel.animate(
            [
                { opacity: 0, transform: 'translateY(12px) scale(0.92)', clipPath: 'inset(48% round 999px)' },
                { opacity: 1, transform: 'translateY(0) scale(1)', clipPath: 'inset(0 round 16px)' },
            ],
            { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        );
        void animation.finished
            .then(() => panel.querySelector('button')?.focus({ preventScroll: true }))
            .catch(() => {});
    };

    trigger.addEventListener('click', () => {
        if (panel.hidden) open();
        else close({ restoreFocus: true });
    });
    panel.addEventListener('click', (event) => {
        const proxy = event.target.closest('[data-player-action-proxy]');
        if (!proxy) return;
        const source = findSourceButton(proxy.dataset.playerActionProxy);
        close();
        source?.click();
    });
    document.addEventListener('pointerdown', (event) => {
        if (panel.hidden || panel.contains(event.target) || trigger.contains(event.target)) return;
        close();
    });
    document.addEventListener('keydown', (event) => {
        if (panel.hidden) return;
        if (event.key === 'Escape') {
            close({ restoreFocus: true });
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...panel.querySelectorAll('button:not(:disabled)')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    window.addEventListener('resize', () => {
        if (!panel.hidden) positionPlayerPopover(panel, getRectSnapshot(trigger), 300);
    });
    window.addEventListener('player-actions-close', () => close());
}

function clearSelection() {
    trackSelection.selectedIds.clear();
    trackSelection.lastClickedId = null;
    trackSelection.isSelecting = false;
    document.body.classList.remove('multi-select-mode');
    document.querySelectorAll('.track-item.selected').forEach((el) => {
        el.classList.remove('selected');
    });
    document.querySelectorAll('.track-checkbox').forEach((checkbox) => {
        checkbox.innerHTML = SVG_CHECKBOX(18);
        checkbox.classList.remove('checked');
    });
    updateSelectionBar();
}

function updateSelectionBar() {
    let bar = document.getElementById('selection-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'selection-bar';
        bar.className = 'selection-bar';
        bar.innerHTML = `
            <span class="selection-count">0 selected</span>
            <div class="selection-actions">
                <button data-action="play-selected">Play</button>
                <button data-action="add-to-queue-selected">Add to queue</button>
                <button data-action="add-to-playlist-selected">Add to playlist</button>
                <button data-action="download-selected">Download</button>
                <button data-action="like-selected">Like</button>
            </div>
            <button data-action="clear-selection" style="margin-left: 8px;">Clear</button>
            `;
        document.body.appendChild(bar);

        bar.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => handleSelectionAction(btn.dataset.action));
        });
    }

    const count = trackSelection.selectedIds.size;
    bar.querySelector('.selection-count').textContent = `${count} selected`;
    bar.classList.toggle('visible', count > 0);
}

async function handleSelectionAction(action) {
    const selectedIds = getSelectedTracks();
    if (selectedIds.length === 0) return;

    const mainContent = document.getElementById('main-content');
    const selectedTracks = [];
    mainContent.querySelectorAll('.track-item').forEach((item) => {
        if (trackSelection.selectedIds.has(item.dataset.trackId)) {
            const track = trackDataStore.get(item);
            if (track) selectedTracks.push(track);
        }
    });

    switch (action) {
        case 'play-selected':
            if (selectedTracks.length > 0) {
                Player.instance.setQueue(selectedTracks, 0, false, {
                    kind: 'unknown',
                    id: null,
                    label: 'Selected tracks',
                    href: null,
                });
                document.getElementById('shuffle-btn').classList.remove('active');
                Player.instance.playTrackFromQueue();
            }
            break;
        case 'add-to-queue-selected':
            if (selectedTracks.length > 0) {
                Player.instance.addToQueue(selectedTracks);
                if (window.renderQueueFunction) await window.renderQueueFunction();
                showNotification(`Added ${selectedTracks.length} tracks to queue`);
            }
            break;
        case 'add-to-playlist-selected':
            if (selectedTracks.length > 0) {
                await showMultiSelectPlaylistModal(selectedTracks);
            }
            break;
        case 'download-selected':
            if (selectedTracks.length > 0) {
                showNotification(`Downloading ${selectedTracks.length} tracks`);
                for (const track of selectedTracks) {
                    await downloadTrackWithMetadata(
                        track,
                        downloadQualitySettings.getQuality(),
                        MusicAPI.instance,
                        LyricsManager.instance
                    );
                }
            }
            break;
        case 'like-selected':
            for (const track of selectedTracks) {
                const added = await db.toggleFavorite('track', track);
                await syncManager.syncLibraryItem('track', track, added);
            }
            showNotification(`Liked ${selectedTracks.length} tracks`);
            break;
        case 'clear-selection':
            clearSelection();
            break;
    }
}

export async function initializePlayerEvents(player, _audioPlayer, scrobbler, ui) {
    playerBarEffects.init();
    const setPlayerStatus = setupPlayerStatus(player);
    setupPlayerActionsPopover();
    window.addEventListener('player-playback-intent', (event) => {
        playerBarEffects.setPlaying(Boolean(event.detail?.playing));
    });
    document.getElementById('now-playing-cover-button')?.addEventListener('click', () => {
        void ui.openCurrentTrackFullscreen();
    });
    if (homeStartRadioBtn) {
        homeStartRadioBtn.addEventListener('click', async () => {
            await player.enableRadio();
        });
    }

    const sleepTimerBtnMobile = document.getElementById('sleep-timer-btn');

    let historyLoggedTrackId = null;

    const { listeningTracker } = await import('./listening-tracker.js');

    let _previousTrackId = null;
    let _trackPlayStartTime = null;

    const setupMediaListeners = (element) => {
        let bufferingFallbackTimer = 0;
        const clearBufferingFallback = () => window.clearTimeout(bufferingFallbackTimer);
        const scheduleBufferingFallback = () => {
            if (player.activeElement !== element || element.paused) return;
            clearBufferingFallback();
            setPlayerStatus({
                state: 'recovering',
                message: 'Connection interrupted — stabilizing playback…',
                actions: ['skip'],
            });
            bufferingFallbackTimer = window.setTimeout(() => {
                void player.fallbackPlaybackQuality('Buffering detected');
            }, 6000);
        };
        element.addEventListener('loadstart', () => {
            if (player.activeElement === element) {
                historyLoggedTrackId = null;
            }
        });

        element.addEventListener('play', async () => {
            if (player.activeElement !== element) return;

            if (!audioContextManager.isReady()) {
                audioContextManager.init(element);
            }
            await audioContextManager.resume();
            audioContextManager.fadePlaybackIn(230);

            if (player.currentTrack) {
                const currentId = player.currentTrack.id;
                if (currentId !== _previousTrackId) {
                    if (_previousTrackId !== null) {
                        const prevSignal = listeningTracker.getSessionSignals();
                        const prevPlayTime = prevSignal.accumulatedPlayTime || 0;
                        const prevDuration = prevSignal.trackDuration || 0;
                        const completedByCrossfade = player.isCrossfadeTransitionFrom(_previousTrackId);
                        if (completedByCrossfade) {
                            listeningTracker.onTrackEnd();
                        } else {
                            listeningTracker.onSkip();
                        }
                        const prevTrack =
                            player.getCurrentQueue()[player.currentQueueIndex - 1] ||
                            player.getCurrentQueue().find((t) => t.id === _previousTrackId);
                        if (prevTrack && prevPlayTime > 0) {
                            listeningTracker.updateArtistAffinity(
                                prevTrack,
                                prevPlayTime,
                                prevDuration,
                                !completedByCrossfade
                            );
                        }
                        listeningTracker.forceFlush();
                    }
                    _previousTrackId = currentId;
                    listeningTracker.onTrackStart(player.currentTrack);
                    _trackPlayStartTime = Date.now();
                }

                if (scrobbler.isAuthenticated()) {
                    scrobbler.updateNowPlaying(player.currentTrack);
                }

                await updateWaveform();
            }

            playerBarEffects.setPlaying(true);
            setPlayerStatus({ state: 'ready' });
            revealCurrentQualityBadge(player);
            player.updateMediaSessionPlaybackState();
            player.updateMediaSessionPositionState();
            updateTabTitle(player);
        });

        element.addEventListener('playing', () => {
            if (player.activeElement !== element) return;
            clearBufferingFallback();
            setPlayerStatus({ state: 'ready' });
            player.updateMediaSessionPlaybackState();
            player.updateMediaSessionPositionState();
        });

        element.addEventListener('pause', () => {
            if (player.activeElement !== element) return;
            clearBufferingFallback();
            playerBarEffects.setPlaying(false);
            player.updateMediaSessionPlaybackState();
            player.updateMediaSessionPositionState();
        });

        element.addEventListener('ended', () => {
            if (player.activeElement !== element) return;
            const elapsedPlayTime = listeningTracker.getSessionSignals().accumulatedPlayTime || 0;
            const trackDur = listeningTracker.getSessionSignals().trackDuration || 0;
            listeningTracker.onTrackEnd();
            if (player.currentTrack) {
                const effectivePlayTime = elapsedPlayTime || (Date.now() - _trackPlayStartTime) / 1000;
                listeningTracker.updateArtistAffinity(player.currentTrack, effectivePlayTime, trackDur, false);
            }
            listeningTracker.forceFlush();
            _previousTrackId = null;
            void player.playNext(0, { preserveGestureToken: true });
        });

        element.addEventListener('timeupdate', async () => {
            if (player.activeElement !== element) return;

            const { currentTime, duration } = element;
            if (duration) {
                const progressFill = document.getElementById('progress-fill');
                const currentTimeEl = document.getElementById('current-time');
                const progressBar = document.getElementById('progress-bar');
                progressFill.style.width = `${(currentTime / duration) * 100}%`;
                currentTimeEl.textContent = formatTime(currentTime);
                progressBar?.setAttribute('aria-valuemax', String(Math.round(duration)));
                progressBar?.setAttribute('aria-valuenow', String(Math.round(currentTime)));
                progressBar?.setAttribute('aria-valuetext', `${formatTime(currentTime)} of ${formatTime(duration)}`);

                listeningTracker.onTimeUpdate(currentTime, duration);
                void player.startCrossfadeIfNeeded(element);

                if (currentTime >= 10 && player.currentTrack && player.currentTrack.id !== historyLoggedTrackId) {
                    historyLoggedTrackId = player.currentTrack.id;
                    const historyEntry = await db.addToHistory(player.currentTrack);
                    await syncManager.syncHistoryItem(historyEntry);

                    if (window.location.hash === '#recent') {
                        ui.renderRecentPage();
                    }
                }
            }
        });

        element.addEventListener('loadedmetadata', () => {
            if (player.activeElement !== element) return;
            const totalDurationEl = document.getElementById('total-duration');
            totalDurationEl.textContent = formatTime(element.duration);
            document
                .getElementById('progress-bar')
                ?.setAttribute('aria-valuemax', String(Math.round(element.duration)));
            player.updateMediaSessionPositionState();
        });

        element.addEventListener('error', (e) => {
            if (player.activeElement !== element) return;

            if (!element.src) return;

            const error = element.error;
            let errorMsg = 'Unknown error';
            if (error) {
                switch (error.code) {
                    case 1:
                        errorMsg = 'Playback aborted';
                        break;
                    case 2:
                        errorMsg = 'Network error';
                        break;
                    case 3:
                        errorMsg = 'Decoding error';
                        break;
                    case 4:
                        errorMsg = 'Source not supported';
                        break;
                }
                if (error.message) errorMsg += `: ${error.message}`;
            }

            console.error(`Media playback error (${element.id}):`, errorMsg, e);
            playerBarEffects.setPlaying(false);

            const canFallback =
                player.quality === 'HI_RES_LOSSLESS' &&
                errorMsg.includes('Source not supported') &&
                errorMsg.includes('0x80004005') &&
                !player.isFallbackRetry;

            if (canFallback) {
                console.warn('Hi-Res failed due to DASH.js Error (FUCK DASH)');
            }

            if (player.currentTrack && error && error.code !== 1) {
                if (player.isFallbackInProgress || canFallback) {
                    return;
                }
                setPlayerStatus({
                    state: 'recovering',
                    message: 'Playback interrupted — trying a lighter stream…',
                    actions: ['skip'],
                });
                void player.fallbackPlaybackQuality(errorMsg).then((recovered) => {
                    if (!recovered) {
                        setPlayerStatus({
                            state: 'error',
                            message: `Couldn’t play ${player.currentTrack?.title || 'this track'}`,
                            actions: ['retry', 'lower-quality', 'skip'],
                        });
                    }
                });
            }
        });

        element.addEventListener('waiting', scheduleBufferingFallback);
        element.addEventListener('stalled', scheduleBufferingFallback);
        element.addEventListener('canplay', () => {
            clearBufferingFallback();
            if (player.activeElement === element) setPlayerStatus({ state: 'ready' });
        });

        element.addEventListener('volumechange', () => {
            if (player.activeElement === element) {
                updateVolumeUI();
            }
        });
    };

    window.addEventListener('volume-change', updateVolumeUI);

    player.getAudioElements().forEach(setupMediaListeners);
    if (player.video) {
        setupMediaListeners(player.video);
    }

    playPauseBtn.addEventListener('click', async () => {
        await hapticMedium();
        player.handlePlayPause();
    });
    nextBtn.addEventListener('click', async () => {
        await hapticMedium();
        player.playNext();
    });
    prevBtn.addEventListener('click', async () => {
        await hapticMedium();
        player.playPrev();
    });

    const syncShuffleButton = () => {
        const active = Boolean(player.shuffleActive);
        shuffleBtn.classList.toggle('active', active);
        shuffleBtn.setAttribute('aria-pressed', String(active));
        shuffleBtn.title = active ? 'Shuffle on' : 'Shuffle off';
        shuffleBtn.setAttribute('aria-label', active ? 'Turn shuffle off' : 'Turn shuffle on');
    };
    const syncRepeatButton = (mode = player.repeatMode) => {
        const active = mode !== REPEAT_MODE.OFF;
        repeatBtn.classList.toggle('active', active);
        repeatBtn.classList.toggle('repeat-one', mode === REPEAT_MODE.ONE);
        repeatBtn.setAttribute('aria-pressed', String(active));
        const label =
            mode === REPEAT_MODE.OFF ? 'Repeat off' : mode === REPEAT_MODE.ALL ? 'Repeat queue' : 'Repeat one';
        repeatBtn.title = label;
        repeatBtn.setAttribute(
            'aria-label',
            mode === REPEAT_MODE.OFF
                ? 'Turn repeat on'
                : mode === REPEAT_MODE.ALL
                  ? 'Repeat queue enabled. Switch to repeat one'
                  : 'Repeat one enabled. Turn repeat off'
        );
    };

    syncShuffleButton();
    syncRepeatButton();

    shuffleBtn.addEventListener('click', async () => {
        await hapticLight();
        await player.toggleShuffle();
        syncShuffleButton();
        if (window.renderQueueFunction) await window.renderQueueFunction();
    });

    repeatBtn.addEventListener('click', async () => {
        await hapticLight();
        const mode = await player.toggleRepeat();
        syncRepeatButton(mode);
    });

    window.addEventListener('radio-state-changed', (e) => {
        if (e.detail && e.detail.enabled) {
            showNotification('Infinite Radio Enabled');
        }
    });

    // Sleep Timer for desktop
    if (sleepTimerBtnDesktop) {
        sleepTimerBtnDesktop.addEventListener('click', () => {
            if (player.isSleepTimerActive()) {
                player.clearSleepTimer();
                showNotification('Sleep timer cancelled');
            } else {
                showSleepTimerPopover(player, sleepTimerBtnDesktop);
            }
        });
    }

    // Sleep Timer for mobile
    if (sleepTimerBtnMobile) {
        sleepTimerBtnMobile.addEventListener('click', () => {
            if (player.isSleepTimerActive()) {
                player.clearSleepTimer();
                showNotification('Sleep timer cancelled');
            } else {
                showSleepTimerPopover(player, sleepTimerBtnMobile);
            }
        });
    }

    // Waveform Masking Logic
    const updateWaveform = async () => {
        const progressBar = document.getElementById('progress-bar');
        const playerControls = document.querySelector('.player-controls');

        if (!waveformSettings.isEnabled() || !player.currentTrack) {
            if (progressBar) {
                progressBar.style.webkitMaskImage = '';
                progressBar.style.maskImage = '';
                progressBar.classList.remove('has-waveform', 'waveform-loaded');
            }
            if (playerControls) {
                playerControls.classList.remove('waveform-loaded');
            }
            currentTrackIdForWaveform = null;
            return;
        }

        if (progressBar && currentTrackIdForWaveform !== player.currentTrack.id) {
            currentTrackIdForWaveform = player.currentTrack.id;
            progressBar.classList.add('has-waveform');
            progressBar.classList.remove('waveform-loaded');
            if (playerControls) {
                playerControls.classList.remove('waveform-loaded');
            }

            // Clear current mask while loading
            progressBar.style.webkitMaskImage = '';
            progressBar.style.maskImage = '';

            try {
                const { url: streamUrl } = await player.api.getStreamUrl(player.currentTrack.id, 'LOW');
                const waveformData = await waveformGenerator.getWaveform(streamUrl, player.currentTrack.id);

                if (waveformData && currentTrackIdForWaveform === player.currentTrack.id) {
                    let { peaks, duration } = waveformData;
                    const trackDuration = player.currentTrack.duration;

                    // Padding logic for sync
                    if (trackDuration && duration && duration < trackDuration) {
                        const diff = trackDuration - duration;
                        if (diff > 0.5) {
                            // If difference is significant (> 500ms)
                            // Calculate how many peaks represent the missing time
                            // peaks.length represents 'duration'
                            // X peaks represent 'diff'
                            const peaksPerSecond = peaks.length / duration;
                            const paddingPeaksCount = Math.floor(diff * peaksPerSecond);

                            if (paddingPeaksCount > 0) {
                                const newPeaks = new Float32Array(peaks.length + paddingPeaksCount);
                                // Fill start with 0s (implied by new Float32Array)
                                newPeaks.set(peaks, paddingPeaksCount);
                                peaks = newPeaks;
                            }
                        }
                    }

                    // Create a temporary canvas to generate the mask
                    const canvas = document.createElement('canvas');
                    const rect = progressBar.getBoundingClientRect();
                    canvas.width = rect.width || 500;
                    canvas.height = 28; // Fixed height for mask generation

                    waveformGenerator.drawWaveform(canvas, peaks);

                    const dataUrl = canvas.toDataURL();
                    progressBar.style.webkitMaskImage = `url(${dataUrl})`;
                    progressBar.style.webkitMaskSize = '100% 100%';
                    progressBar.style.webkitMaskRepeat = 'no-repeat';
                    progressBar.style.maskImage = `url(${dataUrl})`;
                    progressBar.style.maskSize = '100% 100%';
                    progressBar.style.maskRepeat = 'no-repeat';

                    progressBar.classList.add('waveform-loaded');
                    if (playerControls) {
                        playerControls.classList.add('waveform-loaded');
                    }
                }
            } catch (e) {
                console.error('Failed to load waveform mask:', e);
            }
        }
    };

    window.addEventListener('waveform-toggle', async (e) => {
        if (!e.detail.enabled) {
            const progressBar = document.getElementById('progress-bar');
            const playerControls = document.querySelector('.player-controls');
            if (progressBar) {
                progressBar.style.webkitMaskImage = '';
                progressBar.style.maskImage = '';
                progressBar.classList.remove('has-waveform', 'waveform-loaded');
            }
            if (playerControls) {
                playerControls.classList.remove('waveform-loaded');
            }
        }
        await updateWaveform();
    });

    if (volumeBtn) {
        volumeBtn.addEventListener('click', () => {
            const activeEl = player.activeElement;
            _volumeBar?.classList.remove('is-mute-animating');
            void _volumeBar?.offsetWidth;
            _volumeBar?.classList.add('is-mute-animating');
            activeEl.muted = !activeEl.muted;
            localStorage.setItem('muted', activeEl.muted);

            [...player.getAudioElements(), player.video].filter(Boolean).forEach((element) => {
                element.muted = activeEl.muted;
            });

            updateVolumeUI();
            window.setTimeout(() => _volumeBar?.classList.remove('is-mute-animating'), 360);
        });
    }
    const isMuted = localStorage.getItem('muted') === 'true';
    player.getAudioElements().forEach((element) => {
        element.muted = isMuted;
    });
    if (player.video) player.video.muted = isMuted;
    updateVolumeUI();

    initializeSmoothSliders(player);
    setupQualityPopover(player);
}

function initializeSmoothSliders(player) {
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    const progressHoverFill = document.getElementById('progress-hover-fill');
    const progressHoverTime = document.getElementById('progress-hover-time');
    const currentTimeEl = document.getElementById('current-time');
    const volumeBar = document.getElementById('volume-bar');
    const volumeFill = document.getElementById('volume-fill');
    const volumeHoverFill = document.getElementById('volume-hover-fill');
    const volumeBtn = document.getElementById('volume-btn');
    const volumeSlider = document.getElementById('volume-slider');

    let isSeeking = false;
    let wasPlaying = false;
    let isAdjustingVolume = false;
    let lastSeekPosition = 0;

    if (volumeSlider) {
        const MAX_OVERFLOW = 50;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let volumeFrame = 0;
        let pendingVolume = player.userVolume;
        let returnAnimation = null;
        const decayOverflow = (value) => 2 * (1 / (1 + Math.exp(-(value / MAX_OVERFLOW))) - 0.5) * MAX_OVERFLOW;
        const updateElasticShape = (clientX) => {
            const rect = volumeBar.getBoundingClientRect();
            const raw = clientX < rect.left ? clientX - rect.left : clientX > rect.right ? clientX - rect.right : 0;
            const overflow = decayOverflow(Math.abs(raw));
            const direction = raw < 0 ? -1 : raw > 0 ? 1 : 0;
            const scaleX = 1 + overflow / rect.width;
            const scaleY = 1 - (overflow / MAX_OVERFLOW) * 0.2;
            volumeBar.style.transformOrigin = direction < 0 ? 'right' : 'left';
            volumeBar.style.transform = reduceMotion.matches
                ? 'none'
                : `translateX(${direction * overflow * 0.5}px) scale(${scaleX}, ${scaleY})`;
        };
        const releaseElasticShape = (event) => {
            volumeBar.classList.remove('is-stretched');
            volumeBar.classList.add('is-release-reset');
            volumeSlider.classList.remove('is-grabbing');
            if (event?.pointerId != null && volumeSlider.hasPointerCapture(event.pointerId)) {
                volumeSlider.releasePointerCapture(event.pointerId);
            }
            volumeSlider.blur();
            returnAnimation?.cancel();
            if (!reduceMotion.matches) {
                returnAnimation = volumeBar.animate(
                    [{ transform: volumeBar.style.transform || 'none' }, { transform: 'translateX(0) scale(1)' }],
                    { duration: 520, easing: 'cubic-bezier(.22, 1.45, .36, 1)' }
                );
            }
            volumeBar.style.transform = '';
        };
        const commitVolume = () => {
            volumeFrame = 0;
            const position = pendingVolume;
            const activeEl = player.activeElement;
            if (activeEl.muted) {
                activeEl.muted = false;
                const inactiveEl = player.currentTrack?.type === 'video' ? player.audio : player.video;
                if (inactiveEl) inactiveEl.muted = false;
                localStorage.setItem('muted', 'false');
            }
            player.setVolume(position);
            volumeFill.style.width = `${position * 100}%`;
            volumeBar.style.setProperty('--volume-level', `${position * 100}%`);
        };
        const setElasticVolume = () => {
            pendingVolume = Number(volumeSlider.value) / 100;
            volumeFill.style.width = `${pendingVolume * 100}%`;
            volumeBar.style.setProperty('--volume-level', `${pendingVolume * 100}%`);
            if (!volumeFrame) volumeFrame = requestAnimationFrame(commitVolume);
        };
        volumeSlider.value = String(player.userVolume * 100);
        volumeSlider.addEventListener('input', setElasticVolume);
        volumeSlider.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
            returnAnimation?.cancel();
            volumeBar.classList.remove('is-release-reset');
            volumeSlider.setPointerCapture(event.pointerId);
            volumeBar.classList.add('is-stretched');
            volumeSlider.classList.add('is-grabbing');
        });
        volumeSlider.addEventListener('pointermove', (event) => {
            if (volumeSlider.hasPointerCapture(event.pointerId)) updateElasticShape(event.clientX);
        });
        volumeSlider.addEventListener('pointerup', (event) => {
            event.stopPropagation();
            releaseElasticShape(event);
        });
        volumeSlider.addEventListener('pointercancel', releaseElasticShape);
        volumeSlider.addEventListener('lostpointercapture', releaseElasticShape);
        window.addEventListener('pointerup', releaseElasticShape);
        window.addEventListener('blur', releaseElasticShape);
        volumeBar.addEventListener('pointerleave', () => volumeBar.classList.remove('is-release-reset'));
        volumeSlider.addEventListener('click', (event) => event.stopPropagation());
    }

    const updateVolumeHover = (event) => {
        const rect = volumeBar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        volumeBar.style.setProperty('--volume-hover-level', `${position * 100}%`);
        if (volumeHoverFill) volumeHoverFill.style.width = `${position * 100}%`;
    };
    volumeBar.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        volumeBar.classList.add('is-previewing');
        updateVolumeHover(event);
    });
    volumeBar.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'touch') updateVolumeHover(event);
    });
    volumeBar.addEventListener('pointerleave', () => volumeBar.classList.remove('is-previewing'));

    const seek = (bar, event, setter) => {
        const rect = bar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        setter(position);
    };

    const updateSeekUI = (position) => {
        const activeEl = player.activeElement;
        if (!isNaN(activeEl.duration)) {
            progressFill.style.width = `${position * 100}%`;
            if (currentTimeEl) {
                currentTimeEl.textContent = formatTime(position * activeEl.duration);
            }
        }
    };

    const updateProgressHover = (event) => {
        const rect = progressBar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const duration = player.activeElement?.duration || player.currentTrack?.duration || 0;
        progressBar.style.setProperty('--hover-progress', `${position * 100}%`);
        if (progressHoverFill) progressHoverFill.style.width = `${position * 100}%`;
        if (progressHoverTime) {
            progressHoverTime.textContent = formatTime(position * duration);
            progressHoverTime.style.left = `${position * 100}%`;
        }
    };
    progressBar.addEventListener('pointerenter', (event) => {
        progressBar.classList.add('is-previewing');
        updateProgressHover(event);
    });
    progressBar.addEventListener('pointermove', updateProgressHover);
    progressBar.addEventListener('pointerleave', () => progressBar.classList.remove('is-previewing'));
    progressBar.addEventListener('keydown', (event) => {
        const activeEl = player.activeElement;
        const duration = activeEl?.duration || player.currentTrack?.duration || 0;
        if (!Number.isFinite(duration) || duration <= 0) return;

        let nextTime = activeEl.currentTime || 0;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextTime -= 5;
        else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextTime += 5;
        else if (event.key === 'Home') nextTime = 0;
        else if (event.key === 'End') nextTime = duration;
        else return;

        event.preventDefault();
        activeEl.currentTime = Math.max(0, Math.min(duration, nextTime));
        updateSeekUI(activeEl.currentTime / duration);
        progressBar.setAttribute('aria-valuenow', String(Math.round(activeEl.currentTime)));
        progressBar.setAttribute('aria-valuetext', `${formatTime(activeEl.currentTime)} of ${formatTime(duration)}`);
        player.updateMediaSessionPositionState();
    });

    // Progress bar with smooth dragging
    progressBar.addEventListener('mousedown', (e) => {
        const activeEl = player.activeElement;
        isSeeking = true;
        wasPlaying = !activeEl.paused;
        if (wasPlaying) activeEl.pause();

        seek(progressBar, e, (position) => {
            lastSeekPosition = position;
            updateSeekUI(position);
        });
    });

    // Touch events for mobile
    progressBar.addEventListener('touchstart', (e) => {
        const activeEl = player.activeElement;
        e.preventDefault();
        isSeeking = true;
        wasPlaying = !activeEl.paused;
        if (wasPlaying) activeEl.pause();

        const touch = e.touches[0];
        const rect = progressBar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));

        lastSeekPosition = position;
        updateSeekUI(position);
    });

    document.addEventListener('mousemove', (e) => {
        if (isSeeking) {
            seek(progressBar, e, (position) => {
                lastSeekPosition = position;
                updateSeekUI(position);
            });
        }

        if (isAdjustingVolume) {
            seek(volumeBar, e, (position) => {
                const activeEl = player.activeElement;
                if (activeEl.muted) {
                    activeEl.muted = false;
                    localStorage.setItem('muted', false);

                    const inactiveEl = player.currentTrack?.type === 'video' ? player.audio : player.video;
                    if (inactiveEl) inactiveEl.muted = false;
                }
                player.setVolume(position);
                volumeFill.style.width = `${position * 100}%`;
                volumeBar.style.setProperty('--volume-level', `${position * 100}%`);
            });
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (isSeeking) {
            const touch = e.touches[0];
            const rect = progressBar.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));

            lastSeekPosition = position;
            updateSeekUI(position);
        }

        if (isAdjustingVolume) {
            const touch = e.touches[0];
            const rect = volumeBar.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
            const activeEl = player.activeElement;
            if (activeEl.muted) {
                activeEl.muted = false;
                localStorage.setItem('muted', false);

                const inactiveEl = player.currentTrack?.type === 'video' ? player.audio : player.video;
                if (inactiveEl) inactiveEl.muted = false;
            }
            player.setVolume(position);
            volumeFill.style.width = `${position * 100}%`;
            volumeBar.style.setProperty('--volume-level', `${position * 100}%`);
        }
    });

    document.addEventListener('mouseup', () => {
        if (isSeeking) {
            const activeEl = player.activeElement;
            // Commit the seek
            if (!isNaN(activeEl.duration)) {
                activeEl.currentTime = lastSeekPosition * activeEl.duration;
                player.updateMediaSessionPositionState();
                if (wasPlaying) activeEl.play();
            }
            isSeeking = false;
        }

        if (isAdjustingVolume) {
            isAdjustingVolume = false;
        }
    });

    document.addEventListener('touchend', () => {
        if (isSeeking) {
            const activeEl = player.activeElement;
            if (!isNaN(activeEl.duration)) {
                activeEl.currentTime = lastSeekPosition * activeEl.duration;
                player.updateMediaSessionPositionState();
                if (wasPlaying) activeEl.play();
            }
            isSeeking = false;
        }

        if (isAdjustingVolume) {
            isAdjustingVolume = false;
        }
    });

    progressBar.addEventListener('click', (e) => {
        if (!isSeeking) {
            const activeEl = player.activeElement;
            // Only handle click if not result of a drag release
            seek(progressBar, e, (position) => {
                if (!isNaN(activeEl.duration) && activeEl.duration > 0 && activeEl.duration !== Infinity) {
                    activeEl.currentTime = position * activeEl.duration;
                    player.updateMediaSessionPositionState();
                } else if (player.currentTrack && player.currentTrack.duration) {
                    const targetTime = position * player.currentTrack.duration;
                    const progressFill = document.querySelector('.progress-fill');
                    if (progressFill) progressFill.style.width = `${position * 100}%`;
                    player.playTrackFromQueue(targetTime);
                }
            });
        }
    });

    volumeBar.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            const newVolume = Math.max(0, Math.min(1, player.userVolume + delta));
            const activeEl = player.activeElement;

            if (delta > 0 && activeEl.muted) {
                activeEl.muted = false;
                localStorage.setItem('muted', false);

                const inactiveEl = player.currentTrack?.type === 'video' ? player.audio : player.video;
                if (inactiveEl) inactiveEl.muted = false;
            }

            player.setVolume(newVolume);
            volumeFill.style.width = `${newVolume * 100}%`;
            volumeBar.style.setProperty('--volume-level', `${newVolume * 100}%`);
        },
        { passive: false }
    );

    volumeBtn?.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            const newVolume = Math.max(0, Math.min(1, player.userVolume + delta));
            const activeEl = player.activeElement;

            if (delta > 0 && activeEl.muted) {
                activeEl.muted = false;
                localStorage.setItem('muted', false);

                const inactiveEl = player.currentTrack?.type === 'video' ? player.audio : player.video;
                if (inactiveEl) inactiveEl.muted = false;
            }

            player.setVolume(newVolume);
            volumeFill.style.width = `${newVolume * 100}%`;
            volumeBar.style.setProperty('--volume-level', `${newVolume * 100}%`);
        },
        { passive: false }
    );
}

function setupTrackSaveFloatingPanel(player, api, ui) {
    const panel = document.getElementById('track-save-floating-panel');
    if (!panel || panel.dataset.initialized === 'true') return;
    panel.dataset.initialized = 'true';

    let currentTrack = null;
    let currentTrigger = null;
    let currentQuery = '';
    let panelAnimation = null;
    let animationRun = 0;
    let renderRun = 0;

    const getPlaylistCoverUrl = (playlist) => {
        const candidate =
            playlist.cover ||
            playlist.images?.[0] ||
            playlist.tracks?.find((track) => track.album?.cover)?.album?.cover ||
            null;
        if (!candidate) return '/assets/appicon.png';
        const value = String(candidate);
        if (/^(?:data:|blob:|https?:|\/)/.test(value)) return value;
        return api.getCoverUrl(candidate);
    };

    const playlistRowHTML = (playlist, isSaved) => `
        <button
            type="button"
            class="track-save-playlist-row${isSaved ? ' is-saved' : ''}"
            data-playlist-id="${escapeHtml(String(playlist.id))}"
            role="checkbox"
            aria-checked="${String(isSaved)}"
        >
            <img src="${escapeHtml(getPlaylistCoverUrl(playlist))}" alt="" class="track-save-playlist-cover" />
            <span class="track-save-playlist-copy">
                <strong>${escapeHtml(playlist.name || playlist.title || 'Untitled playlist')}</strong>
                <small>${playlist.tracks?.length || playlist.numberOfTracks || 0} songs</small>
            </span>
            <span class="track-save-playlist-check" aria-hidden="true">${isSaved ? SVG_CHECK(13) : ''}</span>
        </button>
    `;

    const likedSongsRowHTML = (isFavorite) => `
        <button
            type="button"
            class="track-save-playlist-row track-save-liked-row${isFavorite ? ' is-saved' : ''}"
            data-save-location="liked"
            role="checkbox"
            aria-checked="${String(isFavorite)}"
        >
            <img src="/assets/appicon.png" alt="" class="track-save-playlist-cover" />
            <span class="track-save-playlist-copy">
                <strong>Liked Songs</strong>
                <small>Your liked tracks</small>
            </span>
            <span class="track-save-playlist-check" aria-hidden="true">${isFavorite ? SVG_CHECK(13) : ''}</span>
        </button>
    `;

    const sortRecentPlaylists = (playlists) => {
        const recentIds = new Map(
            (recentActivityManager.getRecents().playlists || []).map((playlist, index) => [String(playlist.id), index])
        );
        return [...playlists].sort((a, b) => {
            const rankA = recentIds.has(String(a.id)) ? recentIds.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
            const rankB = recentIds.has(String(b.id)) ? recentIds.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
            if (rankA !== rankB) return rankA - rankB;
            return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
        });
    };

    const render = async ({ animateResults = false } = {}) => {
        if (!currentTrack) return;
        const run = ++renderRun;
        const renderedQuery = currentQuery;
        const trackType = currentTrack.type === 'video' ? 'video' : 'track';
        const [playlists, saveState] = await Promise.all([
            db.getPlaylists(true),
            ui.getTrackSaveState(trackType, currentTrack.id),
        ]);
        if (run !== renderRun) return false;
        const savedIds = new Set(saveState.playlistIds.map(String));
        const query = renderedQuery.trim().toLocaleLowerCase();
        const matches = (playlist) => (playlist.name || playlist.title || '').toLocaleLowerCase().includes(query);
        const savedPlaylists = playlists.filter((playlist) => savedIds.has(String(playlist.id)) && matches(playlist));
        const recentPlaylists = sortRecentPlaylists(playlists)
            .filter((playlist) => !savedIds.has(String(playlist.id)) && matches(playlist))
            .slice(0, query ? playlists.length : 8);
        const likedMatches = 'liked songs'.includes(query);

        const sections = [];
        if (!query && (saveState.isFavorite || savedPlaylists.length)) {
            sections.push(`
                <section class="track-save-panel-section" aria-labelledby="track-save-saved-label">
                    <h4 id="track-save-saved-label">Saved in</h4>
                    ${saveState.isFavorite ? likedSongsRowHTML(true) : ''}
                    ${savedPlaylists.map((playlist) => playlistRowHTML(playlist, true)).join('')}
                </section>
            `);
        }

        if (query) {
            const filteredPlaylists = sortRecentPlaylists(playlists).filter(matches);
            sections.push(`
                <section class="track-save-panel-section" aria-labelledby="track-save-results-label">
                    <h4 id="track-save-results-label">Playlists</h4>
                    ${likedMatches ? likedSongsRowHTML(saveState.isFavorite) : ''}
                    ${filteredPlaylists
                        .map((playlist) => playlistRowHTML(playlist, savedIds.has(String(playlist.id))))
                        .join('')}
                    ${!likedMatches && filteredPlaylists.length === 0 ? `<p class="track-save-empty">No playlists match “${escapeHtml(renderedQuery.trim())}”.</p>` : ''}
                </section>
            `);
        } else {
            sections.push(`
                <section class="track-save-panel-section" aria-labelledby="track-save-recent-label">
                    <h4 id="track-save-recent-label">Recent playlists</h4>
                    ${recentPlaylists.map((playlist) => playlistRowHTML(playlist, false)).join('')}
                    ${recentPlaylists.length === 0 ? '<p class="track-save-empty">Create a playlist to save this track somewhere new.</p>' : ''}
                </section>
            `);
        }

        const resultCount = query
            ? sortRecentPlaylists(playlists).filter(matches).length + Number(likedMatches)
            : savedPlaylists.length + Number(saveState.isFavorite) + recentPlaylists.length;
        panel.innerHTML = `
            <div class="track-save-panel-shell">
                <header class="track-save-panel-header">
                    <div class="track-save-panel-title-row">
                        <div class="track-save-panel-title-copy">
                            <h3 id="track-save-floating-title">Add to playlist</h3>
                            <p title="${escapeHtml(currentTrack.title || 'Current track')}">${escapeHtml(currentTrack.title || 'Current track')}</p>
                        </div>
                        <span class="track-save-title-mark${panel.hidden ? ' is-entering' : ''}" aria-hidden="true">
                            <i></i><i></i><i></i><i></i>
                        </span>
                    </div>
                    <div class="track-save-search${query ? ' has-query' : ''}">
                        <span class="track-save-search-icon" aria-hidden="true">${SVG_SEARCH(19)}</span>
                        <input type="search" value="${escapeHtml(renderedQuery)}" placeholder="Find a playlist" aria-label="Find a playlist" />
                        ${query ? `<output class="track-save-result-count" aria-label="${resultCount} results">${resultCount}</output>` : ''}
                        ${query ? `<button type="button" class="track-save-search-clear" aria-label="Clear search">${SVG_CLOSE(15)}</button>` : ''}
                    </div>
                    <button type="button" class="track-save-new-playlist">
                        <span class="track-save-new-playlist-icon" aria-hidden="true">${SVG_PLUS(21)}</span>
                        <span class="track-save-new-playlist-copy">
                            <strong>New playlist</strong>
                            <small>Start with this track</small>
                        </span>
                    </button>
                </header>
                <div class="track-save-panel-list">${sections.join('')}</div>
                <footer class="track-save-panel-footer">
                    <button type="button" class="track-save-panel-cancel">Cancel</button>
                </footer>
            </div>
        `;

        if (animateResults && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const list = panel.querySelector('.track-save-panel-list');
            const resultAnimation = list?.animate(
                [
                    { opacity: 0.25, clipPath: 'inset(0 0 14% 0)', transform: 'translateY(-5px)' },
                    { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' },
                ],
                { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
            );
            if (resultAnimation) void resultAnimation.finished.catch(() => {});
        }
        return true;
    };

    const animateRowConfirmation = (row, isSaved) => {
        row.classList.toggle('is-saved', isSaved);
        row.classList.toggle('is-releasing', !isSaved);
        row.classList.add('is-confirming');
        row.setAttribute('aria-checked', String(isSaved));
        row.setAttribute('aria-busy', 'true');
        row.querySelector('.track-save-playlist-check').innerHTML = isSaved ? SVG_CHECK(13) : '';

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
        const animation = row.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(0.985)', offset: 0.35 }, { transform: 'scale(1)' }],
            { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        );
        return animation.finished.catch(() => {});
    };

    const animateNewPlaylist = (button) => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
        const icon = button.querySelector('.track-save-new-playlist-icon');
        const animation = icon.animate(
            [
                { transform: 'rotate(0deg) scale(1)' },
                { transform: 'rotate(90deg) scale(1.12)' },
                { transform: 'rotate(90deg) scale(1)' },
            ],
            { duration: 210, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        );
        return animation.finished.catch(() => {});
    };

    const position = () => {
        const triggerRect = getRectSnapshot(currentTrigger);
        if (!triggerRect) return null;
        const mobile = window.matchMedia('(max-width: 600px)').matches;
        const gutter = mobile ? 0 : 10;
        const width = mobile ? window.innerWidth - gutter * 2 : Math.min(360, window.innerWidth - gutter * 2);
        panel.style.width = `${width}px`;
        panel.style.maxHeight = `${Math.min(520, window.innerHeight - gutter * 2)}px`;

        const panelHeight = panel.offsetHeight || Math.min(500, window.innerHeight - gutter * 2);
        let left = gutter;
        let top = window.innerHeight - panelHeight - gutter;
        if (!mobile) {
            left = Math.min(Math.max(gutter, triggerRect.right - width), window.innerWidth - width - gutter);
            const fitsAbove = triggerRect.top - panelHeight - 8 >= gutter;
            top = fitsAbove ? triggerRect.top - panelHeight - 8 : triggerRect.bottom + 8;
            top = Math.min(Math.max(gutter, top), window.innerHeight - panelHeight - gutter);
        }

        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        return triggerRect;
    };

    const getFrames = (triggerRect) => {
        const panelRect = panel.getBoundingClientRect();
        return {
            collapsed: {
                opacity: 0,
                borderRadius: '999px',
                clipPath: 'inset(0 round 999px)',
                transform: `translate(${triggerRect.left - panelRect.left}px, ${triggerRect.top - panelRect.top}px) scale(${Math.max(0.06, triggerRect.width / panelRect.width)}, ${Math.max(0.035, triggerRect.height / panelRect.height)})`,
            },
            expanded: {
                opacity: 1,
                borderRadius: '16px',
                clipPath: 'inset(0 round 16px)',
                transform: 'translate(0, 0) scale(1)',
            },
        };
    };

    const close = ({ restoreFocus = false } = {}) => {
        if (panel.hidden) return;
        const run = ++animationRun;
        const triggerRect = getRectSnapshot(currentTrigger);
        panel.classList.remove('is-open');
        currentTrigger?.classList.remove('is-floating-panel-open');
        currentTrigger?.setAttribute('aria-expanded', 'false');
        panelAnimation?.cancel();

        if (!triggerRect || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            panel.hidden = true;
            if (restoreFocus) currentTrigger?.focus({ preventScroll: true });
            return;
        }

        const { collapsed, expanded } = getFrames(triggerRect);
        panelAnimation = panel.animate([expanded, collapsed], {
            duration: 240,
            easing: 'cubic-bezier(0.4, 0, 0.7, 0.2)',
            fill: 'both',
        });
        void panelAnimation.finished
            .then(() => {
                if (run !== animationRun) return;
                panel.hidden = true;
                panelAnimation?.cancel();
                if (restoreFocus) currentTrigger?.focus({ preventScroll: true });
            })
            .catch(() => {});
    };

    const open = async (track, trigger) => {
        const run = ++animationRun;
        currentTrack = track;
        currentTrigger?.classList.remove('is-floating-panel-open');
        currentTrigger = trigger;
        currentQuery = '';
        await render();
        if (run !== animationRun) return;

        panel.hidden = false;
        panel.style.visibility = 'hidden';
        const triggerRect = position();
        if (!triggerRect) {
            panel.hidden = true;
            return;
        }

        currentTrigger.classList.add('is-floating-panel-open');
        currentTrigger.setAttribute('aria-haspopup', 'dialog');
        currentTrigger.setAttribute('aria-expanded', 'true');
        panelAnimation?.cancel();
        const { collapsed, expanded } = getFrames(triggerRect);
        panel.style.visibility = '';
        panel.classList.add('is-open');

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            panel.style.opacity = '1';
            panel.querySelector('input')?.focus({ preventScroll: true });
            return;
        }

        panelAnimation = panel.animate([collapsed, expanded], {
            duration: 400,
            easing: 'cubic-bezier(0.2, 0.9, 0.24, 1.08)',
            fill: 'both',
        });
        void panelAnimation.finished
            .then(() => {
                if (run !== animationRun) return;
                panelAnimation?.cancel();
                panel.querySelector('input')?.focus({ preventScroll: true });
            })
            .catch(() => {});
    };

    const resolveTrack = (button) => {
        if (
            button.id === 'now-playing-like-btn' ||
            button.id === 'fs-like-btn' ||
            button.classList.contains('now-playing-panel-save')
        )
            return player.currentTrack;
        const queueItem = button.closest('.queue-track-item');
        if (queueItem) return player.getCurrentQueue()[Number(queueItem.dataset.queueIndex)];
        const itemElement = button.closest('.track-item, .card');
        return trackDataStore.get(itemElement) || trackDataStore.get(button) || null;
    };

    const removeFromSourcePlaylist = async (button, track) => {
        const playlistId = button.dataset.sourcePlaylistId;
        const trackType = track.type === 'video' ? 'video' : 'track';
        if (!playlistId) return false;

        await db.removeTrackFromPlaylist(playlistId, track.id, trackType);
        const updatedPlaylist = await db.getPlaylist(playlistId);
        await syncManager.syncUserPlaylist(updatedPlaylist, 'update');
        showNotification(`Removed from playlist: ${updatedPlaylist.name}`);
        await ui.renderPlaylistPage(playlistId, 'user');
        return true;
    };

    const openCreatePlaylist = () => {
        const createModal = document.getElementById('playlist-modal');
        if (!createModal || !currentTrack) return;
        document.getElementById('playlist-modal-title').textContent = 'Create Playlist';
        document.getElementById('playlist-name-input').value = '';
        document.getElementById('playlist-cover-input').value = '';
        document.getElementById('playlist-cover-file-input').value = '';
        document.getElementById('playlist-description-input').value = '';
        createModal.dataset.editingId = '';
        document.getElementById('import-section').style.display = 'none';
        createModal._pendingTracks = [currentTrack];
        createModal.classList.add('active');
        document.getElementById('playlist-name-input').focus();
    };

    document.addEventListener(
        'contextmenu',
        async (event) => {
            const button = event.target.closest('.track-save-btn');
            if (!button) return;
            const track = resolveTrack(button);
            if (!track) return;
            event.preventDefault();
            event.stopImmediatePropagation();

            const trackType = track.type === 'video' ? 'video' : 'track';
            if (await db.isFavorite(trackType, track.id)) {
                if (await removeFromSourcePlaylist(button, track)) return;
                await handleTrackAction('toggle-like', track, player, api, null, trackType, ui, null);
                return;
            }
            void open(track, button);
        },
        true
    );

    document.addEventListener('track-save-panel-open', (event) => {
        const button = event.detail?.button;
        const track = button && resolveTrack(button);
        if (track) void open(track, button);
    });

    panel.addEventListener('input', (event) => {
        if (!event.target.matches('.track-save-search input')) return;
        currentQuery = event.target.value;
        const selectionStart = event.target.selectionStart;
        void render({ animateResults: true }).then((didRender) => {
            if (!didRender) return;
            const input = panel.querySelector('.track-save-search input');
            input?.focus({ preventScroll: true });
            input?.setSelectionRange(selectionStart, selectionStart);
        });
    });

    panel.addEventListener('click', async (event) => {
        if (event.target.closest('.track-save-panel-cancel')) {
            close({ restoreFocus: true });
            return;
        }
        if (event.target.closest('.track-save-search-clear')) {
            currentQuery = '';
            await render({ animateResults: true });
            panel.querySelector('.track-save-search input')?.focus({ preventScroll: true });
            return;
        }
        const newPlaylistButton = event.target.closest('.track-save-new-playlist');
        if (newPlaylistButton) {
            await animateNewPlaylist(newPlaylistButton);
            close();
            openCreatePlaylist();
            return;
        }
        if (!currentTrack) return;

        const trackType = currentTrack.type === 'video' ? 'video' : 'track';
        const likedRow = event.target.closest('[data-save-location="liked"]');
        if (likedRow) {
            const isSaved = likedRow.getAttribute('aria-checked') === 'true';
            const feedback = animateRowConfirmation(likedRow, !isSaved);
            const added = await db.toggleFavorite(trackType, currentTrack);
            await syncManager.syncLibraryItem(trackType, currentTrack, added);
            await ui.refreshTrackSaveButtons(trackType, currentTrack.id, { animate: true });
            showNotification(
                added ? `Added to Liked: ${currentTrack.title}` : `Removed from Liked: ${currentTrack.title}`
            );
            await feedback;
            await render();
            return;
        }

        const playlistRow = event.target.closest('[data-playlist-id]');
        if (!playlistRow) return;
        const playlistId = playlistRow.dataset.playlistId;
        const isSaved = playlistRow.getAttribute('aria-checked') === 'true';
        const feedback = animateRowConfirmation(playlistRow, !isSaved);
        if (isSaved) await db.removeTrackFromPlaylist(playlistId, currentTrack.id, trackType);
        else await db.addTrackToPlaylist(playlistId, currentTrack);
        const updatedPlaylist = await db.getPlaylist(playlistId);
        await syncManager.syncUserPlaylist(updatedPlaylist, 'update');
        await ui.refreshTrackSaveButtons(trackType, currentTrack.id, { animate: true });
        showNotification(`${isSaved ? 'Removed from' : 'Added to'} playlist: ${updatedPlaylist.name}`);
        await feedback;
        await render();
    });

    document.addEventListener('pointerdown', (event) => {
        if (panel.hidden || panel.contains(event.target) || currentTrigger?.contains(event.target)) return;
        close();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) close({ restoreFocus: true });
    });
    window.addEventListener('resize', () => {
        if (!panel.hidden) position();
    });
}

// Standalone function to show add to playlist modal
export async function showAddToPlaylistModal(track) {
    const modal = document.getElementById('playlist-select-modal');
    const list = document.getElementById('playlist-select-list');
    const cancelBtn = document.getElementById('playlist-select-cancel');
    const overlay = modal.querySelector('.modal-overlay');

    const renderModal = async () => {
        const playlists = await db.getPlaylists(true);

        const trackId = track.id;
        const playlistsWithTrack = new Set();

        for (const playlist of playlists) {
            if (playlist.tracks && playlist.tracks.some((t) => t.id == trackId)) {
                playlistsWithTrack.add(playlist.id);
            }
        }

        list.innerHTML =
            `
            <div class="modal-option create-new-option" style="border-bottom: 1px solid var(--border); margin-bottom: 0.5rem;">
                <span style="font-weight: 600; color: var(--primary);">+ Create New Playlist</span>
            </div>
        ` +
            playlists
                .map((p) => {
                    const alreadyContains = playlistsWithTrack.has(p.id);
                    return `
                <div class="modal-option ${alreadyContains ? 'already-contains' : ''}" data-id="${p.id}">
                    <span>${p.name}</span>
                    ${
                        alreadyContains
                            ? `<button class="remove-from-playlist-btn-modal" title="Remove from playlist" style="background: transparent; border: none; color: inherit; cursor: pointer; padding: 4px; display: flex; align-items: center;">${SVG_BIN(20)}</button>`
                            : ''
                    }
                </div>
            `;
                })
                .join('');
        return true;
    };

    if (!(await renderModal())) return;

    const closeModal = () => {
        modal.classList.remove('active');
        cleanup();
    };

    const handleOptionClick = async (e) => {
        const removeBtn = e.target.closest('.remove-from-playlist-btn-modal');
        const option = e.target.closest('.modal-option');

        if (!option) return;

        if (option.classList.contains('create-new-option')) {
            closeModal();
            const createModal = document.getElementById('playlist-modal');
            document.getElementById('playlist-modal-title').textContent = 'Create Playlist';
            document.getElementById('playlist-name-input').value = '';
            document.getElementById('playlist-cover-input').value = '';
            document.getElementById('playlist-cover-file-input').value = '';
            document.getElementById('playlist-description-input').value = '';
            createModal.dataset.editingId = '';
            document.getElementById('import-section').style.display = 'none';

            // Reset cover upload state
            const coverUploadBtn = document.getElementById('playlist-cover-upload-btn');
            const coverUrlInput = document.getElementById('playlist-cover-input');
            const coverToggleUrlBtn = document.getElementById('playlist-cover-toggle-url-btn');
            if (coverUploadBtn) {
                coverUploadBtn.style.flex = '1';
                coverUploadBtn.style.display = 'flex';
            }
            if (coverUrlInput) coverUrlInput.style.display = 'none';
            if (coverToggleUrlBtn) {
                coverToggleUrlBtn.textContent = 'or URL';
                coverToggleUrlBtn.title = 'Switch to URL input';
            }

            // Pass track
            createModal._pendingTracks = [track];

            createModal.classList.add('active');
            document.getElementById('playlist-name-input').focus();
            return;
        }

        const playlistId = option.dataset.id;

        if (removeBtn) {
            e.stopPropagation();
            await db.removeTrackFromPlaylist(playlistId, track.id);
            const updatedPlaylist = await db.getPlaylist(playlistId);
            await syncManager.syncUserPlaylist(updatedPlaylist, 'update');
            showNotification(`Removed from playlist: ${option.querySelector('span').textContent}`);
            await renderModal();
        } else {
            if (option.classList.contains('already-contains')) return;

            await db.addTrackToPlaylist(playlistId, track);
            const updatedPlaylist = await db.getPlaylist(playlistId);
            await syncManager.syncUserPlaylist(updatedPlaylist, 'update');
            showNotification(`Added to playlist: ${option.querySelector('span').textContent}`);
            closeModal();
        }
    };

    const cleanup = () => {
        cancelBtn.removeEventListener('click', closeModal);
        overlay.removeEventListener('click', closeModal);
        list.removeEventListener('click', handleOptionClick);
    };

    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    list.addEventListener('click', handleOptionClick);

    modal.classList.add('active');
}

export async function handleTrackAction(
    action,
    item,
    player,
    api,
    lyricsManager,
    type = 'track',
    ui = null,
    scrobbler = null,
    extraData = null
) {
    if (!item) return;

    if (action === 'toggle-canvas') {
        const enabled = !canvasSettings.isEnabled();
        canvasSettings.setEnabled(enabled);
        showNotification(`Canvas ${enabled ? 'enabled' : 'disabled'}`);
        return;
    }

    if (action === 'edit-metadata') {
        if (ui && item.isLocal && typeof ui.openMetadataEditor === 'function') {
            await ui.openMetadataEditor(type, item);
        }
        return;
    }

    // Actions not allowed for unavailable tracks
    const forbiddenForUnavailable = [
        'add-to-queue',
        'play-next',
        'track-mix',
        'download',
        'start-radio',
        'start-infinite-radio',
    ];
    if (item.isUnavailable && forbiddenForUnavailable.includes(action)) {
        showNotification('This track is unavailable.');
        return;
    }

    if (action === 'request-song') {
        if (partyManager.currentParty) {
            await partyManager.requestSong(item);
        } else {
            showNotification('You are not in a listening party');
        }
        return;
    }

    if (action === 'start-radio' || action === 'start-infinite-radio') {
        let tracks = [];
        if (type === 'track') {
            tracks = [item];
        } else if (item.tracks) {
            tracks = item.tracks;
        } else if (type === 'album') {
            const data = await api.getAlbum(item.id);
            tracks = data.tracks;
        } else if (type === 'playlist') {
            const data = await api.getPlaylist(item.uuid);
            tracks = data.tracks;
        } else if (type === 'user-playlist') {
            const playlist = await db.getPlaylist(item.id);
            tracks = playlist ? playlist.tracks : [];
        }

        if (tracks.length > 0) {
            player.setQueue(tracks, 0, true, playbackSourceContext('radio', item, `${item.title || item.name} Radio`));
            player.playAtIndex(0);
            player.enableRadio(tracks);
            showNotification(`Started radio based on ${type}: ${item.title || item.name}`);
        } else {
            showNotification('Could not start infinite radio: No tracks found');
        }
        return;
    }

    if (action === 'track-mix' && type === 'track') {
        if (item.mixes && item.mixes.TRACK_MIX) {
            navigate(`/mix/${item.mixes.TRACK_MIX}`);
        }
        return;
    }

    // Collection Actions (Album, Playlist, Mix)
    const isCollection = ['album', 'playlist', 'user-playlist', 'mix'].includes(type);
    const collectionActions = ['play-card', 'shuffle-play-card', 'add-to-queue', 'play-next', 'download', 'start-mix'];

    if (isCollection && collectionActions.includes(action)) {
        try {
            // Check if album/artist is blocked
            const { contentBlockingSettings } = await import('./storage.js');
            if (type === 'album' && contentBlockingSettings.shouldHideAlbum(item)) {
                showNotification('This album is blocked');
                return;
            }

            let tracks = [];
            let collectionItem = item;

            if (type === 'album') {
                const data = await api.getAlbum(item.id);
                tracks = data.tracks;
                collectionItem = data.album || item;
            } else if (type === 'playlist') {
                const data = await api.getPlaylist(item.uuid);
                tracks = data.tracks;
                collectionItem = data.playlist || item;
            } else if (type === 'user-playlist') {
                const playlist = await db.getPlaylist(item.id);
                tracks = playlist ? playlist.tracks : item.tracks || [];
                collectionItem = playlist || item;
            } else if (type === 'mix') {
                const data = await api.getMix(item.id);
                tracks = data.tracks;
                collectionItem = data.mix || item;
            }

            if (tracks.length === 0 && action !== 'start-mix') {
                showNotification(`No tracks found in this ${type}`);
                return;
            }

            if (action === 'download') {
                if (type === 'album') {
                    await downloadAlbum(
                        collectionItem,
                        tracks,
                        api,
                        downloadQualitySettings.getQuality(),
                        lyricsManager
                    );
                } else {
                    await downloadPlaylist(
                        collectionItem,
                        tracks,
                        api,
                        downloadQualitySettings.getQuality(),
                        lyricsManager
                    );
                }
                return;
            }

            // Filter blocked tracks from collections
            tracks = contentBlockingSettings.filterTracks(tracks);

            if (action === 'add-to-queue') {
                player.addToQueue(tracks);
                if (window.renderQueueFunction) await window.renderQueueFunction();
                showNotification(`Added ${tracks.length} tracks to queue`);
                return;
            }

            if (action === 'play-next') {
                player.addNextToQueue(tracks);
                if (window.renderQueueFunction) await window.renderQueueFunction();
                showNotification(`Playing next: ${tracks.length} tracks`);
                return;
            }

            if (action === 'start-mix') {
                if (type === 'album' && collectionItem.artist?.id) {
                    const artistData = await api.getArtist(collectionItem.artist.id);
                    if (artistData.mixes?.ARTIST_MIX) {
                        navigate(`/mix/${artistData.mixes.ARTIST_MIX}`);
                        return;
                    }
                }
                // Fallback to item's own page or first track's mix
                if (tracks.length > 0 && tracks[0].mixes?.TRACK_MIX) {
                    navigate(`/mix/${tracks[0].mixes.TRACK_MIX}`);
                } else {
                    navigate(`/${type.replace('user-', '')}/${item.id || item.uuid}`);
                }
                return;
            }

            // play-card and shuffle-play-card
            if (action === 'shuffle-play-card') {
                player.shuffleActive = true;
                const tracksToShuffle = [...tracks];
                tracksToShuffle.sort(() => Math.random() - 0.5);
                player.setQueue(tracksToShuffle, 0, false, playbackSourceContext(type, collectionItem));
                const shuffleBtn = document.getElementById('shuffle-btn');
                if (shuffleBtn) shuffleBtn.classList.add('active');
            } else {
                player.setQueue(tracks, 0, false, playbackSourceContext(type, collectionItem));
                const shuffleBtn = document.getElementById('shuffle-btn');
                if (shuffleBtn) shuffleBtn.classList.remove('active');
            }
            player.playAtIndex(0);
            const name = type === 'user-playlist' ? collectionItem.name : collectionItem.title;
            showNotification(`Playing ${type.replace('user-', '')}: ${name}`);
        } catch (error) {
            console.error('Failed to handle collection action:', error);
            showNotification(`Failed to process ${type} action`);
        }
        return;
    }

    if (action === 'toggle-pin') {
        const pinned = await db.togglePinned(item, type);
        showNotification(pinned ? `Pinned to sidebar` : `Unpinned from sidebar`);

        if (ui && typeof ui.renderPinnedItems === 'function') {
            ui.renderPinnedItems();
        }
    }

    // Individual Track Actions
    // Check if track/artist is blocked
    const { contentBlockingSettings } = await import('./storage.js');
    const BLOCKED_PLAY_ACTIONS = new Set(['play-card', 'add-to-queue', 'play-next', 'start-mix']);
    if (type === 'track' && BLOCKED_PLAY_ACTIONS.has(action) && contentBlockingSettings.shouldHideTrack(item)) {
        showNotification('This track is blocked');
        return;
    }

    if (action === 'add-to-queue') {
        player.addToQueue(item);
        if (window.renderQueueFunction) await window.renderQueueFunction();
        showNotification(`Added to queue: ${item.title}`);
    } else if (action === 'play-next') {
        player.addNextToQueue(item);
        if (window.renderQueueFunction) await window.renderQueueFunction();
        showNotification(`Playing next: ${item.title}`);
    } else if (action === 'play-card') {
        player.setQueue([item], 0, false, playbackSourceContext('single', item, item.title));
        player.playAtIndex(0);
        showNotification(`Playing track: ${item.title}`);
    } else if (action === 'start-mix') {
        if (item.mixes?.TRACK_MIX) {
            navigate(`/mix/${item.mixes.TRACK_MIX}`);
        } else {
            showNotification('No mix available for this track');
        }
    } else if (action === 'download') {
        await downloadTrackWithMetadata(item, downloadQualitySettings.getQuality(), api, lyricsManager);
    } else if (action === 'toggle-like') {
        const added = await db.toggleFavorite(type, item);
        await syncManager.syncLibraryItem(type, item, added);

        if (added && type === 'track' && scrobbler) {
            if (lastFMStorage.isEnabled() && lastFMStorage.shouldLoveOnLike()) {
                scrobbler.loveTrack(item);
            }
            if (libreFmSettings.isEnabled() && libreFmSettings.shouldLoveOnLike()) {
                scrobbler.loveTrack(item);
            }
            if (listenBrainzSettings.isEnabled() && listenBrainzSettings.shouldLoveOnLike()) {
                scrobbler.loveTrack(item);
            }
        }

        // Update all instances of this item's like button on the page
        const id = type === 'playlist' ? item.uuid : item.id;
        const selector =
            type === 'track'
                ? `[data-track-id="${id}"] .like-btn`
                : type === 'video'
                  ? `.card[data-video-id="${id}"] .like-btn`
                  : `.card[data-${type}-id="${id}"] .like-btn, .card[data-playlist-id="${id}"] .like-btn`;

        // Also check header buttons
        const headerBtn = document.getElementById(`like-${type}-btn`);

        const elementsToUpdate = [...document.querySelectorAll(selector)];
        if (headerBtn) elementsToUpdate.push(headerBtn);

        const nowPlayingLikeBtn = document.getElementById('now-playing-like-btn');
        if (nowPlayingLikeBtn && (type === 'track' || type === 'video') && player?.currentTrack?.id === item.id) {
            elementsToUpdate.push(nowPlayingLikeBtn);
        }

        const fsLikeBtn = document.getElementById('fs-like-btn');
        if (fsLikeBtn && (type === 'track' || type === 'video') && player?.currentTrack?.id === item.id) {
            elementsToUpdate.push(fsLikeBtn);
        }

        if ((type === 'track' || type === 'video') && ui) {
            await ui.refreshTrackSaveButtons(type, id, { animate: true });
        } else {
            elementsToUpdate.forEach((btn) => {
                const heartIcon = btn.querySelector('svg');
                if (heartIcon) {
                    heartIcon.classList.toggle('filled', added);
                    if (heartIcon.hasAttribute('fill')) {
                        heartIcon.setAttribute('fill', added ? 'currentColor' : 'none');
                    }
                }
                btn.classList.toggle('active', added);
                btn.title = added ? 'Remove from Favorites' : 'Add to Favorites';
            });
        }

        // Handle Library Page Update
        if (window.location.pathname.split('/').filter(Boolean)[0] === 'library') {
            const itemSelector =
                type === 'track'
                    ? `.track-item[data-track-id="${id}"], .card[data-track-id="${id}"]`
                    : type === 'video'
                      ? `.video-card[data-video-id="${id}"]`
                      : `.card[data-${type}-id="${id}"], .card[data-playlist-id="${id}"]`;

            const itemEl = document.querySelector(itemSelector);

            if (!added && itemEl) {
                // Remove item
                const container = itemEl.parentElement;
                itemEl.remove();
                if (container && container.children.length === 0) {
                    const msg =
                        type === 'track'
                            ? 'No liked tracks yet.'
                            : type === 'video'
                              ? 'No liked videos yet.'
                              : `No liked ${type}s yet.`;
                    container.innerHTML = `<div class="placeholder-text">${msg}</div>`;
                }
            } else if (added && !itemEl && ui && (type === 'track' || type === 'video')) {
                // Add item
                if (type === 'track') {
                    const tracksContainer = document.getElementById('library-tracks-container');
                    if (tracksContainer) {
                        const placeholder = tracksContainer.querySelector('.placeholder-text');
                        if (placeholder) placeholder.remove();

                        const layout = localStorage.getItem('libraryLikedTracksView') || 'list';
                        const tempDiv = document.createElement('div');
                        if (layout === 'grid') {
                            tracksContainer.classList.remove('track-list');
                            tracksContainer.classList.add('card-grid');
                            tempDiv.innerHTML = ui.createTrackCardHTML(item);
                        } else {
                            tracksContainer.classList.remove('card-grid');
                            tracksContainer.classList.add('track-list');
                            const index = tracksContainer.children.length;
                            tempDiv.innerHTML = ui.createTrackItemHTML(item, index, true, false, false, true);
                        }
                        const newEl = tempDiv.firstElementChild;

                        if (newEl) {
                            tracksContainer.appendChild(newEl);
                            trackDataStore.set(newEl, item);
                            ui.updateLikeState(newEl, 'track', item.id);
                            const likedToolbar = document.getElementById('library-liked-tracks-toolbar');
                            if (likedToolbar) likedToolbar.style.display = 'flex';
                            const shuffleBtn = document.getElementById('shuffle-liked-tracks-btn');
                            const downloadBtn = document.getElementById('download-liked-tracks-btn');
                            if (shuffleBtn) shuffleBtn.style.display = 'flex';
                            if (downloadBtn) downloadBtn.style.display = 'flex';
                            ui.setupLibraryLikedTracksSearch(tracksContainer);
                        }
                    }
                } else if (type === 'video') {
                    const videosTabContent = document.getElementById('library-tab-videos');
                    if (videosTabContent) {
                        const grid = videosTabContent.querySelector('.card-grid');
                        if (grid) {
                            const placeholder = grid.querySelector('.placeholder-text');
                            if (placeholder) grid.innerHTML = '';

                            const videoHTML = ui.createVideoCardHTML(item);
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = videoHTML;
                            const newEl = tempDiv.firstElementChild;

                            if (newEl) {
                                grid.appendChild(newEl);
                                trackDataStore.set(newEl, item);
                                ui.updateLikeState(newEl, 'video', item.id);
                                newEl.addEventListener('click', (e) => {
                                    if (
                                        e.target.closest('.card-play-btn') ||
                                        e.target.closest('.card-image-container')
                                    ) {
                                        e.stopPropagation();
                                        player.playVideo(item);
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
    } else if (action === 'add-to-playlist') {
        const modal = document.getElementById('playlist-select-modal');
        const list = document.getElementById('playlist-select-list');
        const cancelBtn = document.getElementById('playlist-select-cancel');
        const overlay = modal.querySelector('.modal-overlay');

        const renderModal = async () => {
            const playlists = await db.getPlaylists(true);
            // Removed empty check to allow creating new playlist

            const trackId = item.id;
            const trackType = item.type || 'track';
            const playlistsWithTrack = new Set();

            for (const playlist of playlists) {
                if (
                    playlist.tracks &&
                    playlist.tracks.some((t) => t.id == trackId && (t.type || 'track') === trackType)
                ) {
                    playlistsWithTrack.add(playlist.id);
                }
            }

            list.innerHTML =
                `
                <div class="modal-option create-new-option" style="border-bottom: 1px solid var(--border); margin-bottom: 0.5rem;">
                    <span style="font-weight: 600; color: var(--primary);">+ Create New Playlist</span>
                </div>
            ` +
                playlists
                    .map((p) => {
                        const alreadyContains = playlistsWithTrack.has(p.id);
                        return `
                    <div class="modal-option ${alreadyContains ? 'already-contains' : ''}" data-id="${p.id}">
                        <span>${p.name}</span>
                        ${
                            alreadyContains
                                ? `<button class="remove-from-playlist-btn-modal" title="Remove from playlist" style="background: transparent; border: none; color: inherit; cursor: pointer; padding: 4px; display: flex; align-items: center;">${SVG_BIN(20)}</button>`
                                : ''
                        }
                    </div>
                `;
                    })
                    .join('');
            return true;
        };

        if (!(await renderModal())) return;

        const closeModal = () => {
            modal.classList.remove('active');
            cleanup();
        };

        const handleOptionClick = async (e) => {
            const removeBtn = e.target.closest('.remove-from-playlist-btn-modal');
            const option = e.target.closest('.modal-option');

            if (!option) return;

            if (option.classList.contains('create-new-option')) {
                closeModal();
                const createModal = document.getElementById('playlist-modal');
                document.getElementById('playlist-modal-title').textContent = 'Create Playlist';
                document.getElementById('playlist-name-input').value = '';
                document.getElementById('playlist-cover-input').value = '';
                document.getElementById('playlist-cover-file-input').value = '';
                document.getElementById('playlist-description-input').value = '';
                createModal.dataset.editingId = '';
                document.getElementById('import-section').style.display = 'none';

                // Reset cover upload state
                const coverUploadBtn = document.getElementById('playlist-cover-upload-btn');
                const coverUrlInput = document.getElementById('playlist-cover-input');
                const coverToggleUrlBtn = document.getElementById('playlist-cover-toggle-url-btn');
                if (coverUploadBtn) {
                    coverUploadBtn.style.flex = '1';
                    coverUploadBtn.style.display = 'flex';
                }
                if (coverUrlInput) coverUrlInput.style.display = 'none';
                if (coverToggleUrlBtn) {
                    coverToggleUrlBtn.textContent = 'or URL';
                    coverToggleUrlBtn.title = 'Switch to URL input';
                }

                // Pass track
                createModal._pendingTracks = [item];

                createModal.classList.add('active');
                document.getElementById('playlist-name-input').focus();
                return;
            }

            const playlistId = option.dataset.id;

            if (removeBtn) {
                e.stopPropagation();
                await db.removeTrackFromPlaylist(playlistId, item.id);
                const updatedPlaylist = await db.getPlaylist(playlistId);
                await syncManager.syncUserPlaylist(updatedPlaylist, 'update');
                showNotification(`Removed from playlist: ${option.querySelector('span').textContent}`);
                await renderModal();
            } else {
                if (option.classList.contains('already-contains')) return;

                await db.addTrackToPlaylist(playlistId, item);
                const updatedPlaylist = await db.getPlaylist(playlistId);
                await syncManager.syncUserPlaylist(updatedPlaylist, 'update');
                showNotification(`Added to playlist: ${option.querySelector('span').textContent}`);
                closeModal();
            }
        };

        const cleanup = () => {
            cancelBtn.removeEventListener('click', closeModal);
            overlay.removeEventListener('click', closeModal);
            list.removeEventListener('click', handleOptionClick);
        };

        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);
        list.addEventListener('click', handleOptionClick);

        modal.classList.add('active');
    } else if (action === 'go-to-artist') {
        const artistId = extraData?.artistId || item.artist?.id || item.artists?.[0]?.id;
        if (artistId) {
            navigate(`/artist/${artistId}`);
        }
    } else if (action === 'go-to-album') {
        const displayAlbum = getTrackDisplayAlbum(item);
        if (displayAlbum?.id) {
            navigate(`/album/${displayAlbum.id}`);
        }
    } else if (action === 'copy-link') {
        await copyShareLink(type, item);
    } else if (action === 'open-in-new-tab') {
        // Use stored href from card if available, otherwise construct URL
        const contextMenu = document.getElementById('context-menu');
        const storedHref = contextMenu?._contextHref;
        const url = buildSharePath(type, item)
            ? `${window.location.origin}${buildSharePath(type, item)}`
            : storedHref
              ? `${window.location.origin}${storedHref}`
              : `${window.location.origin}/${type}/${item.id || item.uuid}`;

        window.open(url, '_blank');
    } else if (action === 'open-in-harmony') {
        const albumId = item.id;
        const harmonyUrl = `https://harmony.pulsewidth.org.uk/release?url=${encodeURIComponent(`https://tidal.com/album/${albumId}`)}&gtin=&region=&musicbrainz=&deezer=&itunes=&spotify=&tidal=&beatport=`;
        window.open(harmonyUrl, '_blank');
    } else if (action === 'track-info') {
        const displayAlbum = getTrackDisplayAlbum(item);
        const releaseDate = displayAlbum?.releaseDate || item.streamStartDate;
        const dateDisplay = releaseDate ? new Date(releaseDate).toLocaleDateString() : 'Unknown';
        const quality = item.audioQuality || 'Unknown';
        const bitrate = item.bitrate ? `${item.bitrate} kbps` : '';

        const infoHTML = `
                <div style="padding: 1.5rem; max-width: 500px; max-height: 80vh; overflow-y: auto;">
                    <h3 style="margin-bottom: 1rem; font-size: 1.3rem; font-weight: 600;">${escapeHtml(item.title)}</h3>
                    <div style="color: var(--muted-foreground); font-size: 0.9rem; line-height: 1.8;">
                        <div style="display: grid; gap: 0.5rem;">
                            <p><strong style="color: var(--foreground);">Artist:</strong> ${escapeHtml(getTrackArtists(item))}</p>
                            <p><strong style="color: var(--foreground);">Album:</strong> ${escapeHtml(displayAlbum?.title || 'Unknown')}</p>
                            ${displayAlbum?.artist?.name ? `<p><strong style="color: var(--foreground);">Album Artist:</strong> ${escapeHtml(displayAlbum.artist.name)}</p>` : ''}
                            <p><strong style="color: var(--foreground);">Release Date:</strong> ${escapeHtml(dateDisplay)}</p>
                            <p><strong style="color: var(--foreground);">Duration:</strong> ${escapeHtml(formatTime(item.duration))}</p>
                            ${item.trackNumber ? `<p><strong style="color: var(--foreground);">Track Number:</strong> ${escapeHtml(String(item.trackNumber))}</p>` : ''}
                            ${item.discNumber ? `<p><strong style="color: var(--foreground);">Disc Number:</strong> ${escapeHtml(String(item.discNumber))}</p>` : ''}
                            ${item.version ? `<p><strong style="color: var(--foreground);">Version:</strong> ${escapeHtml(item.version)}</p>` : ''}
                            ${item.explicit ? `<p><strong style="color: var(--foreground);">Explicit:</strong> Yes</p>` : ''}
                            <p><strong style="color: var(--foreground);">Quality:</strong> ${escapeHtml(quality)} ${bitrate ? `(${escapeHtml(bitrate)})` : ''}</p>
                        </div>

                        ${
                            item.credits && item.credits.length > 0
                                ? `
                            <div style="margin-top: 1rem; padding: 0.75rem; background: var(--accent); border-radius: 8px;">
                                <p style="color: var(--foreground); font-weight: 500; margin-bottom: 0.5rem;">Credits</p>
                                <div style="font-size: 0.85rem; line-height: 1.6;">
                                    ${item.credits.map((c) => `<p>${escapeHtml(c.type)}: ${escapeHtml(c.name)}</p>`).join('')}
                                </div>
                            </div>
                        `
                                : ''
                        }

                        ${
                            item.composers && item.composers.length > 0
                                ? `
                            <p style="margin-top: 0.5rem;"><strong style="color: var(--foreground);">Composers:</strong> ${escapeHtml(item.composers.map((c) => c.name).join(', '))}</p>
                        `
                                : ''
                        }

                        ${
                            item.lyrics?.text
                                ? `
                            <div style="margin-top: 1rem; padding: 0.75rem; background: var(--accent); border-radius: 8px;">
                                <p style="color: var(--foreground); font-weight: 500; margin-bottom: 0.5rem;">Has Lyrics</p>
                            </div>
                        `
                                : ''
                        }

                        ${item.id ? `<p style="margin-top: 1rem; font-size: 0.8rem; color: var(--muted);"><strong>Track ID:</strong> ${escapeHtml(item.id)}</p>` : ''}
                        ${displayAlbum?.id ? `<p style="font-size: 0.8rem; color: var(--muted);"><strong>Album ID:</strong> ${escapeHtml(displayAlbum.id)}</p>` : ''}
                    </div>
                    <button class="btn-primary track-info-close-btn" style="margin-top: 1.5rem; width: 100%;">Close</button>
                </div>
            `;

        // Create and show modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText =
            'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';
        modal.innerHTML = infoHTML;
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        const closeBtn = modal.querySelector('.track-info-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => modal.remove();
        }
        document.body.appendChild(modal);
    } else if (action === 'block-track') {
        const { contentBlockingSettings } = await import('./storage.js');
        if (contentBlockingSettings.isTrackBlocked(item.id)) {
            contentBlockingSettings.unblockTrack(item.id);
            showNotification(`Unblocked track: ${item.title}`);
        } else {
            contentBlockingSettings.blockTrack(item);
            showNotification(`Blocked track: ${item.title}`);
        }
    } else if (action === 'block-album') {
        const { contentBlockingSettings } = await import('./storage.js');
        const displayAlbum = type === 'album' ? item : getTrackDisplayAlbum(item);
        const albumId = type === 'album' ? item.id : displayAlbum?.id;
        const albumTitle = type === 'album' ? item.title || item.name : displayAlbum?.title || displayAlbum?.name;
        const albumArtist =
            type === 'album' ? item.artist?.name || item.artist : displayAlbum?.artist?.name || displayAlbum?.artist;

        if (!albumId) {
            showNotification('No album information available');
            return;
        }

        const albumObj = { id: albumId, title: albumTitle, artist: albumArtist };

        if (contentBlockingSettings.isAlbumBlocked(albumId)) {
            contentBlockingSettings.unblockAlbum(albumId);
            showNotification(`Unblocked album: ${albumTitle || 'Unknown Album'}`);
        } else {
            contentBlockingSettings.blockAlbum(albumObj);
            showNotification(`Blocked album: ${albumTitle || 'Unknown Album'}`);
        }
    } else if (action === 'block-artist') {
        const { contentBlockingSettings } = await import('./storage.js');
        const artistId = type === 'artist' ? item.id : item.artist?.id || item.artists?.[0]?.id;
        const artistName = type === 'artist' ? item.name || item.title : item.artist?.name || item.artists?.[0]?.name;

        if (!artistId) {
            showNotification('No artist information available');
            return;
        }

        const artistObj = { id: artistId, name: artistName };

        if (contentBlockingSettings.isArtistBlocked(artistId)) {
            contentBlockingSettings.unblockArtist(artistId);
            showNotification(`Unblocked artist: ${artistName || 'Unknown Artist'}`);
        } else {
            contentBlockingSettings.blockArtist(artistObj);
            showNotification(`Blocked artist: ${artistName || 'Unknown Artist'}`);
        }
    }
}

function setContextMenuLabel(item, label) {
    if (!item) return;
    const labelElement = item.querySelector('.context-menu-label');
    if (labelElement) labelElement.textContent = label;
    else item.textContent = label;
}

function setContextMenuItemVisible(item, visible) {
    if (!item) return;
    item.style.display = visible ? 'flex' : 'none';
    item.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function refreshContextMenuSections(contextMenu) {
    contextMenu.querySelectorAll('[data-menu-section]').forEach((section) => {
        let sibling = section.nextElementSibling;
        let hasVisibleAction = false;
        while (sibling && !sibling.hasAttribute('data-menu-section')) {
            if (sibling.matches('[data-action]') && sibling.style.display !== 'none') {
                hasVisibleAction = true;
                break;
            }
            sibling = sibling.nextElementSibling;
        }
        section.style.display = hasVisibleAction ? 'flex' : 'none';
    });
}

export async function updateContextMenuLikeState(contextMenu, contextTrack) {
    if (!contextMenu || !contextTrack) return;

    const type = contextMenu._contextType || 'track';

    const canvasItem = contextMenu.querySelector('li[data-action="toggle-canvas"]');
    if (canvasItem) {
        const canvasEnabled = canvasSettings.isEnabled();
        setContextMenuLabel(canvasItem, canvasEnabled ? 'Disable Canvas' : 'Enable Canvas');
    }

    const likeItem = contextMenu.querySelector('li[data-action="toggle-like"]');
    let isLiked = false;
    if (likeItem) {
        const key = type === 'playlist' ? contextTrack.uuid : contextTrack.id;
        isLiked = await db.isFavorite(type, key);
    }

    const pinItem = contextMenu.querySelector('li[data-action="toggle-pin"]');
    if (pinItem) {
        const isPinned = await db.isPinned(contextTrack.id || contextTrack.uuid);
        setContextMenuLabel(pinItem, isPinned ? 'Unpin' : 'Pin');
    }

    const trackMixItem = contextMenu.querySelector('li[data-action="track-mix"]');
    if (trackMixItem) {
        const hasMix = contextTrack.mixes && contextTrack.mixes.TRACK_MIX;
        setContextMenuItemVisible(trackMixItem, hasMix);
    }

    // Update block/unblock labels
    const { contentBlockingSettings } = await import('./storage.js');

    const blockTrackItem = contextMenu.querySelector('li[data-action="block-track"]');
    if (blockTrackItem) {
        const isBlocked = contentBlockingSettings.isTrackBlocked(contextTrack.id);
        setContextMenuLabel(
            blockTrackItem,
            isBlocked
                ? blockTrackItem.dataset.labelUnblock || 'Unblock track'
                : blockTrackItem.dataset.labelBlock || 'Block track'
        );
        blockTrackItem.classList.toggle('context-menu-danger', !isBlocked);
    }

    const blockAlbumItem = contextMenu.querySelector('li[data-action="block-album"]');
    if (blockAlbumItem) {
        const albumId = type === 'album' ? contextTrack.id : contextTrack.album?.id;
        const isBlocked = albumId ? contentBlockingSettings.isAlbumBlocked(albumId) : false;
        setContextMenuLabel(
            blockAlbumItem,
            isBlocked
                ? blockAlbumItem.dataset.labelUnblock || 'Unblock album'
                : blockAlbumItem.dataset.labelBlock || 'Block album'
        );
        blockAlbumItem.classList.toggle('context-menu-danger', !isBlocked);
    }

    const blockArtistItem = contextMenu.querySelector('li[data-action="block-artist"]');
    if (blockArtistItem) {
        const artistId = type === 'artist' ? contextTrack.id : contextTrack.artist?.id || contextTrack.artists?.[0]?.id;
        const isBlocked = artistId ? contentBlockingSettings.isArtistBlocked(artistId) : false;
        setContextMenuLabel(
            blockArtistItem,
            isBlocked
                ? blockArtistItem.dataset.labelUnblock || 'Unblock artist'
                : blockArtistItem.dataset.labelBlock || 'Block artist'
        );
        blockArtistItem.classList.toggle('context-menu-danger', !isBlocked);
    }

    // Filter items based on type
    contextMenu.querySelectorAll('li[data-action]').forEach((item) => {
        const filter = item.dataset.typeFilter;
        if (filter) {
            const types = filter.split(',');
            setContextMenuItemVisible(item, types.includes(type));
        } else {
            setContextMenuItemVisible(item, true);
        }
        if (item.dataset.action === 'request-song') {
            setContextMenuItemVisible(item, Boolean(partyManager.currentParty) && !contextTrack.isLocal);
        }
        if (item.dataset.action === 'edit-metadata') {
            setContextMenuItemVisible(item, type === 'track' && Boolean(contextTrack.isLocal));
        }
        // Canvas playback is a global preference. Keep its recovery control
        // available on track menus even when this particular track has no
        // Canvas or exposes it through a different metadata field.
        if (
            contextTrack.isLocal &&
            ['share-menu', 'open-in-new-tab', 'block-track', 'block-album', 'block-artist'].includes(
                item.dataset.action
            )
        ) {
            setContextMenuItemVisible(item, false);
        }
        if (
            contextTrack.isUnavailable &&
            ['play-next', 'add-to-queue', 'download', 'track-mix'].includes(item.dataset.action)
        ) {
            setContextMenuItemVisible(item, false);
        }

        // Update labels for Like/Save
        if (item.dataset.action === 'toggle-like') {
            const labelPrefix = isLiked ? 'labelUnlike' : 'label';
            const labelKey = `${labelPrefix}${type.charAt(0).toUpperCase() + type.slice(1).replace('User-playlist', 'Playlist')}`;
            const fallbackKey = isLiked ? 'labelUnlikeTrack' : 'labelTrack';
            const label = item.dataset[labelKey] || item.dataset[fallbackKey] || (isLiked ? 'Unlike' : 'Like');
            setContextMenuLabel(item, label);
        }
    });

    const goToAlbumItem = contextMenu.querySelector('li[data-action="go-to-album"]');
    if (goToAlbumItem) {
        const album = contextTrack.album;
        setContextMenuItemVisible(goToAlbumItem, ['track', 'video'].includes(type) && Boolean(album?.id));
        if (album) {
            const albumType = album.type?.toUpperCase();
            const trackCount = album.numberOfTracks;
            const label =
                albumType === 'SINGLE' || trackCount === 1
                    ? 'single'
                    : albumType === 'EP' || (trackCount && trackCount <= 6)
                      ? 'EP'
                      : 'album';
            setContextMenuLabel(goToAlbumItem, `Go to ${label}`);
        }
    }

    if (blockAlbumItem) {
        const albumId = type === 'album' ? contextTrack.id : contextTrack.album?.id;
        setContextMenuItemVisible(blockAlbumItem, !contextTrack.isLocal && Boolean(albumId));
    }

    if (blockArtistItem) {
        const artistId = type === 'artist' ? contextTrack.id : contextTrack.artist?.id || contextTrack.artists?.[0]?.id;
        setContextMenuItemVisible(blockArtistItem, !contextTrack.isLocal && Boolean(artistId));
    }

    // Handle multiple artists for "Go to artist"
    const artistItem = contextMenu.querySelector('li[data-action="go-to-artist"]');
    if (artistItem) {
        const artists = Array.isArray(contextTrack.artists)
            ? contextTrack.artists
            : contextTrack.artist
              ? [contextTrack.artist]
              : [];
        const canShowArtist = type === 'track' || type === 'album';

        if (artists.length > 1 && canShowArtist) {
            setContextMenuItemVisible(artistItem, true);
            setContextMenuLabel(artistItem, 'Go to artists');
            artistItem.dataset.hasMultipleArtists = 'true';
        } else {
            const hasArtist = artists.length > 0;
            setContextMenuItemVisible(artistItem, hasArtist && canShowArtist);
            artistItem.dataset.hasMultipleArtists = 'false';
            setContextMenuLabel(artistItem, artists.length > 1 ? 'Go to artists' : 'Go to artist');
            delete artistItem.dataset.artistId;
            delete artistItem.dataset.trackerSheetId;
        }
    }

    const selectedTrackCount = contextMenu._selectedTracks?.length || 0;
    if (selectedTrackCount > 1) {
        const multiSelectActions = new Set(['play-next', 'add-to-queue', 'add-to-playlist', 'download']);
        contextMenu.querySelectorAll('li[data-action]').forEach((item) => {
            if (!multiSelectActions.has(item.dataset.action)) setContextMenuItemVisible(item, false);
        });
    }

    refreshContextMenuSections(contextMenu);
}

function renderContextSubmenu(contextMenu, title, items) {
    const itemMarkup = items
        .map(
            ({ action, label, icon, data = '' }) => `
                <li role="menuitem" tabindex="-1" data-action="${action}" ${data}>
                    ${icon(18)}
                    <span class="context-menu-label">${escapeHtml(label)}</span>
                </li>`
        )
        .join('');
    contextMenu.innerHTML = `<ul role="none">
        <li role="menuitem" tabindex="-1" data-action="back-to-main-menu">
            ${SVG_LEFT_ARROW(18)}
            <span class="context-menu-label">Back</span>
        </li>
        <li class="context-menu-section" data-menu-section role="presentation"><span>${escapeHtml(title)}</span></li>
        ${itemMarkup}
    </ul>`;
    refreshContextMenuSections(contextMenu);
    prepareContextMenu(contextMenu);
}

function openShareSubmenu(contextMenu, shouldOpen, shouldFocus = false) {
    const shareItem = contextMenu.querySelector('.context-menu-share');
    const submenu = shareItem?.querySelector('.context-menu-submenu');
    if (!shareItem || !submenu) return;

    if (shouldOpen) {
        const shareRect = shareItem.getBoundingClientRect();
        const submenuWidth = submenu.offsetWidth;
        shareItem.classList.toggle('opens-left', shareRect.right + submenuWidth + 8 > window.innerWidth - 10);
    }

    shareItem.classList.toggle('is-share-open', shouldOpen);
    shareItem.setAttribute('aria-expanded', String(shouldOpen));

    if (shouldOpen && shouldFocus) {
        requestAnimationFrame(() => submenu.querySelector('li[data-action]:not([aria-hidden="true"])')?.focus());
    }
}

function playbackSourceContext(kind, item = {}, fallbackLabel = 'Now playing') {
    const normalizedKind = kind === 'user-playlist' || kind === 'mix' ? 'playlist' : kind;
    const id = item.id ?? item.uuid ?? null;
    const label = item.title || item.name || fallbackLabel;
    return {
        kind: ['playlist', 'album', 'artist', 'liked', 'radio', 'single'].includes(normalizedKind)
            ? normalizedKind
            : 'unknown',
        id: id == null ? null : String(id),
        label,
        href: normalizedKind === 'liked' ? '/favorites/tracks' : id == null ? null : `/${normalizedKind}/${id}`,
    };
}

function playbackSourceForTrackList(ui, trackItem) {
    if (window.location.pathname.startsWith('/search/')) return playbackSourceContext('single', {}, 'Search');
    const pageTitle = trackItem.closest('.page')?.querySelector('.detail-header .title')?.textContent?.trim();
    if (ui.currentPage === 'artist' && ui.currentArtistId)
        return playbackSourceContext(
            'artist',
            { id: ui.currentArtistId, name: ui.currentArtist?.name || pageTitle },
            'Artist'
        );
    const path = window.location.pathname.split('/').filter(Boolean);
    if (path[0] === 'album') {
        return playbackSourceContext('album', { id: path.at(-1), title: ui.currentAlbum?.title || pageTitle }, 'Album');
    }
    if (path[0] === 'playlist') {
        return playbackSourceContext('playlist', { id: path[1], title: pageTitle }, 'Playlist');
    }
    if (path[0] === 'favorites') return playbackSourceContext('liked', {}, 'Liked Songs');
    return playbackSourceContext(
        'unknown',
        {},
        pageTitle || trackItem.closest('.page-section')?.querySelector('h1, h2')?.textContent || 'Now playing'
    );
}

export function initializeTrackInteractions(player, api, mainContent, contextMenu, lyricsManager, ui, scrobbler) {
    let contextTrack = null;

    setupTrackSaveFloatingPanel(player, api, ui);
    setupTrackVersionPicker(player, api);

    document.addEventListener('open-current-track-context-menu', async (event) => {
        const track = event.detail?.track || player.currentTrack;
        const anchor = event.detail?.anchor;
        if (!track || !anchor) return;
        if (contextMenu._originalHTML) {
            contextMenu.innerHTML = contextMenu._originalHTML;
            contextMenu._originalHTML = null;
        }
        contextTrack = track;
        contextMenu._contextTrack = track;
        contextMenu._contextType = track.type === 'video' ? 'video' : 'track';
        contextMenu._selectedTracks = [];
        contextMenu._contextHref = null;
        await updateContextMenuLikeState(contextMenu, track);
        const rect = anchor.getBoundingClientRect();
        positionMenu(contextMenu, rect.left, rect.bottom + 5, rect);
    });

    mainContent.addEventListener('touchstart', handleTrackTouchStart, { passive: true });
    mainContent.addEventListener('touchmove', handleTrackTouchMove, { passive: true });
    mainContent.addEventListener('touchend', handleTrackTouchEnd, { passive: true });

    mainContent.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('.track-action-btn, .like-btn, .play-btn');
        if (actionBtn && actionBtn.dataset.action) {
            e.preventDefault(); // Prevent card navigation
            e.stopPropagation();
            const itemElement = actionBtn.closest('.track-item, .card');
            const action = actionBtn.dataset.action;
            const type = actionBtn.dataset.type || 'track';

            let item = itemElement ? trackDataStore.get(itemElement) : trackDataStore.get(actionBtn);

            // If no item from element (e.g. header buttons), try to get from hash
            if (!item && action === 'toggle-like') {
                const id = window.location.pathname.split('/')[2];
                if (id) {
                    try {
                        if (type === 'album') {
                            const data = await api.getAlbum(id);
                            item = data.album;
                        } else if (type === 'artist') {
                            item = await api.getArtist(id);
                        } else if (type === 'playlist') {
                            const data = await api.getPlaylist(id);
                            item = data.playlist;
                        } else if (type === 'mix') {
                            const data = await api.getMix(id);
                            item = data.mix;
                        } else if (type === 'track') {
                            const data = await api.getTrack(id);
                            item = data.track;
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }
            }

            if (item && action === 'toggle-like' && actionBtn.classList.contains('track-save-btn')) {
                const trackType = item.type === 'video' ? 'video' : 'track';
                if (await db.isFavorite(trackType, item.id)) {
                    document.dispatchEvent(new CustomEvent('track-save-panel-open', { detail: { button: actionBtn } }));
                    return;
                }
            }

            if (item) {
                await handleTrackAction(action, item, player, api, lyricsManager, type, ui, scrobbler);
            }
            return;
        }

        const cardMenuBtn = e.target.closest('.card-menu-btn, #album-menu-btn');
        if (cardMenuBtn) {
            e.stopPropagation();
            const card = cardMenuBtn.closest('.card');
            const type = cardMenuBtn.dataset.type;
            const id = cardMenuBtn.dataset.id;

            let item = card ? trackDataStore.get(card) : null;

            if (!item) {
                // Check if item is stored on the button itself (e.g., album page header menu)
                item = trackDataStore.get(cardMenuBtn);
            }

            if (!item) {
                // Fallback: create a shell item
                item = { id, uuid: id, title: card?.querySelector('.card-title')?.textContent || 'Item' };
            }

            if (contextMenu._originalHTML) {
                contextMenu.innerHTML = contextMenu._originalHTML;
                contextMenu._originalHTML = null;
            }

            contextTrack = item;
            contextMenu._contextTrack = item;
            contextMenu._contextType = type;
            contextMenu._contextHref = card?.dataset.href || null;

            await updateContextMenuLikeState(contextMenu, item);
            const rect = cardMenuBtn.getBoundingClientRect();
            positionMenu(contextMenu, rect.left, rect.bottom + 5, rect);
            return;
        }

        const menuBtn = e.target.closest('.track-menu-btn');
        if (menuBtn) {
            e.stopPropagation();
            const trackItem = menuBtn.closest('.track-item');
            if (trackItem && !trackItem.dataset.queueIndex) {
                const clickedTrack = trackDataStore.get(trackItem);

                if (clickedTrack && clickedTrack.isLocal) return;

                if (
                    contextMenu.style.display === 'block' &&
                    contextTrack &&
                    clickedTrack &&
                    contextTrack.id === clickedTrack.id
                ) {
                    if (contextMenu._originalHTML) {
                        contextMenu.innerHTML = contextMenu._originalHTML;
                    }
                    contextMenu.style.display = 'none';
                    contextMenu._contextType = null;
                    contextMenu._originalHTML = null;
                    return;
                }

                contextTrack = clickedTrack;
                if (contextTrack) {
                    if (contextMenu._originalHTML) {
                        contextMenu.innerHTML = contextMenu._originalHTML;
                        contextMenu._originalHTML = null;
                    }
                    contextMenu._contextTrack = contextTrack;
                    contextMenu._contextType = menuBtn.dataset.type || trackItem.dataset.type || 'track';
                    contextMenu._contextHref = null;
                    if (trackSelection.isSelecting && trackSelection.selectedIds.size > 0) {
                        const selectedTracks = [];
                        document.querySelectorAll('.track-item.selected').forEach((item) => {
                            const track = trackDataStore.get(item);
                            if (track) selectedTracks.push(track);
                        });
                        contextMenu._selectedTracks = selectedTracks;
                    }
                    await updateContextMenuLikeState(contextMenu, contextTrack);
                    const rect = menuBtn.getBoundingClientRect();
                    positionMenu(contextMenu, rect.left, rect.bottom + 5, rect);
                }
            }
            return;
        }

        const checkbox = e.target.closest('.track-checkbox');
        if (checkbox) {
            e.stopPropagation();
            const trackItem = checkbox.closest('.track-item');
            if (trackItem) {
                toggleTrackSelection(trackItem, isMultiSelectToggle(e), isMultiSelectRange(e));
            }
            return;
        }

        const trackItem = e.target.closest('.track-item');
        if (trackItem && trackItem.classList.contains('unavailable')) {
            return;
        }
        if (isLongPress && longPressTrackItem === trackItem) {
            return;
        }
        if (
            trackItem &&
            !trackItem.classList.contains('blocked') &&
            !trackItem.dataset.queueIndex &&
            !e.target.closest('.remove-from-playlist-btn') &&
            !e.target.closest('.artist-link') &&
            !e.target.closest('.like-btn')
        ) {
            const clickedTrackId = trackItem.dataset.trackId;
            const isSearch = window.location.pathname.startsWith('/search/');

            if (isMultiSelectToggle(e)) {
                e.preventDefault();
                toggleTrackSelection(trackItem, true, isMultiSelectRange(e));
                return;
            }

            if (isMultiSelectRange(e) && trackSelection.isSelecting) {
                e.preventDefault();
                toggleTrackSelection(trackItem, false, true);
                return;
            }

            if (trackSelection.isSelecting) {
                return;
            }

            if (isSearch) {
                const clickedTrack = trackDataStore.get(trackItem);
                if (clickedTrack) {
                    if (trackItem.dataset.type === 'video') {
                        player.playVideo(clickedTrack);
                    } else {
                        player.setQueue(
                            [clickedTrack],
                            0,
                            false,
                            playbackSourceContext('single', clickedTrack, 'Search')
                        );
                        player.enableAutoplay();
                        document.getElementById('shuffle-btn').classList.remove('active');
                        player.playTrackFromQueue();

                        const { autoplaySettings } = await import('./storage.js');
                        const fetchRecs = autoplaySettings.isSmartRecsEnabled()
                            ? (async () => {
                                  const { smartRecommendations } = await import('./smart-recommendations.js');
                                  const recs = await api.getTrackRecommendations(clickedTrack.id);
                                  if (recs && recs.length > 0) {
                                      const filtered = smartRecommendations.filterRecommendations(recs);
                                      const ranked = smartRecommendations.rankRecommendations(filtered);
                                      return ranked;
                                  }
                                  return [];
                              })()
                            : api.getTrackRecommendations(clickedTrack.id);

                        fetchRecs.then((recs) => {
                            if (recs && recs.length > 0) {
                                player.addToQueue(recs);
                            }
                        });
                    }
                }
            } else {
                const parentList = trackItem.closest('.track-list');
                const allTrackElements = Array.from(parentList.querySelectorAll('.track-item'));
                const trackList = allTrackElements.map((el) => trackDataStore.get(el)).filter(Boolean);

                if (trackList.length > 0) {
                    const startIndex = trackList.findIndex((t) => t.id == clickedTrackId);

                    player.setQueue(trackList, startIndex, false, playbackSourceForTrackList(ui, trackItem));
                    player.enableAutoplay();

                    if (ui.currentPage === 'artist' && ui.currentArtistId) {
                        player.setArtistPopularTracksContext(ui.currentArtistId, trackList, trackList.length, true);
                    }

                    document.getElementById('shuffle-btn').classList.remove('active');
                    player.playTrackFromQueue();
                }
            }
        }

        // Handle artist link clicks in track lists
        const artistLink = e.target.closest('.artist-link');
        if (artistLink) {
            e.stopPropagation();
            const artistId = artistLink.dataset.artistId;
            if (artistId) {
                navigate(`/artist/${artistId}`);
            }
            return;
        }

        const card = e.target.closest('.card');
        if (card) {
            if (e.target.closest('.edit-playlist-btn') || e.target.closest('.delete-playlist-btn')) {
                return;
            }

            const libraryTracksContainer = card.closest('#library-tracks-container');
            if (libraryTracksContainer && card.dataset.trackId) {
                if (card.classList.contains('blocked')) return;
                if (
                    e.target.closest('.like-btn') ||
                    e.target.closest('.card-play-btn') ||
                    e.target.closest('.card-menu-btn')
                ) {
                    return;
                }
                e.preventDefault();
                const clickedTrackId = card.dataset.trackId;
                const clickedTrack = trackDataStore.get(card);
                if (!clickedTrack) return;
                const allTrackElements = Array.from(libraryTracksContainer.querySelectorAll('.card[data-track-id]'));
                const trackList = allTrackElements.map((el) => trackDataStore.get(el)).filter(Boolean);
                if (trackList.length === 0) return;
                const startIndex = trackList.findIndex((t) => t.id == clickedTrackId);
                player.setQueue(trackList, startIndex, false, playbackSourceForTrackList(ui, card));
                player.enableAutoplay();
                if (ui.currentPage === 'artist' && ui.currentArtistId) {
                    player.setArtistPopularTracksContext(ui.currentArtistId, trackList, trackList.length, true);
                }
                document.getElementById('shuffle-btn').classList.remove('active');
                player.playTrackFromQueue();
                return;
            }

            const href = card.dataset.href;
            if (href) {
                // Allow native links inside card to work if any exist
                if (e.target.closest('a')) return;

                e.preventDefault();
                navigate(href);
            }
        }
    });

    mainContent.addEventListener('contextmenu', async (e) => {
        const trackItem = e.target.closest('.track-item, .queue-track-item');
        const card = e.target.closest('.card');

        if (trackItem) {
            e.preventDefault();
            if (trackItem.classList.contains('queue-track-item')) {
                // For queue items, get track from player's queue
                const queueIndex = parseInt(trackItem.dataset.queueIndex);
                contextTrack = player.getCurrentQueue()[queueIndex];
            } else {
                // For regular track items
                contextTrack = trackDataStore.get(trackItem);
            }

            if (contextTrack) {
                if (contextMenu._originalHTML) {
                    contextMenu.innerHTML = contextMenu._originalHTML;
                    contextMenu._originalHTML = null;
                }

                // Store selected tracks for multi-select actions
                let selectedTracks = [];
                if (trackSelection.isSelecting && trackSelection.selectedIds.size > 0) {
                    document.querySelectorAll('.track-item.selected').forEach((item) => {
                        const track = trackDataStore.get(item);
                        if (track) selectedTracks.push(track);
                    });
                }

                contextMenu._contextTrack = contextTrack;
                contextMenu._contextType = contextTrack.type || 'track';
                contextMenu._selectedTracks = selectedTracks;
                contextMenu._contextHref = null;
                await updateContextMenuLikeState(contextMenu, contextTrack);
                positionMenu(contextMenu, e.clientX, e.clientY);
            }
        } else if (card) {
            e.preventDefault();
            const type = card.dataset.albumId
                ? 'album'
                : card.dataset.playlistId
                  ? 'playlist'
                  : card.dataset.mixId
                    ? 'mix'
                    : card.dataset.href
                      ? card.dataset.href.split('/')[1]
                      : 'item';
            const id = card.dataset.albumId || card.dataset.playlistId || card.dataset.mixId;

            const item = trackDataStore.get(card) || {
                id,
                uuid: id,
                title: card.querySelector('.card-title')?.textContent,
            };

            if (contextMenu._originalHTML) {
                contextMenu.innerHTML = contextMenu._originalHTML;
                contextMenu._originalHTML = null;
            }

            contextTrack = item;
            contextMenu._contextTrack = item;
            contextMenu._contextType = type.replace('userplaylist', 'user-playlist');
            contextMenu._contextHref = card.dataset.href;

            await updateContextMenuLikeState(contextMenu, item);
            positionMenu(contextMenu, e.clientX, e.clientY);
        }
    });

    document.querySelector('.now-playing-bar')?.addEventListener('contextmenu', async (e) => {
        if (!player.currentTrack) return;
        const track = player.currentTrack;

        const target = e.target.closest('.cover, .title, .album, .artist');
        if (!target) return;

        e.preventDefault();
        e.stopPropagation();

        if (contextMenu._originalHTML) {
            contextMenu.innerHTML = contextMenu._originalHTML;
            contextMenu._originalHTML = null;
        }

        contextTrack = track;
        contextMenu._contextTrack = track;
        contextMenu._contextType = track.type || 'track';
        contextMenu._selectedTracks = [];
        contextMenu._contextHref = null;

        await updateContextMenuLikeState(contextMenu, track);
        positionMenu(contextMenu, e.clientX, e.clientY);
    });

    document.addEventListener('click', async (e) => {
        if (contextMenu.style.display === 'block') {
            if (contextMenu._originalHTML) {
                contextMenu.innerHTML = contextMenu._originalHTML;
            }
            contextMenu.style.display = 'none';
            contextMenu._contextType = null;
            contextMenu._originalHTML = null;
        }

        if (
            trackSelection.isSelecting &&
            !e.target.closest('.track-item') &&
            !e.target.closest('.selection-bar') &&
            !e.target.closest('.track-checkbox')
        ) {
            clearSelection();
        }
    });

    document.addEventListener('keydown', async (e) => {
        if (contextMenu.style.display === 'block' && e.key === 'Escape') {
            e.preventDefault();
            if (contextMenu._originalHTML) contextMenu.innerHTML = contextMenu._originalHTML;
            contextMenu.style.display = 'none';
            contextMenu.setAttribute('aria-hidden', 'true');
            contextMenu.classList.remove('is-opening');
            contextMenu._contextType = null;
            contextMenu._originalHTML = null;
            contextMenu._triggerElement?.focus?.({ preventScroll: true });
            return;
        }
        if (e.key === 'Escape' && trackSelection.isSelecting) {
            clearSelection();
        }
    });

    contextMenu.addEventListener('keydown', (e) => {
        const actions = [...contextMenu.querySelectorAll('li[data-action]')].filter((item) => {
            const style = getComputedStyle(item);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
        if (!actions.length) return;

        const currentIndex = actions.indexOf(document.activeElement);
        let nextIndex = currentIndex;
        if (e.key === 'ArrowRight' && document.activeElement?.matches('.context-menu-share')) {
            e.preventDefault();
            openShareSubmenu(contextMenu, true, true);
            return;
        }
        if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % actions.length;
        else if (e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + actions.length) % actions.length;
        else if (e.key === 'Home') nextIndex = 0;
        else if (e.key === 'End') nextIndex = actions.length - 1;
        else if ((e.key === 'Enter' || e.key === ' ') && currentIndex >= 0) {
            e.preventDefault();
            actions[currentIndex].click();
            return;
        } else return;

        e.preventDefault();
        actions.forEach((item) => item.classList.remove('is-keyboard-active'));
        actions[nextIndex].classList.add('is-keyboard-active');
        actions[nextIndex].focus({ preventScroll: true });
    });

    contextMenu.addEventListener('pointerover', (e) => {
        const shareItem = e.target.closest('.context-menu-share');
        if (shareItem && contextMenu.contains(shareItem)) openShareSubmenu(contextMenu, true);
    });

    contextMenu.addEventListener('pointerout', (e) => {
        const shareItem = e.target.closest('.context-menu-share');
        if (shareItem && !shareItem.contains(e.relatedTarget)) openShareSubmenu(contextMenu, false);
    });

    contextMenu.addEventListener('focusin', (e) => {
        if (e.target.closest('.context-menu-share')) openShareSubmenu(contextMenu, true);
    });

    contextMenu.addEventListener('focusout', (e) => {
        const shareItem = e.target.closest('.context-menu-share');
        if (shareItem && !shareItem.contains(e.relatedTarget)) openShareSubmenu(contextMenu, false);
    });

    contextMenu.addEventListener('click', async (e) => {
        e.stopPropagation();
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const track = contextMenu._contextTrack || contextTrack;
        const type = contextMenu._contextType || 'track';

        if (action === 'share-menu') {
            openShareSubmenu(contextMenu, true, true);
            return;
        }

        if (action === 'go-to-artists' || (action === 'go-to-artist' && target.dataset.hasMultipleArtists === 'true')) {
            const artists = Array.isArray(track.artists) ? track.artists : track.artist ? [track.artist] : [];
            if (artists.length > 1) {
                // Save original HTML if not already saved
                if (!contextMenu._originalHTML) {
                    contextMenu._originalHTML = contextMenu.innerHTML;
                }

                renderContextSubmenu(
                    contextMenu,
                    'Choose artist',
                    artists.map((artist) => ({
                        action: 'go-to-artist',
                        label: artist.name || 'Unknown Artist',
                        icon: SVG_USER,
                        data: `data-artist-id="${escapeHtml(String(artist.id))}"`,
                    }))
                );
                return;
            }
        }

        if (action === 'back-to-main-menu') {
            if (contextMenu._originalHTML) {
                contextMenu.innerHTML = contextMenu._originalHTML;
                contextMenu._originalHTML = null;
                // Re-update like state since we replaced the HTML
                await updateContextMenuLikeState(contextMenu, track);
                prepareContextMenu(contextMenu);
            }
            return;
        }

        if (action === 'share-social' && track) {
            const shareType = ['track', 'album', 'artist'].includes(type) ? type : 'track';
            socialManager.prepareShare(shareType, track);
            navigate('/social');
        } else if (action && track) {
            const selectedTracks = contextMenu._selectedTracks || [];
            const isMultiSelect = selectedTracks.length > 1;

            if (isMultiSelect) {
                // Handle multi-select actions
                switch (action) {
                    case 'play-next':
                        selectedTracks.forEach((t) => {
                            player.addNextToQueue(t);
                        });
                        if (window.renderQueueFunction) await window.renderQueueFunction();
                        showNotification(`Playing next: ${selectedTracks.length} tracks`);
                        clearSelection();
                        break;
                    case 'add-to-queue':
                        player.addToQueue(selectedTracks);
                        if (window.renderQueueFunction) await window.renderQueueFunction();
                        showNotification(`Added ${selectedTracks.length} tracks to queue`);
                        clearSelection();
                        break;
                    case 'toggle-like':
                        selectedTracks.forEach(async (t) => {
                            const added = await db.toggleFavorite('track', t);
                            await syncManager.syncLibraryItem('track', t, added);
                        });
                        showNotification(`Liked ${selectedTracks.length} tracks`);
                        clearSelection();
                        break;
                    case 'add-to-playlist':
                        await showMultiSelectPlaylistModal(selectedTracks);
                        clearSelection();
                        break;
                    case 'download':
                        showNotification(`Downloading ${selectedTracks.length} tracks`);
                        clearSelection();
                        for (const track of selectedTracks) {
                            await downloadTrackWithMetadata(
                                track,
                                downloadQualitySettings.getQuality(),
                                api,
                                lyricsManager
                            );
                        }
                        break;
                    default:
                        clearSelection();
                        break;
                }
            } else {
                await handleTrackAction(action, track, player, api, lyricsManager, type, ui, scrobbler, target.dataset);
            }
        }

        // Reset menu state before closing
        if (contextMenu._originalHTML) {
            contextMenu.innerHTML = contextMenu._originalHTML;
            contextMenu._originalHTML = null;
        }
        contextMenu.style.display = 'none';
        contextMenu.setAttribute('aria-hidden', 'true');
        contextMenu.classList.remove('is-opening');
        contextMenu._contextType = null;
        contextMenu._selectedTracks = null;
        contextMenu._contextHref = null;
    });

    // Now playing bar interactions
    document.querySelector('.now-playing-bar .title').addEventListener('click', (event) => {
        if (!event.target.closest('.now-playing-title-link')) return;
        const track = player.currentTrack;
        const displayAlbum = getTrackDisplayAlbum(track);
        if (displayAlbum?.id) {
            navigate(`/album/${displayAlbum.id}`);
        }
    });

    document.querySelector('.now-playing-bar .album').addEventListener('click', () => {
        const track = player.currentTrack;
        const displayAlbum = getTrackDisplayAlbum(track);
        if (displayAlbum?.id) {
            navigate(`/album/${displayAlbum.id}`);
        }
    });

    document.querySelector('.now-playing-bar .artist').addEventListener('click', (e) => {
        const link = e.target.closest('button.artist-link');
        if (link) {
            e.stopPropagation();
            const artistId = link.dataset.artistId;
            if (artistId) {
                navigate(`/artist/${artistId}`);
            }
        }
    });

    const nowPlayingLikeBtn = document.getElementById('now-playing-like-btn');
    if (nowPlayingLikeBtn) {
        nowPlayingLikeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (player.currentTrack) {
                const trackType = player.currentTrack.type === 'video' ? 'video' : 'track';
                if (await db.isFavorite(trackType, player.currentTrack.id)) {
                    document.dispatchEvent(
                        new CustomEvent('track-save-panel-open', { detail: { button: nowPlayingLikeBtn } })
                    );
                    return;
                }
                await handleTrackAction(
                    'toggle-like',
                    player.currentTrack,
                    player,
                    api,
                    lyricsManager,
                    trackType,
                    ui,
                    scrobbler
                );
            }
        });
    }

    const nowPlayingMixBtn = document.getElementById('now-playing-mix-btn');
    const compactMixBtn = document.getElementById('compact-mix-btn');
    if (nowPlayingMixBtn) {
        nowPlayingMixBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (player.currentTrack) {
                await handleTrackAction(
                    'track-mix',
                    player.currentTrack,
                    player,
                    api,
                    lyricsManager,
                    'track',
                    ui,
                    scrobbler
                );
            }
        });
    }
    compactMixBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        nowPlayingMixBtn?.click();
    });
}

function showSleepTimerPopover(player, trigger) {
    const popover = document.getElementById('sleep-timer-popover');
    if (!popover || !trigger) return;

    let closeTimer = 0;
    const closePopover = () => {
        popover.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        window.clearTimeout(closeTimer);
        closeTimer = window.setTimeout(() => {
            popover.hidden = true;
            cleanup();
        }, 180);
    };

    const handleOptionClick = (e) => {
        if (e.target.closest('#cancel-sleep-timer')) {
            closePopover();
            return;
        }
        const timerOption = e.target.closest('.timer-option');
        if (timerOption) {
            let minutes;
            if (timerOption.id === 'custom-timer-btn') {
                const customInput = document.getElementById('custom-minutes');
                minutes = parseInt(customInput.value);
                if (!minutes || minutes < 1) {
                    showNotification('Please enter a valid number of minutes');
                    return;
                }
            } else {
                minutes = parseInt(timerOption.dataset.minutes);
            }

            if (minutes) {
                player.setSleepTimer(minutes);
                showNotification(`Sleep timer set for ${minutes} minute${minutes === 1 ? '' : 's'}`);
                closePopover();
            }
        }
    };

    const handlePointerDown = (e) => {
        if (!popover.contains(e.target) && !trigger.contains(e.target)) closePopover();
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') closePopover();
    };

    const cleanup = () => {
        popover.removeEventListener('click', handleOptionClick);
        document.removeEventListener('pointerdown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('resize', reposition);
    };
    const reposition = () => positionPlayerPopover(popover, getRectSnapshot(trigger), 340);

    popover.addEventListener('click', handleOptionClick);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', reposition);
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    reposition();
    requestAnimationFrame(() => popover.classList.add('is-open'));
}
