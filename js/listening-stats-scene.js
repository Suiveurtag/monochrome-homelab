import { getVibrantColorFromImage } from './vibrant-color.js';

const colors = new Map();
const runs = new WeakMap();

// Each render owns a finite animation. Quiet updates retain exact values immediately.
export function animateStatsScene(root) {
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
                if (color) colors.set(img.src, color);
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
    if (metric && !reduced.matches && !content.classList.contains('stats-update')) {
        const total = Number(metric.dataset.count);
        const formatter = new Intl.NumberFormat();
        const start = performance.now();
        let frame;
        const tick = (now) => {
            if (signal.aborted) return;
            const progress = Math.min(1, (now - start) / 850);
            metric.textContent = formatter.format(Math.round(total * (1 - Math.pow(1 - progress, 4))));
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
        fan.addEventListener(
            'pointermove',
            (event) => {
                if (reduced.matches || event.pointerType !== 'mouse') return;
                const rect = fan.getBoundingClientRect();
                fan.style.setProperty(
                    '--stats-tilt-x',
                    `${((event.clientY - rect.top - rect.height / 2) / rect.height) * -7}deg`
                );
                fan.style.setProperty(
                    '--stats-tilt-y',
                    `${((event.clientX - rect.left - rect.width / 2) / rect.width) * 9}deg`
                );
            },
            { signal }
        );
        fan.addEventListener('pointerleave', reset, { signal });
        reduced.addEventListener('change', reset, { signal });
    }
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) entry.target.classList.toggle('stats-in-view', entry.isIntersecting);
    });
    root.querySelectorAll('.stats-scene, .stats-panel, .stats-history').forEach((section) => observer.observe(section));
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
}
