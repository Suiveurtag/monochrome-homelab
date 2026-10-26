import { beforeEach, describe, expect, test, vi } from 'vitest';

const { kawarpInstances } = vi.hoisted(() => ({ kawarpInstances: [] }));

vi.mock('@kawarp/core', () => ({
    default: class KawarpMock {
        constructor(canvas, options) {
            this.canvas = canvas;
            this.options = options;
            this.loadImage = vi.fn(async () => {});
            this.start = vi.fn();
            this.stop = vi.fn();
            this.resize = vi.fn();
            this.renderFrame = vi.fn();
            this.setOptions = vi.fn();
            this.dispose = vi.fn();
            this.loadVideo = vi.fn();
            this.unloadVideo = vi.fn();
            kawarpInstances.push(this);
        }
    },
}));

beforeEach(() => {
    document.body.innerHTML =
        '<style>[data-spicy-background]{position:absolute;width:400px;height:800px}[data-spicy-background]>canvas{position:absolute;width:100%;height:100%}</style>';
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
        await controller.setSource('/covers/first.jpg');
        expect(kawarpInstances[0].loadImage).toHaveBeenCalledTimes(1);
        await controller.setSource('/covers/second.jpg');
        expect(kawarpInstances).toHaveLength(1);
        expect(kawarpInstances[0].loadImage).toHaveBeenNthCalledWith(1, '/covers/first.jpg');
        expect(kawarpInstances[0].loadImage).toHaveBeenNthCalledWith(2, '/covers/second.jpg');
        expect(controller.root.classList.contains('has-kawarp-background')).toBe(true);
        expect(host.querySelector('.spicy-dynamic-bg-fallback')).toBeNull();

        controller.dispose();
        expect(kawarpInstances[0].dispose).toHaveBeenCalledOnce();
        expect(host.querySelector('[data-spicy-background]')).toBeNull();
    });

    test('follows the Canvas video and returns to the cover when it goes away', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const controller = mountSpicyDynamicBackground(host);
        const video = document.createElement('video');

        // Ready before the cover finished loading: attaches once Kawarp exists.
        const loading = controller.setSource('/covers/first.jpg');
        controller.followVideo(video);
        await loading;
        const kawarp = kawarpInstances[0];
        expect(kawarp.loadVideo).toHaveBeenCalledWith(video, expect.objectContaining({ sampleWidth: 72 }));

        controller.followVideo(null);
        expect(kawarp.unloadVideo).toHaveBeenCalledOnce();
        expect(kawarp.loadImage).toHaveBeenLastCalledWith('/covers/first.jpg');

        // Another cover load on the shared host keeps following the Canvas.
        controller.followVideo(video);
        await controller.setSource('/covers/second.jpg');
        expect(kawarp.loadImage).toHaveBeenLastCalledWith('/covers/second.jpg');
        expect(kawarp.loadVideo).toHaveBeenCalledTimes(4);
    });

    test('copies the real rendered canvas into the foreground instead of loading a second background', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.append(host);
        const controller = mountSpicyDynamicBackground(host, { foregroundClassName: 'test-foreground' });
        expect(controller.foreground).toBeTruthy();
        controller.foreground.style.cssText = 'position:absolute;width:400px;height:160px';
        await controller.setSource('/cover.jpg');
        const source = controller.canvas.getContext('2d');
        source.fillStyle = 'rgb(36, 87, 143)';
        source.fillRect(0, 0, controller.canvas.width, controller.canvas.height);
        controller.setForegroundActive(true);
        const pixels = controller.foreground.getContext('2d').getImageData(20, 20, 1, 1).data;
        expect([...pixels]).toEqual([36, 87, 143, 255]);
        expect(kawarpInstances).toHaveLength(1);
        expect(controller.foreground.parentElement).toBe(host);
        expect(controller.foreground.parentElement).not.toBe(controller.root);
        controller.dispose();
        expect(host.querySelector('.test-foreground')).toBeNull();
    });

    test('rejects animated sources instead of assigning an invalid CSS background image', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const controller = mountSpicyDynamicBackground(host);

        expect(await controller.setSource('/covers/animated.mp4')).toBe(false);
        expect(kawarpInstances).toHaveLength(0);
        expect(controller.canvas.style.display).toBe('none');
        expect(host.querySelector('.spicy-dynamic-bg-fallback')).toBeNull();
    });

    test('draws the first real frame without a transition or a fallback layer', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.append(host);
        const controller = mountSpicyDynamicBackground(host);
        expect(host.querySelectorAll('.spicy-dynamic-bg-fallback')).toHaveLength(0);
        await controller.setSource('/covers/first.jpg');
        const kawarp = kawarpInstances[0];
        expect(kawarp.options.transitionDuration).toBe(0);
        expect(kawarp.renderFrame).toHaveBeenCalled();
        expect(controller.root.classList.contains('has-kawarp-background')).toBe(true);
        controller.dispose();
    });

    test('keeps the real shader visible while another image loads', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.append(host);
        const controller = mountSpicyDynamicBackground(host);
        await controller.setSource('/covers/first.jpg');
        let resolveLoad;
        kawarpInstances[0].loadImage.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveLoad = resolve;
                })
        );
        const pending = controller.setSource('/covers/second.jpg');
        await vi.waitFor(() => expect(resolveLoad).toEqual(expect.any(Function)));
        expect(controller.root.classList.contains('has-kawarp-background')).toBe(true);
        expect(host.querySelector('.spicy-dynamic-bg-fallback')).toBeNull();
        resolveLoad();
        await pending;
        controller.dispose();
    });

    test('uses the first decoded Canvas frame directly, without loading a cover first', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.append(host);
        const controller = mountSpicyDynamicBackground(host);
        await controller.setSource('/cover.jpg', { deferToVideo: true });
        expect(kawarpInstances).toHaveLength(0);
        const video = document.createElement('video');
        Object.defineProperty(video, 'readyState', { value: 2 });
        controller.followVideo(video);
        const kawarp = kawarpInstances[0];
        expect(kawarp.loadImage).not.toHaveBeenCalled();
        expect(kawarp.loadVideo).toHaveBeenCalledWith(video, expect.objectContaining({ sampleWidth: 72 }));
        expect(kawarp.renderFrame).toHaveBeenCalled();
        expect(controller.root.classList.contains('has-kawarp-background')).toBe(true);
        // The shared lyrics renderer may repeat this without overriding the Canvas owner.
        await controller.setSource('/cover.jpg');
        expect(kawarp.loadImage).not.toHaveBeenCalled();
        kawarp.loadVideo.mock.lastCall[1].onError(new Error('unreadable'));
        expect(kawarp.loadImage).not.toHaveBeenCalled();
        expect(host.querySelector('.spicy-dynamic-bg-fallback')).toBeNull();
        controller.dispose();
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

        expect(kawarpInstances[0].renderFrame).toHaveBeenCalled();
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

        controller.kawarp.renderFrame.mockClear();
        controller.kawarp.resize.mockClear();
        controller.root.style.width = '460px';
        controller.resizeKawarp();

        expect(controller.kawarp.resize).toHaveBeenCalledOnce();
        expect(controller.kawarp.renderFrame).toHaveBeenCalledOnce();
        controller.dispose();
    });

    test('keeps the animated frame during a resize burst and redraws once when it settles', async () => {
        const { mountSpicyDynamicBackground } = await import('./spicy-dynamic-background.js');
        const host = document.createElement('div');
        document.body.append(host);
        const controller = mountSpicyDynamicBackground(host);
        await controller.setSource('/covers/first.jpg');
        const kawarp = controller.kawarp;
        kawarp.isPlaying = true;
        const context = controller.canvas.getContext('2d');
        const paint = () => {
            context.fillStyle = 'rgb(36, 87, 143)';
            context.fillRect(0, 0, controller.canvas.width, controller.canvas.height);
        };
        paint();
        kawarp.renderFrame.mockImplementation(paint);
        kawarp.renderFrame.mockClear();
        kawarp.resize.mockClear();
        const initialWidth = controller.canvas.width;
        vi.useFakeTimers();
        try {
            for (const width of [440, 480, 520]) {
                controller.root.style.width = `${width}px`;
                controller.scheduleResize();
                await vi.advanceTimersByTimeAsync(30);
                expect(controller.canvas.width).toBe(initialWidth);
                expect([...context.getImageData(20, 20, 1, 1).data]).toEqual([36, 87, 143, 255]);
            }
            await vi.advanceTimersByTimeAsync(150);
            expect(controller.canvas.width).toBe(Math.round(520 * window.devicePixelRatio));
            expect(kawarp.resize).toHaveBeenCalledOnce();
            expect(kawarp.renderFrame).toHaveBeenCalledOnce();
            expect([...context.getImageData(20, 20, 1, 1).data]).toEqual([36, 87, 143, 255]);
            controller.resizeKawarp();
            expect(kawarp.resize).toHaveBeenCalledOnce();
        } finally {
            controller.dispose();
            vi.useRealTimers();
        }
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
        expect(host.querySelector('.spicy-dynamic-bg-fallback')).toBeNull();
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
