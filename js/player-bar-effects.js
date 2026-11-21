import { initPlayerIconMotion } from './player-icon-motion.js';

const PLAY_PAUSE_ICON = `
    <svg class="morph-play-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="morph-play-triangle" d="M8 5.5L19 12L8 18.5Z" />
        <path class="morph-pause-left" d="M7 5.5H10.5V18.5H7Z" />
        <path class="morph-pause-right" d="M13.5 5.5H17V18.5H13.5Z" />
    </svg>`;

class PlayerBarEffects {
    constructor() {
        this.bar = null;
        this.playing = false;
        this.frame = 0;
        this.startedAt = 0;
        this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
        this.drawFrame = (time) => this._draw(time);
    }

    init() {
        this.bar = document.querySelector('.now-playing-bar');
        if (!this.bar || this.bar.dataset.effectsReady === 'true') return;
        this.bar.dataset.effectsReady = 'true';
        this.installMorphIcon();
        initPlayerIconMotion(this.bar);
        this.bar.style.setProperty('--edge-proximity', '100');
        this.bar.addEventListener('pointermove', (event) => {
            const rect = this.bar.getBoundingClientRect();
            const angle = Math.atan2(
                event.clientY - rect.top - rect.height / 2,
                event.clientX - rect.left - rect.width / 2
            );
            this.bar.style.setProperty('--cursor-angle', `${(angle * 180) / Math.PI + 90}deg`);
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stopFrame();
            else if (this.playing) this.startFrame();
        });
    }

    installMorphIcon() {
        const button = this.bar.querySelector('.play-pause-btn');
        if (!button) return;
        button.innerHTML = PLAY_PAUSE_ICON;
    }

    setPlaying(playing) {
        if (!this.bar) this.init();
        this.playing = playing;
        this.bar?.classList.toggle('is-playing', playing);
        const button = this.bar?.querySelector('.play-pause-btn');
        button?.classList.toggle('is-paused-icon', playing);
        if (button) {
            button.title = playing ? 'Pause' : 'Play';
            button.setAttribute('aria-label', playing ? 'Pause' : 'Play');
            button.setAttribute('aria-pressed', String(playing));
        }
        if (playing && !document.hidden) this.startFrame();
        else this.stopFrame();
    }

    startFrame() {
        if (this.frame) return;
        this.startedAt = performance.now();
        this.frame = requestAnimationFrame(this.drawFrame);
    }

    stopFrame() {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
    }

    _draw(now) {
        this.frame = 0;
        if (!this.playing || document.hidden || !this.bar) return;
        const t = (now - this.startedAt) / 1000;
        this.bar.style.setProperty('--player-glow-angle', `${(t * 55) % 360}deg`);
        this.frame = requestAnimationFrame(this.drawFrame);
    }
}

export const playerBarEffects = new PlayerBarEffects();

// The player shell must be usable immediately, even while account data and
// settings are still loading. The later call from initializePlayerEvents is
// intentionally idempotent and only confirms the initialized state.
queueMicrotask(() => playerBarEffects.init());
