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
            (start == null ? null : start + (parseTtmlTime(span.getAttribute('dur'), timingParameters) ?? 0));
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
    const regularSpans = background ? childSpans : childSpans.filter((span) => !isBackgroundElement(span));
    const timedSpans = regularSpans.filter(
        (span) => span.hasAttribute('begin') || span.hasAttribute('end') || span.hasAttribute('dur')
    );
    const sourceSpans = timedSpans.length ? timedSpans : regularSpans;
    if (!sourceSpans.length) return lineTimedWords(parent.textContent || '', lineStart, lineEnd, background);

    return sourceSpans.map((span, index) => {
        const wordTiming = elementTiming(span, lineStart, lineEnd, timingParameters);
        let text = span.textContent || '';
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

export function parseSpicyTtml(ttml) {
    if (!ttml || typeof DOMParser === 'undefined') return [];
    const documentNode = new DOMParser().parseFromString(ttml, 'application/xml');
    if (documentNode.getElementsByTagName('parsererror').length) throw new Error('Invalid TTML document');

    const namespacedParagraphs = Array.from(documentNode.getElementsByTagNameNS('*', 'p'));
    const paragraphs = namespacedParagraphs.length
        ? namespacedParagraphs
        : Array.from(documentNode.getElementsByTagName('p'));
    const timingParameters = getTtmlTimingParameters(documentNode.documentElement);
    const explicitlyLineTimed =
        getAttributeByLocalName(documentNode.documentElement, 'timing')?.toLowerCase() === 'line';
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
            if (explicitlyLineTimed && !background) {
                const textOnly = paragraph.cloneNode(true);
                Array.from(textOnly.getElementsByTagNameNS('*', 'span'))
                    .filter(isBackgroundElement)
                    .forEach((element) => element.remove());
                words = lineTimedWords(textOnly.textContent || '', timing.start, timing.end, false);
            } else {
                words = parseWordElements(paragraph, timing.start, timing.end, background, timingParameters);
            }
            const syncType = words.length > 1 ? 'Syllable' : 'Line';

            words.forEach((word, wordIndex) => {
                const nextWord = words[wordIndex + 1];
                word.isPartOfWord = Boolean(nextWord && !nextWord.spaceBefore);
            });

            const text = words.map((word) => word.text).join('');
            return {
                start: timing.start,
                end: timing.end,
                text,
                words,
                syncType,
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
                        words: parseWordElements(
                            container,
                            containerTiming.start,
                            containerTiming.end,
                            true,
                            timingParameters
                        ),
                        background: true,
                        opposite: false,
                        rtl: /[\u0590-\u08ff]/.test(container.textContent || ''),
                        syncType: 'Syllable',
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

    return leadLines;
}
