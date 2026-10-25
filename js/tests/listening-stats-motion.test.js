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
function fixture(total, update = false) {
    const root = {
        metric: { dataset: { count: String(total) }, textContent: String(total) },
        style: { removeProperty() {} },
        querySelectorAll: () => [],
        querySelector: (selector) =>
            selector === '[data-count]'
                ? root.metric
                : selector === '#stats-content'
                  ? { classList: { contains: () => update } }
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

test('every entrance counts up from zero to the total', () => {
    const root = fixture(200);
    animateStatsScene(root);
    expect(root.metric.textContent).toBe('0');
    advance(850);
    expect(root.metric.textContent).toBe('200');
});

test('a new entrance cancels the prior count', () => {
    const root = fixture(200);
    animateStatsScene(root);
    advance(100);
    root.metric = { dataset: { count: '50' }, textContent: '50' };
    animateStatsScene(root);
    expect(root.metric.textContent).toBe('0');
    expect(frames.size).toBe(1);
    advance(850);
    expect(root.metric.textContent).toBe('50');
});

test('background updates keep the exact total without counting', () => {
    const root = fixture(200, true);
    animateStatsScene(root);
    expect(root.metric.textContent).toBe('200');
    expect(frames.size).toBe(0);
});

test('reduced motion preserves the final total without scheduling frames', () => {
    reduced = true;
    const root = fixture(200);
    animateStatsScene(root);
    expect(root.metric.textContent).toBe('200');
    expect(frames.size).toBe(0);
});
