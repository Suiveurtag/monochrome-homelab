import SimpleBar from 'simplebar';
import simplebarCss from 'simplebar/dist/simplebar.css?raw';
import { SpicyDynamicBackground, mountSpicyDynamicBackground } from './spicy-dynamic-background.js';
import { Spring } from './vendor/spicy-lyrics/Spring.js';
import upstreamMainCss from './vendor/spicy-lyrics/upstream/main.css?raw';
import upstreamMixedCss from './vendor/spicy-lyrics/upstream/Mixed.css?raw';
import upstreamSimplebarCss from './vendor/spicy-lyrics/upstream/Simplebar.css?raw';
import { createLyricsAnimator } from './vendor/spicy-lyrics/upstream/LyricsAnimator.ts';
import { AppendLineRomanization, AppendSyllableRomanization } from './vendor/spicy-lyrics/upstream/RomanizedRow.ts';
import { JoinSplitWords } from './vendor/spicy-lyrics/upstream/JoinSplitWords.ts';
import { SplitLetters } from './vendor/spicy-lyrics/upstream/SplitLetters.ts';
import { IsLetterCapable } from './vendor/spicy-lyrics/upstream/IsLetterCapable.ts';
import { StripZeroWidth } from './vendor/spicy-lyrics/upstream/StripZeroWidth.ts';
import { ConvertTime } from './vendor/spicy-lyrics/upstream/ConvertTime.ts';
import Emphasize, { createFlameGroup } from './vendor/spicy-lyrics/upstream/Emphasize.ts';
import upstreamCreditsCss from './vendor/spicy-lyrics/upstream/PinnedCredits.css?raw';
import { getSpicyLyricsSetting } from './spicy-lyrics-settings.js';
import { LyricsVirtualizer, fadesAwayPreviousLines } from './vendor/spicy-lyrics/upstream/LyricsVirtualizer.ts';
import { parseSpicyTtml, parseTtmlTime } from './spicy-lyrics-ttml.js';
import { getArtworkSources } from './artwork-media.js';

export { Spring as SpicySpring };
export { parseSpicyTtml, parseTtmlTime };

// Spicy Lyrics' GetBloomScroll, adapted to the local line fields.
function getBloomScroll(lines, position) {
    const next = lines.findIndex((line) => !line.background && line.start > position);
    if (next < 0) return { ms: 750, leadMs: 0 };
    let prevEnd = -Infinity;
    for (let i = next - 1; i >= 0; i--) {
        prevEnd = Math.max(prevEnd, lines[i].leadEnd ?? lines[i].end);
        if (!lines[i].background) break;
    }
    const room = lines[next].start - prevEnd;
    const gap = Math.min(750, Math.max(200, room));
    const ms = Math.round(480 + (750 - 480) * (gap - 200) / (750 - 200));
    return { ms, leadMs: Math.min(ms, Math.max(0, room)) };
}

