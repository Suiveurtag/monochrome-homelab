import { describe, expect, it } from 'vitest';
import { isTtml, lrcToTtml, lyricsToTtml, parseLrc } from './lyrics-format.js';

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

    it('recognizes and preserves uploaded TTML', () => {
        const ttml = '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="2s"><span begin="1s" end="2s">Line</span></p></div></body></tt>';
        expect(isTtml(ttml)).toBe(true);
        expect(lyricsToTtml(ttml)).toBe(ttml);
        expect(isTtml('<tt><body></body></tt>')).toBe(false);
    });
});
