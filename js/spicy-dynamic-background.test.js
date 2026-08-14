import { beforeEach, describe, expect, test, vi } from 'vitest';

const { kawarpInstances } = vi.hoisted(() => ({ kawarpInstances: [] }));

vi.mock('@kawarp/core', () => ({
    default: class KawarpMock {
        constructor(canvas) {
            this.canvas = canvas;
            this.loadImage = vi.fn(async () => {});
            this.start = vi.fn();
            this.setOptions = vi.fn();
            this.dispose = vi.fn();
            kawarpInstances.push(this);
        }
    },
}));

beforeEach(() => {
    document.body.innerHTML = '';
    kawarpInstances.length = 0;
});

describe('Spicy dynamic background', () => {
    test('mounts once, reuses one Kawarp instance, and disposes its owned host', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);

        const controller = mountSpicyDynamicBackground(host, { className: 'test-background' });
        expect(mountSpicyDynamicBackground(host)).toBe(controller);
        expect(host.querySelectorAll('[data-spicy-background]')).toHaveLength(1);

        await controller.setSource('/covers/first.jpg');
        await controller.setSource('/covers/second.jpg');
        expect(kawarpInstances).toHaveLength(1);
        expect(kawarpInstances[0].loadImage).toHaveBeenNthCalledWith(1, '/covers/first.jpg');
        expect(kawarpInstances[0].loadImage).toHaveBeenNthCalledWith(2, '/covers/second.jpg');
        expect(controller.root.classList.contains('has-kawarp-background')).toBe(true);
        expect(controller.fallback.style.backgroundImage).toContain('/covers/second.jpg');

        controller.dispose();
        expect(kawarpInstances[0].dispose).toHaveBeenCalledOnce();
        expect(host.querySelector('[data-spicy-background]')).toBeNull();
    });

    test('keeps the cover fallback when no Kawarp-compatible source exists', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const controller = mountSpicyDynamicBackground(host);

        expect(await controller.setSource('/covers/animated.mp4')).toBe(false);
        expect(kawarpInstances).toHaveLength(0);
        expect(controller.canvas.style.display).toBe('none');
        expect(controller.fallback.style.backgroundImage).toContain('/covers/animated.mp4');
    });

    test('rejects a stale load before replacing the current artwork', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const controller = mountSpicyDynamicBackground(host);
        await controller.setSource('/covers/bootstrap.jpg');

        const stale = controller.setSource('/covers/stale.jpg');
        const current = controller.setSource('/covers/current.jpg');

        expect(await stale).toBe(false);
        expect(await current).toBe(true);
        expect(kawarpInstances[0].loadImage).not.toHaveBeenCalledWith('/covers/stale.jpg');
        expect(kawarpInstances[0].loadImage).toHaveBeenLastCalledWith('/covers/current.jpg');
        expect(controller.source).toBe('/covers/current.jpg');
        expect(controller.fallback.style.backgroundImage).toContain('/covers/current.jpg');
    });
});
