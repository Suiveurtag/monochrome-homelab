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

    test('tilts the artwork toward the pointed corner while keeping the frontlight near center', () => {
        window.matchMedia = vi.fn(() => ({ matches: false }));
        const inspector = new AlbumCoverInspector();
        inspector.interactionSurface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });

        const corners = [
            { x: 0, y: 0, rotateX: '14.00deg', rotateY: '-14.00deg', depthX: '12.0px', depthY: '12.0px' },
            { x: 200, y: 0, rotateX: '14.00deg', rotateY: '14.00deg', depthX: '-12.0px', depthY: '12.0px' },
            { x: 0, y: 200, rotateX: '-14.00deg', rotateY: '-14.00deg', depthX: '12.0px', depthY: '-12.0px' },
            { x: 200, y: 200, rotateX: '-14.00deg', rotateY: '14.00deg', depthX: '-12.0px', depthY: '-12.0px' },
        ];

        corners.forEach(({ x, y, rotateX, rotateY, depthX, depthY }) => {
            inspector.updateTilt({ clientX: x, clientY: y });
            expect(inspector.card.style.getPropertyValue('--cover-rotate-x')).toBe(rotateX);
            expect(inspector.card.style.getPropertyValue('--cover-rotate-y')).toBe(rotateY);
            expect(inspector.card.style.getPropertyValue('--cover-depth-x')).toBe(depthX);
            expect(inspector.card.style.getPropertyValue('--cover-depth-y')).toBe(depthY);
        });

        inspector.updateTilt({ clientX: 200, clientY: 0 });
        expect(inspector.card.style.getPropertyValue('--cover-light-x')).toBe('58.0%');
        expect(inspector.card.style.getPropertyValue('--cover-light-y')).toBe('30.0%');
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
