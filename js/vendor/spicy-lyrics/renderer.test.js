/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { createSpicyLyricsRenderer, getCenteredScrollTop, parseSpicyTtml, parseTtmlTime } from './renderer.js';

vi.mock('../../artwork-media.js', () => ({
    getArtworkSources: () => ({ static: '' }),
}));

describe('Spicy Lyrics renderer', () => {
    it('parses Apple-style word synced TTML', () => {
        const lines = parseSpicyTtml(`
            <tt xmlns="http://www.w3.org/ns/ttml">
                <body><div>
                    <p begin="00:00:02.000" end="00:00:05.000">
                        <span begin="00:00:02.000" end="00:00:03.000">Hello</span>
                        <span begin="00:00:03.000" end="00:00:05.000">world</span>
                    </p>
                </div></body>
            </tt>
        `);

        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({ start: 2000, end: 5000 });
        expect(lines[0].words).toMatchObject([
            { text: 'Hello', start: 2000, end: 3000 },
            { text: 'world', start: 3000, end: 5000 },
        ]);
    });

    it('supports TTML clock, second and millisecond timings', () => {
        expect(parseTtmlTime('01:02:03.500')).toBe(3723500);
        expect(parseTtmlTime('4.25s')).toBe(4250);
        expect(parseTtmlTime('750ms')).toBe(750);
    });

    it('centers the active line and clamps both ends', () => {
        expect(getCenteredScrollTop(900, 100, 600, 2200)).toBe(650);
        expect(getCenteredScrollTop(10, 80, 600, 2200)).toBe(0);
        expect(getCenteredScrollTop(2150, 100, 600, 2200)).toBe(1600);
    });

    it('mounts the native Spicy DOM and activates the current fullscreen line', () => {
        const container = document.createElement('div');
        container.id = 'fullscreen-lyrics-content';
        document.body.appendChild(container);
        const renderer = createSpicyLyricsRenderer({
            container,
            track: { duration: 10 },
            ttml: `
                <tt xmlns="http://www.w3.org/ns/ttml"><body><div>
                    <p begin="0s" end="2s">First line</p>
                    <p begin="2s" end="5s"><span begin="2s" end="5s">Centered</span></p>
                </div></body></tt>
            `,
            durationSeconds: 10,
            onSeek: vi.fn(),
        });

        renderer.setCurrentTime(2500, true);

        expect(container.querySelector('am-lyrics')).toBeNull();
        expect(renderer.root.classList).toContain('Fullscreen');
        expect(container.querySelectorAll('.SpicyLyricsScrollContainer > .line')).toHaveLength(2);
        expect(container.querySelector('.line.Active')?.textContent).toBe('Centered');

        renderer.destroy();
        container.remove();
    });
});