// Spicy's selectors stay inside the shadow tree, isolated from the player's CSS.
const SHADOW_BRIDGE_CSS = `
@font-face {
    font-family: SpicyLyrics;
    font-weight: 400;
    src: url('https://fonts.spikerko.org/spicy-lyrics/LyricsRegular.woff2') format('woff2');
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: SpicyLyrics;
    font-weight: 500;
    src: url('https://fonts.spikerko.org/spicy-lyrics/LyricsMedium.woff2') format('woff2');
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: SpicyLyrics;
    font-weight: 600;
    src: url('https://fonts.spikerko.org/spicy-lyrics/LyricsSemibold.woff2') format('woff2');
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: SpicyLyrics;
    font-weight: 700;
    src: url('https://fonts.spikerko.org/spicy-lyrics/LyricsBold.woff2') format('woff2');
    font-style: normal;
    font-display: swap;
}
:host {
    --spice-sidebar: #fff;
    --spice-text: #fff;
    --spicy-lyrics-active-color: #fff;
    --spicy-lyrics-idle-color: rgb(255 255 255 / 0.32);
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    color: #fff;
    container-type: size;
    background: rgb(10 12 16);
}
:host([data-external-background]) {
    background: transparent;
}
*, *::before, *::after { box-sizing: border-box; }
#SpicyLyricsPage {
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    isolation: isolate;
    container-type: size;
    color: #fff;
}
#SpicyLyricsPage:not(.UseSpicyFont),
#SpicyLyricsPage:not(.UseSpicyFont) * {
    font-family: system-ui, sans-serif !important;
}
#SpicyLyricsPage.UseSpicyFont,
#SpicyLyricsPage.UseSpicyFont * {
    font-family: SpicyLyrics, sans-serif !important;
}
#SpicyLyricsPage .ContentBox {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
    align-items: center;
    justify-content: center;
}
#SpicyLyricsPage .NowBar { display: none !important; }
#SpicyLyricsPage.Fullscreen .simplebar-track {
    display: none !important;
}
#SpicyLyricsPage .LyricsContainer .LyricsContent {
    --spice-sidebar: #fff;
}
#SpicyLyricsPage.CardMode .LyricsContainer .LyricsContent {
    --DefaultLyricsSize: calc(clamp(1.85rem, calc(1cqw * 6), 2.8rem) * var(--SL-LyricsScale, 1));
    --SpicyLyrics-LineSpacing: 1cqw 0;
    --ImageMask: linear-gradient(
        180deg,
        transparent 0,
        transparent 8px,
        var(--spice-sidebar) calc(28px + var(--SL-LyricsContent_MaskTopPadding, 0px)),
        var(--spice-sidebar) calc(100% - 28px),
        transparent calc(100% - 8px),
        transparent
    );
    -webkit-mask-image: var(--ImageMask);
    mask-image: var(--ImageMask);
}
#SpicyLyricsPage .LyricsContainer .LyricsContent .SpicyLyricsScrollContainer {
    padding-inline: clamp(1rem, 8cqw, 2.25rem);
}
#SpicyLyricsPage.CardMode .LyricsContainer .LyricsContent .SpicyLyricsScrollContainer {
    margin-top: 0 !important;
    padding-top: 24px !important;
}
#SpicyLyricsPage.Fullscreen .LyricsContainer .LyricsContent .SpicyLyricsScrollContainer {
    padding-inline: clamp(1.5rem, 7cqw, 6rem);
}
#SpicyLyricsPage .LyricsContainer .LyricsContent .line {
    align-self: stretch;
    width: 100%;
}
#SpicyLyricsPage:not(.BloomRenderer) .LyricsContainer .LyricsContent .line {
    column-gap: 0.32ch;
}
#SpicyLyricsPage .LyricsContainer .LyricsContent .line .word-group {
    column-gap: 0;
}
.spicy-word-token {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: baseline;
    white-space: nowrap;
}
.spicy-word-space {
    display: none;
}
:host([data-next-up]) #SpicyLyricsPage .LyricsContainer .LyricsContent {
    --SL-LyricsContent_MaskBottomPadding: 56px;
}
/* Bloom measures the sung edge across word boxes, including their upstream ::after spacing. */
#SpicyLyricsPage.SpicyRenderer:not(.BloomRenderer) .LyricsContainer .LyricsContent .line
    :is(.word, .letterGroup):not(.PartOfWord, .dot, .LastWordInLine)::after {
    margin-right: 0;
}
#SpicyLyricsPage .line:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: -2px;
}
#SpicyLyricsPage .LyricsContainer .LyricsContent .line :is(.spicy-word-token, .word-group) {
    max-width: 100%;
    overflow-wrap: anywhere;
}
#SpicyLyricsPage .LyricsContainer .LyricsContent .line .word {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
#SpicyLyricsPage .line > .RomanizedRow {
    white-space: normal;
    overflow-wrap: anywhere;
}
#SpicyLyricsPage .LyricsContainer { position: relative; }
#SpicyLyricsPage .LyricsContainer > .LyricsPinnedCredits {
    inset: auto clamp(1rem, 8cqw, 2.25rem) var(--spicy-credits-inset, 1.5rem);
    color: rgb(255 255 255 / 0.8);
    font-size: 0.8rem;
}
#SpicyLyricsPage.Fullscreen { --spicy-credits-inset: 3.5rem; }
@supports (-moz-appearance: none) {
    @media (prefers-reduced-motion: no-preference) {
        /* Keep WebRender from snapping an axis-aligned lift to whole pixels (Bug 2069657). */
        #SpicyLyricsPage.BloomRenderer .LyricsContent .line:is(.Active, .Settling)
            :is(.word:not(.dot), .letter) {
            rotate: 0.1deg;
        }
    }
}
@media (prefers-reduced-motion: reduce) {
    #SpicyLyricsPage *, #SpicyLyricsPage *::before { transition-duration: 0s !important; }
    #SpicyLyricsPage .LyricsContent :is(.line, .word, .letterGroup, .letter, .dotGroup) {
        scale: 1 !important;
        transform: none !important;
    }
}
.spicy-dynamic-bg,
.spicy-dynamic-bg-shade {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
.spicy-dynamic-bg {
    z-index: -2;
    display: block;
    filter: saturate(2.5) brightness(0.65);
    opacity: 0;
}
#SpicyLyricsPage.has-kawarp-background .spicy-dynamic-bg { opacity: 1; }
#SpicyLyricsPage.Fullscreen > :is(.spicy-dynamic-bg, .spicy-dynamic-bg-shade) {
    opacity: 0;
}
:host([data-external-background])
    #SpicyLyricsPage > :is(.spicy-dynamic-bg, .spicy-dynamic-bg-shade) {
    opacity: 0;
}
.spicy-dynamic-bg-shade {
    z-index: -1;
    background: linear-gradient(180deg, rgb(5 7 10 / 0.12), rgb(5 7 10 / 0.58));
}
.simplebar-track { z-index: 20; }
.simplebar-scrollbar::before { background: var(--Simplebar-Scrollbar-Color, rgb(255 255 255 / 0.6)); }
`;

