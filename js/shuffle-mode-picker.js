import { getShuffleMode, setShuffleMode, shuffleTracks } from './recommendation-settings.js';
import { SVG_SHUFFLE } from './icons.js';

export function setupShuffleModePicker(player, trigger) {
    if (!trigger) return;
    const panel = document.createElement('div');
    panel.className = 'shuffle-mode-picker';
    panel.hidden = true;
    panel.id = 'shuffle-mode-picker';
    panel.innerHTML = `<div class="shuffle-mode-heading"><div class="shuffle-mode-icon" aria-hidden="true">${SVG_SHUFFLE(20)}</div><div><div class="shuffle-mode-title" id="shuffle-mode-title">Shuffle</div><div class="shuffle-mode-caption">Choose how your queue plays</div></div></div>
        <div class="shuffle-mode-options" role="radiogroup" aria-labelledby="shuffle-mode-title">
            <label><input type="radio" name="shuffle-picker-mode" value="smart" aria-describedby="shuffle-mode-description"><span class="shuffle-mode-choice">Smart Random</span></label>
            <label><input type="radio" name="shuffle-picker-mode" value="real" aria-describedby="shuffle-mode-description"><span class="shuffle-mode-choice">Real Random</span></label>
        </div>
        <div class="shuffle-mode-detail"><div class="shuffle-mode-mark" aria-hidden="true"><i></i><i></i><i></i></div><p class="shuffle-mode-description" id="shuffle-mode-description" aria-live="polite"></p></div>`;
    document.body.append(panel);
    trigger.setAttribute('aria-controls', panel.id);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'shuffle-mode-title');

    let animation;
    let animationRun = 0;
    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frames = () => {
        const source = trigger.getBoundingClientRect();
        const target = panel.getBoundingClientRect();
        return [
            { opacity: 0, borderRadius: '999px', clipPath: 'inset(0 round 999px)',
                transform: `translate(${source.left - target.left}px, ${source.top - target.top}px) scale(${Math.max(0.08, source.width / target.width)}, ${Math.max(0.06, source.height / target.height)})` },
            { opacity: 1, borderRadius: '16px', clipPath: 'inset(0 round 16px)', transform: 'translate(0, 0) scale(1)' },
        ];
    };
    const sync = () => {
        const mode = getShuffleMode();
        panel.querySelector(`input[value="${mode}"]`).checked = true;
        panel.querySelector('.shuffle-mode-description').textContent = mode === 'smart'
            ? 'Spaces out artists and recently played songs.'
            : 'Every song has an equal chance, with no adjustments.';
    };
    const close = (restoreFocus = false) => {
        if (panel.hidden) return;
        const run = ++animationRun;
        const [collapsed] = frames();
        const style = getComputedStyle(panel);
        const current = { opacity: style.opacity, borderRadius: style.borderRadius, clipPath: style.clipPath, transform: style.transform };
        animation?.cancel();
        panel.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (restoreFocus) trigger.focus();
        if (reducedMotion()) { panel.hidden = true; return; }
        animation = panel.animate([current, collapsed], { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' });
        animation.finished.then(() => {
            if (run !== animationRun) return;
            panel.hidden = true;
            animation.cancel();
        }).catch(() => {});
    };
    const open = () => {
        ++animationRun;
        animation?.cancel();
        sync();
        panel.hidden = false;
        const rect = trigger.getBoundingClientRect();
        const left = Math.max(8, Math.min(rect.left + rect.width / 2 - panel.offsetWidth / 2, window.innerWidth - panel.offsetWidth - 8));
        panel.style.left = `${left}px`;
        panel.style.top = `${Math.max(8, rect.top - panel.offsetHeight - 10)}px`;
        const [collapsed, expanded] = frames();
        panel.classList.add('is-open');
        if (!reducedMotion()) {
            animation = panel.animate([collapsed, expanded], { duration: 380, easing: 'cubic-bezier(0.2, 0.9, 0.24, 1.04)' });
        }
        trigger.setAttribute('aria-expanded', 'true');
        panel.querySelector('input:checked').focus();
    };
    trigger.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); open(); });
    trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            open();
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
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    });
    document.addEventListener('pointerdown', (event) => {
        if (!panel.hidden && !panel.contains(event.target) && event.target !== trigger) close();
    });
    window.addEventListener('shuffle-mode-changed', sync);
    window.addEventListener('resize', () => { if (!panel.hidden) close(); });
}
