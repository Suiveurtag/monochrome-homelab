//js/events.js
import { selectionModifierMatches } from './keyboard-shortcuts.js';
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
import { setupTrackSavePanel } from './track-save-panel.js';
import { setupSleepNightfall, playSleepDoze } from './sleep-nightfall.js';
import {
    lastFMStorage,
    libreFmSettings,
    listenBrainzSettings,
    waveformSettings,
    keyboardShortcuts,
    sleepTimerSettings,
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
    SVG_INFORMATION_CIRCLE,
    SVG_LEFT_ARROW,
    SVG_MUTE,
    SVG_QUALITY_CD,
    SVG_QUALITY_VINYL,
    SVG_QUALITY_WAVE_SAW,
    SVG_QUALITY_WAVE_SINE,
    SVG_QUALITY_WAVE_SQUARE,
    SVG_QUALITY_WAVES_ELECTRICITY,
    SVG_REPEAT,
    SVG_SETTINGS,
    SVG_SHUFFLE,
    SVG_VOLUME,
    SVG_VOLUME_1,
    SVG_USER,
} from './icons.js';
import { MusicAPI } from './music-api.js';
import { LyricsManager } from './lyrics.js';
import { createScrubLyrics } from './scrub-lyrics.js';
import { Player } from './player.js';
import { playerBarEffects } from './player-bar-effects.js';
import { createElasticVolume } from './elastic-volume.js';
import { initializePlayerActionLayout, PLAYER_ACTIONS } from './player-bar-layout.js';
import { canvasSettings } from './canvas-settings.js';
import { setupTrackVersionPicker } from './track-version-picker.js';
import { getPlayerPopoverFrames, PLAYER_POPOVER_OPEN } from './player-popover-motion.js';
import { setupShuffleModePicker } from './shuffle-mode-picker.js';
import { getShuffleMode } from './recommendation-settings.js';
import { getTrackDisplayAlbum } from './track-versions.js';
import { PLAYBACK_QUALITY_OPTIONS, SANA_QUALITY } from './player-quality.js';

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
    return selectionModifierMatches(e, keyboardShortcuts.getShortcutForAction('multiSelectToggle'));
}

