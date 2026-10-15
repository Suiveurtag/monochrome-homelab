import { getVibrantColorFromImage } from './vibrant-color.js';

const colors = new Map();
const runs = new WeakMap();
const entrances = new WeakMap();

// The page chrome responds immediately, independently of the stats request.
export function beginStatsEntrance(root) {
    entrances.get(root)?.abort();
    runs.get(root)?.abort();
    const controller = new AbortController();
    entrances.set(root, controller);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;
    const animations = [];
    for (const [selector, delay] of [
        ['.stats-header', 0],
        ['.stats-toolbar', 55],
    ]) {
        const target = root.querySelector(selector);
        if (!target) continue;
        animations.push(
            target.animate(
                [
                    { opacity: 0.45, transform: 'translateY(7px)' },
                    { opacity: 1, transform: 'translateY(0)' },
                ],
                { duration: 420, delay, fill: 'backwards', easing: 'cubic-bezier(.16,1,.3,1)' }
            )
        );
    }
    const cancel = () => animations.forEach((animation) => animation.cancel());
    controller.signal.addEventListener('abort', cancel, { once: true });
    reduced.addEventListener?.('change', () => reduced.matches && cancel(), { signal: controller.signal });
}

// Each render owns a finite animation. Quiet updates retain exact values immediately.
export function animateStatsScene(root, startCount) {
    runs.get(root)?.abort();
    const controller = new AbortController();
    runs.set(root, controller);
    const { signal } = controller;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const content = root.querySelector('#stats-content');
    const finishEntry = () => content.classList.remove('stats-entry');
    if (reduced.matches) finishEntry();
    content.addEventListener?.(
        'animationend',
        (event) => {
            if (event.animationName === 'stats-orbit-enter') finishEntry();
        },
        { signal }
    );
    const images = [...root.querySelectorAll('.stats-cover-card img')];
    for (let index = 0; index < 3; index++) root.style.removeProperty(`--stats-color-${index}`);
    images.forEach((img, index) => {
        const cached = colors.get(img.src);
        if (cached)
            root.style.setProperty(`--stats-color-${index}`, `color-mix(in oklab, ${cached} 70%, var(--foreground))`);
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
            if (color)
                root.style.setProperty(
                    `--stats-color-${index}`,
                    `color-mix(in oklab, ${color} 70%, var(--foreground))`
                );
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
        const duration = Number.isFinite(startCount) ? 450 : 760;
        const formatter = new Intl.NumberFormat();
        metric.textContent = formatter.format(from);
        metric.dataset.displayCount = String(from);
        const start = performance.now();
        let frame;
        const tick = (now) => {
            if (signal.aborted) return;
            const progress = Math.min(1, (now - start) / duration);
            const displayed = Math.round(from + (total - from) * (1 - Math.pow(1 - progress, 4)));
            metric.textContent = formatter.format(displayed);
            metric.dataset.displayCount = String(displayed);
            if (progress < 1 && !reduced.matches && !document.hidden) frame = requestAnimationFrame(tick);
            else {
                metric.textContent = formatter.format(total);
                metric.dataset.displayCount = String(total);
            }
        };
        frame = requestAnimationFrame(tick);
        signal.addEventListener('abort', () => cancelAnimationFrame(frame), { once: true });
    }
    const fan = root.querySelector('.stats-cover-fan');
    if (fan) {
        const reset = () => {
            fan.style.removeProperty('--stats-tilt-x');
            fan.style.removeProperty('--stats-tilt-y');
            fan.style.removeProperty('--stats-shine-x');
            fan.style.removeProperty('--stats-shine-y');
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
                        '--stats-shine-x',
                        `${Math.max(0, Math.min(100, ((pointer.x - rect.left) / rect.width) * 100))}%`
                    );
                    fan.style.setProperty(
                        '--stats-shine-y',
                        `${Math.max(0, Math.min(100, ((pointer.y - rect.top) / rect.height) * 100))}%`
                    );
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
    const activeAnimations = new Set();
    const seen = new WeakSet();
    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                const section = entry.target;
                section.classList.toggle('stats-in-view', entry.isIntersecting);
                if (
                    !entry.isIntersecting ||
                    seen.has(section) ||
                    reduced.matches ||
                    content.classList.contains('stats-update')
                )
                    continue;
                seen.add(section);
                const targets = section.matches('.stats-scene')
                    ? []
                    : [
                          section.querySelector('.stats-section-header'),
                          ...section.querySelectorAll('tbody tr, .stats-legend li, .stats-history-items li'),
                      ];
                targets.filter(Boolean).forEach((target, index) => {
                    const animation = target.animate(
                        [
                            { opacity: 0.35, transform: `translateY(${index ? 8 : 5}px)` },
                            { opacity: 1, transform: 'translateY(0)' },
                        ],
                        { duration: 380, delay: Math.min(index * 24, 168), easing: 'cubic-bezier(.16,1,.3,1)' }
                    );
                    activeAnimations.add(animation);
                    animation.finished
                        .then(() => activeAnimations.delete(animation))
                        .catch(() => activeAnimations.delete(animation));
                });
            }
        },
        { threshold: 0.08 }
    );
    root.querySelectorAll('.stats-scene, .stats-trend, .stats-panel, .stats-history').forEach((section) =>
        observer.observe(section)
    );
    const visibility = () => root.classList.toggle('stats-document-hidden', Boolean(document.hidden));
    document.addEventListener?.('visibilitychange', visibility, { signal });
    visibility();
    reduced.addEventListener?.(
        'change',
        () => {
            if (reduced.matches) {
                finishEntry();
                activeAnimations.forEach((animation) => animation.cancel());
            }
        },
        { signal }
    );
    signal.addEventListener(
        'abort',
        () => {
            observer.disconnect();
            activeAnimations.forEach((animation) => animation.cancel());
            activeAnimations.clear();
        },
        { once: true }
    );
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
