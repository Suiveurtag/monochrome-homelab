import { beforeEach, describe, expect, test, vi } from 'vitest';

const { kawarpInstances } = vi.hoisted(() => ({ kawarpInstances: [] }));

vi.mock('@kawarp/core', () => ({
    default: class KawarpMock {
        constructor(canvas) {
            this.canvas = canvas;
            this.loadImage = vi.fn(async () => {});
            this.start = vi.fn();
            this.stop = vi.fn();
            this.resize = vi.fn();
            this.renderFrame = vi.fn();
            this.setOptions = vi.fn();
            this.dispose = vi.fn();
            kawarpInstances.push(this);
        }
    },
}));

beforeEach(() => {
    document.body.innerHTML = '';
    kawarpInstances.length = 0;
    vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn(() => 1)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    );
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

    test('rejects animated sources instead of assigning an invalid CSS background image', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const controller = mountSpicyDynamicBackground(host);

        expect(await controller.setSource('/covers/animated.mp4')).toBe(false);
        expect(kawarpInstances).toHaveLength(0);
        expect(controller.canvas.style.display).toBe('none');
        expect(controller.fallback.style.backgroundImage).toBe('');
    });

    test('crossfades between two static fallback layers', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const controller = mountSpicyDynamicBackground(host);

        await controller.setSource('/covers/first.jpg');
        await controller.setSource('/covers/second.jpg');

        const fallbacks = host.querySelectorAll('.spicy-dynamic-bg-fallback');
        expect(fallbacks).toHaveLength(2);
        expect(host.querySelectorAll('.spicy-dynamic-bg-fallback.is-visible')).toHaveLength(1);
        expect(controller.fallback.style.backgroundImage).toContain('/covers/second.jpg');
    });

    test('stops hidden backgrounds and resumes their existing Kawarp instance', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const controller = mountSpicyDynamicBackground(host);
        await controller.setSource('/covers/first.jpg');

        controller.setActive(false);
        expect(kawarpInstances[0].stop).toHaveBeenCalledOnce();
        controller.setActive(true);
        expect(kawarpInstances[0].start).toHaveBeenCalledTimes(2);
    });

    test('renders a newly loaded frame while the panel is collapsed', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const controller = mountSpicyDynamicBackground(host);
        controller.setActive(false);

        await controller.setSource('/covers/collapsed-track.jpg');

        expect(kawarpInstances[0].renderFrame).toHaveBeenCalledOnce();
        expect(controller.root.classList.contains('has-kawarp-background')).toBe(true);
        controller.dispose();
    });

    test('redraws a paused Kawarp frame after its panel is resized', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const controller = mountSpicyDynamicBackground(host);
        await controller.setSource('/covers/first.jpg');
        controller.kawarp.isPlaying = false;

        controller.resizeKawarp();

        expect(controller.kawarp.resize).toHaveBeenCalledOnce();
        expect(controller.kawarp.renderFrame).toHaveBeenCalledOnce();
        controller.dispose();
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

    test('uses restrained playback motion and freezes the current frame while paused', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        const audio = document.createElement('audio');
        let paused = false;
        Object.defineProperty(audio, 'paused', { configurable: true, get: () => paused });
        document.body.append(host, audio);
        const controller = mountSpicyDynamicBackground(host);
        controller.connectPlayback({ getElement: () => audio, getAnalyser: () => null });

        await controller.setSource('/covers/fluid.jpg');
        expect(kawarpInstances[0].setOptions).toHaveBeenCalledWith(
            expect.objectContaining({ animationSpeed: 0.35, scale: 1 })
        );

        const optionsCallsBeforePause = kawarpInstances[0].setOptions.mock.calls.length;
        paused = true;
        audio.dispatchEvent(new Event('pause'));
        expect(kawarpInstances[0].stop).toHaveBeenCalledOnce();
        expect(kawarpInstances[0].setOptions).toHaveBeenCalledTimes(optionsCallsBeforePause);

        paused = false;
        audio.dispatchEvent(new Event('play'));
        expect(kawarpInstances[0].start).toHaveBeenCalledTimes(2);
        controller.dispose();
    });

    test('holds the Kawarp frame still when reduced motion is requested', async () => {
        vi.stubGlobal(
            'matchMedia',
            vi.fn((query) => ({
                matches: query === '(prefers-reduced-motion: reduce)',
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }))
        );
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const controller = mountSpicyDynamicBackground(host);

        await controller.setSource('/covers/still.jpg');

        expect(kawarpInstances[0].setOptions).toHaveBeenCalledWith(
            expect.objectContaining({ animationSpeed: 0, scale: 1, transitionDuration: 0 })
        );
        expect(requestAnimationFrame).not.toHaveBeenCalled();
        controller.dispose();
    });
});
