// @vitest-environment happy-dom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AlbumCoverInspector } from './album-cover-inspector.js';

const markup = `
    <button id="trigger"><img id="cover" src="/cover.jpg" /></button>
    <div id="album-cover-inspector" hidden>
        <button class="album-cover-inspector-download"></button>
        <button class="album-cover-inspector-close"></button>
        <div class="album-cover-inspector-stage">
            <div class="album-cover-inspector-arrival">
                <div class="album-cover-inspector-card">
                    <div class="album-cover-inspector-media-host"></div>
                    <div class="album-cover-inspector-light"></div>
                </div>
            </div>
            <h2 id="album-cover-inspector-title"></h2>
            <p id="album-cover-inspector-artist"></p>
        </div>
    </div>
`;

describe('AlbumCoverInspector', () => {
    beforeEach(() => {
        document.body.innerHTML = markup;
        window.matchMedia = vi.fn(() => ({ matches: true }));
        window.requestAnimationFrame = vi.fn((callback) => {
            callback();
            return 1;
        });
        window.cancelAnimationFrame = vi.fn();
    });

    test('moves the live artwork into the 3D viewer and restores it on close', async () => {
        const inspector = new AlbumCoverInspector();
        const trigger = document.getElementById('trigger');
        const cover = document.getElementById('cover');

        await inspector.open({ media: cover, trigger, title: 'Discovery', artist: 'Daft Punk' });

        expect(inspector.isOpen).toBe(true);
        expect(document.querySelector('.album-cover-inspector-media-host > #cover')).toBe(cover);
        expect(document.getElementById('album-cover-inspector-title').textContent).toBe('Discovery');
        expect(document.getElementById('album-cover-inspector-artist').textContent).toBe('Daft Punk');
        expect(document.body.style.overflow).toBe('hidden');

        await inspector.close();

        expect(inspector.isOpen).toBe(false);
        expect(trigger.firstElementChild).toBe(cover);
        expect(document.body.style.overflow).toBe('');
    });

    test('closes with Escape and returns focus to the cover trigger', async () => {
        const inspector = new AlbumCoverInspector();
        const trigger = document.getElementById('trigger');
        const cover = document.getElementById('cover');
        await inspector.open({ media: cover, trigger });

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await Promise.resolve();

        expect(inspector.isOpen).toBe(false);
        expect(document.activeElement).toBe(trigger);
    });

    test('maps pointer position to the TIDAL tilt and glare range', () => {
        window.matchMedia = vi.fn(() => ({ matches: false }));
        const inspector = new AlbumCoverInspector();
        inspector.interactionSurface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });

        const positions = [
            { x: 50, y: 50, rotateX: 6, rotateY: -6 },
            { x: 150, y: 50, rotateX: 6, rotateY: 6 },
            { x: 50, y: 150, rotateX: -6, rotateY: -6 },
            { x: 150, y: 150, rotateX: -6, rotateY: 6 },
        ];

        positions.forEach(({ x, y, rotateX, rotateY }) => {
            inspector.updateTilt({ clientX: x, clientY: y });
            expect(inspector.springTarget.rotateX).toBe(rotateX);
            expect(inspector.springTarget.rotateY).toBe(rotateY);
        });

        inspector.updateTilt({ clientX: 200, clientY: 0 });
        expect(inspector.springTarget.glareX).toBe(100);
        expect(inspector.springTarget.glareY).toBe(100);
        expect(inspector.springTarget.opacity).toBe(0);
    });

    test('downloads the cover blob with an album-based filename', async () => {
        const inspector = new AlbumCoverInspector();
        const trigger = document.getElementById('trigger');
        const cover = document.getElementById('cover');
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
        const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        await inspector.open({
            media: cover,
            trigger,
            title: 'Discovery',
            downloadSource: async () => new Blob(['cover'], { type: 'image/png' }),
        });

        await expect(inspector.download()).resolves.toBe(true);

        expect(click).toHaveBeenCalledOnce();
        expect(createObjectURL).toHaveBeenCalledOnce();
        expect(document.querySelector('a[download]')).toBeNull();
        click.mockRestore();
        createObjectURL.mockRestore();
        revokeObjectURL.mockRestore();
    });
});