function isMultiSelectRange(e) {
    return selectionModifierMatches(e, keyboardShortcuts.getShortcutForAction('multiSelectRange'));
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

let elasticVolume = null;
const VOLUME_ICONS = { mute: SVG_MUTE, low: SVG_VOLUME_1, high: SVG_VOLUME };

// Three icon states follow the level; the SVG is only replaced when the state changes, so dragging
// the slider doesn't rebuild it every frame and the icon can animate the change.
const syncVolumeIcon = (level) => {
    if (!volumeBtn) return;
    const state = level <= 0 ? 'mute' : level < 0.5 ? 'low' : 'high';
    if (volumeBtn.dataset.volumeState === state) return;
    volumeBtn.dataset.volumeFrom = volumeBtn.dataset.volumeState || '';
    volumeBtn.dataset.volumeState = state;
    volumeBtn.innerHTML = VOLUME_ICONS[state](20);
};

const updateVolumeUI = () => {
    const activeEl = Player.instance.activeElement;
    const { muted } = activeEl;
    const volume = Player.instance.userVolume;
    const level = muted ? 0 : volume;
    syncVolumeIcon(level);
    volumeFill.style.setProperty('--volume-level', `${level * 100}%`);
    _volumeBar?.style.setProperty('--volume-level', `${level * 100}%`);
    if (elasticVolume) {
        elasticVolume.sync(level);
        return;
    }
    volumeFill.style.width = `${level * 100}%`;
    const slider = document.getElementById('volume-slider');
    if (slider) slider.value = String(level * 100);
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
    // Width first: the height depends on it, and on first open it was still unset.
    panel.style.width = `${width}px`;
    const panelHeight = panel.offsetHeight || 360;
    const left = Math.min(
        Math.max(gutter, triggerRect.left + triggerRect.width / 2 - width / 2),
        window.innerWidth - width - gutter
    );
    const fitsAbove = triggerRect.top - panelHeight - gutter > gutter;
    const top = fitsAbove
        ? triggerRect.top - panelHeight - 14
        : Math.min(triggerRect.bottom + 14, window.innerHeight - panelHeight - gutter);

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
    let iconAnimationTimer = 0;
    let sanaUnlocked = false;
    let secretKeys = '';
    let lastTriggerRect = null;
    let lastTriggerRadius = '999px';
    const backdrop = document.createElement('div');
    backdrop.className = 'quality-floating-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    panel.before(backdrop);

    const qualityVisuals = {
        auto: { rgb: '148 163 184', icon: SVG_SETTINGS(20) },
        SANA: { rgb: '255 65 75', icon: SVG_QUALITY_WAVE_SQUARE(20) },
        LOWEST: { rgb: '148 163 184', icon: SVG_QUALITY_WAVE_SINE(20) },
        LOW: { rgb: '96 165 250', icon: SVG_QUALITY_WAVE_SQUARE(20) },
        NORMAL: { rgb: '168 85 247', icon: SVG_QUALITY_WAVE_SAW(20) },
        HIGH: { rgb: '249 115 22', icon: SVG_QUALITY_WAVES_ELECTRICITY(20) },
        LOSSLESS: { rgb: '45 212 191', icon: SVG_QUALITY_CD(20) },
        HI_RES_LOSSLESS: { rgb: '244 191 84', icon: SVG_QUALITY_VINYL(22) },
    };

    // Disc/record rotation driven by momentum: ω relaxes exponentially toward a cruise speed,
    // so a new kick, a deselect or a close/reopen always continues from the current angle and speed.
    const SPIN = {
        LOSSLESS: { kick: 1500, friction: 2.6, cruise: 0, target: (icon) => icon.querySelector('svg') },
        HI_RES_LOSSLESS: { kick: 1900, friction: 1.7, cruise: 60, target: (icon) => icon.querySelector('svg .record') },
    };
    const spinStates = {};
    let spinFrame = 0;
    const spinNow = (profile, now = performance.now()) => {
        const s = spinStates[profile] || { theta: 0, omega: 0, target: 0, k: SPIN[profile].friction, t0: now };
        const dt = (now - s.t0) / 1000;
        const decay = Math.exp(-s.k * dt);
        return {
            theta: s.theta + s.target * dt + ((s.omega - s.target) / s.k) * (1 - decay),
            omega: s.target + (s.omega - s.target) * decay,
        };
    };
    const setSpin = (profile, { kick = 0, cruising = false }) => {
        const now = performance.now();
        const cfg = SPIN[profile];
        const cur = spinNow(profile, now);
        const target = cruising ? cfg.cruise : 0;
        let omega = cur.omega + kick;
        // A free-spinning disc coasts to an upright rest instead of stopping at a random angle.
        if (target === 0 && omega > 1) {
            const end = cur.theta + omega / cfg.friction;
            omega = Math.max(omega, (Math.ceil(end / 360) * 360 - cur.theta) * cfg.friction);
        }
        spinStates[profile] = { theta: cur.theta % 360, omega, target, k: cfg.friction, t0: now };
    };
    const tickSpin = () => {
        spinFrame = 0;
        if (panel.hidden) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let active = false;
        for (const profile of Object.keys(SPIN)) {
            const icon = panel.querySelector(`.quality-radio-option[data-quality-profile="${profile}"] .quality-tier-icon`);
            const el = icon && SPIN[profile].target(icon);
            const { theta, omega } = spinNow(profile);
            const s = spinStates[profile];
            if (!s || reduce) continue;
            const settled = s.target === 0 && Math.abs(omega) < 0.4;
            if (settled) {
                spinStates[profile] = { theta: 0, omega: 0, target: 0, k: s.k, t0: performance.now() };
                if (el) el.style.transform = '';
                continue;
            }
            if (el) el.style.transform = `rotate(${theta % 360}deg)`;
            active = true;
        }
        if (active) spinFrame = requestAnimationFrame(tickSpin);
    };
    const startSpinLoop = () => {
        if (!spinFrame) spinFrame = requestAnimationFrame(tickSpin);
    };
    // After every render: resume from the stored angle/speed; the selected record keeps cruising.
    const syncSpinToPanel = (selectedProfile) => {
        for (const profile of Object.keys(SPIN)) {
            const wantsCruise = profile === selectedProfile && SPIN[profile].cruise > 0;
            if (spinStates[profile] && (spinStates[profile].target !== 0) !== wantsCruise) setSpin(profile, { cruising: wantsCruise });
            else if (!spinStates[profile] && wantsCruise) setSpin(profile, { cruising: true });
        }
        startSpinLoop();
    };

    const getConnectionMessage = (state) => {
        if (state.requested === 'SANA') return 'Deliberately degraded, low-bitrate sound. Nothing is added on top.';
        const effectiveLabel =
            state.options.find((option) => option.id === state.effective)?.label || 'a lower quality';
        if (state.fallbackReason) {
            return `${escapeHtml(state.fallbackReason)}. Playing at ${escapeHtml(effectiveLabel)} for now.`;
        }
        if (state.availability?.maxLossyQuality) {
            const sourceLimit = state.options.find((option) => option.id === state.availability.maxLossyQuality)?.label || effectiveLabel;
            return state.requested === 'auto'
                ? `Auto is using ${escapeHtml(effectiveLabel)}; this lossy file is limited to ${escapeHtml(sourceLimit)}.`
                : `This file is lossy, so playback is limited to ${escapeHtml(sourceLimit)} to avoid claiming lossless quality.`;
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

    const playLosslessMagic = (profile) => {
        const magicClass = profile === 'HI_RES_LOSSLESS' ? 'is-vinyl-magic' : 'is-lossless-magic';
        window.clearTimeout(losslessMagicTimer);
        panel.classList.remove('is-lossless-magic', 'is-vinyl-magic');
        void panel.offsetWidth;
        panel.classList.add(magicClass);
        losslessMagicTimer = window.setTimeout(() => panel.classList.remove(magicClass), profile === 'HI_RES_LOSSLESS' ? 2200 : 720);
    };

    // Replays the per-tier icon animation on the freshly selected row.
    const playIconAnimation = (option) => {
        window.clearTimeout(iconAnimationTimer);
        panel.querySelectorAll('.is-just-selected').forEach((el) => el.classList.remove('is-just-selected'));
        void option.offsetWidth;
        option.classList.add('is-just-selected');
        // Wave icons carry their own SMIL animation; Sana keeps its looping CSS one.
        if (option.dataset.qualityProfile !== 'SANA') {
            option
                .querySelectorAll('.quality-tier-icon animate, .quality-tier-icon animateTransform')
                .forEach((node) => node.beginElement?.());
        }
        iconAnimationTimer = window.setTimeout(() => option.classList.remove('is-just-selected'), 2200);
    };

    // Cut a pill-shaped hole in the blurred backdrop so only the quality badge stays sharp.
    const updateBackdropHole = (rect = lastTriggerRect) => {
        if (!rect) return;
        const pad = 2;
        const x = rect.left - pad;
        const y = rect.top - pad;
        const w = rect.width + pad * 2;
        const h = rect.height + pad * 2;
        const r = Math.min(h / 2, w / 2);
        const W = window.innerWidth;
        const H = window.innerHeight;
        backdrop.style.clipPath =
            `path(evenodd, "M0 0H${W}V${H}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
            `H${x + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z")`;
    };

    // The badge changes width with the selected tier: follow its rect every frame while open.
    let holeFrame = 0;
    let holeKey = '';
    const trackBadgeHole = () => {
        cancelAnimationFrame(holeFrame);
        const tick = () => {
            if (panel.hidden) return;
            const rect = getRectSnapshot(getCurrentTrigger());
            const key = rect ? `${rect.left}|${rect.top}|${rect.width}|${rect.height}` : '';
            if (rect && key !== holeKey) {
                holeKey = key;
                lastTriggerRect = rect;
                updateBackdropHole(rect);
            }
            holeFrame = requestAnimationFrame(tick);
        };
        holeKey = '';
        holeFrame = requestAnimationFrame(tick);
    };
    const stopBadgeHole = () => cancelAnimationFrame(holeFrame);

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
            if (!panel.hidden) updateBackdropHole(currentRect);
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

        playIconAnimation(next);
        if (profile.endsWith('LOSSLESS')) playLosslessMagic(profile);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
            for (const other of Object.keys(SPIN)) {
                if (other === profile) setSpin(other, { kick: SPIN[other].kick, cruising: SPIN[other].cruise > 0 });
                else if (spinStates[other]) setSpin(other, { cruising: false });
            }
            startSpinLoop();
        }

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

    const getFloatingPanelFrames = (triggerRect = lastTriggerRect) =>
        getPlayerPopoverFrames(panel.getBoundingClientRect(), triggerRect);

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
        stopBadgeHole();
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
        const isAuto = state.requested === 'auto';
        const selectedProfile = !isAuto && (state.requested === 'SANA' || state.options.some((option) => option.id === state.requested))
            ? state.requested
            : state.effective;
        const choices = [
            ...(sanaUnlocked || state.requested === 'SANA' ? [SANA_QUALITY] : []),
            ...(state.allOptions || PLAYBACK_QUALITY_OPTIONS),
        ];
        panel.innerHTML = `
            <div class="player-popover-header">
                <h3 id="quality-popover-title">Playback quality</h3>
                <label class="quality-auto-toggle" title="Adjusts to the track and your connection">
                    <span class="quality-auto-label">Auto</span>
                    <span class="toggle-switch">
                        <input type="checkbox" role="switch" name="playback-quality-auto" ${isAuto ? 'checked' : ''}
                            aria-label="Automatic quality, adjusts to the track and your connection" />
                        <span class="slider"></span>
                    </span>
                </label>
            </div>
            <div class="quality-radio-group" role="radiogroup" aria-label="Playback quality">
                <span class="quality-selection-indicator" aria-hidden="true"></span>
                ${choices
                    .map((option) => {
                        const isAvailable = option.id === 'SANA' || state.options.some((available) => available.id === option.id);
                        const isSelected = option.id === selectedProfile;
                        const visual = qualityVisuals[option.id] || qualityVisuals.auto;
                        return `
                            <label class="quality-radio-option ${isSelected ? 'is-selected' : ''} ${!isAvailable ? 'is-unavailable' : ''} ${
                                option.id === 'SANA' ? 'is-sana' : option.id === 'LOSSLESS' ? 'is-lossless is-cd' : option.id === 'HI_RES_LOSSLESS' ? 'is-lossless is-vinyl' : ''
                            }"
                                data-quality-profile="${option.id}"
                                data-tier-rgb="${visual.rgb}"
                                style="--quality-tier-rgb: ${visual.rgb}">
                                <input type="radio" name="playback-quality" value="${option.id}" ${
                                    isSelected ? 'checked' : ''
                                } ${!isAvailable ? `disabled aria-label="${escapeHtml(option.label)} unavailable for this source"` : ''} />
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
        syncSpinToPanel(isAuto ? null : selectedProfile);
    };
    const open = (badge) => {
        const run = ++animationRun;
        secretKeys = '';
        trigger = badge;
        lastTriggerRect = getRectSnapshot(badge);
        if (!lastTriggerRect) return;
        lastTriggerRadius = getComputedStyle(badge).borderRadius || '999px';
        render();
        updateBackdropHole(lastTriggerRect);
        trackBadgeHole();
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
        panelAnimation = panel.animate([collapsed, expanded], PLAYER_POPOVER_OPEN);
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
        const input = event.target.closest('input[name="playback-quality"], input[name="playback-quality-auto"]');
        if (!input || qualityChangeInFlight) return;
        const isAutoSwitch = input.name === 'playback-quality-auto';
        // Switching Auto off keeps the tier it was playing; switching it on lets the player choose.
        const nextProfile = isAutoSwitch ? (input.checked ? 'auto' : player.getQualityState().effective) : input.value;
        const run = ++selectionRun;
        qualityChangeInFlight = true;
        const group = panel.querySelector('.quality-radio-group');
        group?.setAttribute('aria-busy', 'true');
        panel.querySelectorAll('input[name^="playback-quality"]').forEach((radio) => {
            radio.disabled = true;
        });
        try {
            if (!isAutoSwitch) void animateSelection(nextProfile);
            await player.selectPlaybackQuality(nextProfile);
            if (run !== selectionRun || panel.hidden) return;
            const state = player.getQualityState();
            const autoSwitch = panel.querySelector('input[name="playback-quality-auto"]');
            if (autoSwitch) autoSwitch.checked = state.requested === 'auto';
            if (state.requested === 'auto') void animateSelection(state.effective);
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
                panel.querySelectorAll('input[name^="playback-quality"]').forEach((radio) => {
                    radio.disabled = radio.closest('.is-unavailable') !== null;
                });
            }
        }
    });
    const moveQualitySelection = (direction) => {
        if (qualityChangeInFlight) return;
        const inputs = [...panel.querySelectorAll('input[name="playback-quality"]:not(:disabled)')];
        if (!inputs.length) return;
        const currentIndex = inputs.findIndex((input) => input.checked);
        const nextIndex = Math.min(
            inputs.length - 1,
            Math.max(0, (currentIndex === -1 ? 0 : currentIndex) + direction)
        );
        const nextInput = inputs[nextIndex];
        if (!nextInput || nextInput.checked) {
            nextInput?.focus({ preventScroll: true });
            return;
        }
        nextInput.focus({ preventScroll: true });
        nextInput.click();
    };
    document.addEventListener('pointerdown', (event) => {
        if (panel.hidden || panel.contains(event.target) || getCurrentTrigger()?.contains(event.target)) return;
        close();
    });
    document.addEventListener('keydown', (event) => {
        if (panel.hidden) return;
        if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.length === 1) {
            secretKeys = (secretKeys + event.key.toLowerCase()).slice(-4);
            if (secretKeys === 'sana' && !sanaUnlocked) {
                sanaUnlocked = true;
                render();
                positionPlayerPopover(panel, refreshTriggerRect(), 420);
                syncSelectionIndicator();
                panel.querySelector('[value="SANA"]')?.focus({ preventScroll: true });
                return;
            }
            if ('sana'.startsWith(secretKeys)) return;
            secretKeys = '';
        }
        if (event.key === 'Escape') {
            close({ restoreFocus: true });
            return;
        }
        if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
            event.preventDefault();
            moveQualitySelection(1);
            return;
        }
        if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'z') {
            event.preventDefault();
            moveQualitySelection(-1);
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
    if (!bar || !status || !message) return () => {};

    // The status floats above the bar and only appears when something deserves attention: a load or a
    // recovery that drags on shows after a grace delay, errors and confirmations show right away, and a
    // healthy or idle player shows nothing.
    const SHOW_DELAY = { loading: 2500, recovering: 1500 };
    let successTimer = 0;
    let showTimer = 0;
    const setStatus = ({ state = 'ready', message: nextMessage = '', actions = [] } = {}) => {
        window.clearTimeout(successTimer);
        window.clearTimeout(showTimer);
        bar.dataset.playerState = state;
        status.dataset.state = state;
        if (nextMessage) message.textContent = nextMessage;
        status.querySelectorAll('[data-player-recovery]').forEach((button) => {
            button.hidden = !actions.includes(button.dataset.playerRecovery);
            button.disabled = false;
        });
        if (state === 'ready' || state === 'idle') {
            status.classList.remove('is-visible');
        } else if (!status.classList.contains('is-visible')) {
            const delay = SHOW_DELAY[state] ?? 0;
            if (delay) {
                showTimer = window.setTimeout(() => {
                    // The status can outlive the problem (events fired before it was set): if audio is
                    // actually playing by now, there is nothing to report.
                    const element = player.activeElement;
                    if (element && !element.paused && !element.seeking && element.readyState >= 3) {
                        setStatus({ state: 'ready' });
                        return;
                    }
                    status.classList.add('is-visible');
                }, delay);
            }
            else status.classList.add('is-visible');
        }
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
                Player.instance.addToQueue(selectedTracks, { userInitiated: true });
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
    const { initializeListeningSync } = await import('./listening-sync.js');
    initializeListeningSync(listeningTracker);

    let _previousTrackId = null;

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
            const sequence = player.playbackSequence;

            if (!audioContextManager.isReady()) {
                audioContextManager.init(element);
            }
            await audioContextManager.resume();
            if (player.activeElement !== element || player.playbackSequence !== sequence || element.paused) return;
            audioContextManager.fadePlaybackIn(230);

            if (player.currentTrack) {
                const currentId = String(player.currentTrack.id);
                if (
                    currentId !== _previousTrackId ||
                    listeningTracker.getSessionSignals().currentTrackId !== currentId
                ) {
                    if (_previousTrackId !== null) {
                        const completedByCrossfade = player.isCrossfadeTransitionFrom(_previousTrackId);
                        if (completedByCrossfade) {
                            listeningTracker.onTrackEnd();
                        } else {
                            listeningTracker.onSkip();
                        }
                        listeningTracker.forceFlush();
                    }
                    _previousTrackId = currentId;
                    historyLoggedTrackId = null;
                    listeningTracker.onTrackStart(player.currentTrack);
                    listeningTracker.onSeek(element.currentTime);
                }

                if (scrobbler.isAuthenticated()) {
                    scrobbler.updateNowPlaying(player.currentTrack);
                }

                await updateWaveform();
            }

            listeningTracker.onSeek(element.currentTime);
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
            listeningTracker.onTimeUpdate(element.currentTime, element.duration, { playbackRate: element.playbackRate });
            listeningTracker.forceFlush();
            clearBufferingFallback();
            playerBarEffects.setPlaying(false);
            player.updateMediaSessionPlaybackState();
            player.updateMediaSessionPositionState();
        });

        element.addEventListener('ended', () => {
            if (player.activeElement !== element) return;
            if (player.isTransitionInFlight?.()) return;
            listeningTracker.onTimeUpdate(element.currentTime, element.duration, { playbackRate: element.playbackRate });
            listeningTracker.onTrackEnd();
            listeningTracker.forceFlush();
            _previousTrackId = null;
            if (player.consumeSleepTimerAtTrackEnd()) return;
            void player.playNext(0, { preserveGestureToken: true });
        });

        element.addEventListener('seeking', () => {
            if (player.activeElement === element) listeningTracker.onSeek(element.currentTime);
        });
        element.addEventListener('timeupdate', async () => {
            if (player.activeElement !== element) return;

            const { currentTime, duration } = element;
            if (duration) {
                const progressFill = document.getElementById('progress-fill');
                const currentTimeEl = document.getElementById('current-time');
                const progressBar = document.getElementById('progress-bar');
                // While scrubbing, playback continues but the thumb follows the pointer.
                if (!progressBar?.classList.contains('is-scrubbing')) {
                    progressFill.style.width = `${(currentTime / duration) * 100}%`;
                    currentTimeEl.textContent = formatTime(currentTime);
                }
                progressBar?.setAttribute('aria-valuemax', String(Math.round(duration)));
                progressBar?.setAttribute('aria-valuenow', String(Math.round(currentTime)));
                progressBar?.setAttribute('aria-valuetext', `${formatTime(currentTime)} of ${formatTime(duration)}`);

                if (!element.paused && !element.seeking) listeningTracker.onTimeUpdate(currentTime, duration, { playbackRate: element.playbackRate });
                void player.startCrossfadeIfNeeded(element);
                void player.startGaplessIfNeeded(element);

                if (listeningTracker.getSessionSignals().accumulatedPlayTime >= 30 && player.currentTrack && player.currentTrack.id !== historyLoggedTrackId) {
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
        const real = active && getShuffleMode() === 'real';
        shuffleBtn.classList.toggle('active', active);
        shuffleBtn.classList.toggle('is-real-shuffle', real);
        shuffleBtn.setAttribute('aria-pressed', String(active));
        shuffleBtn.title = real ? 'Real Random shuffle on' : active ? 'Shuffle on' : 'Shuffle off';
        shuffleBtn.setAttribute('aria-label', real ? 'Turn off Real Random shuffle' : active ? 'Turn shuffle off' : 'Turn shuffle on');
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
    setupShuffleModePicker(player, shuffleBtn);
    window.addEventListener('player-queue-changed', syncShuffleButton);
    window.addEventListener('shuffle-mode-changed', syncShuffleButton);

    shuffleBtn.addEventListener('click', async () => {
        await hapticLight();
        await player.toggleShuffle();
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

    setupSleepTimer(player, [sleepTimerBtnDesktop, sleepTimerBtnMobile]);

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
            activeEl.muted = !activeEl.muted;
            localStorage.setItem('muted', activeEl.muted);

            [...player.getAudioElements(), player.video].filter(Boolean).forEach((element) => {
                element.muted = activeEl.muted;
            });

            updateVolumeUI();
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
    let isAdjustingVolume = false;
    let lastSeekPosition = 0;

    const scrubLyrics = createScrubLyrics({
        anchor: progressBar.closest('.progress-track-shell') || progressBar,
        getTrack: () => player.currentTrack,
    });
    const scrubDuration = () => {
        const duration = player.activeElement?.duration;
        return Number.isFinite(duration) && duration > 0 ? duration : player.currentTrack?.duration || 0;
    };

    const volumeDragValue = document.getElementById('volume-drag-value');
    const showVolumeDragValue = (fraction) => {
        if (!volumeDragValue) return;
        const rect = volumeBar.getBoundingClientRect();
        const rowRect = volumeDragValue.offsetParent?.getBoundingClientRect();
        if (!rowRect) return;
        volumeDragValue.textContent = `${Math.round(fraction * 100)}%`;
        volumeDragValue.style.left = `${rect.left - rowRect.left + fraction * rect.width}px`;
    };

    if (volumeSlider) {
        let volumeFrame = 0;
        let pendingVolume = player.userVolume;
        const commitVolume = () => {
            volumeFrame = 0;
            const activeEl = player.activeElement;
            if (activeEl.muted) {
                activeEl.muted = false;
                const inactiveEl = player.currentTrack?.type === 'video' ? player.audio : player.video;
                if (inactiveEl) inactiveEl.muted = false;
                localStorage.setItem('muted', 'false');
            }
            player.setVolume(pendingVolume);
            volumeBar.style.setProperty('--volume-level', `${pendingVolume * 100}%`);
            syncVolumeIcon(pendingVolume);
        };
        elasticVolume = createElasticVolume({
            bar: volumeBar,
            fill: volumeFill,
            input: volumeSlider,
            startIcon: volumeBtn,
            pushed: [volumeBar.closest('.volume-controls')?.querySelector('.player-actions-row')].filter(Boolean),
            onInput: (fraction) => {
                pendingVolume = fraction;
                showVolumeDragValue(fraction);
                if (!volumeFrame) volumeFrame = requestAnimationFrame(commitVolume);
            },
        });
        const activeEl = player.activeElement;
        elasticVolume.jump(activeEl?.muted ? 0 : player.userVolume);
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
        scrubLyrics.prefetch();
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
        isSeeking = true;
        progressBar.classList.add('is-scrubbing');

        seek(progressBar, e, (position) => {
            lastSeekPosition = position;
            updateSeekUI(position);
            scrubLyrics.start(position * scrubDuration());
        });
    });

    // Touch events for mobile
    progressBar.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isSeeking = true;
        progressBar.classList.add('is-scrubbing');

        const touch = e.touches[0];
        const rect = progressBar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));

        lastSeekPosition = position;
        updateSeekUI(position);
        scrubLyrics.start(position * scrubDuration());
    });

    document.addEventListener('mousemove', (e) => {
        if (isSeeking) {
            seek(progressBar, e, (position) => {
                lastSeekPosition = position;
                updateSeekUI(position);
                scrubLyrics.update(position * scrubDuration());
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
            scrubLyrics.update(position * scrubDuration());
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
            }
            isSeeking = false;
            progressBar.classList.remove('is-scrubbing');
            scrubLyrics.end();
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
            }
            isSeeking = false;
            progressBar.classList.remove('is-scrubbing');
            scrubLyrics.end();
        }

        if (isAdjustingVolume) {
            isAdjustingVolume = false;
        }
    });

    document.addEventListener('touchcancel', () => {
        if (!isSeeking) return;
        isSeeking = false;
        progressBar.classList.remove('is-scrubbing');
        scrubLyrics.end();
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
            updateVolumeUI();
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
            updateVolumeUI();
        },
        { passive: false }
    );
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

    if (action === 'start-radio' || action === 'start-infinite-radio') {
        let tracks = [];
        if (type === 'track') {
            tracks = [item];
        } else if (item.tracks) {
            tracks = item.tracks;
        } else if (type === 'album') {
            const data = await api.getAlbum(item.id);
            tracks = data.tracks;
        } else if (type === 'artist') {
            const artist = await api.getArtist(item.id);
            tracks = artist.tracks || [];
        } else if (type === 'playlist') {
            const data = await api.getPlaylist(item.uuid);
            tracks = data.tracks;
        } else if (type === 'user-playlist') {
            const playlist = await db.getPlaylist(item.id);
            tracks = playlist ? playlist.tracks : [];
        }

        if (tracks.length > 0) {
            await player.enableRadio(tracks, playbackSourceContext('radio', item, `${item.title || item.name} Radio`));
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
                player.addToQueue(tracks, { userInitiated: true });
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
                const { shuffleTracks } = await import('./recommendation-settings.js');
                await player.setQueue(shuffleTracks(tracks), 0, false, playbackSourceContext(type, collectionItem));
                document.getElementById('shuffle-btn')?.classList.remove('active');
            } else {
                await player.setQueue(tracks, 0, false, playbackSourceContext(type, collectionItem));
                const shuffleBtn = document.getElementById('shuffle-btn');
                if (shuffleBtn) shuffleBtn.classList.remove('active');
            }
            await player.playAtIndex(0);
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
        player.addToQueue(item, { userInitiated: true });
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
    } else if (action === 'send-to-friend' || action === 'note-about') {
        window.dispatchEvent(new CustomEvent('community-share', { detail: { action, type, item } }));
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
        // Artwork for the sidebar's Recents: artist picture, playlist image or album cover.
        cover: item.picture ?? item.image ?? item.cover ?? null,
        images: Array.isArray(item.images) ? item.images.slice(0, 4) : undefined,
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
    document.addEventListener('keyboard-track-selection', (event) => {
        const { row, range } = event.detail || {};
        if (!row?.matches('.track-item[data-track-id]') || row.matches('.unavailable, .blocked')) return;
        toggleTrackSelection(row, !range, !!range);
    });
    let contextTrack = null;

    setupTrackSavePanel({ player, api, ui, handleTrackAction });
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
        const trackItem = e.target.closest('.track-item, .queue-track-row');
        const card = e.target.closest('.card');

        if (trackItem) {
            e.preventDefault();
            if (trackItem.classList.contains('queue-track-row')) {
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

        if (action && track) {
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
                        player.addToQueue(selectedTracks, { userInitiated: true });
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

// Sleep timer panel. The dial selects up to 120 minutes, then shows the fraction of time remaining.
const SLEEP_DIAL_STEP = 5;
const SLEEP_DEG_PER_MINUTE = 3;

function formatSleepClock(ms) {
    const total = Math.ceil(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

function formatWallClock(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function describeSleepMinutes(minutes) {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} hour${hours > 1 ? 's' : ''}${rest ? ` ${rest} minutes` : ''}`;
}

function setupSleepTimer(player, triggers) {
    const panel = document.getElementById('sleep-timer-popover');
    const dial = document.getElementById('sleep-dial');
    if (!panel || !dial) return;

    const arc = dial.querySelector('.sleep-dial-arc');
    const hand = dial.querySelector('.sleep-dial-hand');
    const tickGroup = dial.querySelector('.sleep-dial-ticks');
    const valueEl = document.getElementById('sleep-dial-value');
    const unitEl = document.getElementById('sleep-dial-unit');
    const alarmTimeEl = document.getElementById('sleep-dial-alarm-time');
    const endsEl = document.getElementById('sleep-timer-ends');
    const actions = panel.querySelector('.sleep-actions');
    const setup = document.getElementById('sleep-setup');
    const trackOption = document.getElementById('sleep-track-option');
    const trackLeft = document.getElementById('sleep-track-left');
    const fadeToggle = document.getElementById('sleep-fade-toggle');
    const startButton = document.getElementById('sleep-start');
    const extendButton = document.getElementById('sleep-extend');
    const stopButton = document.getElementById('sleep-stop');
    const closeButton = document.getElementById('cancel-sleep-timer');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const { MIN_MINUTES, MAX_MINUTES } = sleepTimerSettings;

    // One tick per 5 minutes; quarter hours run longer.
    const NS = 'http://www.w3.org/2000/svg';
    const ticks = Array.from({ length: 24 }, (_, index) => {
        const angle = (index / 24) * Math.PI * 2;
        const major = index % 6 === 0;
        const inner = major ? 85 : 88;
        const tick = document.createElementNS(NS, 'line');
        tick.setAttribute('class', major ? 'sleep-tick sleep-tick-major' : 'sleep-tick');
        tick.setAttribute('x1', String(100 + inner * Math.sin(angle)));
        tick.setAttribute('y1', String(100 - inner * Math.cos(angle)));
        tick.setAttribute('x2', String(100 + 93 * Math.sin(angle)));
        tick.setAttribute('y2', String(100 - 93 * Math.cos(angle)));
        tickGroup.append(tick);
        return { tick, minutes: index * SLEEP_DIAL_STEP };
    });

    let trigger = null;
    let refreshTimer = 0;
    let closeTimer = 0;
    let tween = 0;
    let gliding = false;
    let shown = sleepTimerSettings.getMinutes();
    let draftMinutes = shown;
    let draftTrack = false;
    let wasRunning = false;

    const paint = (minutes) => {
        shown = minutes;
        const clamped = Math.min(MAX_MINUTES, Math.max(0, minutes));
        arc.style.strokeDasharray = `${clamped} 120`;
        hand.style.transform = `rotate(${clamped * SLEEP_DEG_PER_MINUTE}deg)`;
        for (const { tick, minutes: at } of ticks) tick.classList.toggle('is-lit', at <= clamped && clamped > 0);
    };

    // Drag follower: a critically damped spring chasing the snapped target. Retargeting mid-flight keeps
    // the current velocity, so crossing several notches reads as one continuous motion, never a restart.
    let velocity = 0;
    const FOLLOW_OMEGA = 26;
    const followTo = (target) => {
        if (reduceMotion.matches) {
            cancelAnimationFrame(tween);
            gliding = false;
            paint(target);
            return;
        }
        if (gliding && followTarget !== null) {
            followTarget = target;
            return;
        }
        cancelAnimationFrame(tween);
        followTarget = target;
        velocity = 0;
        gliding = true;
        dial.classList.remove('is-ticking');
        let last = performance.now();
        const step = (now) => {
            const dt = Math.min(0.032, (now - last) / 1000);
            last = now;
            const offset = shown - followTarget;
            velocity += (-2 * FOLLOW_OMEGA * velocity - FOLLOW_OMEGA * FOLLOW_OMEGA * offset) * dt;
            const next = shown + velocity * dt;
            if (Math.abs(next - followTarget) < 0.02 && Math.abs(velocity) < 0.2) {
                paint(followTarget);
                followTarget = null;
                velocity = 0;
                gliding = false;
                return;
            }
            paint(next);
            tween = requestAnimationFrame(step);
        };
        tween = requestAnimationFrame(step);
    };
    let followTarget = null;

    const glideTo = (target, duration = 420) => {
        cancelAnimationFrame(tween);
        followTarget = null;
        velocity = 0;
        if (reduceMotion.matches || Math.abs(target - shown) < 0.5) {
            gliding = false;
            paint(target);
            return;
        }
        const from = shown;
        const start = performance.now();
        gliding = true;
        dial.classList.remove('is-ticking');
        const step = (now) => {
            const t = Math.min(1, (now - start) / duration);
            paint(from + (target - from) * (1 - (1 - t) ** 4));
            if (t < 1) tween = requestAnimationFrame(step);
            else gliding = false;
        };
        tween = requestAnimationFrame(step);
    };

    const setAttr = (name, value) => {
        if (value === null) dial.removeAttribute(name);
        else if (dial.getAttribute(name) !== value) dial.setAttribute(name, value);
    };

    // Idle, the dial is a slider; running, it only reports the time left.
    const setDialSemantics = (running, label) => {
        setAttr('role', running ? 'timer' : 'slider');
        setAttr('tabindex', running ? null : '0');
        setAttr('aria-label', running ? label : 'Timer length');
        setAttr('aria-valuemin', running ? null : String(MIN_MINUTES));
        setAttr('aria-valuemax', running ? null : String(MAX_MINUTES));
        setAttr('aria-valuenow', running ? null : String(draftMinutes));
        setAttr(
            'aria-valuetext',
            running ? null : draftTrack ? 'End of this track' : describeSleepMinutes(draftMinutes)
        );
    };

    const setText = (element, text) => {
        if (element.textContent !== text) element.textContent = text;
    };

    // Restarts a one-shot keyframe class, then drops it so a later hidden -> shown flip cannot replay it.
    const replay = (element, className, ms) => {
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
        clearTimeout(element._replayTimer);
        element._replayTimer = setTimeout(() => element.classList.remove(className), ms);
    };

    // Brings every part of the panel in line with the player, idle or running.
    const sync = ({ animate = false } = {}) => {
        const state = player.getSleepTimerState();
        const running = Boolean(state);
        const trackRemaining = player.getTrackRemainingMs();
        panel.classList.toggle('is-running', running);
        panel.classList.toggle('is-fading', Boolean(state?.fading));

        if (running) {
            const leftMinutes = state.remaining / 60_000;
            const progress = (state.remaining / state.total) * MAX_MINUTES;
            if (!wasRunning || animate) glideTo(progress);
            else if (!gliding) paint(progress);
            const pausesAt = formatWallClock(state.endsAt);
            setText(valueEl, formatSleepClock(state.remaining));
            setText(alarmTimeEl, pausesAt);
            setDialSemantics(true, `${describeSleepMinutes(Math.ceil(leftMinutes))} left, pauses at ${pausesAt}`);
        } else {
            if (draftTrack && trackRemaining === null) draftTrack = false;
            const target = draftTrack ? trackRemaining / 60_000 : draftMinutes;
            if (wasRunning || animate) glideTo(target);
            else if (draftTrack && !gliding) paint(target);
            setText(valueEl, draftTrack ? formatSleepClock(trackRemaining) : String(draftMinutes));
            setText(unitEl, draftTrack ? 'left in this track' : 'min');
            const endsAt = Date.now() + (draftTrack ? trackRemaining : draftMinutes * 60_000);
            setText(endsEl, `Pauses at ${formatWallClock(endsAt)}`);
            setDialSemantics(false);
        }
        setup.inert = running;

        trackOption.disabled = trackRemaining === null;
        trackOption.setAttribute('aria-pressed', String(!running && draftTrack));
        trackOption.classList.toggle('is-selected', !running && draftTrack);
        setText(trackLeft, trackRemaining === null ? 'Nothing playing' : formatSleepClock(trackRemaining));
        fadeToggle.checked = sleepTimerSettings.isFadeEnabled();
        startButton.hidden = running;
        extendButton.hidden = !running;
        stopButton.hidden = !running;
        dial.classList.toggle('is-ticking', running && wasRunning && !gliding);
        // Start / stop / timer end while open: the new action row arrives instead of snapping in.
        if (running !== wasRunning && panel.classList.contains('is-open')) {
            replay(actions, 'is-swapping', 700);
            if (running) replay(alarmTimeEl.parentElement, 'is-set', 900);
        }
        wasRunning = running;
    };

    const chooseMinutes = (minutes, { glide = true, follow = false } = {}) => {
        const snapped = Math.round(minutes / SLEEP_DIAL_STEP) * SLEEP_DIAL_STEP;
        const next = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, snapped));
        const changed = next !== draftMinutes || draftTrack;
        draftMinutes = next;
        draftTrack = false;
        sleepTimerSettings.setMinutes(next);
        if (follow) followTo(next);
        else if (glide) glideTo(next);
        else {
            cancelAnimationFrame(tween);
            paint(next);
        }
        sync();
        return changed;
    };

    const placePanel = () => {
        panel.style.bottom = '';
        const rect =
            getRectSnapshot(trigger) ?? getRectSnapshot(document.getElementById('more-player-actions-btn'));
        if (!rect) {
            // Opened from a hidden button (the mobile actions menu): centre it just above the player bar.
            const width = Math.min(320, window.innerWidth - 24);
            const barTop = document.querySelector('.now-playing-bar')?.getBoundingClientRect().top ?? window.innerHeight;
            panel.style.width = `${width}px`;
            panel.style.left = `${(window.innerWidth - width) / 2}px`;
            panel.style.top = 'auto';
            panel.style.bottom = `${window.innerHeight - barTop + 12}px`;
            panel.style.setProperty('--panel-origin-x', '50%');
            panel.style.setProperty('--panel-origin-y', '100%');
            return;
        }
        positionPlayerPopover(panel, rect, 320);
        // Opened above its button: pin the bottom edge so the panel grows upward when its content changes.
        if (panel.style.getPropertyValue('--panel-origin-y') === '100%') {
            const top = parseFloat(panel.style.top);
            panel.style.bottom = `${window.innerHeight - top - panel.offsetHeight}px`;
            panel.style.top = 'auto';
        }
    };

    const onPointerDownOutside = (event) => {
        if (panel.contains(event.target) || triggers.some((button) => button?.contains(event.target))) return;
        close();
    };
    const onKeyDown = (event) => {
        if (event.key === 'Escape') close({ restoreFocus: true });
    };

    // Same capsule-from-the-button morph as the quality panel.
    const panelFrames = () => {
        const panelRect = panel.getBoundingClientRect();
        const rect = getRectSnapshot(trigger) ?? {
            left: panelRect.left + panelRect.width / 2,
            top: panelRect.top + panelRect.height,
            width: 1,
            height: 1,
        };
        return {
            collapsed: {
                opacity: 0,
                borderRadius: '999px',
                clipPath: 'inset(0 round 999px)',
                transform: `translate(${rect.left - panelRect.left}px, ${rect.top - panelRect.top}px) scale(${Math.max(
                    0.08,
                    rect.width / panelRect.width
                )}, ${Math.max(0.06, rect.height / panelRect.height)})`,
            },
            expanded: {
                opacity: 1,
                borderRadius: '16px',
                clipPath: 'inset(0 round 16px)',
                transform: 'translate(0, 0) scale(1)',
            },
        };
    };
    let panelAnimation = null;

    function open(button) {
        clearTimeout(closeTimer);
        trigger = button;
        triggers.forEach((item) => item?.setAttribute('aria-expanded', String(item === button)));
        // The opening moment: the dial winds up from 12 to the current length.
        const remaining = player.getSleepTimerRemainingMs();
        const trackRemaining = player.getTrackRemainingMs();
        if (draftTrack && trackRemaining === null) draftTrack = false;
        wasRunning = remaining !== null;
        panel.hidden = false;
        cancelAnimationFrame(tween);
        paint(0);
        glideTo(wasRunning ? remaining / 60_000 : draftTrack ? trackRemaining / 60_000 : draftMinutes, 640);
        sync();
        placePanel();
        clearInterval(refreshTimer);
        refreshTimer = setInterval(() => sync(), 250);
        document.addEventListener('pointerdown', onPointerDownOutside);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', placePanel);
        requestAnimationFrame(() => {
            const { collapsed, expanded } = panelFrames();
            panelAnimation?.cancel();
            panel.classList.add('is-open');
            if (!reduceMotion.matches) {
                panelAnimation = panel.animate([collapsed, expanded], {
                    duration: 380,
                    easing: 'cubic-bezier(0.2, 0.9, 0.24, 1.04)',
                    fill: 'both',
                });
                panelAnimation.finished.then(() => panelAnimation?.cancel()).catch(() => {});
            }
            (player.isSleepTimerActive() ? stopButton : dial).focus({ preventScroll: true });
        });
    }

    function close({ restoreFocus = false } = {}) {
        if (panel.hidden || !panel.classList.contains('is-open')) return;
        if (!reduceMotion.matches) {
            const computed = getComputedStyle(panel);
            const from = {
                opacity: Number.parseFloat(computed.opacity) || 0,
                borderRadius: computed.borderRadius,
                clipPath: computed.clipPath === 'none' ? 'inset(0 round 16px)' : computed.clipPath,
                transform: computed.transform === 'none' ? 'translate(0, 0) scale(1)' : computed.transform,
            };
            const { collapsed } = panelFrames();
            panelAnimation?.cancel();
            panelAnimation = panel.animate([from, collapsed], {
                duration: 200,
                easing: 'cubic-bezier(0.4, 0, 1, 1)',
                fill: 'both',
            });
        }
        panel.classList.remove('is-open');
        triggers.forEach((item) => item?.setAttribute('aria-expanded', 'false'));
        clearInterval(refreshTimer);
        document.removeEventListener('pointerdown', onPointerDownOutside);
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', placePanel);
        closeTimer = setTimeout(() => {
            panel.hidden = true;
            panelAnimation?.cancel();
        }, 200);
        if (restoreFocus && trigger?.offsetParent) trigger.focus({ preventScroll: true });
    }

    triggers.forEach((button) =>
        button?.addEventListener('click', () => {
            if (!panel.hidden && panel.classList.contains('is-open') && trigger === button) close();
            else open(button);
        })
    );
    closeButton?.addEventListener('click', () => close({ restoreFocus: true }));

    // The fill grows from where the option was pressed; from the keyboard it grows from the centre.
    trackOption.addEventListener('pointerdown', (event) => {
        const box = trackOption.getBoundingClientRect();
        trackOption.style.setProperty('--fill-x', `${event.clientX - box.left}px`);
        trackOption.style.setProperty('--fill-y', `${event.clientY - box.top}px`);
    });
    trackOption.addEventListener('click', (event) => {
        if (player.getTrackRemainingMs() === null) return;
        if (event.detail === 0) {
            trackOption.style.setProperty('--fill-x', '50%');
            trackOption.style.setProperty('--fill-y', '50%');
        }
        draftTrack = !draftTrack;
        sync({ animate: true });
    });

    fadeToggle.addEventListener('change', () => {
        sleepTimerSettings.setFadeEnabled(fadeToggle.checked);
        player.tickSleepTimer();
    });

    startButton.addEventListener('click', () => {
        if (draftTrack) {
            if (!player.setSleepTimerEndOfTrack()) return;
        } else {
            player.setSleepTimer(draftMinutes);
        }
        panel.classList.remove('is-starting');
        void panel.offsetWidth;
        panel.classList.add('is-starting');
        sync();
        stopButton.focus({ preventScroll: true });
    });

    extendButton.addEventListener('click', () => {
        player.extendSleepTimer(15);
        replay(extendButton, 'is-bumped', 560);
        sync({ animate: true });
    });

    stopButton.addEventListener('click', () => {
        player.clearSleepTimer();
        sync({ animate: true });
        dial.focus({ preventScroll: true });
    });

    // Dragging the dial: the angle from 12 o'clock picks the minutes, snapped to 5. Dragging across
    // 12 o'clock does not wrap from 120 to 5 (or back): the value holds at the end it came from until
    // the pointer crosses back. Only a step across the seam counts, never a large jump elsewhere.
    let lastTurn = null;
    let pinnedAt = null;
    const turnAt = (event) => {
        const box = dial.getBoundingClientRect();
        const angle = Math.atan2(event.clientX - (box.left + box.width / 2), box.top + box.height / 2 - event.clientY);
        return (angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2);
    };
    const minutesAt = (event) => {
        const turn = turnAt(event);
        if (lastTurn !== null) {
            const forwardOverTop = lastTurn > 0.75 && turn < 0.25;
            const backOverTop = lastTurn < 0.25 && turn > 0.75;
            if (forwardOverTop) pinnedAt = pinnedAt === MIN_MINUTES ? null : MAX_MINUTES;
            else if (backOverTop) pinnedAt = pinnedAt === MAX_MINUTES ? null : MIN_MINUTES;
        }
        lastTurn = turn;
        return pinnedAt ?? Math.round((turn * MAX_MINUTES) / SLEEP_DIAL_STEP) * SLEEP_DIAL_STEP;
    };

    dial.addEventListener('pointerdown', (event) => {
        if (player.isSleepTimerActive() || event.button > 0) return;
        event.preventDefault();
        dial.setPointerCapture(event.pointerId);
        dial.classList.add('is-dragging');
        dial.focus({ preventScroll: true });
        lastTurn = null;
        pinnedAt = null;
        chooseMinutes(minutesAt(event), { follow: true });
    });
    dial.addEventListener('pointermove', (event) => {
        if (!dial.hasPointerCapture(event.pointerId)) return;
        if (chooseMinutes(minutesAt(event), { follow: true })) navigator.vibrate?.(4);
    });
    const endDrag = (event) => {
        if (dial.hasPointerCapture(event.pointerId)) dial.releasePointerCapture(event.pointerId);
        dial.classList.remove('is-dragging');
    };
    dial.addEventListener('pointerup', endDrag);
    dial.addEventListener('pointercancel', endDrag);

    dial.addEventListener('keydown', (event) => {
        if (player.isSleepTimerActive()) return;
        const base = draftTrack ? Math.round(shown / SLEEP_DIAL_STEP) * SLEEP_DIAL_STEP : draftMinutes;
        const moves = {
            ArrowUp: base + 5,
            ArrowRight: base + 5,
            ArrowDown: base - 5,
            ArrowLeft: base - 5,
            PageUp: base + 15,
            PageDown: base - 15,
            Home: MIN_MINUTES,
            End: MAX_MINUTES,
        };
        if (event.key in moves) {
            event.preventDefault();
            chooseMinutes(moves[event.key]);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            startButton.click();
        }
    });

    const nightfall = setupSleepNightfall(player, { onExtend: () => !panel.hidden && sync({ animate: true }) });

    window.addEventListener('sleep-timer-end', (event) => {
        if (event.detail?.finished) {
            if (sleepTimerSettings.isNightfallEnabled()) {
                nightfall.show();
            } else {
                showNotification('Paused by the sleep timer');
                playSleepDoze();
            }
        }
        if (panel.hidden) return;
        const hadFocus = panel.contains(document.activeElement);
        sync({ animate: true });
        // Turn off / +15 just disappeared: keep keyboard focus inside the panel.
        if (hadFocus && !panel.contains(document.activeElement)) dial.focus({ preventScroll: true });
    });

    paint(draftMinutes);
}
