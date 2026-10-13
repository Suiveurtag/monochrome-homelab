import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { animateStatsScene } from '../listening-stats-scene.js';

let clock;
let frames;
let nextFrame;
let reduced;

beforeEach(() => {
    clock = 0;
    nextFrame = 0;
    frames = new Map();
    reduced = false;
    vi.stubGlobal('performance', { now: () => clock });
    if (typeof document === 'undefined') vi.stubGlobal('document', { hidden: false });
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
    vi.stubGlobal('requestAnimationFrame', (callback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
    vi.stubGlobal(
        'IntersectionObserver',
        class {
            observe() {}
            disconnect() {}
        }
    );
});
afterEach(() => vi.unstubAllGlobals());
function fixture(total) {
    const root = {
        metric: { dataset: { count: String(total) }, textContent: String(total) },
        style: { removeProperty() {} },
        querySelectorAll: () => [],
        querySelector: (selector) =>
            selector === '[data-count]'
                ? root.metric
                : selector === '#stats-content'
                  ? { classList: { contains: () => false } }
                  : null,
    };
    return root;
}
function advance(milliseconds) {
    clock += milliseconds;
    const current = [...frames.values()];
    frames.clear();
    current.forEach((callback) => callback(clock));
}

test('replacement has the visible starting value before its first frame', () => {
    const root = fixture(200);
    animateStatsScene(root, 80);
    expect(root.metric.textContent).toBe('80');
    expect(root.metric.dataset.count).toBe('200');
    advance(450);
    expect(root.metric.textContent).toBe('200');
});

test('rapid replacement continues from the painted value and cancels the prior frame', () => {
    const root = fixture(200);
    animateStatsScene(root, 80);
    advance(100);
    const painted = Number(root.metric.dataset.displayCount);
    expect(painted).toBeGreaterThan(80);
    expect(painted).toBeLessThan(200);
    root.metric = { dataset: { count: '50' }, textContent: '50' };
    animateStatsScene(root, painted);
    expect(root.metric.textContent).toBe(String(painted));
    expect(frames.size).toBe(1);
    advance(450);
    expect(root.metric.dataset.displayCount).toBe('50');
    expect(root.metric.textContent).toBe('50');
});

test('reduced motion preserves the final total without scheduling frames', () => {
    reduced = true;
    const root = fixture(200);
    animateStatsScene(root, 80);
    expect(root.metric.textContent).toBe('200');
    expect(frames.size).toBe(0);
});
