import { afterEach, describe, expect, test } from 'vitest';
import { getScrollLineIndex, parseSpicyTtml, parseTtmlTime, SpicyLyricsElement, SpicySpring } from './spicy-lyrics-renderer.js';
import { repairCachedSpicyTtml } from './spicy-lyrics-ttml.js';

afterEach(() => document.body.replaceChildren());

const WORD_SYNC_TTML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal">
  <body><div>
    <p begin="00:00:01.000" end="00:00:03.000">
      <span begin="00:00:01.000" end="00:00:01.500">Spicy</span>
      <span begin="00:00:01.500" end="00:00:03.000"> Lyrics</span>
    </p>
  </div></body>
</tt>`;

const LINE_SYNC_TTML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Line">
  <body><div><p begin="00:00:09.649" end="00:00:12.174">Feel  it  come</p></div></body>
</tt>`;

describe('Spicy Lyrics renderer', () => {
    test('repairs cached Spicy API boundaries and renders separate words', () => {
        const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="4s"><span begin="1s" end="1.5s">I</span><span begin="1.5s" end="2s">might</span><span begin="2s" end="3s">cra</span><span begin="3s" end="4s">zy</span></p></div></body></tt>';
        const syllables = [{ Text: 'I' }, { Text: 'might' }, { Text: 'cra', IsPartOfWord: true }, { Text: 'zy' }];
        const raw = { lyrics: { body: { Body: { Content: [{ Lead: { Syllables: syllables } }] } } } };
        const repaired = repairCachedSpicyTtml(ttml, raw);
        expect(parseSpicyTtml(repaired)[0].text).toBe('I might crazy');
        expect(parseSpicyTtml(repairCachedSpicyTtml(repaired, raw))[0].text).toBe('I might crazy');
        const element = new SpicyLyricsElement();
        element.ttml = repaired;
        document.body.appendChild(element);
        expect(element._lineStates[0].element.querySelectorAll('.spicy-word-token')).toHaveLength(3);
        expect(element._lineStates[0].element.querySelectorAll('.spicy-word-space')).toHaveLength(2);
    });
    test('does not let a lingering background vocal pull scrolling back to its lead', () => {
        const lines = [
            { start: 0, end: 1000 },
            { start: 0, end: 4000, background: true },
            { start: 1500, end: 3000 },
        ];
        expect(getScrollLineIndex(lines, 2000)).toBe(2);
    });
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

    test('keeps an inline x-bg lane in Spicy Lyrics', () => {
        const inlineBackgroundTtml = `<?xml version="1.0" encoding="UTF-8"?>
        <tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
          <body><div><p begin="00:00:01.000" end="00:00:03.000">
            <span begin="00:00:01.000" end="00:00:02.000">Main</span>
            <span ttm:role="x-bg"><span begin="00:00:01.500" end="00:00:02.500">(backing)</span></span>
          </p></div></body>
        </tt>`;

        const [line] = parseSpicyTtml(inlineBackgroundTtml);
        expect(line.text).toBe('Main');
        expect(line.backgrounds).toHaveLength(1);
        expect(line.backgrounds[0].text).toBe('(backing)');
        expect(line.backgrounds[0].words[0].background).toBe(true);
    });

    test('maps Apple x-translation vocal lanes to Spicy duet alignment', () => {
        const duetTtml = WORD_SYNC_TTML.replace(
            '<p begin="00:00:01.000"',
            '<p ttm:role="x-translation" begin="00:00:01.000"'
        );

        const [line] = parseSpicyTtml(duetTtml);
        expect(line.opposite).toBe(true);
    });

    test('maps Apple right-aligned lanes to Spicy duet alignment', () => {
        const rightAlignedTtml = WORD_SYNC_TTML.replace(
            '<p begin="00:00:01.000"',
            '<p itunes:align="right" begin="00:00:01.000"',
        );

        const [line] = parseSpicyTtml(rightAlignedTtml);
        expect(line.opposite).toBe(true);

        const element = new SpicyLyricsElement();
        element.ttml = rightAlignedTtml;
        document.body.appendChild(element);
        expect(element._lineStates[0].element.classList.contains('OppositeAligned')).toBe(true);
        expect(element.shadowRoot.querySelector('.SpicyLyricsScrollContainer')?.classList.contains('HasDuetLines')).toBe(
            true,
        );
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

describe('Spicy Lyrics 6.5.10', () => {
    test('lifts the letters of a held Bloom word in order at their playback time', () => {
        localStorage.setItem('spicyLyrics.style', 'bloom');
        try {
            const lyrics = new SpicyLyricsElement();
            lyrics.ttml = WORD_SYNC_TTML;
            lyrics.style.cssText = 'width: 600px; height: 640px;';
            document.body.appendChild(lyrics);
            const letters = lyrics.lyricElements[0].querySelectorAll('.letterGroup .letter');
            const lift = (letter) => {
                const { transform } = getComputedStyle(letter);
                return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
            };

            lyrics.currentTime = 1550;
            expect(lift(letters[0])).toBe(0);
            lyrics.currentTime = 1750;
            expect(lift(letters[0])).toBeLessThan(0);
            expect(lift(letters[0])).toBeLessThan(lift(letters[letters.length - 1]));
            lyrics.currentTime = 2500;
            expect(lift(letters[letters.length - 1])).toBeLessThan(0);
        } finally {
            localStorage.removeItem('spicyLyrics.style');
        }
    });

    test('resolves the fullscreen Bloom mask and interpolates the line highlight', () => {
        localStorage.setItem('spicyLyrics.style', 'bloom');
        const shell = document.createElement('div');
        shell.id = 'fullscreen-cover-overlay';
        shell.style.cssText = 'width: 600px; height: 640px;';
        try {
            const lyrics = new SpicyLyricsElement();
            lyrics.ttml = LINE_SYNC_TTML;
            shell.append(lyrics);
            document.body.appendChild(shell);
            const [line] = lyrics.lyricElements;
            expect(getComputedStyle(lyrics.shadowRoot.querySelector('.LyricsContent')).maskImage).toContain('linear-gradient');
            expect(getComputedStyle(line).getPropertyValue('--SL-LineLyricsSize')).toMatch(/px$/);
            expect(Number(getComputedStyle(line).getPropertyValue('--SLR_SungAlpha'))).toBe(0.18);

            lyrics.currentTime = 10000;
            const fade = line.getAnimations().find((animation) => animation.transitionProperty === '--SLR_SungAlpha');
            expect(fade).toBeDefined();
            fade.pause();
            fade.currentTime = 150;
            const alpha = Number(getComputedStyle(line).getPropertyValue('--SLR_SungAlpha'));
            expect(alpha).toBeGreaterThan(0.18);
            expect(alpha).toBeLessThan(0.94);
        } finally {
            localStorage.removeItem('spicyLyrics.style');
        }
    });

    test('keeps a Bloom line lit across a short gap and reserves dots for the upstream interlude threshold', () => {
        localStorage.setItem('spicyLyrics.style', 'bloom');
        localStorage.setItem('spicyLyrics.fadePrevious', 'true');
        try {
            const lyrics = new SpicyLyricsElement();
            lyrics.style.cssText = 'width: 600px; height: 640px;';
            lyrics.ttml = WORD_SYNC_TTML.replace('</p>', `</p>
                <p begin="7s" end="8s">Next line</p>
                <p begin="13s" end="14s">After the break</p>`);
            document.body.appendChild(lyrics);
            lyrics.currentTime = 5500;

            const [first, second, interlude] = lyrics._lineStates;
            expect(first.element.classList.contains('Active')).toBe(true);
            expect(first.end).toBe(second.start);
            expect(first.leadEnd).toBe(3000);
            expect(interlude.musical).toBe(true);
            expect(interlude.start).toBe(8000);
        } finally {
            localStorage.removeItem('spicyLyrics.style');
            localStorage.removeItem('spicyLyrics.fadePrevious');
        }
    });

    test('animates independent surfaces and applies Bloom and syllable joining live', async () => {
        const { setSpicyLyricsSetting } = await import('./spicy-lyrics-settings.js');
        const card = new SpicyLyricsElement();
        const fullscreen = new SpicyLyricsElement();
        const shell = document.createElement('div');
        shell.id = 'fullscreen-cover-overlay';
        shell.style.cssText = 'width: 600px; height: 640px;';
        card.style.cssText = 'width: 360px; height: 520px;';
        fullscreen.ttml = WORD_SYNC_TTML.replaceAll('Spicy', 'Fire');
        card.ttml = WORD_SYNC_TTML.replace('>Spicy</span>', '>Spi</span>').replace('> Lyrics</span>', '>cy</span>');
        shell.append(fullscreen);
        document.body.append(card, shell);

        try {
            expect(card.shadowRoot.querySelectorAll('.word-group .word, .word-group .letterGroup')).toHaveLength(2);
            setSpicyLyricsSetting('style', 'bloom');
            setSpicyLyricsSetting('joinWords', 'all');
            card.currentTime = 1750;
            fullscreen.currentTime = 500;
            expect(card.shadowRoot.querySelector('.BloomRenderer .line.Active .letterGroup')?.textContent).toBe('Spicy');
            expect(fullscreen.shadowRoot.querySelector('.line.Active')).toBeNull();
            fullscreen.currentTime = 2100;
            expect(fullscreen.shadowRoot.querySelector('.line.Active')?.textContent).toContain('Fire');
            expect(card.shadowRoot.querySelector('.line.Active')?.textContent).toContain('Spicy');
        } finally {
            card.remove();
            shell.remove();
            localStorage.removeItem('spicyLyrics.style');
            localStorage.removeItem('spicyLyrics.joinWords');
        }
    });

    test('parses romanization separately from translations, with bounded word timing', () => {
        const ttml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal">
            <head><metadata><itunes:transliterations><itunes:transliteration>
                <itunes:text for="L1"><span>Annyeong</span> <span>haseyo</span></itunes:text>
            </itunes:transliteration></itunes:transliterations><itunes:songwriters>
                <itunes:songwriter>Writer</itunes:songwriter>
            </itunes:songwriters></metadata></head>
            <body><div><p itunes:key="L1" begin="2s" end="5s">
                <span begin="2s">안녕</span> <span begin="3s">하세요</span>
                <span ttm:role="x-translation">Hello</span>
            </p></div></body></tt>`;
        const lines = parseSpicyTtml(ttml);
        expect(lines.songwriters).toEqual(['Writer']);
        expect(lines[0].text).toBe('안녕 하세요');
        expect(lines[0].romanized).toBe('Annyeong haseyo');
        expect(lines[0].words.map(({ end, romanized }) => [end, romanized])).toEqual([
            [3000, 'Annyeong'],
            [5000, 'haseyo'],
        ]);
    });

    test('supports unsynced text and Korean romanization without a network dictionary', async () => {
        const { romanizeLyrics } = await import('./spicy-lyrics-romanization.js');
        const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p>사랑해</p></div></body></tt>';
        const lines = parseSpicyTtml(ttml);
        expect(lines[0].syncType).toBe('Static');
        expect((await romanizeLyrics(lines))[0].romanized).toBe('Saranghae');
    });
});
