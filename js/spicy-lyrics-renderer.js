/*
 * Spicy Lyrics renderer integration for Monochrome.
 *
 * The spring solver, animation ranges and Kawarp configuration are ported from
 * Spicy Lyrics by Spikerko (AGPL-3.0), revision
 * cc45160facbebbe6c872a8796d339c0602d58928.
 * Source: https://github.com/spikerko/spicy-lyrics
 *
 * This adapter replaces Spicetify-specific player, store and page APIs with
 * Monochrome's native audio element while preserving the upstream rendering
 * behaviour for TTML line and word timing.
 */

import SimpleBar from 'simplebar';
import simplebarCss from 'simplebar/dist/simplebar.css?raw';
import { SpicyDynamicBackground, mountSpicyDynamicBackground } from './spicy-dynamic-background.js';
import { Spring } from './vendor/spicy-lyrics/Spring.js';
import upstreamMainCss from './vendor/spicy-lyrics/upstream/main.css?raw';
import upstreamMixedCss from './vendor/spicy-lyrics/upstream/Mixed.css?raw';
import upstreamSimplebarCss from './vendor/spicy-lyrics/upstream/Simplebar.css?raw';
import { Animate as animateUpstream } from './vendor/spicy-lyrics/upstream/LyricsAnimator.ts';
import { notifyNewElementMounted, replaceSyllableLines } from './vendor/spicy-lyrics/upstream/AnimatorCompat.js';
import { LyricsVirtualizer } from './vendor/spicy-lyrics/upstream/LyricsVirtualizer.ts';
import { parseSpicyTtml, parseTtmlTime } from './spicy-lyrics-ttml.js';
import { getArtworkSources } from './artwork-media.js';

export { Spring as SpicySpring };
export { parseSpicyTtml, parseTtmlTime };