function installDocumentStyles(doc) {
    if (doc.getElementById('spicy-lyrics-document-styles')) return;
    // In the document, Spicy's @property rules enable interpolation and let
    // container units resolve to pixels once per line.
    const style = doc.createElement('style');
    style.id = 'spicy-lyrics-document-styles';
    style.textContent = [upstreamMainCss, upstreamMixedCss]
        .flatMap((css) => css.match(/@property\s+--[\w-]+\s*\{[^}]*\}/g) ?? [])
        .join('\n');
    doc.head.append(style);
}

function createMusicalInterlude(start, end, opposite = false) {
    const duration = end - start;
    const dotDuration = duration / 3;
    const padding = -550 / 3;
    const dot1End = Math.max(start, start + dotDuration + padding);
    const dot2End = Math.max(dot1End, start + dotDuration * 2 + padding * 2);
    const dot3End = Math.max(dot2End, end - 550);
    const dots = Array.from({ length: 3 }, (_, index) => ({
        text: '•',
        spaceBefore: false,
        start: index === 0 ? start : index === 1 ? dot1End : dot2End,
        end: index === 0 ? dot1End : index === 1 ? dot2End : dot3End,
        background: false,
        dot: true,
    }));
    return {
        start,
        end,
        text: '•••',
        words: dots,
        musical: true,
        opposite,
        background: false,
        rtl: false,
        syncType: 'Line',
    };
}

function prepareTimedLines(lines, bloom, fadePrevious) {
    if (!lines.length) return lines;
    const interludeMin = bloom && fadePrevious ? 5000 : 3000;
    const withInterludes = [];
    const firstLine = lines[0];
    if (firstLine.start >= interludeMin) {
        withInterludes.push(createMusicalInterlude(0, firstLine.start, firstLine.opposite));
    }
    lines.forEach((line, index) => {
        const nextLine = lines[index + 1];
        const sungEnd = bloom ? line.leadEnd ?? lineEnd(line) : lineEnd(line);
        const gap = nextLine ? nextLine.start - sungEnd : 0;
        // Spicy fills short gaps with the current line, while the lead's real
        // end still limits how early the next line can scroll into view.
        const end = gap > 0 && gap < interludeMin ? nextLine.start : sungEnd;
        withInterludes.push(bloom ? { ...line, end, leadEnd: sungEnd } : line);
        withInterludes.push(...(line.backgrounds || []));
        if (gap >= interludeMin) {
            withInterludes.push(createMusicalInterlude(sungEnd, nextLine.start, nextLine.opposite));
        }
    });
    return withInterludes;
}

function resolveCoverUrl(track, api) {
    // Kawarp accepts still images. Animated MP4/HLS artwork remains in the
    // host's media element while its real poster/cover drives the shared
    // full-surface background.
    const album = track?.album || {};
    const sources = getArtworkSources({
        cover: album.cover || track?.cover || track?.image || album.coverId || track?.coverId,
        animatedCover: track?.videoUrl || track?.videoCoverUrl || album.videoCoverUrl || album.animatedCover,
        coverFallback: track?.coverFallback || track?.staticCover || album.coverFallback || album.staticCover,
    });
    const cover = sources.static;
    if (!cover) return '';
    if (/^(?:https?:|blob:|data:)/i.test(cover)) return cover;
    return api?.getCoverUrl?.(cover, '1280') || cover;
}

const PIN_LOOKAHEAD = 2;

function resolveToLeadIndex(lines, index) {
    let resolved = index;
    while (resolved > 0 && lines[resolved]?.background) resolved -= 1;
    return resolved;
}

function getGroupEndTime(lines, leadIndex) {
    let end = lines[leadIndex].end;
    for (let index = leadIndex + 1; index < lines.length && lines[index].background; index += 1) {
        end = Math.max(end, lines[index].end);
    }
    return end;
}

function getLookaheadLine(lines, leadIndex) {
    let remaining = PIN_LOOKAHEAD;
    for (let index = leadIndex + 1; index < lines.length; index += 1) {
        if (lines[index].background) continue;
        remaining -= 1;
        if (remaining === 0) return lines[index];
    }
    return null;
}

