/* Local TTML -> Spicy Lyrics semantic adapter.
 *
 * Spicy Lyrics normally receives this model from its own API. Monochrome keeps
 * uploaded TTML local, so this is the only upstream boundary intentionally
 * reimplemented here. Times are milliseconds because Monochrome's player sync
 * uses HTMLMediaElement.currentTime * 1000.
 */

export function parseTtmlTime(value, timingParameters = {}) {
    if (value == null || value === '') return null;
    const source = String(value).trim();
    if (!source) return null;
    if (/^-?\d+(?:\.\d+)?ms$/i.test(source)) return Number.parseFloat(source);
    if (/^-?\d+(?:\.\d+)?s$/i.test(source)) return Number.parseFloat(source) * 1000;

    const frameClock = source.match(/^(\d+):(\d{2}):(\d{2}):(\d+)(?:\.(\d+))?$/);
    if (frameClock) {
        const [, hours, minutes, seconds, frames, subframes = '0'] = frameClock;
        const frameRate = timingParameters.frameRate || 30;
        const subFrameRate = timingParameters.subFrameRate || 1;
        const elapsedFrames = Number(frames) + Number(subframes) / subFrameRate;
        return (
            (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000 + (elapsedFrames * 1000) / frameRate
        );
    }
    const frameOffset = source.match(/^(-?\d+(?:\.\d+)?)f$/i);
    if (frameOffset) return (Number.parseFloat(frameOffset[1]) * 1000) / (timingParameters.frameRate || 30);
    const tickOffset = source.match(/^(-?\d+(?:\.\d+)?)t$/i);
    if (tickOffset) return (Number.parseFloat(tickOffset[1]) * 1000) / (timingParameters.tickRate || 1);

    const clock = source.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.:](\d+))?$/);
    if (clock) {
        const [, hours = '0', minutes, seconds, fraction] = clock;
        const millis = fraction == null ? 0 : Number(`0.${fraction}`) * 1000;
        return Number(hours) * 3600000 + Number(minutes) * 60000 + Number(seconds) * 1000 + millis;
    }
    const numeric = Number(source);
    return Number.isFinite(numeric) && source !== '' ? numeric * 1000 : null;
}

// Restore word boundaries lost by older Spicy API-to-TTML conversions.
export function repairCachedSpicyTtml(ttml, rawResponse) {
    const response = rawResponse?.lyrics?.body;
    const rows = (response?.Body || response)?.Content;
    if (!Array.isArray(rows)) return null;
    const documentNode = new DOMParser().parseFromString(ttml, 'application/xml');
    if (documentNode.getElementsByTagName('parsererror').length) return null;
    const paragraphs = Array.from(documentNode.getElementsByTagNameNS('*', 'p'));
    if (paragraphs.length !== rows.length) return null;
    for (let i = 0; i < rows.length; i++) {
        const syllables = rows[i].Lead?.Syllables || [];
        const spans = Array.from(paragraphs[i].children);
        if (spans.length !== syllables.length) return null;
        for (let j = 1; j < spans.length; j++) {
            const previous = syllables[j - 1];
            if (!previous.IsPartOfWord && !/\s$/u.test(previous.Text || '') && !/^\s/u.test(syllables[j].Text || '') &&
                !/^\s/u.test(spans[j].previousSibling?.nodeType === 3 ? spans[j].previousSibling.textContent : '')) {
                spans[j].before(documentNode.createTextNode(' '));
            }
        }
    }
    return new XMLSerializer().serializeToString(documentNode);
}

function getTtmlTimingParameters(root) {
    const attribute = (localName) =>
        Array.from(root?.attributes || []).find((item) => item.localName === localName)?.value;
    const multiplier = attribute('frameRateMultiplier')?.trim().split(/\s+/u).map(Number);
    const rateMultiplier =
        multiplier?.length === 2 && multiplier.every(Number.isFinite) && multiplier[1] !== 0
            ? multiplier[0] / multiplier[1]
            : 1;
    const frameRate = (Number(attribute('frameRate')) || 30) * rateMultiplier;
    const subFrameRate = Number(attribute('subFrameRate')) || 1;
    return {
        frameRate,
        subFrameRate,
        tickRate: Number(attribute('tickRate')) || frameRate * subFrameRate,
    };
}

