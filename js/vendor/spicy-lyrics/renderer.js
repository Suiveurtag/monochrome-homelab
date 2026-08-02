/*
 * Spicy Lyrics renderer integration for Monochrome.
 * Structure, states, timing curves and spring values are adapted from:
 * https://github.com/spikerko/spicy-lyrics/ at cc45160facbebbe6c872a8796d339c0602d58928
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import './spicy-lyrics.css';
import Spline from 'cubic-spline';
import { easeSinOut } from 'd3-ease';
import { Spring } from './spring.js';
import { getArtworkSources } from '../../artwork-media.js';

export const SPICY_LYRICS_PROJECT_URL = 'https://github.com/spikerko/spicy-lyrics/';

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const rtlPattern = /[\u0590-\u08ff\ufb1d-\ufefc]/;

export function parseTtmlTime(value) {
    if (value == null || value === '') return 0;
    const source = String(value).trim();
    if (/^-?\d+(?:\.\d+)?ms$/i.test(source)) return Number.parseFloat(source);
    if (/^-?\d+(?:\.\d+)?s$/i.test(source)) return Number.parseFloat(source) * 1000;
    const parts = source.split(':').map(Number);
    if (parts.some(Number.isNaN)) return 0;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    return Number(source) || 0;
}

function elementTime(element, name, fallback = 0) {
    return parseTtmlTime(element.getAttribute(name) || element.getAttribute(`itunes:${name}`)) || fallback;
}

function directTimedSpans(element) {
    return Array.from(element.children).filter(
        (child) => child.localName === 'span' && (child.hasAttribute('begin') || child.hasAttribute('end'))
    );
}

function parseWordNodes(parent, lineStart, lineEnd) {
    const timed = directTimedSpans(parent).filter(
        (span) => !String(span.getAttribute('ttm:role') || span.getAttribute('role') || '').includes('x-bg')
    );
    if (timed.length) {
        return timed
            .map((span, index) => {
                const start = elementTime(span, 'begin', lineStart);
                const end = Math.max(
                    start + 80,
                    elementTime(
                        span,
                        'end',
                        timed[index + 1] ? elementTime(timed[index + 1], 'begin', lineEnd) : lineEnd
                    )
                );
                return {
                    text: span.textContent || '',
                    start,
                    end,
                    partOfWord:
                        span.getAttribute('itunes:key')?.includes('.') ||
                        (/^\S/.test(span.textContent || '') &&
                            index > 0 &&
                            !/\s$/.test(timed[index - 1]?.textContent || '')),
                };
            })
            .filter((word) => word.text.trim());
    }

    const text = (parent.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const pieces = text.split(/(\s+)/).filter((piece) => piece.trim());
    const duration = Math.max(100, lineEnd - lineStart);
    const totalWeight = pieces.reduce((sum, piece) => sum + Math.max(1, [...piece].length), 0);
    let cursor = lineStart;
    return pieces.map((piece, index) => {
        const share = duration * (Math.max(1, [...piece].length) / totalWeight);
        const start = cursor;
        cursor = index === pieces.length - 1 ? lineEnd : cursor + share;
        return { text: piece, start, end: Math.max(start + 80, cursor), partOfWord: false };
    });
}

export function parseSpicyTtml(ttml, durationSeconds = 0) {
    if (typeof ttml !== 'string' || typeof DOMParser === 'undefined') return [];
    const documentNode = new DOMParser().parseFromString(ttml, 'application/xml');
    if (documentNode.querySelector('parsererror')) return [];
    const paragraphs = Array.from(documentNode.getElementsByTagNameNS('*', 'p'));

    return paragraphs
        .map((paragraph, index) => {
            const start = elementTime(paragraph, 'begin', 0);
            const nextStart = paragraphs[index + 1] ? elementTime(paragraphs[index + 1], 'begin', start + 5000) : 0;
            const fallbackEnd = nextStart || Math.max(start + 5000, Number(durationSeconds) * 1000);
            const end = Math.max(start + 100, elementTime(paragraph, 'end', fallbackEnd));
            const role = paragraph.getAttribute('ttm:agent') || paragraph.getAttribute('agent') || '';
            const opposite =
                /v2|voice2|background|other/i.test(role) || paragraph.getAttribute('itunes:align') === 'right';
            const backgroundContainers = Array.from(paragraph.getElementsByTagNameNS('*', 'span')).filter((span) =>
                String(span.getAttribute('ttm:role') || span.getAttribute('role') || '').includes('x-bg')
            );
            const words = parseWordNodes(paragraph, start, end);
            const background = backgroundContainers.map((span) => ({
                start: elementTime(span, 'begin', start),
                end: elementTime(span, 'end', end),
                words: parseWordNodes(span, start, end),
            }));
            return { start, end, words, background, opposite };
        })
        .filter((line) => line.words.length);
}

export function getCenteredScrollTop(lineTop, lineHeight, viewportHeight, scrollHeight) {
    return clamp(lineTop + lineHeight / 2 - viewportHeight / 2, 0, Math.max(0, scrollHeight - viewportHeight));
}

function createSprings() {
    return {
        scale: new Spring(0.95, 0.88, 0.64),
        y: new Spring(0.01, 1.45, 0.4),
        glow: new Spring(0, 1.18, 0.56),
    };
}

const createSpline = (points) =>
    new Spline(
        points.map(([time]) => time),
        points.map(([, value]) => value)
    );
const scaleSpline = createSpline([
    [0, 0.95],
    [0.7, 1.0505],
    [1, 1],
]);
const letterScaleSpline = createSpline([
    [0, 0.95],
    [0.7, 1.175],
    [1, 1],
]);
const ySpline = createSpline([
    [0, 0.01],
    [0.9, -1 / 60],
    [1, 0],
]);
const letterYSpline = createSpline([
    [0, 0.01],
    [0.9, -1 / 56],
    [1, 0],
]);
const glowSpline = createSpline([
    [0, 0],
    [0.15, 1],
    [0.6, 1],
    [1, 0],
]);
const scaleAt = (p, letter = false) => (letter ? letterScaleSpline : scaleSpline).at(clamp(p, 0, 1));
const yAt = (p, letter = false) => (letter ? letterYSpline : ySpline).at(clamp(p, 0, 1));
const glowAt = (p) => glowSpline.at(clamp(p, 0, 1));

function createAnimatedToken(word, isBackground = false) {
    const duration = word.end - word.start;
    const letterCapable = [...word.text].length <= 12 && duration >= 1000 && !rtlPattern.test(word.text);
    const element = document.createElement(letterCapable ? 'div' : 'span');
    element.className = letterCapable ? 'letterGroup' : 'word';
    if (isBackground) element.classList.add(letterCapable ? 'bg-letterGroup' : 'bg-word');
    if (word.partOfWord) element.classList.add('PartOfWord');

    const token = { ...word, element, letterCapable, springs: createSprings(), letters: [] };
    if (letterCapable) {
        const letters = [...word.text];
        const animationEnd = Math.max(word.start + 100, word.end - 250);
        const letterDuration = (animationEnd - word.start) / Math.max(1, letters.length);
        letters.forEach((letter, index) => {
            const letterElement = document.createElement('span');
            letterElement.className = 'letter Emphasis';
            if (index === letters.length - 1) letterElement.classList.add('LastLetterInWord');
            letterElement.textContent = letter;
            element.appendChild(letterElement);
            token.letters.push({
                element: letterElement,
                start: word.start + index * letterDuration,
                end: word.start + (index + 1) * letterDuration,
                springs: createSprings(),
            });
        });
    } else {
        element.textContent = word.text;
    }
    return token;
}

function createLine(line, index, seek) {
    const element = document.createElement('div');
    element.className = 'line NotSung';
    element.dataset.lineIndex = String(index);
    if (line.opposite) element.classList.add('OppositeAligned');
    if (line.words.some((word) => rtlPattern.test(word.text))) element.classList.add('rtl');
    const tokens = line.words.map((word) => createAnimatedToken(word));
    tokens.at(-1)?.element.classList.add('LastWordInLine');
    tokens.forEach((token) => element.appendChild(token.element));
    element.addEventListener('click', () => seek(line.start));
    return { ...line, element, tokens };
}

function animateToken(token, currentTime, deltaTime, fontVariable = '--DefaultLyricsSize') {
    const progress = clamp((currentTime - token.start) / Math.max(1, token.end - token.start), 0, 1);
    const state = currentTime < token.start ? 'NotSung' : currentTime >= token.end ? 'Sung' : 'Active';
    const animatedProgress = state === 'NotSung' ? 0 : state === 'Sung' ? 1 : progress;
    token.springs.scale.setGoal(scaleAt(animatedProgress));
    token.springs.y.setGoal(yAt(animatedProgress));
    token.springs.glow.setGoal(glowAt(animatedProgress));
    const scale = token.springs.scale.step(deltaTime);
    const y = token.springs.y.step(deltaTime);
    const glow = token.springs.glow.step(deltaTime);
    token.element.style.scale = String(scale);
    token.element.style.transform = `translate3d(0, calc(var(${fontVariable}) * ${y}), 0)`;
    token.element.style.setProperty('--gradient-position', `${-20 + animatedProgress * 120}%`);
    token.element.style.setProperty('--text-shadow-opacity', `${glow * 0.85}`);
    token.element.style.setProperty('--text-shadow-blur-radius', `${4 + glow * 12}px`);

    token.letters.forEach((letter) => {
        const letterProgress = clamp((currentTime - letter.start) / Math.max(1, letter.end - letter.start), 0, 1);
        const letterState = currentTime < letter.start ? 0 : currentTime >= letter.end ? 1 : letterProgress;
        letter.springs.scale.setGoal(scaleAt(letterState, true));
        letter.springs.y.setGoal(yAt(letterState, true));
        letter.springs.glow.setGoal(glowAt(letterState));
        const letterGlow = letter.springs.glow.step(deltaTime);
        letter.element.style.scale = String(letter.springs.scale.step(deltaTime));
        letter.element.style.transform = `translate3d(0, calc(var(${fontVariable}) * ${letter.springs.y.step(deltaTime)}), 0)`;
        letter.element.style.setProperty('--gradient-position', `${-20 + easeSinOut(letterState) * 120}%`);
        letter.element.style.setProperty('--text-shadow-opacity', `${letterGlow * 0.85}`);
        letter.element.style.setProperty('--text-shadow-blur-radius', `${4 + letterGlow * 12}px`);
    });
}

function createBackground(root, track, api) {
    const sources = getArtworkSources(track?.album || track?.cover || track?.image);
    const artwork = api?.getCoverUrl?.(sources.static, '1280') || sources.static;
    const background = document.createElement('div');
    background.className = 'SpicyLyricsBackground';
    if (artwork)
        background.style.setProperty('--spicy-lyrics-artwork', `url("${String(artwork).replaceAll('"', '\\"')}")`);
    root.prepend(background);
}

export function createSpicyLyricsRenderer({ container, track, ttml, durationSeconds, api, onSeek }) {
    const parsedLines = parseSpicyTtml(ttml, durationSeconds);
    const fullscreen = container.id === 'fullscreen-lyrics-content';
    const root = document.createElement('div');
    root.id = 'SpicyLyricsPage';
    root.className = `SpicyRenderer UseSpicyFont${fullscreen ? ' Fullscreen' : ''}`;
    root.dataset.spicyLyricsView = fullscreen ? 'fullscreen' : 'side';
    createBackground(root, track, api);

    const lyricsContainer = document.createElement('div');
    lyricsContainer.className = 'LyricsContainer';
    const content = document.createElement('div');
    content.className = 'LyricsContent';
    const scroll = document.createElement('div');
    scroll.className = 'SpicyLyricsScrollContainer';
    scroll.dataset.lyricsType = parsedLines.some((line) => line.words.length > 1) ? 'Syllable' : 'Line';
    content.appendChild(scroll);
    lyricsContainer.appendChild(content);
    root.appendChild(lyricsContainer);
    container.replaceChildren(root);

    if (!parsedLines.length) {
        scroll.innerHTML = '<div class="LyricsNotice">Lyrics unavailable</div>';
        return { root, lines: [], setCurrentTime() {}, destroy() {} };
    }

    const lines = parsedLines.map((line, index) => createLine(line, index, onSeek));
    lines.forEach((line) => scroll.appendChild(line.element));
    let activeIndex = -1;
    let lastFrame = performance.now();
    let scrollAnimation = 0;
    let userScrollingUntil = 0;

    const markUserScroll = () => {
        userScrollingUntil = performance.now() + 750;
        content.classList.add('HideLineBlur');
    };
    content.addEventListener('wheel', markUserScroll, { passive: true });
    content.addEventListener('touchmove', markUserScroll, { passive: true });

    const centerLine = (line, immediate = false) => {
        if (!line || performance.now() < userScrollingUntil) return;
        content.classList.remove('HideLineBlur');
        const top = getCenteredScrollTop(
            line.element.offsetTop,
            line.element.offsetHeight,
            content.clientHeight,
            content.scrollHeight
        );
        if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            content.scrollTop = top;
            return;
        }
        cancelAnimationFrame(scrollAnimation);
        const start = content.scrollTop;
        const distance = top - start;
        const started = performance.now();
        const frame = (now) => {
            const progress = clamp((now - started) / 620, 0, 1);
            const eased = 1 - (1 - progress) ** 4;
            content.scrollTop = start + distance * eased;
            if (progress < 1) scrollAnimation = requestAnimationFrame(frame);
        };
        scrollAnimation = requestAnimationFrame(frame);
    };

    const setCurrentTime = (milliseconds, immediate = false) => {
        const now = performance.now();
        const deltaTime = clamp((now - lastFrame) / 1000, 1 / 240, 1 / 20);
        lastFrame = now;
        let nextActive = lines.findIndex((line) => milliseconds >= line.start && milliseconds < line.end);
        if (nextActive < 0)
            nextActive = Math.max(
                0,
                lines.findLastIndex((line) => milliseconds >= line.start)
            );

        lines.forEach((line, index) => {
            const state = index < nextActive ? 'Sung' : index === nextActive ? 'Active' : 'NotSung';
            line.element.classList.toggle('Sung', state === 'Sung');
            line.element.classList.toggle('Active', state === 'Active');
            line.element.classList.toggle('NotSung', state === 'NotSung');
            const distance = Math.abs(index - nextActive);
            line.element.style.setProperty(
                '--BlurAmount',
                state === 'Active' ? '0px' : `${Math.min(distance * 1.5, 5.465)}px`
            );
            if (distance <= 2) line.tokens.forEach((token) => animateToken(token, milliseconds, deltaTime));
        });

        if (nextActive !== activeIndex) {
            activeIndex = nextActive;
            centerLine(lines[activeIndex], immediate);
        }
    };

    const resizeObserver = new ResizeObserver(() => centerLine(lines[activeIndex], true));
    resizeObserver.observe(content);
    requestAnimationFrame(() => setCurrentTime(0, true));

    return {
        root,
        lines,
        setCurrentTime,
        destroy() {
            cancelAnimationFrame(scrollAnimation);
            resizeObserver.disconnect();
            content.removeEventListener('wheel', markUserScroll);
            content.removeEventListener('touchmove', markUserScroll);
        },
    };
}