// Port of Spicy Lyrics' GetScrollLine policy. Background vocals stay attached
// to their lead line and overlapping lead lines use the same two-line pinning
// heuristic as upstream.
export function getScrollLineIndex(lines, position) {
    const activeIndices = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.start <= position && line.end >= position) activeIndices.push(index);
    }
    if (!activeIndices.length) return -1;

    const frontLead = Math.max(...activeIndices.map((index) => resolveToLeadIndex(lines, index)));
    const activeLeads = [];
    for (const index of activeIndices) {
        const lead = resolveToLeadIndex(lines, index);
        if (lines[index].background && lead < frontLead) continue;
        if (activeLeads.at(-1) !== lead) activeLeads.push(lead);
    }

    const anchorIndex = activeLeads[0];
    const lookahead = getLookaheadLine(lines, anchorIndex);
    const wordsStart = Math.max(lookahead?.wordStates?.[0]?.StartTime ?? lookahead?.start ?? 0, lookahead?.start ?? 0);
    if (!lookahead || getGroupEndTime(lines, anchorIndex) <= wordsStart) return anchorIndex;

    const lastIndex = activeLeads.at(-1);
    const leadBetween = lines.slice(anchorIndex + 1, lastIndex).some((line) => !line.background);
    return leadBetween ? lastIndex : anchorIndex;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lineEnd = (line) => Math.max(line.end, ...line.words.map((word) => word.end));

function toSyllable(word) {
    return {
        Text: word.text.trim(),
        // Spicy's helpers accept seconds and convert to animation milliseconds.
        StartTime: word.start / 1000,
        EndTime: word.end / 1000,
        IsPartOfWord: word.isPartOfWord,
        TransliteratedText: word.romanized?.trim(),
        TransliteratedIsPartOfWord: word.romanizedPartOfWord,
    };
}

function renderWords(line, element, replaceRomanization) {
    const bloom = getSpicyLyricsSetting('style') === 'bloom';
    const textOf = (word) => StripZeroWidth(replaceRomanization ? word.TransliteratedText ?? word.Text : word.Text).trim();
    const canEmphasize = (word, letterCount) =>
        !line.musical && !line.rtl && IsLetterCapable(
            letterCount,
            ConvertTime(word.EndTime) - ConvertTime(word.StartTime),
            line.background
        );
    const source = line.words.map(toSyllable);
    if (replaceRomanization) {
        source.forEach((word) => { word.IsPartOfWord = word.TransliteratedIsPartOfWord ?? word.IsPartOfWord; });
    }
    const join = getSpicyLyricsSetting('joinWords');
    const words = line.musical || join === 'off'
        ? source
        : JoinSplitWords(source, join === 'all' ? 'full' : join, (word) =>
            canEmphasize(word, SplitLetters(textOf(word)).length)
        );
    const dotGroup = line.musical ? document.createElement('div') : null;
    if (dotGroup) {
        dotGroup.className = 'dotGroup';
        element.append(dotGroup);
    }

    const states = [];
    for (let start = 0; start < words.length;) {
        let last = start;
        while (words[last].IsPartOfWord && last + 1 < words.length) last += 1;
        const group = words.slice(start, last + 1);
        const wordLetters = SplitLetters(group.map(textOf).join('')).length;
        const wholeWord = { StartTime: group[0].StartTime, EndTime: group.at(-1).EndTime };
        const flame = bloom && group.length > 1 && canEmphasize(wholeWord, wordLetters)
            ? createFlameGroup(wholeWord.StartTime, wholeWord.EndTime)
            : null;
        const token = document.createElement('span');
        token.className = 'spicy-word-token';
        const content = group.length > 1 ? document.createElement('span') : token;
        if (content !== token) {
            content.className = 'word-group';
            token.append(content);
        }
        if (!dotGroup) element.append(token);

        group.forEach((word, index) => {
            const text = textOf(word);
            if (!text) return;
            const letters = SplitLetters(text);
            const emphasize = bloom && group.length > 1 ? Boolean(flame) : canEmphasize(word, letters.length);
            const node = document.createElement(emphasize ? 'div' : 'span');
            node.className = emphasize ? 'letterGroup' : 'word';
            node.classList.toggle('dot', Boolean(dotGroup));
            node.classList.toggle('bg-word', Boolean(line.background && !emphasize));
            node.classList.toggle('PartOfWord', index < group.length - 1);
            node.classList.toggle('LastWordInLine', start + index === words.length - 1);
            (dotGroup ?? content).append(node);
            let state;
            if (emphasize) {
                const parts = getSpicyLyricsSetting('keepSyllablePace') === 'true' && word.Parts?.map((part) => ({
                    StartTime: part.StartTime,
                    Letters: SplitLetters(textOf(part)).length,
                }));
                const paced = parts && parts.reduce((sum, part) => sum + part.Letters, 0) === letters.length;
                state = Emphasize(letters, node, word, line.background, paced ? parts : undefined, flame);
            } else {
                node.textContent = text;
                const startTime = ConvertTime(word.StartTime);
                const endTime = ConvertTime(word.EndTime);
                state = {
                    HTMLElement: node,
                    StartTime: startTime,
                    EndTime: endTime,
                    TotalTime: endTime - startTime,
                    BGWord: line.background,
                    Dot: Boolean(dotGroup),
                };
            }
            state.WordLetters = wordLetters;
            states.push(state);
        });
        if (!dotGroup && last < words.length - 1) {
            const space = document.createElement('span');
            space.className = 'spicy-word-space';
            space.ariaHidden = 'true';
            space.textContent = '\u00a0';
            token.append(space);
        }
        start = last + 1;
    }
    return states;
}

