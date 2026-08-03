/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
    buildSpicyTimeline,
    createSpicyLyricsRenderer,
    getCenteredScrollTop,
    parseSpicyTtml,
    parseTtmlTime,
} from './renderer.js';

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

    it('preserves word parts, background vocals and long interludes', () => {
        const parsed = parseSpicyTtml(`
            <tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
                <body><div>
                    <p begin="4s" end="8s">
                        <span begin="4s" end="5s">Hel</span><span begin="5s" end="6s">lo</span>
                        <span begin="6s" end="8s"> world</span>
                    </p>
                    <p ttm:role="x-bg" begin="4.5s" end="7s">
                        <span begin="4.5s" end="7s">Background</span>
                    </p>
                </div></body>
            </tt>
        `);
        const timeline = buildSpicyTimeline(parsed);

        expect(parsed[0].words.map(({ text, partOfWord }) => ({ text, partOfWord }))).toEqual([
            { text: 'Hel', partOfWord: true },
            { text: 'lo', partOfWord: false },
            { text: 'world', partOfWord: false },
        ]);
        expect(timeline.map((line) => ({ musical: Boolean(line.musical), background: line.backgroundLine }))).toEqual([
            { musical: true, background: undefined },
            { musical: false, background: false },
            { musical: false, background: true },
        ]);
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

    it('shows an interlude before late lyrics instead of activating the first line early', () => {
        const container = document.createElement('div');
        container.id = 'fullscreen-lyrics-content';
        document.body.appendChild(container);
        const renderer = createSpicyLyricsRenderer({
            container,
            track: { duration: 20 },
            ttml: `
                <tt xmlns="http://www.w3.org/ns/ttml"><body><div>
                    <p begin="10s" end="12s"><span begin="10s" end="12s">Late line</span></p>
                </div></body></tt>
            `,
            durationSeconds: 20,
            onSeek: vi.fn(),
        });

        renderer.setCurrentTime(1000, true);

        expect(container.querySelector('.musical-line.Active')).not.toBeNull();
        expect(container.querySelector('.line:not(.musical-line)')?.classList).toContain('NotSung');

        renderer.destroy();
        container.remove();
    });
});
