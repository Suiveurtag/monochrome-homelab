import { getPlayerPopoverFrames, PLAYER_POPOVER_OPEN } from './player-popover-motion.js';
import { getShuffleMode, setShuffleMode, shuffleTracks } from './recommendation-settings.js';
import { SVG_SHUFFLE } from './icons.js';
import ICON_CHECK from '!lucide/check.svg?svg&icon';
import ICON_DICE from '!lucide/dice-5.svg?svg&icon';

function modeOption(mode, title, description, icon) {
    return `<label>
        <input type="radio" name="shuffle-picker-mode" value="${mode}"
            aria-labelledby="shuffle-${mode}-title" aria-describedby="shuffle-${mode}-description">
        <span class="shuffle-mode-option">
            <span class="shuffle-mode-glyph" aria-hidden="true">${icon(20)}</span>
            <span class="shuffle-mode-copy">
                <span id="shuffle-${mode}-title" class="shuffle-mode-name">${title}</span>
                <span id="shuffle-${mode}-description" class="shuffle-mode-description">${description}</span>
            </span>
        </span>
    </label>`;
}

export function setupShuffleModePicker(player, trigger) {
    if (!trigger) return;
    const panel = document.createElement('div');
    panel.className = 'shuffle-mode-picker';
    panel.hidden = true;
    panel.id = 'shuffle-mode-picker';
    panel.innerHTML = `<h2 class="shuffle-mode-heading" id="shuffle-mode-title">Shuffle mode</h2>
        <div class="shuffle-mode-options" role="radiogroup" aria-labelledby="shuffle-mode-title">
            <span class="shuffle-mode-selection" aria-hidden="true">${ICON_CHECK(16)}</span>
            ${modeOption('smart', 'Smart Random', 'Spaces out artists and recent plays', SVG_SHUFFLE)}
            ${modeOption('real', 'Real Random', 'Fully random track order', ICON_DICE)}
        </div>`;
    document.body.append(panel);
    trigger.setAttribute('aria-controls', panel.id);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'shuffle-mode-title');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const content = panel.querySelectorAll('.shuffle-mode-options, .shuffle-mode-heading');
    let panelAnimation;
    let contentAnimations = [];
    let docked;

    const sync = () => {
        panel.querySelector(`input[value="${getShuffleMode()}"]`).checked = true;
    };
    const stopPanelAnimation = () => {
        const style = getComputedStyle(panel);
        const frame = { opacity: Number(style.opacity), transform: style.transform, borderRadius: style.borderRadius, clipPath: style.clipPath };
        panelAnimation?.cancel();
        return frame;
    };
    const hide = () => {
        panel.hidden = true;
        panelAnimation?.cancel();
        contentAnimations.forEach((animation) => animation.cancel());
        trigger.classList.remove('is-shuffle-picker-visible');
    };
    const close = (restoreFocus = false, withMotion = true) => {
        if (panel.hidden || panel.inert) return;
        const current = stopPanelAnimation();
        panel.inert = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (restoreFocus) trigger.focus({ preventScroll: true });
        if (!withMotion || reducedMotion.matches) {
            hide();
            return;
        }

        const easing = getComputedStyle(panel).getPropertyValue('--ease-out').trim() || 'ease-out';
        const exit = panel.animate([current, { offset: 0.56, opacity: current.opacity * 0.8 }, docked], {
            duration: 155, easing, fill: 'forwards',
        });
        panelAnimation = exit;
        exit.finished.then(() => {
            if (panelAnimation === exit) hide();
        }).catch(() => {});
    };
    const open = (withMotion = true) => {
        if (!panel.hidden && !panel.inert) return;
        const current = panel.hidden ? null : stopPanelAnimation();
        sync();
        panel.inert = false;
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add('is-shuffle-picker-visible');

        const rect = trigger.getBoundingClientRect();
        const inset = 8;
        const gap = 10;
        const anchor = rect.left + rect.width / 2;
        const above = rect.top - gap - panel.offsetHeight;
        const below = rect.bottom + gap;
        const opensBelow = above < inset && below + panel.offsetHeight <= window.innerHeight - inset;
        const left = Math.max(inset, Math.min(anchor - panel.offsetWidth / 2, window.innerWidth - panel.offsetWidth - inset));
        panel.style.left = `${left}px`;
        panel.style.top = `${opensBelow ? below : Math.max(inset, above)}px`;
        panel.style.transformOrigin = 'top left';
        const direction = opensBelow ? -1 : 1;
        docked = { opacity: 0, borderRadius: '12px', clipPath: 'inset(0 round 12px)', transform: `translateY(${11 * direction}px) scale(0.94)` };

        if (withMotion && !reducedMotion.matches) {
            const { collapsed, expanded } = getPlayerPopoverFrames(panel.getBoundingClientRect(), rect, '12px');
            const opening = panel.animate([current ?? collapsed, expanded], PLAYER_POPOVER_OPEN);
            panelAnimation = opening;
            opening.finished.then(() => opening.cancel()).catch(() => {});
            if (!current) {
                contentAnimations = Array.from(content).flatMap((element, index) => {
                    const delay = index === 0 ? 60 : 40;
                    return [
                        element.animate([{ opacity: 0 }, { opacity: 1 }], {
                            duration: 180, delay, easing: 'ease', fill: 'backwards',
                        }),
                        element.animate([{ transform: 'translateY(6px)' }, { transform: 'translateY(0)' }], {
                            duration: 260, delay, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards',
                        }),
                    ];
                });
            }
        } else {
            contentAnimations.forEach((animation) => animation.cancel());
        }
        panel.querySelector('input:checked').focus({ preventScroll: true });
    };

    trigger.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        open();
    });
    trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            open(false);
        }
    });
    panel.addEventListener('change', async (event) => {
        if (!event.target.matches('input[name="shuffle-picker-mode"]')) return;
        const previous = getShuffleMode();
        setShuffleMode(event.target.value);
        if (previous !== getShuffleMode() && player.shuffleActive) {
            const split = Math.max(0, player.currentQueueIndex + 1);
            const played = player.shuffledQueue.slice(0, split);
            player.shuffledQueue = [...played, ...shuffleTracks(player.shuffledQueue.slice(split), player.currentTrack)];
            player.preloadCache.clear();
            player.preloadNextTracks();
            await player.saveQueueState();
            await window.renderQueueFunction?.();
        }
    });
    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
            close(true, false);
            return;
        }
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close(true, false);
    });
    document.addEventListener('pointerdown', (event) => {
        if (!panel.contains(event.target) && !trigger.contains(event.target)) close();
    });
    trigger.addEventListener('click', () => close());
    window.addEventListener('shuffle-mode-changed', sync);
    window.addEventListener('resize', () => close(panel.contains(document.activeElement), false));
}