export class SpicyLyricsElement extends HTMLElement {
    constructor() {
        super();
        this._root = this.attachShadow({ mode: 'open' });
        this._ttml = '';
        this._lineOnly = false;
        this._currentTime = 0;
        this._lines = [];
        this._lineStates = [];
        this._activeLineIndex = -1;
        this._manualScrollUntil = 0;
        this._lastPosition = 0;
        this._pendingScrollTimer = null;
        this._virtualizer = new LyricsVirtualizer();
        this._dynamicBackground = null;
        this._coverUrl = '';
        this._connected = false;
        this._applySettings = (event) => {
            const key = event.detail?.key;
            if (
                ['style', 'joinWords', 'keepSyllablePace', 'romanization', 'credits', 'reviewer', 'staticScroll', 'romajiAsWritten'].includes(key) ||
                (key === 'fadePrevious' && this._page?.classList.contains('BloomRenderer'))
            ) {
                this.render();
                void this._loadRomanization();
                return;
            }
            if (key === 'scrollToActive') {
                this._updateSyncState();
                return;
            }
            if (!['font', 'size', 'fadePrevious', 'backgroundLinePop', 'keepOverlappingLines', 'largerCinemaLyrics'].includes(key)) return;
            const previousSize = Number(this._page.style.getPropertyValue('--SL-LyricsScale')) || 1;
            this._updatePageSettings();
            if (key === 'size') this._virtualizer.lyricsSizeChanged(Number(getSpicyLyricsSetting('size')) / 100 / previousSize);
            else this._virtualizer.remeasure();
            this.animate(true);
        };
        this._simpleBar = null;
        this._updateSyncState = () => {
            const direction = this.getOffSyncDirection();
            const offSync = direction !== null;
            if (offSync === this._offSync && direction === this._offSyncDirection) return;
            this._offSync = offSync;
            this._offSyncDirection = direction;
            this.dispatchEvent(new CustomEvent('lyrics-sync-change', { detail: { offSync, direction } }));
        };
        this._onScrollKey = (event) => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) this._suspendAutoScroll();
        };
        this._suspendAutoScroll = () => {
            this._manualScrollUntil = performance.now() + 1500;
            this._lyricsContent?.classList.add('HideLineBlur');
            clearTimeout(this._pendingScrollTimer);
            this._pendingScrollTimer = null;
            this._updateSyncState();
        };
    }

    connectedCallback() {
        if (this._connected) return;
        this._connected = true;
        installDocumentStyles(this.ownerDocument);
        window.addEventListener('spicy-lyrics-settings-changed', this._applySettings);
        this.addEventListener('wheel', this._suspendAutoScroll, { passive: true });
        this.addEventListener('touchmove', this._suspendAutoScroll, { passive: true });
        this.render();
        void this._loadRomanization();
    }

    _updatePageSettings() {
        const page = this._page;
        if (!page) return;
        const enabled = (key) => getSpicyLyricsSetting(key) === 'true';
        page.classList.toggle('UseSpicyFont', getSpicyLyricsSetting('font') === 'spicy');
        page.classList.toggle('BloomRenderer', getSpicyLyricsSetting('style') === 'bloom');
        page.classList.toggle('MinimalLyricsMode', enabled('fadePrevious'));
        page.classList.toggle('Exp_BackgroundLinePop', enabled('backgroundLinePop'));
        page.classList.toggle('Exp_KeepOverlappingLines', enabled('keepOverlappingLines'));
        page.classList.toggle('Exp_LargerCinemaLyrics', enabled('largerCinemaLyrics'));
        page.classList.toggle('RomanizedRowsShown', getSpicyLyricsSetting('romanization') === 'underLine');
        page.style.setProperty('--SL-LyricsScale', String(Number(getSpicyLyricsSetting('size')) / 100));
    }

    async _loadRomanization() {
        const setting = getSpicyLyricsSetting('romanization');
        const written = getSpicyLyricsSetting('romajiAsWritten');
        const source = this._lines;
        if (setting === 'off' || this._romanizationRequest?.source === source && this._romanizationRequest.written === written) return;
        if (!source.some((line) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Greek}]/u.test(line.text))) return;
        const request = { source, written };
        this._romanizationRequest = request;
        try {
            const { romanizeLyrics } = await import('./spicy-lyrics-romanization.js');
            const apply = (result) => {
                if (this._romanizationRequest !== request || this._lines !== source) return;
                this._romanizedLines = result;
                if (this._connected && getSpicyLyricsSetting('romanization') !== 'off') this.render();
            };
            apply(await romanizeLyrics(source, this.lang, { onDictionaryReady: apply }));
        } catch (error) {
            if (this._romanizationRequest === request) this._romanizationRequest = null;
            console.warn('Could not romanize lyrics:', error);
        }
    }

    /** True when the user scrolled away and the playing line is outside the visible area. */
    isOffSync() {
        return this.getOffSyncDirection() !== null;
    }

    getOffSyncDirection() {
        if (!this._manualScrollUntil || this._lyricsType === 'Static' || getSpicyLyricsSetting('scrollToActive') !== 'true') return null;
        const index = getScrollLineIndex(this._lineStates, this._currentTime);
        const line = this._lineStates[index]?.element;
        if (!line || !this._scrollElement) return null;
        if (!line.isConnected) {
            const firstMounted = this._lineStates.findIndex((state) => state.element.isConnected);
            return firstMounted < 0 || index >= firstMounted ? 'Below' : 'Above';
        }
        const view = this._scrollElement.getBoundingClientRect();
        const rect = line.getBoundingClientRect();
        if (rect.bottom < view.top) return 'Above';
        if (rect.top > view.bottom) return 'Below';
        return null;
    }

    resync() {
        this._manualScrollUntil = 0;
        this._lyricsContent?.classList.remove('HideLineBlur');
        const index = getScrollLineIndex(this._lineStates, this._currentTime);
        if (index >= 0) {
            const glide = this._page.classList.contains('BloomRenderer') && !reducedMotion();
            this._virtualizer.scrollToIndex(index, 'center', !glide, this._scrollPadding, glide);
        }
        this._updateSyncState();
    }

    get _scrollPadding() {
        // Spicy's fullscreen Bloom anchor sits 80px above the viewport center.
        return this._page.matches('.Fullscreen.BloomRenderer') ? 80 : 30;
    }

    disconnectedCallback() {
        this._connected = false;
        this._scrollElement?.removeEventListener('scroll', this._updateSyncState);
        this._scrollElement?.removeEventListener('keydown', this._onScrollKey);
        window.removeEventListener('spicy-lyrics-settings-changed', this._applySettings);
        this.removeEventListener('wheel', this._suspendAutoScroll);
        this.removeEventListener('touchmove', this._suspendAutoScroll);
        window.clearTimeout(this._pendingScrollTimer);
        this._pendingScrollTimer = null;
        this._animator?.destroy();
        this._animator = null;
        this._virtualizer.destroy();
        this._simpleBar?.unMount();
        this._simpleBar = null;
        this._dynamicBackground?.dispose();
        this._dynamicBackground = null;
    }

    set ttml(value) {
        this._ttml = value || '';
        this._parseLyrics();
    }

    get ttml() {
        return this._ttml;
    }

    set lineOnly(value) {
        this._lineOnly = Boolean(value);
        this._parseLyrics();
    }

    get lineOnly() {
        return this._lineOnly;
    }

    _parseLyrics() {
        this._lines = parseSpicyTtml(this._ttml, { lineOnly: this._lineOnly });
        if (!this.lang && this._lines.some((line) => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(line.text))) {
            this.lang = 'ja';
        }
        this._romanizedLines = null;
        if (this._connected) {
            this.render();
            void this._loadRomanization();
        }
    }

    get lyricElements() {
        return this._lineStates.filter((line) => !line.musical).map((line) => line.element);
    }

    get lyricsType() {
        return this._lyricsType;
    }

    setPlaybackProgress(fraction) {
        if (this._lyricsType !== 'Static' || getSpicyLyricsSetting('staticScroll') === 'off' ||
            performance.now() < this._manualScrollUntil || !this._scrollElement) return;
        const { scrollHeight, clientHeight } = this._scrollElement;
        this._virtualizer.setScrollPosition(Math.max(0, scrollHeight - clientHeight) * fraction);
    }

    set currentTime(value) {
        this._currentTime = Math.max(0, Number(value) || 0);
        this.animate();
    }

    get currentTime() {
        return this._currentTime;
    }

    async setTrack(track, api) {
        const coverUrl = resolveCoverUrl(track, api);
        if (coverUrl === this._coverUrl) return;
        this._coverUrl = coverUrl;
        await this.applyDynamicBackground();
    }

    render() {
        this._scrollElement?.removeEventListener('scroll', this._updateSyncState);
        this._scrollElement?.removeEventListener('keydown', this._onScrollKey);
        this._animator?.destroy();
        this._animator = null;
        this._virtualizer.destroy();
        this._simpleBar?.unMount();
        this._simpleBar = null;
        this._dynamicBackground?.dispose();
        this._dynamicBackground = null;
        clearTimeout(this._pendingScrollTimer);
        this._pendingScrollTimer = null;
        this._root.replaceChildren();
        const sourceLines = getSpicyLyricsSetting('romanization') === 'off' ? this._lines : this._romanizedLines ?? this._lines;
        const staticLyrics = sourceLines[0]?.syncType === 'Static';
        const renderedLines = staticLyrics ? sourceLines : prepareTimedLines(
            sourceLines,
            getSpicyLyricsSetting('style') === 'bloom',
            getSpicyLyricsSetting('fadePrevious') === 'true'
        );

        const styles = document.createElement('style');
        styles.textContent = `${simplebarCss}\n${upstreamSimplebarCss}\n${upstreamMainCss}\n${upstreamMixedCss}\n${upstreamCreditsCss}\n${SHADOW_BRIDGE_CSS}`;

        const page = document.createElement('section');
        page.id = 'SpicyLyricsPage';
        page.className = 'spicy-lyrics-page SpicyRenderer';
        this._page = page;
        this._updatePageSettings();
        const fullscreen = Boolean(this.closest('#fullscreen-cover-overlay'));
        page.classList.toggle('Fullscreen', fullscreen);
        page.classList.toggle('CardMode', !fullscreen);

        const canvas = document.createElement('canvas');
        canvas.className = 'spicy-dynamic-bg';
        const shade = document.createElement('div');
        shade.className = 'spicy-dynamic-bg-shade';
        const lyricsContainer = document.createElement('div');
        lyricsContainer.className = 'LyricsContainer';
        const contentBox = document.createElement('div');
        contentBox.className = 'ContentBox';
        const nowBar = document.createElement('div');
        nowBar.className = 'NowBar';
        const content = document.createElement('div');
        content.className = 'LyricsContent';
        const scroll = document.createElement('div');
        scroll.className = 'SpicyLyricsScrollContainer';
        const lyricsType = staticLyrics ? 'Static' : renderedLines.some((line) => line.syncType === 'Syllable') ? 'Syllable' : 'Line';
        this._lyricsType = lyricsType;
        scroll.dataset.lyricsType = lyricsType;
        scroll.classList.toggle('HasDuetLines', renderedLines.some((line) => line.opposite));
        scroll.classList.toggle('HasRtlLines', renderedLines.some((line) => line.rtl));
        const virtualContainer = document.createElement('div');
        virtualContainer.className = 'VirtualLyricsContainer';
        const romanization = getSpicyLyricsSetting('romanization');
        this._lineStates = renderedLines.map((line, index) => {
            const element = document.createElement('div');
            element.className = staticLyrics ? 'line static' : 'line NotSung';
            element.classList.toggle('musical-line', Boolean(line.musical));
            element.classList.toggle('OppositeAligned', Boolean(line.opposite));
            element.classList.toggle('bg-line', Boolean(line.background));
            element.classList.toggle('rtl', Boolean(line.rtl && romanization !== 'replace'));
            if (!staticLyrics) {
                element.dataset.timestamp = String(line.start);
                element.setAttribute('role', 'button');
                const label = romanization === 'replace' ? line.romanized || line.text : line.text;
                element.setAttribute('aria-label', line.musical ? 'Instrumental break' : label);
                element.tabIndex = 0;
                const seek = () => this.dispatchEvent(
                    new CustomEvent('line-click', { bubbles: true, detail: { timestamp: line.start, index, text: line.text } })
                );
                element.addEventListener('click', seek);
                element.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    seek();
                });
            }

            const hasWords = line.musical || lyricsType === 'Syllable';
            const wordStates = hasWords ? renderWords(line, element, romanization === 'replace') : [];
            if (!hasWords) element.textContent = romanization === 'replace' ? line.romanized ?? line.text : line.text;
            if (romanization === 'underLine' && !line.musical) {
                if (hasWords && line.words.some((word) => word.romanized != null)) {
                    AppendSyllableRomanization(element, line.words.map(toSyllable), Boolean(line.backgrounds?.length));
                } else {
                    AppendLineRomanization(element, { Text: line.text, TransliteratedText: line.romanized });
                }
            }
            return { ...line, element, wordStates };
        });

        if (!staticLyrics) {
            const animatorLines = this._lineStates.map((line) => ({
                HTMLElement: line.element,
                StartTime: line.start,
                EndTime: line.end,
                LeadEndTime: line.leadEnd ?? lineEnd(line),
                TotalTime: line.end - line.start,
                DotLine: Boolean(line.musical),
                BGLine: Boolean(line.background),
                Syllables: { Lead: line.wordStates },
            }));
            this._animator = createLyricsAnimator(lyricsType, animatorLines, this._virtualizer);
        }

        scroll.appendChild(virtualContainer);
        content.appendChild(scroll);
        lyricsContainer.appendChild(content);
        const creditMode = getSpicyLyricsSetting('credits');
        const songwriters = this._lines.songwriters ?? [];
        const creditLines = [this.provider, songwriters.length ? `Written by ${songwriters.join(', ')}` : ''];
        if (creditLines.some(Boolean)) {
            const pinned = document.createElement('div');
            pinned.className = 'LyricsPinnedCredits';
            const pinnedCredits = document.createElement('div');
            pinnedCredits.className = 'Credits';
            const scrolling = document.createElement('div');
            scrolling.className = 'Credits';
            creditLines.forEach((label, index) => {
                if (!label) return;
                const text = document.createElement('div');
                text.textContent = label;
                (creditMode === 'full' || creditMode === 'source' && index === 0 ? pinnedCredits : scrolling).append(text);
            });
            if (pinnedCredits.childElementCount) {
                pinned.append(pinnedCredits);
                lyricsContainer.append(pinned);
            }
            if (scrolling.childElementCount) scroll.append(scrolling);
        }
        contentBox.append(nowBar, lyricsContainer);
        const sharedHost = this.closest('[data-spicy-background-host]');
        const externalBackground = Boolean(sharedHost || this.closest('#fullscreen-cover-overlay'));
        if (sharedHost) mountSpicyDynamicBackground(sharedHost, { className: 'now-playing-panel-spicy-bg' });
        if (externalBackground) this.setAttribute('data-external-background', 'true');
        else this.removeAttribute('data-external-background');
        if (externalBackground) page.append(contentBox);
        else page.append(canvas, shade, contentBox);
        this._root.append(styles, page);
        this._simpleBar = new SimpleBar(content, { autoHide: false });
        this._simpleBar.recalculate();
        this._scrollElement = this._simpleBar.getScrollElement();
        this._scrollElement.tabIndex = 0;
        this._scrollElement.setAttribute('aria-label', staticLyrics ? 'Lyrics' : 'Synchronized lyrics');
        this._scrollElement.addEventListener('scroll', this._updateSyncState, { passive: true });
        this._scrollElement.addEventListener('keydown', this._onScrollKey);
        this._lyricsContent = content;
        this._dynamicBackground = externalBackground ? null : new SpicyDynamicBackground({ root: page, canvas });
        if (this._playback) this._dynamicBackground?.connectPlayback(this._playback);
        this._activeLineIndex = -1;
        this._lastPosition = 0;
        this._bloomFocus = null;
        this._virtualizer.init(this._scrollElement, virtualContainer, this._lineStates.map((line) => line.element));
        void this.applyDynamicBackground();
        this.animate(true);
        this.dispatchEvent(new Event('lyrics-rendered'));
    }

    connectPlayback(audio, getAnalyser) {
        this._playback = { getElement: () => audio, getAnalyser };
        this._dynamicBackground?.connectPlayback(this._playback);
    }

    async applyDynamicBackground() {
        await this._dynamicBackground?.setSource(this._coverUrl);
    }

    animate(force = false) {
        if (!this._connected || !this._lineStates.length) return;

        if (this._lyricsType === 'Static') return;
        const now = performance.now();
        const activeIndex = getScrollLineIndex(this._lineStates, this._currentTime);
        const bloom = this._page.classList.contains('BloomRenderer');
        const bloomTimed = bloom && !fadesAwayPreviousLines(this._page);
        const bloomEarly = bloomTimed && this._page.classList.contains('CardMode');
        const bloomScroll = bloomTimed ? getBloomScroll(this._lineStates, this._currentTime) : null;
        const earlyIndex = bloomEarly ? getScrollLineIndex(this._lineStates, this._currentTime + bloomScroll.leadMs) : -1;
        const scrollIndex = earlyIndex >= 0 ? earlyIndex : activeIndex;
        this._animator?.setEarlySungBefore(earlyIndex);
        this._animator?.animate(this._currentTime);
        const bloomFocus = bloomTimed ? this._lineStates[scrollIndex]?.element : null;
        if (bloomFocus !== this._bloomFocus) {
            this._bloomFocus?.classList.remove('BloomFocus');
            this._bloomFocus = bloomFocus;
            this._bloomFocus?.classList.add('BloomFocus');
        }

        const drasticPositionChange =
            this._lastPosition !== 0 && Math.abs(this._currentTime - this._lastPosition) > 1000;
        const shouldForceScroll = force || this._activeLineIndex < 0 || drasticPositionChange;
        this._lastPosition = this._currentTime;

        this._updateSyncState();
        if (now < this._manualScrollUntil || this._offSync && !shouldForceScroll) return;
        if (this._manualScrollUntil) {
            this._manualScrollUntil = 0;
            this._lyricsContent.classList.remove('HideLineBlur');
        }
        if (scrollIndex < 0 || scrollIndex === this._activeLineIndex && !shouldForceScroll) return;

        this._manualScrollUntil = 0;
        this._activeLineIndex = scrollIndex;
        this._lyricsContent.classList.remove('HideLineBlur');
        const instant = shouldForceScroll || reducedMotion();
        const scroll = () => {
            this._virtualizer.scrollToIndex(scrollIndex, 'center', instant, this._scrollPadding, false, bloomScroll?.ms);
            if (instant) this._animator?.animate(this._currentTime);
        };
        clearTimeout(this._pendingScrollTimer);
        if (!instant && !bloom && getSpicyLyricsSetting('smoothScrolling') !== 'true' && this._lineStates[scrollIndex - 1]?.musical) {
            this._pendingScrollTimer = window.setTimeout(scroll, 240);
        } else {
            scroll();
        }
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('spicy-lyrics')) {
    customElements.define('spicy-lyrics', SpicyLyricsElement);
}