/*
 * The two lyrics stylesheets above are an unmodified upstream snapshot.  They
 * intentionally live in this component's shadow tree: Monochrome has global
 * span/transform/font rules which previously changed Spicy's DOM contract and
 * removed the pseudo-element word separators.  This bridge only supplies page
 * primitives normally provided by Spotify/Spicetify. Word spacing is rendered
 * inside each semantic word container below. This preserves Spicy's exact
 * 0.32ch metric without depending on an empty ::after flex item, which Firefox
 * can collapse or cover when independently scaling adjacent words.
 */
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
:host([data-external-background='true']) {
    background: transparent;
}
*, *::before, *::after { box-sizing: border-box; }
#SpicyLyricsPage {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    isolation: isolate;
    container-type: size;
    color: #fff;
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
#SpicyLyricsPage .LyricsContainer .LyricsContent {
    --DefaultLyricsSize: clamp(1.85rem, calc(1cqw * 7), 3.5rem);
    --spice-sidebar: #fff;
}
#SpicyLyricsPage.CardMode .LyricsContainer .LyricsContent {
    --DefaultLyricsSize: clamp(1.85rem, calc(1cqw * 6), 2.8rem);
}
#SpicyLyricsPage .LyricsContainer .LyricsContent .SpicyLyricsScrollContainer {
    padding-inline: clamp(1rem, 8cqw, 2.25rem);
}
#SpicyLyricsPage.CardMode .LyricsContainer .LyricsContent .SpicyLyricsScrollContainer {
    margin-top: 0 !important;
    padding-top: 26.7cqh !important;
}
#SpicyLyricsPage.Fullscreen .LyricsContainer .LyricsContent .SpicyLyricsScrollContainer {
    padding-inline: clamp(1.5rem, 7cqw, 6rem);
}
#SpicyLyricsPage .LyricsContainer .LyricsContent .line {
    column-gap: 0;
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
    display: inline-block !important;
    flex: 0 0 0.28ch;
    width: 0.28ch;
    min-width: 0.28ch;
    overflow: hidden;
    white-space: pre;
    pointer-events: none;
}
#SpicyLyricsPage .LyricsContainer .LyricsContent .line
    :is(.word, .letterGroup):not(.PartOfWord, .dot, .LastWordInLine)::after {
    margin-right: 0;
}
.spicy-dynamic-bg,
.spicy-dynamic-bg-fallback,
.spicy-dynamic-bg-shade {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
.spicy-dynamic-bg-fallback {
    z-index: -3;
    background-position: center;
    background-size: cover;
    filter: saturate(2.25) brightness(0.48) blur(42px);
    transform: scale(1.18);
    transition: background-image 850ms cubic-bezier(0.66, 0, 0.34, 1);
}
.spicy-dynamic-bg {
    z-index: -2;
    display: block;
    filter: saturate(2.5) brightness(0.65);
    opacity: 0;
    transition: opacity 800ms ease;
}
#SpicyLyricsPage.has-kawarp-background .spicy-dynamic-bg { opacity: 1; }
#SpicyLyricsPage.Fullscreen > :is(.spicy-dynamic-bg, .spicy-dynamic-bg-fallback, .spicy-dynamic-bg-shade) {
    opacity: 0;
}
:host([data-external-background='true'])
    #SpicyLyricsPage > :is(.spicy-dynamic-bg, .spicy-dynamic-bg-fallback, .spicy-dynamic-bg-shade) {
    opacity: 0;
}
.spicy-dynamic-bg-shade {
    z-index: -1;
    background: linear-gradient(180deg, rgb(5 7 10 / 0.12), rgb(5 7 10 / 0.58));
}
.simplebar-track { z-index: 20; }
.simplebar-scrollbar::before { background: var(--Simplebar-Scrollbar-Color, rgb(255 255 255 / 0.6)); }
`;

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
    return { start, end, text: '•••', words: dots, musical: true, opposite, background: false, rtl: false };
}

function addMusicalInterludes(lines) {
    if (!lines.length) return lines;
    const withInterludes = [];
    const firstLine = lines[0];
    if (firstLine.start >= 3000) withInterludes.push(createMusicalInterlude(0, firstLine.start, firstLine.opposite));
    lines.forEach((line, index) => {
        withInterludes.push(line);
        withInterludes.push(...(line.backgrounds || []));
        const nextLine = lines[index + 1];
        if (nextLine && nextLine.start - line.end >= 3000) {
            withInterludes.push(createMusicalInterlude(line.end, nextLine.start, nextLine.opposite));
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
function getScrollLineIndex(lines, position) {
    const activeIndices = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.start <= position && line.end >= position) activeIndices.push(index);
    }
    if (!activeIndices.length) return -1;

    const anchorIndex = resolveToLeadIndex(lines, activeIndices[0]);
    const lookahead = getLookaheadLine(lines, anchorIndex);
    if (!lookahead || getGroupEndTime(lines, anchorIndex) <= lookahead.start) return anchorIndex;

    const firstIndex = activeIndices[0];
    const lastIndex = activeIndices[activeIndices.length - 1];
    return resolveToLeadIndex(lines, lastIndex - firstIndex <= 1 ? firstIndex : lastIndex);
}

export class SpicyLyricsElement extends HTMLElement {
    constructor() {
        super();
        this._root = this.attachShadow({ mode: 'open' });
        this._ttml = '';
        this._currentTime = 0;
        this._lines = [];
        this._lineStates = [];
        this._activeLineIndex = -1;
        this._manualScrollUntil = 0;
        this._lastPosition = 0;
        this._pendingScrollTimer = null;
        this._virtualizer = new LyricsVirtualizer();
        this._dynamicBackground = null;
        this._externalBackground = null;
        this._ownsExternalBackground = false;
        this._coverUrl = '';
        this._connected = false;
        this._simpleBar = null;
        this._suspendAutoScroll = () => {
            this._manualScrollUntil = performance.now() + 750;
            this._lyricsContent?.classList.add('HideLineBlur');
        };
    }

    connectedCallback() {
        if (this._connected) return;
        this._connected = true;
        this.addEventListener('wheel', this._suspendAutoScroll, { passive: true });
        this.addEventListener('touchmove', this._suspendAutoScroll, { passive: true });
        this.render();
    }

    disconnectedCallback() {
        this._connected = false;
        this.removeEventListener('wheel', this._suspendAutoScroll);
        this.removeEventListener('touchmove', this._suspendAutoScroll);
        window.clearTimeout(this._pendingScrollTimer);
        this._pendingScrollTimer = null;
        this._virtualizer.destroy();
        this._simpleBar?.unMount();
        this._simpleBar = null;
        this._dynamicBackground?.dispose();
        this._dynamicBackground = null;
        if (this._ownsExternalBackground) this._externalBackground?.dispose();
        this._externalBackground = null;
        this._ownsExternalBackground = false;
    }

    set ttml(value) {
        this._ttml = value || '';
        this._lines = addMusicalInterludes(parseSpicyTtml(this._ttml));
        if (this._connected) this.render();
    }

    get ttml() {
        return this._ttml;
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
        this._virtualizer.destroy();
        this._simpleBar?.unMount();
        this._simpleBar = null;
        this._dynamicBackground?.dispose();
        this._dynamicBackground = null;
        this._root.replaceChildren();

        const styles = document.createElement('style');
        styles.textContent = `${simplebarCss}\n${upstreamSimplebarCss}\n${upstreamMainCss}\n${upstreamMixedCss}\n${SHADOW_BRIDGE_CSS}`;

        const page = document.createElement('section');
        page.id = 'SpicyLyricsPage';
        page.className = 'spicy-lyrics-page SpicyRenderer UseSpicyFont MinimalLyricsMode';
        const fullscreen = Boolean(this.closest('#fullscreen-cover-overlay'));
        page.classList.toggle('Fullscreen', fullscreen);
        page.classList.toggle('CardMode', !fullscreen);

        const background = document.createElement('div');
        background.className = 'spicy-dynamic-bg-fallback';
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
        scroll.dataset.lyricsType = this._lines.some((line) => line.words.length > 1) ? 'Syllable' : 'Line';
        scroll.classList.toggle(
            'HasDuetLines',
            this._lines.some((line) => line.opposite)
        );
        scroll.classList.toggle(
            'HasRtlLines',
            this._lines.some((line) => line.rtl)
        );
        const virtualContainer = document.createElement('div');
        virtualContainer.className = 'VirtualLyricsContainer';
        this._lineStates = this._lines.map((line, index) => {
            const element = document.createElement('div');
            element.className = 'line NotSung';
            element.classList.toggle('musical-line', Boolean(line.musical));
            element.classList.toggle('OppositeAligned', line.opposite);
            element.classList.toggle('bg-line', line.background);
            element.classList.toggle('rtl', line.rtl);
            element.dataset.timestamp = String(line.start);
            element.setAttribute('role', 'button');
            element.tabIndex = 0;

            const seek = () =>
                this.dispatchEvent(
                    new CustomEvent('line-click', { bubbles: true, detail: { timestamp: line.start, index } })
                );
            element.addEventListener('click', seek);
            element.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    seek();
                }
            });

            const dotGroup = line.musical ? document.createElement('div') : null;
            dotGroup?.classList.add('dotGroup');
            let currentWordGroup = null;
            const wordStates = line.words.map((word, wordIndex, words) => {
                const text = word.text.trimStart();
                const emphasize = !word.dot && !line.rtl && word.end - word.start >= 1000;
                const wordElement = document.createElement(emphasize ? 'div' : 'span');
                wordElement.className = `${emphasize ? 'letterGroup' : 'word'}${word.background && !emphasize ? ' bg-word' : ''}${word.dot ? ' dot' : ''}`;
                wordElement.classList.toggle('LastWordInLine', wordIndex === words.length - 1);
                const isPartOfWord = Boolean(word.isPartOfWord);
                wordElement.classList.toggle('PartOfWord', isPartOfWord);
                const letterStates = [];
                if (emphasize) {
                    const letterEnd = Math.max(word.start + 1, word.end - 250);
                    const letterDuration = (letterEnd - word.start) / text.length;
                    Array.from(text).forEach((letter, letterIndex) => {
                        const letterElement = document.createElement('span');
                        letterElement.className = 'letter Emphasis';
                        letterElement.classList.toggle('LastLetterInWord', letterIndex === text.length - 1);
                        letterElement.textContent = letter;
                        wordElement.appendChild(letterElement);
                        letterStates.push({
                            element: letterElement,
                            start: word.start + letterIndex * letterDuration,
                            end: word.start + (letterIndex + 1) * letterDuration,
                            scale: new Spring(0.95, 0.88, 0.64),
                            yOffset: new Spring(0.01, 1.45, 0.4),
                            glow: new Spring(0, 1.18, 0.56),
                        });
                    });
                } else {
                    wordElement.textContent = text;
                }
                if (dotGroup) {
                    dotGroup.appendChild(wordElement);
                } else {
                    const previousWord = words[wordIndex - 1];
                    const previousIsPartOfWord = Boolean(previousWord?.isPartOfWord);
                    if (isPartOfWord || (previousIsPartOfWord && currentWordGroup)) {
                        if (!currentWordGroup) {
                            currentWordGroup = document.createElement('span');
                            currentWordGroup.className = 'word-group';
                            element.appendChild(currentWordGroup);
                        }
                        currentWordGroup.appendChild(wordElement);
                        if (!isPartOfWord && previousIsPartOfWord) currentWordGroup = null;
                    } else {
                        currentWordGroup = null;
                        element.appendChild(wordElement);
                    }
                }
                return {
                    ...word,
                    element: wordElement,
                    scale: new Spring(0.95, 0.88, 0.64),
                    yOffset: new Spring(0.01, 1.45, 0.4),
                    glow: new Spring(0, 1.18, 0.56),
                    opacity: word.dot ? new Spring(0.35, 1, 0.5) : null,
                    letterStates,
                };
            });
            if (!dotGroup) {
                const semanticWords = Array.from(element.children);
                semanticWords.forEach((semanticWord, semanticIndex) => {
                    const token = document.createElement('span');
                    token.className = 'spicy-word-token';
                    element.insertBefore(token, semanticWord);
                    token.appendChild(semanticWord);

                    if (semanticIndex < semanticWords.length - 1) {
                        const space = document.createElement('span');
                        space.className = 'spicy-word-space';
                        space.setAttribute('aria-hidden', 'true');
                        space.textContent = '\u00a0';
                        token.appendChild(space);
                    }
                });
            }
            if (dotGroup) element.appendChild(dotGroup);
            return { ...line, element, wordStates };
        });

        replaceSyllableLines(
            this._lineStates.map((line) => ({
                HTMLElement: line.element,
                StartTime: line.start,
                EndTime: line.end,
                TotalTime: line.end - line.start,
                DotLine: Boolean(line.musical),
                BGLine: Boolean(line.background),
                Syllables: {
                    Lead: line.wordStates.map((word) => {
                        const animationEnd = word.letterStates.length
                            ? Math.max(word.start + 1, word.end - 250)
                            : word.end;
                        return {
                            HTMLElement: word.element,
                            StartTime: word.start,
                            EndTime: animationEnd,
                            TotalTime: animationEnd - word.start,
                            LetterGroup: word.letterStates.length > 0,
                            Letters: word.letterStates.map((letter) => ({
                                HTMLElement: letter.element,
                                StartTime: letter.start,
                                EndTime: letter.end,
                                TotalTime: letter.end - letter.start,
                                Emphasis: true,
                                BGLetter: Boolean(word.background),
                            })),
                            BGWord: Boolean(word.background),
                            Dot: Boolean(word.dot),
                        };
                    }),
                },
            }))
        );

        scroll.appendChild(virtualContainer);
        content.appendChild(scroll);
        lyricsContainer.appendChild(content);
        contentBox.append(nowBar, lyricsContainer);
        const sharedBackgroundHost = this.closest('[data-spicy-background-host]');
        if (sharedBackgroundHost) page.append(contentBox);
        else page.append(background, canvas, shade, contentBox);
        this._root.append(styles, page);
        this._simpleBar = new SimpleBar(content, { autoHide: false });
        this._simpleBar.recalculate();
        this._scrollElement = this._simpleBar.getScrollElement();
        this._scrollContainer = scroll;
        this._lyricsContent = content;
        this._page = page;
        this._canvas = sharedBackgroundHost ? null : canvas;
        this._fallback = sharedBackgroundHost ? null : background;
        this._dynamicBackground = sharedBackgroundHost
            ? null
            : new SpicyDynamicBackground({ root: page, canvas, fallback: background });
        this._activeLineIndex = -1;
        this._lastPosition = 0;
        this._virtualizer.setOnNewElementMounted(notifyNewElementMounted);
        this._virtualizer.init(
            this._scrollElement,
            virtualContainer,
            this._lineStates.map((line) => line.element)
        );
        void this.applyDynamicBackground();
        this.animate(true);
    }

    async applyDynamicBackground() {
        const sharedHost = this.closest('[data-spicy-background-host]');
        if (!sharedHost && (!this._canvas || !this._fallback)) return;
        const fullscreenOverlay = this.closest('#fullscreen-cover-overlay');
        if (sharedHost) {
            this.setAttribute('data-external-background', 'true');
            this._externalBackground = mountSpicyDynamicBackground(sharedHost, {
                className: 'now-playing-panel-spicy-bg',
            });
            this._ownsExternalBackground = false;
        } else if (fullscreenOverlay && !this._externalBackground) {
            this.removeAttribute('data-external-background');
            this._externalBackground = mountSpicyDynamicBackground(fullscreenOverlay, {
                className: 'spicy-lyrics-fullscreen-bg',
            });
            this._ownsExternalBackground = true;
        } else if (!fullscreenOverlay) {
            this.removeAttribute('data-external-background');
        }

        const background = this._externalBackground || this._dynamicBackground;
        await background?.setSource(this._coverUrl);
    }

    animate(force = false) {
        if (!this._connected || !this._lineStates.length) return;

        // This is Spicy Lyrics' upstream LyricsAnimator.ts. The adapter above
        // only feeds it Monochrome's current position and the exact DOM/object
        // shape produced by ApplySyllableLyrics.
        animateUpstream(this._currentTime);

        const now = performance.now();
        const activeIndex = getScrollLineIndex(this._lineStates, this._currentTime);
        const drasticPositionChange =
            this._lastPosition !== 0 && Math.abs(this._currentTime - this._lastPosition) > 1000;
        const shouldForceScroll = force || this._activeLineIndex < 0 || drasticPositionChange;
        this._lastPosition = this._currentTime;

        const shouldResumeAutoScroll =
            this._lyricsContent?.classList.contains('HideLineBlur') && now >= this._manualScrollUntil;
        if (shouldResumeAutoScroll) this._lyricsContent?.classList.remove('HideLineBlur');

        if (activeIndex >= 0 && (activeIndex !== this._activeLineIndex || shouldForceScroll)) {
            const activeLine = this._lineStates[activeIndex]?.element;
            const canAutoScroll = shouldForceScroll || activeLine?.isConnected;
            if (now < this._manualScrollUntil || !canAutoScroll) return;

            this._activeLineIndex = activeIndex;
            this._lyricsContent?.classList.remove('HideLineBlur');
            const scroll = () => this._virtualizer.scrollToIndex(activeIndex, 'center', shouldForceScroll, 30);
            window.clearTimeout(this._pendingScrollTimer);
            if (this._lineStates[activeIndex - 1]?.musical) {
                this._pendingScrollTimer = window.setTimeout(scroll, 240);
            } else {
                scroll();
            }
        }
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('spicy-lyrics')) {
    customElements.define('spicy-lyrics', SpicyLyricsElement);
}
