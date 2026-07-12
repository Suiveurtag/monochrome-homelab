import { playerBarEffectsSettings } from './storage.js';
import {
    DarkVeilRenderer,
    MagicRingsRenderer,
    SideRaysRenderer,
    SilkRenderer,
    SoftAuroraRenderer,
    StrandsRenderer,
} from './player-bar-shaders.js';

const PLAY_PAUSE_ICON = `
    <svg class="morph-play-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="morph-play-triangle" d="M8 5.5L19 12L8 18.5Z" />
        <path class="morph-pause-left" d="M7 5.5H10.5V18.5H7Z" />
        <path class="morph-pause-right" d="M13.5 5.5H17V18.5H13.5Z" />
    </svg>`;

class PlayerBarEffects {
    constructor() {
        this.bar = null;
        this.stage = null;
        this.playing = false;
        this.frame = 0;
        this.startedAt = 0;
        this.resizeObserver = null;
        this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
        this.drawFrame = (time) => this._draw(time);
    }

    init() {
        this.bar = document.querySelector('.now-playing-bar');
        if (!this.bar || this.bar.dataset.effectsReady === 'true') return;
        this.bar.dataset.effectsReady = 'true';
        this.stage = this.bar.querySelector('.player-shader-stage');
        this.renderers = {
            'soft-aurora': new SoftAuroraRenderer(this.stage),
            'side-rays': new SideRaysRenderer(this.stage),
            silk: new SilkRenderer(this.stage),
            strands: new StrandsRenderer(this.stage),
            'dark-veil': new DarkVeilRenderer(this.stage),
        };
        this.magicRings = new MagicRingsRenderer(this.bar.querySelector('.player-magic-rings'));
        this.setEffect(playerBarEffectsSettings.getEffect());
        this.installMorphIcon();
        this.installPlayBurstFallback();
        this.animateButtons();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.bar);
        this.resize();
        this.bar.style.setProperty('--edge-proximity', '100');
        this.bar.addEventListener('pointermove', (event) => {
            const rect = this.bar.getBoundingClientRect();
            const angle = Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2);
            this.bar.style.setProperty('--cursor-angle', `${angle * 180 / Math.PI + 90}deg`);
        });
        window.addEventListener('player-bar-effect-changed', (event) => this.setEffect(event.detail.effect));
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

    installPlayBurstFallback() {
        this.bar.addEventListener('pointerdown', (event) => {
            if (!event.target.closest?.('.play-pause-btn')) return;
            if (!this.playing) this.playMagicRings();
        }, { capture: true });
    }

    setEffect(effect) {
        if (!this.bar) return;
        this.bar.dataset.playerEffect = effect;
        this.stage?.querySelectorAll('canvas, .player-cover-blur-effect').forEach((element) => {
            element.style.opacity = element.parentElement === this.stage ? '0' : '';
        });
        if (this.playing) {
            this.stopFrame();
            this.startFrame();
        }
    }

    setPlaying(playing, { userInitiated = false } = {}) {
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
        if (playing && userInitiated) this.playMagicRings();
        if (playing && !document.hidden) this.startFrame();
        else this.stopFrame();
        if (!playing) this.clearRenderers();
    }

    playMagicRings() {
        this.magicRings?.burst(this.getColorRgb());
    }

    animateButtons() {
        this.bar.querySelectorAll('button').forEach((button) => {
            button.addEventListener('click', () => {
                button.classList.remove('icon-activated');
                void button.offsetWidth;
                button.classList.add('icon-activated');
            });
        });
    }

    resize() {
        if (!this.stage || !this.bar) return;
        Object.values(this.renderers || {}).forEach((renderer) => renderer.resize?.());
        this.magicRings?.resize();
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

    clearRenderers() {
        Object.values(this.renderers || {}).forEach((renderer) => renderer.clear?.());
        this.stage?.querySelectorAll('canvas, .player-cover-blur-effect').forEach((element) => { element.style.opacity = '0'; });
    }

    getColorRgb() {
        const value = getComputedStyle(document.documentElement).getPropertyValue('--highlight-rgb').trim();
        const rgb = value.replaceAll(',', ' ').split(/\s+/).slice(0, 3).map(Number);
        return [rgb[0] || 167, rgb[1] || 139, rgb[2] || 250];
    }

    _draw(now) {
        this.frame = 0;
        if (!this.playing || document.hidden || !this.stage) return;
        const t = (now - this.startedAt) / 1000;
        this.bar.style.setProperty('--player-glow-angle', `${(t * 55) % 360}deg`);
        const effect = this.bar.dataset.playerEffect;
        this.stage?.querySelectorAll('canvas, .player-cover-blur-effect').forEach((element) => { element.style.opacity = '0'; });
        const renderer = this.renderers?.[effect] || this.renderers?.['dark-veil'];
        renderer?.render(now, this.getColorRgb());
        if (renderer?.gl?.canvas) renderer.gl.canvas.style.opacity = '1';
        if (renderer?.renderer?.domElement) renderer.renderer.domElement.style.opacity = '1';
        this.frame = requestAnimationFrame(this.drawFrame);
    }
}

export const playerBarEffects = new PlayerBarEffects();

// The player shell must be usable immediately, even while account data and
// settings are still loading. The later call from initializePlayerEvents is
// intentionally idempotent and only confirms the initialized state.
queueMicrotask(() => playerBarEffects.init());
