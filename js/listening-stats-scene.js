import { getVibrantColorFromImage } from './vibrant-color.js';

const colors = new Map();
const runs = new WeakMap();

// Each render owns a finite animation. Quiet updates retain exact values immediately.
export function animateStatsScene(root, startCount) {
    runs.get(root)?.abort();
    const controller = new AbortController();
    runs.set(root, controller);
    const { signal } = controller;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const content = root.querySelector('#stats-content');
    const images = [...root.querySelectorAll('.stats-cover-card img')];
    for (let index = 0; index < 3; index++) root.style.removeProperty(`--stats-color-${index}`);
    images.forEach((img, index) => {
        const apply = () => {
            if (signal.aborted) return;
            let color = colors.get(img.src);
            if (!color) {
                try {
                    color = getVibrantColorFromImage(img);
                } catch {
                    /* Remote artwork may disallow canvas access. */
                }
                if (color) {
                    if (colors.size >= 64) colors.delete(colors.keys().next().value);
                    colors.set(img.src, color);
                }
            }
            if (color) root.style.setProperty(`--stats-color-${index}`, color);
        };
        if (img.complete && img.naturalWidth) apply();
        else img.addEventListener('load', apply, { once: true, signal });
    });
    // Reset a missing cover's palette rather than retaining another period's colors.
    for (let index = images.length; index < 3; index++) {
        root.style.removeProperty(`--stats-color-${index}`);
    }
    const metric = root.querySelector('[data-count]');
    if (metric && !reduced.matches && (Number.isFinite(startCount) || !content.classList.contains('stats-update'))) {
        const total = Number(metric.dataset.count);
        const from = Number.isFinite(startCount) ? startCount : 0;
        const duration = Number.isFinite(startCount) ? 450 : 850;
        const formatter = new Intl.NumberFormat();
        const start = performance.now();
        let frame;
        const tick = (now) => {
            if (signal.aborted) return;
            const progress = Math.min(1, (now - start) / duration);
            metric.textContent = formatter.format(Math.round(from + (total - from) * (1 - Math.pow(1 - progress, 4))));
            if (progress < 1 && !reduced.matches && !document.hidden) frame = requestAnimationFrame(tick);
            else metric.textContent = formatter.format(total);
        };
        frame = requestAnimationFrame(tick);
        signal.addEventListener('abort', () => cancelAnimationFrame(frame), { once: true });
    }
    const fan = root.querySelector('.stats-cover-fan');
    if (fan) {
        const reset = () => {
            fan.style.removeProperty('--stats-tilt-x');
            fan.style.removeProperty('--stats-tilt-y');
        };
        let tiltFrame;
        let pointer;
        fan.addEventListener(
            'pointermove',
            (event) => {
                if (reduced.matches || event.pointerType !== 'mouse') return;
                pointer = { x: event.clientX, y: event.clientY };
                if (tiltFrame) return;
                tiltFrame = requestAnimationFrame(() => {
                    tiltFrame = null;
                    const rect = fan.getBoundingClientRect();
                    fan.style.setProperty(
                        '--stats-tilt-x',
                        `${((pointer.y - rect.top - rect.height / 2) / rect.height) * -7}deg`
                    );
                    fan.style.setProperty(
                        '--stats-tilt-y',
                        `${((pointer.x - rect.left - rect.width / 2) / rect.width) * 9}deg`
                    );
                });
            },
            { signal }
        );
        signal.addEventListener('abort', () => cancelAnimationFrame(tiltFrame), { once: true });
        fan.addEventListener(
            'pointerleave',
            () => {
                cancelAnimationFrame(tiltFrame);
                tiltFrame = null;
                reset();
            },
            { signal }
        );
        reduced.addEventListener('change', reset, { signal });
    }
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) entry.target.classList.toggle('stats-in-view', entry.isIntersecting);
    });
    root.querySelectorAll('.stats-scene, .stats-panel, .stats-history').forEach((section) => observer.observe(section));
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
}

const contentAnimations = new WeakMap();
export function transitionStatsContent(content) {
    contentAnimations.get(content)?.cancel();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = content.animate(
        [
            { opacity: 0.65, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' }
    );
    contentAnimations.set(content, animation);
}

export function syncStatsSegments(root) {
    const groups = [...root.querySelectorAll('.stats-segments')];
    const positions = groups.map((group) => {
        const selected = group.querySelector('button[aria-pressed="true"]');
        return selected
            ? { group, x: selected.offsetLeft, width: selected.offsetWidth, height: selected.offsetHeight }
            : null;
    });
    for (const position of positions.filter(Boolean)) {
        let indicator = position.group.querySelector('.stats-segment-indicator');
        if (!indicator) {
            indicator = document.createElement('span');
            indicator.className = 'stats-segment-indicator';
            indicator.setAttribute('aria-hidden', 'true');
            position.group.prepend(indicator);
        }
        indicator.style.width = `${position.width}px`;
        indicator.style.height = `${position.height}px`;
        indicator.style.transform = `translateX(${position.x - 4}px)`;
    }
}
