import { afterEach, describe, expect, test } from 'vitest';
import { parseSpicyTtml, parseTtmlTime, SpicyLyricsElement, SpicySpring } from './spicy-lyrics-renderer.js';

afterEach(() => document.body.replaceChildren());

const WORD_SYNC_TTML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body><div>
    <p begin="00:00:01.000" end="00:00:03.000">
      <span begin="00:00:01.000" end="00:00:01.500">Spicy</span>
      <span begin="00:00:01.500" end="00:00:03.000"> Lyrics</span>
    </p>
  </div></body>
</tt>`;

const LINE_SYNC_TTML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" itunes:timing="Line">
  <body><div><p begin="00:00:09.649" end="00:00:12.174">Feel  it  come</p></div></body>
</tt>`;

describe('Spicy Lyrics renderer', () => {
    test('parses TTML clock, seconds and milliseconds timing', () => {
        expect(parseTtmlTime('00:01:02.250')).toBe(62250);
        expect(parseTtmlTime('1.5s')).toBe(1500);
        expect(parseTtmlTime('125ms')).toBe(125);
    });

    test('keeps word-level TTML timing instead of flattening it to lines', () => {
        const [line] = parseSpicyTtml(WORD_SYNC_TTML);
        expect(line.start).toBe(1000);
        expect(line.end).toBe(3000);
        expect(line.text).toBe('Spicy Lyrics');
        expect(line.words).toEqual([
            {
                text: 'Spicy',
                spaceBefore: false,
                start: 1000,
                end: 1500,
                background: false,
                isPartOfWord: false,
            },
            {
                text: ' Lyrics',
                spaceBefore: true,
                start: 1500,
                end: 3000,
                background: false,
                isPartOfWord: false,
            },
        ]);
    });

    test('uses the upstream line renderer for line-timed Apple lyrics', () => {
        const [line] = parseSpicyTtml(LINE_SYNC_TTML);
        expect(line.text).toBe('Feel it come');
        expect(line.syncType).toBe('Line');
        expect(line.words.map((word) => word.text)).toEqual(['Feel it come']);
        expect(line.words[0].start).toBe(9649);
        expect(line.words.at(-1).end).toBe(12174);

        const element = new SpicyLyricsElement();
        element.ttml = LINE_SYNC_TTML;
        document.body.appendChild(element);
        const renderedLine = element._lineStates.find((state) => !state.musical).element;
        expect(element.shadowRoot.querySelector('.SpicyLyricsScrollContainer').dataset.lyricsType).toBe('Line');
        expect(renderedLine.querySelectorAll('.spicy-word-token')).toHaveLength(0);
        expect(renderedLine.textContent).toBe('Feel it come');
    });

    test('matches upstream nesting of Apple x-bg paragraphs below their lead vocal', () => {
        const backgroundTtml = WORD_SYNC_TTML.replace(
            '</p>',
            '</p><p ttm:role="x-bg" begin="00:00:01.200" end="00:00:02.000"><span begin="00:00:01.200" end="00:00:02.000">Backing</span></p>'
        );
        const [line] = parseSpicyTtml(backgroundTtml);
        expect(line.background).toBe(false);
        expect(line.backgrounds).toHaveLength(1);
        expect(line.backgrounds[0].background).toBe(true);
        expect(line.backgrounds[0].words.every((word) => word.background)).toBe(true);
    });

    test('maps Apple x-translation vocal lanes to Spicy duet alignment', () => {
        const duetTtml = WORD_SYNC_TTML.replace(
            '<p begin="00:00:01.000"',
            '<p ttm:role="x-translation" begin="00:00:01.000"'
        );

        const [line] = parseSpicyTtml(duetTtml);
        expect(line.opposite).toBe(true);
    });

    test('renders upstream word boundaries and emits the existing line-click seek contract', () => {
        const element = new SpicyLyricsElement();
        element.style.width = '600px';
        element.style.height = '800px';
        element.ttml = WORD_SYNC_TTML;
        document.body.appendChild(element);
        let timestamp = null;
        element.addEventListener('line-click', (event) => (timestamp = event.detail.timestamp));
        const root = element.shadowRoot;
        const renderedLine = element._lineStates[0].element;
        renderedLine.click();

        expect(root.querySelector('.ContentBox')).toBeTruthy();
        expect(root.querySelector('.simplebar-content .VirtualLyricsContainer')).toBeTruthy();
        expect(renderedLine.classList.contains('musical-line')).toBe(false);
        expect(renderedLine.querySelectorAll('.word, .letterGroup')).toHaveLength(2);
        expect(renderedLine.querySelector('.word:not(.LastWordInLine)')?.textContent).toBe('Spicy');
        expect(renderedLine.querySelector('.letterGroup.LastWordInLine')?.textContent).toBe('Lyrics');
        expect(renderedLine.querySelectorAll('.word-group')).toHaveLength(0);
        expect(renderedLine.querySelectorAll('.spicy-word-token')).toHaveLength(2);
        expect(renderedLine.querySelectorAll('.spicy-word-space')).toHaveLength(1);
        expect(root.querySelector('style').textContent).toContain('column-gap: 0.32ch');
        expect(timestamp).toBe(1000);
    });

    test('groups only TTML syllables that belong to the same word', () => {
        const syllableTtml = WORD_SYNC_TTML.replace('>Spicy</span>', '>Spic</span>').replace(
            '> Lyrics</span>',
            '>y</span>'
        );
        const element = new SpicyLyricsElement();
        element.ttml = syllableTtml;
        document.body.appendChild(element);
        const renderedLine = element._lineStates[0].element;

        expect(renderedLine.querySelectorAll('.word-group')).toHaveLength(1);
        expect(renderedLine.querySelector('.word-group')?.textContent).toBe('Spicy');
        expect(renderedLine.querySelector('.word.PartOfWord')?.textContent).toBe('Spic');
    });

    test('keeps visible spacing after a multi-syllable word in imported Apple TTML', () => {
        const importedTtml = `<?xml version="1.0" encoding="UTF-8"?>
        <tt xmlns="http://www.w3.org/ns/ttml"><body><div>
          <p begin="00:00:01.000" end="00:00:03.000">
            <span begin="00:00:01.000" end="00:00:01.500">Every</span>
            <span begin="00:00:01.500" end="00:00:02.000">body</span>
            <span begin="00:00:02.000" end="00:00:03.000"> knows</span>
          </p>
        </div></body></tt>`;
        const element = new SpicyLyricsElement();
        element.ttml = importedTtml;
        document.body.appendChild(element);
        const renderedLine = element._lineStates[0].element;

        expect(renderedLine.querySelector('.word-group')?.textContent).toBe('Everybody');
        expect(renderedLine.querySelectorAll('.spicy-word-token')).toHaveLength(2);
        expect(element.shadowRoot.querySelector('style').textContent).toContain('column-gap: 0.32ch');
    });

    test('uses upstream letter emphasis for words lasting at least one second', () => {
        const element = new SpicyLyricsElement();
        element.ttml = WORD_SYNC_TTML;
        document.body.appendChild(element);

        const renderedLine = element._lineStates[0].element;
        expect(renderedLine.querySelectorAll('.letterGroup')).toHaveLength(1);
        expect(renderedLine.querySelector('.letterGroup')?.textContent).toBe('Lyrics');
    });

    test('reuses one host-owned background controller inside the Now Playing panel', async () => {
        const host = document.createElement('aside');
        host.dataset.spicyBackgroundHost = '';
        const element = new SpicyLyricsElement();
        element.ttml = WORD_SYNC_TTML;
        host.appendChild(element);
        document.body.appendChild(host);
        await Promise.resolve();

        expect(element._dynamicBackground).toBeNull();
        expect(element._ownsExternalBackground).toBe(false);
        expect(host.querySelectorAll('[data-spicy-background]')).toHaveLength(1);
        expect(host.querySelectorAll('canvas.spicy-dynamic-bg')).toHaveLength(1);
        expect(element.shadowRoot.querySelector('canvas.spicy-dynamic-bg')).toBeNull();
        expect(element.getAttribute('data-external-background')).toBe('true');
    });

    test('uses the upstream damped spring solver without overshooting a critical spring', () => {
        const spring = new SpicySpring(0, 2, 1, 1);
        const samples = Array.from({ length: 120 }, () => spring.Step(1 / 60));
        expect(samples.every((sample) => sample >= 0 && sample <= 1)).toBe(true);
        expect(samples.at(-1)).toBeCloseTo(1, 4);
    });
});
