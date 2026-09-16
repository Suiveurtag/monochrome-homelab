import { describe, expect, it } from 'vitest';
import { isTtml, lrcToTtml, lyricsToTtml, normalizeTtmlWordTiming, parseLrc, plainLyricsToTtml } from './lyrics-format.js';

describe('LRC lyrics formatting', () => {
    it('parses centisecond and millisecond timestamps', () => {
        expect(parseLrc('[00:01.25] First\n[01:02.345] Second')).toEqual([
            { timestamp: 1250, text: 'First' },
            { timestamp: 62345, text: 'Second' },
        ]);
    });

    it('supports offsets, repeated timestamps and metadata headers', () => {
        expect(parseLrc('[ar:Artist]\n[offset:100]\n[00:01.00][00:02.00] Line')).toEqual([
            { timestamp: 1100, text: 'Line' },
            { timestamp: 2100, text: 'Line' },
        ]);
    });

    it('creates safe TTML for the Monochrome lyrics component', () => {
        const ttml = lrcToTtml('[00:01.00] Rock & <roll>\n[00:03.00] End', 5);
        expect(ttml).toContain('begin="00:00:01.000" end="00:00:03.000"');
        expect(ttml).toContain('Rock &amp; &lt;roll&gt;');
        expect(ttml).toContain('begin="00:00:03.000" end="00:00:05.000"');
    });

    it('recognizes uploaded TTML and preserves existing word timing', () => {
        const ttml =
            '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="2s"><span begin="1s" end="2s">Line</span></p></div></body></tt>';
        expect(isTtml(ttml)).toBe(true);
        expect(lyricsToTtml(ttml)).toContain('<span begin="1s" end="2s">Line</span>');
        expect(isTtml('<tt><body></body></tt>')).toBe(false);
    });

    it('adds interpolated word timings to line-timed TTML', () => {
        const input =
            '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Line"><body><div><p begin="1s" end="3s">Why\'d you wanna go</p></div></body></tt>';
        const normalized = normalizeTtmlWordTiming(input);
        const document = new DOMParser().parseFromString(normalized, 'application/xml');
        const line = document.getElementsByTagNameNS('http://www.w3.org/ns/ttml', 'p')[0];
        expect(document.documentElement.getAttribute('itunes:timing')).toBe('Word');
        expect(line.getElementsByTagNameNS('http://www.w3.org/ns/ttml', 'span')).toHaveLength(4);
        expect(line.textContent).toBe("Why'd you wanna go");
        expect(line.querySelector('span')?.getAttribute('begin')).toBe('00:00:01.000');
        expect(line.lastElementChild?.getAttribute('end')).toBe('00:00:03.000');
    });

    it('turns parenthesized vocals into an AMLL/Spicy background lane', () => {
        const input =
            '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><div><p begin="1s" end="3s">Main line (background voice)</p></div></body></tt>';
        const normalized = normalizeTtmlWordTiming(input);
        const document = new DOMParser().parseFromString(normalized, 'application/xml');
        const background = document.querySelector('[*|role="x-bg"]');
        expect(background).toBeTruthy();
        expect(background?.textContent).toBe('(background voice)');
        expect(background?.getElementsByTagNameNS('http://www.w3.org/ns/ttml', 'span')).toHaveLength(2);
    });

    it('restores the missing opening duet lane in the Stars Apple export', () => {
        const input =
            '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal"><head><metadata><ttm:title xmlns:ttm="http://www.w3.org/ns/ttml#metadata">Stars</ttm:title><ttm:artist xmlns:ttm="http://www.w3.org/ns/ttml#metadata">PinkPantheress</ttm:artist></metadata></head><body><div><p begin="1s" end="2s">Why\'d you wanna go (why\'d you wanna go)</p><p begin="2s" end="3s">You need somebody, baby, just call me</p><p begin="3s" end="4s">Tell me what always keeps you up at night</p></div></body></tt>';
        const normalized = normalizeTtmlWordTiming(input);
        const document = new DOMParser().parseFromString(normalized, 'application/xml');
        const lines = Array.from(document.getElementsByTagNameNS('http://www.w3.org/ns/ttml', 'p'));

        expect(lines.map((line) => line.getAttribute('itunes:align'))).toEqual(['right', 'right', null]);
        expect(lines.map((line) => line.getAttribute('ttm:agent'))).toEqual(['v2', 'v2', null]);
        expect(document.querySelector('[*|role="x-bg"]')?.textContent).toBe('(why\'d you wanna go)');
    });

    it('turns plain fallback lyrics into timed TTML', () => {
        const ttml = plainLyricsToTtml('First & line\nSecond <line>', 10);
        expect(ttml).toContain('begin="00:00:00.000" end="00:00:05.000"');
        expect(ttml).toContain('begin="00:00:05.000" end="00:00:10.000"');
        expect(ttml).toContain('First &amp; line');
        expect(ttml).toContain('Second &lt;line&gt;');
    });
});
