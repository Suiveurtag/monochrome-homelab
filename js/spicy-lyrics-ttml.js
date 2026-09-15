/* Local TTML -> Spicy Lyrics semantic adapter.
 *
 * Spicy Lyrics normally receives this model from its own API. Monochrome keeps
 * uploaded TTML local, so this is the only upstream boundary intentionally
 * reimplemented here. Times are milliseconds because Monochrome's player sync
 * uses HTMLMediaElement.currentTime * 1000.
 */

export function parseTtmlTime(value) {
    if (value == null || value === '') return null;
    const source = String(value).trim();
    if (/^-?\d+(?:\.\d+)?ms$/i.test(source)) return Number.parseFloat(source);
    if (/^-?\d+(?:\.\d+)?s$/i.test(source)) return Number.parseFloat(source) * 1000;

    const clock = source.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.:](\d+))?$/);
    if (!clock) return null;
    const [, hours = '0', minutes, seconds, fraction = '0'] = clock;
    const millis = Number(`0.${fraction}`) * 1000;
    return Number(hours) * 3600000 + Number(minutes) * 60000 + Number(seconds) * 1000 + millis;
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
        .flatMap((node) => [getAttributeByLocalName(node, 'agent'), getAttributeByLocalName(node, 'role'), getAttributeByLocalName(node, 'align')])
        .filter(Boolean)
        .join(' ');
}

function elementTiming(element, fallbackStart = 0, fallbackEnd = fallbackStart + 4000) {
    const start = parseTtmlTime(element.getAttribute('begin')) ?? fallbackStart;
    const duration = parseTtmlTime(element.getAttribute('dur'));
    const end = parseTtmlTime(element.getAttribute('end')) ?? (duration == null ? fallbackEnd : start + duration);
    return { start, end: Math.max(start + 1, end) };
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

function parseWordElements(parent, lineStart, lineEnd, background = false) {
    const childSpans = Array.from(parent.childNodes).filter(
        (child) => child.nodeType === 1 && child.localName === 'span',
    );
    const regularSpans = background ? childSpans : childSpans.filter((span) => !isBackgroundElement(span));
    const timedSpans = regularSpans.filter(
        (span) => span.hasAttribute('begin') || span.hasAttribute('end') || span.hasAttribute('dur'),
    );
    const sourceSpans = timedSpans.length ? timedSpans : regularSpans;
    if (!sourceSpans.length) return lineTimedWords(parent.textContent || '', lineStart, lineEnd, background);

    return sourceSpans.map((span) => {
        const wordTiming = elementTiming(span, lineStart, lineEnd);
        return {
            text: span.textContent || '',
            spaceBefore: /^\s/u.test(span.textContent || ''),
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
    const parsed = paragraphs
        .map((paragraph, lineIndex) => {
            const next = paragraphs[lineIndex + 1];
            const nextStart = next ? parseTtmlTime(next.getAttribute('begin')) : null;
            const paragraphStart = parseTtmlTime(paragraph.getAttribute('begin')) ?? 0;
            const timing = elementTiming(paragraph, paragraphStart, nextStart ?? paragraphStart + 4000);
            const agent = getAttributeByLocalName(paragraph, 'agent') || '';
            const role = getAttributeByLocalName(paragraph, 'role') || '';
            const laneAttributes = getLaneAttributes(paragraph);
            const rightAligned = /^right$/i.test(getAttributeByLocalName(paragraph, 'align') || '');
            const background = isBackgroundElement(paragraph);
            const backgroundContainers = background
                ? []
                : Array.from(paragraph.getElementsByTagNameNS('*', 'span')).filter(isBackgroundElement);
            const words = parseWordElements(paragraph, timing.start, timing.end, background);
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
                    const containerTiming = elementTiming(container, timing.start, timing.end);
                    return {
                        start: containerTiming.start,
                        end: containerTiming.end,
                        text: container.textContent || '',
                        words: parseWordElements(container, containerTiming.start, containerTiming.end, true),
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