function getAttributeByLocalName(element, localName) {
    for (const attribute of element.attributes || []) {
        if (attribute.localName === localName || attribute.name?.split(':').at(-1) === localName)
            return attribute.value;
    }
    return null;
}

function getLaneAttributes(element) {
    return [element, ...Array.from(element.getElementsByTagNameNS('*', 'span'))]
        .flatMap((node) => [
            getAttributeByLocalName(node, 'agent'),
            getAttributeByLocalName(node, 'role'),
            getAttributeByLocalName(node, 'align'),
        ])
        .filter(Boolean)
        .join(' ');
}

function elementTiming(element, fallbackStart = 0, fallbackEnd = fallbackStart + 4000, timingParameters = {}) {
    const start = parseTtmlTime(element.getAttribute('begin'), timingParameters) ?? fallbackStart;
    const duration = parseTtmlTime(element.getAttribute('dur'), timingParameters);
    const end =
        parseTtmlTime(element.getAttribute('end'), timingParameters) ??
        (duration == null ? fallbackEnd : start + duration);
    return { start, end: Math.max(start + 1, end) };
}

function getTimedDescendantRange(element, timingParameters) {
    const timedSpans = Array.from(element.getElementsByTagNameNS('*', 'span')).filter(
        (span) => span.hasAttribute('begin') || span.hasAttribute('end') || span.hasAttribute('dur')
    );
    const starts = [];
    const ends = [];

    timedSpans.forEach((span) => {
        const start = parseTtmlTime(span.getAttribute('begin'), timingParameters);
        const end =
            parseTtmlTime(span.getAttribute('end'), timingParameters) ??
            (start != null && span.hasAttribute('dur') ? start + (parseTtmlTime(span.getAttribute('dur'), timingParameters) ?? 0) : null);
        if (start != null) starts.push(start);
        if (end != null) ends.push(end);
    });

    return {
        start: starts.length ? Math.min(...starts) : null,
        end: ends.length ? Math.max(...ends) : null,
    };
}

function hasWhitespaceBetween(previousSpan, currentSpan) {
    let node = previousSpan?.nextSibling;
    while (node && node !== currentSpan) {
        const text = node.nodeType === 3 ? node.textContent || '' : '';
        if (/^\s+$/u.test(text) && !text.includes('\n')) return true;
        node = node.nextSibling;
    }
    return false;
}

function lineTimedWords(text, start, end, background) {
    const normalizedText = String(text || '')
        .trim()
        .replace(/\s+/gu, ' ');
    if (!normalizedText) return [];
    return [{ text: normalizedText, spaceBefore: false, start, end, background }];
}

function isBackgroundElement(element) {
    return /(?:^|\s)x-bg(?:\s|$)/i.test(getAttributeByLocalName(element, 'role') || '');
}

function parseWordElements(parent, lineStart, lineEnd, background = false, timingParameters = {}) {
    const childSpans = Array.from(parent.childNodes).filter(
        (child) => child.nodeType === 1 && child.localName === 'span'
    );
    const regularSpans = childSpans.filter((span) => !isSecondaryText(span) && (background || !isBackgroundElement(span)));
    const timedSpans = regularSpans.filter(
        (span) => span.hasAttribute('begin') || span.hasAttribute('end') || span.hasAttribute('dur')
    );
    const sourceSpans = timedSpans.length ? timedSpans : regularSpans;
    if (!sourceSpans.length) return lineTimedWords(parent.textContent || '', lineStart, lineEnd, background);

    return sourceSpans.map((span, index) => {
        const nextStart = parseTtmlTime(sourceSpans[index + 1]?.getAttribute('begin'), timingParameters);
        const wordTiming = elementTiming(span, lineStart, nextStart ?? lineEnd, timingParameters);
        let text = lyricText(span);
        const previousSpan = sourceSpans[index - 1];
        const previousEndsWithSpace = /\s$/u.test(previousSpan?.textContent || '');
        if (previousSpan && (hasWhitespaceBetween(previousSpan, span) || previousEndsWithSpace) && !/^\s/u.test(text)) {
            text = ` ${text}`;
        }
        return {
            text,
            spaceBefore: /^\s/u.test(text),
            start: wordTiming.start,
            end: wordTiming.end,
            background,
        };
    });
}

function isSecondaryText(element) {
    return /(?:^|\s)x-(?:romanization|transliteration|translation)(?:\s|$)/i.test(getAttributeByLocalName(element, 'role') || '');
}

function lyricText(element) {
    return Array.from(element.childNodes, (node) => {
        if (node.nodeType === 3 || node.nodeType === 4) return node.textContent;
        if (node.nodeType !== 1 || isBackgroundElement(node) || isSecondaryText(node)) return '';
        return lyricText(node);
    }).join('');
}

function getTransliterations(documentNode) {
    const rows = new Map();
    for (const block of documentNode.getElementsByTagNameNS('*', 'transliteration')) {
        for (const line of block.getElementsByTagNameNS('*', 'text')) {
            const key = getAttributeByLocalName(line, 'for');
            if (!key || rows.has(key)) continue;
            rows.set(key, line);
        }
    }
    return rows;
}

export function parseSpicyTtml(ttml, { lineOnly = false } = {}) {
    if (!ttml || typeof DOMParser === 'undefined') return [];
    const documentNode = new DOMParser().parseFromString(ttml.replaceAll('&nbsp;', '&#160;'), 'application/xml');
    if (documentNode.getElementsByTagName('parsererror').length) throw new Error('Invalid TTML document');

    const body = documentNode.getElementsByTagNameNS('*', 'body')[0];
    const paragraphs = Array.from(body?.getElementsByTagNameNS('*', 'p') ?? []);
    const timingParameters = getTtmlTimingParameters(documentNode.documentElement);
    const timing = getAttributeByLocalName(documentNode.documentElement, 'timing')?.toLowerCase();
    const explicitlyLineTimed = lineOnly || timing === 'line';
    const staticLyrics = timing === 'none' || !paragraphs.some((paragraph) =>
        [paragraph, ...paragraph.getElementsByTagNameNS('*', 'span')].some((node) =>
            node.hasAttribute('begin') || node.hasAttribute('end') || node.hasAttribute('dur')
        )
    );
    const transliterations = getTransliterations(documentNode);
    const paragraphRanges = paragraphs.map((paragraph) => getTimedDescendantRange(paragraph, timingParameters));
    const parsed = paragraphs
        .map((paragraph, lineIndex) => {
            const next = paragraphs[lineIndex + 1];
            const childRange = paragraphRanges[lineIndex];
            const nextStart = next
                ? (parseTtmlTime(next.getAttribute('begin'), timingParameters) ?? paragraphRanges[lineIndex + 1]?.start)
                : null;
            const paragraphStart =
                parseTtmlTime(paragraph.getAttribute('begin'), timingParameters) ?? childRange.start ?? 0;
            const fallbackEnd = childRange.end ?? nextStart ?? paragraphStart + 4000;
            const timing = elementTiming(paragraph, paragraphStart, fallbackEnd, timingParameters);
            const agent = getAttributeByLocalName(paragraph, 'agent') || '';
            const role = getAttributeByLocalName(paragraph, 'role') || '';
            const laneAttributes = getLaneAttributes(paragraph);
            const rightAligned = /^right$/i.test(getAttributeByLocalName(paragraph, 'align') || '');
            const background = isBackgroundElement(paragraph);
            const backgroundContainers = background
                ? []
                : Array.from(paragraph.getElementsByTagNameNS('*', 'span')).filter(isBackgroundElement);
            let words;
            if (explicitlyLineTimed) {
                words = lineTimedWords(lyricText(paragraph), timing.start, timing.end, background);
            } else {
                words = parseWordElements(paragraph, timing.start, timing.end, background, timingParameters);
            }
            const syncType = staticLyrics ? 'Static' : !explicitlyLineTimed &&
                (words.length > 1 || timing.end > words[0]?.end || childRange.start != null) ? 'Syllable' : 'Line';
            const romanizationEntry = transliterations.get(getAttributeByLocalName(paragraph, 'key')) ??
                Array.from(paragraph.children).find((node) =>
                    /x-(?:romanization|transliteration)/i.test(getAttributeByLocalName(node, 'role') || '')
                );
            const romanizedSpans = Array.from(romanizationEntry?.children ?? []).filter((node) =>
                node.localName === 'span' && !isBackgroundElement(node)
            );

            words.forEach((word, wordIndex) => {
                const nextWord = words[wordIndex + 1];
                word.isPartOfWord = Boolean(nextWord && !nextWord.spaceBefore);
                if (romanizedSpans.length === words.length) {
                    const span = romanizedSpans[wordIndex];
                    const next = romanizedSpans[wordIndex + 1];
                    word.romanized = span.textContent ?? '';
                    word.romanizedPartOfWord = Boolean(next && !/\s$/.test(span.textContent) &&
                        !/^\s/.test(next.textContent) && !hasWhitespaceBetween(span, next));
                }
            });

            const text = words.map((word) => word.text).join('');
            return {
                start: timing.start,
                end: Math.max(timing.end, ...words.map((word) => word.end)),
                text,
                words,
                syncType,
                romanized: romanizationEntry?.textContent?.trim(),
                leadEnd: Math.max(timing.end, ...words.map((word) => word.end)),
                // Apple/Spotify duet exports can expose the second vocal lane
                // as x-translation even when the text is not a translation.
                // Spicy Lyrics maps that lane to OppositeAligned.
                opposite:
                    rightAligned ||
                    /(?:v2|voice2|secondary|opposite|x-translation)/i.test(`${agent} ${role} ${laneAttributes}`),
                background,
                backgrounds: backgroundContainers.map((container) => {
                    const containerRange = getTimedDescendantRange(container, timingParameters);
                    const containerTiming = elementTiming(
                        container,
                        containerRange.start ?? timing.start,
                        containerRange.end ?? timing.end,
                        timingParameters
                    );
                    return {
                        start: containerTiming.start,
                        end: containerTiming.end,
                        text: container.textContent || '',
                        words: explicitlyLineTimed
                            ? lineTimedWords(
                                  container.textContent || '',
                                  containerTiming.start,
                                  containerTiming.end,
                                  true
                              )
                            : parseWordElements(
                                  container,
                                  containerTiming.start,
                                  containerTiming.end,
                                  true,
                                  timingParameters
                              ),
                        background: true,
                        opposite: false,
                        rtl: /[\u0590-\u08ff]/.test(container.textContent || ''),
                        syncType: explicitlyLineTimed ? 'Line' : 'Syllable',
                    };
                }),
                rtl: /[\u0590-\u08ff]/.test(text),
            };
        })
        .filter((line) => line.text.trim());

    const leadLines = parsed.filter((line) => !line.background);
    const backgroundLines = parsed.filter((line) => line.background);
    leadLines.forEach((line) => {
        line.backgrounds ??= [];
        line.backgrounds.forEach((background) => {
            background.opposite = line.opposite;
            line.end = Math.max(line.end, background.end);
        });
    });

    backgroundLines.forEach((background) => {
        const owner = leadLines
            .map((lead) => ({
                lead,
                overlap: Math.max(0, Math.min(lead.end, background.end) - Math.max(lead.start, background.start)),
                distance: Math.abs(lead.start - background.start),
            }))
            .filter((candidate) => candidate.overlap > 0)
            .sort((a, b) => b.overlap - a.overlap || a.distance - b.distance)[0]?.lead;

        if (!owner) return;
        background.opposite = owner.opposite;
        owner.backgrounds.push(background);
        owner.end = Math.max(owner.end, background.end);
    });

    const songwriters = [...documentNode.getElementsByTagNameNS('*', 'songwriter')]
        .map((node) => node.textContent.trim())
        .filter(Boolean);
    if (songwriters.length) Object.defineProperty(leadLines, 'songwriters', { value: songwriters });
    return leadLines;
}
