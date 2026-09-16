function escapeXml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function formatTtmlTime(milliseconds) {
    const safe = Math.max(0, Math.round(milliseconds));
    const hours = Math.floor(safe / 3600000);
    const minutes = Math.floor((safe % 3600000) / 60000);
    const seconds = Math.floor((safe % 60000) / 1000);
    const millis = safe % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function parseTtmlTime(value) {
    if (value == null || value === '') return null;
    const source = String(value).trim();
    if (/^-?\d+(?:\.\d+)?ms$/i.test(source)) return Number.parseFloat(source);
    if (/^-?\d+(?:\.\d+)?s$/i.test(source)) return Number.parseFloat(source) * 1000;
    const parts = source.split(':').map(Number);
    if (parts.some(Number.isNaN)) return null;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    return Number(source) || null;
}

function splitLyricWords(text) {
    const normalized = String(text || '').replace(/\s+/gu, ' ').trim();
    return normalized.match(/\s*\S+/gu) || [];
}

function splitVocalSegments(text) {
    const segments = [];
    const pattern = /\([^()]+\)/gu;
    let cursor = 0;
    for (const match of String(text || '').matchAll(pattern)) {
        if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), background: false });
        segments.push({ text: match[0], background: true });
        cursor = match.index + match[0].length;
    }
    if (cursor < String(text || '').length) segments.push({ text: text.slice(cursor), background: false });
    return segments.length ? segments : [{ text: String(text || ''), background: false }];
}

const TTML_METADATA_NAMESPACE = 'http://www.w3.org/ns/ttml#metadata';
const ITUNES_TTML_NAMESPACE = 'http://music.apple.com/lyric-ttml-internal';
const STARS_OPENING_DUET_END = 'You need somebody, baby, just call me';

function normalizedLyricText(text) {
    return String(text || '')
        .replace(/\s+/gu, ' ')
        .trim()
        .toLocaleLowerCase('en-US');
}

function metadataText(document, localName) {
    return Array.from(document.getElementsByTagNameNS('*', localName))[0]?.textContent || '';
}

/**
 * Some Apple line-timed exports flatten duet information into plain text.
 * Stars is one of those exports: its first vocal lane is the second singer,
 * but the source contains no agent or alignment attribute at all. Restore the
 * known lane boundary before either lyrics renderer parses the document.
 */
function markStarsOpeningDuet(document, paragraphs) {
    const title = normalizedLyricText(metadataText(document, 'title'));
    const artist = normalizedLyricText(metadataText(document, 'artist'));
    if (title !== 'stars' || artist !== 'pinkpantheress') return false;

    let started = false;
    let changed = false;
    for (const paragraph of paragraphs) {
        if (!started) started = normalizedLyricText(paragraph.textContent).startsWith("why'd you wanna go");
        if (!started) continue;

        paragraph.setAttributeNS(TTML_METADATA_NAMESPACE, 'ttm:agent', 'v2');
        paragraph.setAttributeNS(ITUNES_TTML_NAMESPACE, 'itunes:align', 'right');
        changed = true;
        if (normalizedLyricText(paragraph.textContent) === normalizedLyricText(STARS_OPENING_DUET_END)) break;
    }
    return changed;
}

/**
 * Converts valid line-timed TTML into word-timed TTML. Sources such as Apple
 * Music's `itunes:timing="Line"` exports often contain no child spans at all.
 * Their line timing is retained; word timings are an interpolation because
 * the source does not contain the original per-word timestamps.
 */
export function normalizeTtmlWordTiming(content) {
    if (!isTtml(content) || typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return content;

    const document = new DOMParser().parseFromString(content.replace(/^\uFEFF/, '').trim(), 'application/xml');
    const paragraphs = Array.from(document.getElementsByTagNameNS('*', 'p'));
    let converted = false;

    paragraphs.forEach((paragraph, index) => {
        const timedSpans = Array.from(paragraph.getElementsByTagNameNS('*', 'span')).filter(
            (span) => span.hasAttribute('begin') || span.hasAttribute('end') || span.hasAttribute('dur'),
        );
        if (timedSpans.length) return;

        const segments = splitVocalSegments(paragraph.textContent);
        const words = segments.flatMap((segment) =>
            splitLyricWords(segment.text).map((text) => ({ text, background: segment.background })),
        );
        if (!words.length) return;
        const start = parseTtmlTime(paragraph.getAttribute('begin')) ?? 0;
        const nextStart = parseTtmlTime(paragraphs[index + 1]?.getAttribute('begin'));
        const end = Math.max(
            start + 1,
            parseTtmlTime(paragraph.getAttribute('end')) ?? nextStart ?? start + 4000,
        );
        const totalWeight = words.reduce((sum, word) => sum + Math.max(1, word.text.trim().length), 0);
        let cursor = start;

        paragraph.replaceChildren();
        let currentBackground = null;
        words.forEach((word, wordIndex) => {
            const span = document.createElementNS('http://www.w3.org/ns/ttml', 'span');
            const weight = Math.max(1, word.text.trim().length) / totalWeight;
            const wordEnd = wordIndex === words.length - 1 ? end : cursor + (end - start) * weight;
            span.setAttribute('begin', formatTtmlTime(cursor));
            span.setAttribute('end', formatTtmlTime(Math.max(cursor + 1, wordEnd)));
            span.textContent = word.text;
            if (word.background) {
                if (!currentBackground) {
                    currentBackground = document.createElementNS('http://www.w3.org/ns/ttml', 'span');
                    currentBackground.setAttributeNS(
                        'http://www.w3.org/ns/ttml#metadata',
                        'ttm:role',
                        'x-bg',
                    );
                    paragraph.appendChild(currentBackground);
                }
                currentBackground.appendChild(span);
            } else {
                currentBackground = null;
                paragraph.appendChild(span);
            }
            cursor = wordEnd;
        });
        converted = true;
    });

    const restoredDuetLayout = markStarsOpeningDuet(document, paragraphs);
    if (!converted && !restoredDuetLayout) return content.replace(/^\uFEFF/, '').trim();
    const root = document.documentElement;
    const timingAttribute = Array.from(root.attributes).find(
        (attribute) => attribute.localName === 'timing' || attribute.name === 'timing',
    );
    if (timingAttribute) timingAttribute.value = 'Word';
    else root.setAttributeNS('http://music.apple.com/lyric-ttml-internal', 'itunes:timing', 'Word');
    return new XMLSerializer().serializeToString(document);
}

export function parseLrc(content) {
    if (typeof content !== 'string') return [];
    const offset = Number(content.match(/^\[offset:([+-]?\d+)\]\s*$/im)?.[1] || 0);
    const entries = [];

    for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const timestamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
        if (!timestamps.length) continue;
        const text = rawLine.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim();
        if (!text) continue;

        for (const match of timestamps) {
            const fraction = (match[3] || '0').padEnd(3, '0').slice(0, 3);
            const timestamp = Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number(fraction) + offset;
            entries.push({ timestamp: Math.max(0, timestamp), text });
        }
    }

    return entries.sort((a, b) => a.timestamp - b.timestamp);
}

export function lrcToTtml(content, durationSeconds = 0) {
    const lines = parseLrc(content);
    if (!lines.length) return '';
    const durationMs = Math.max(0, Number(durationSeconds) * 1000);
    const body = lines
        .map((line, index) => {
            const nextTimestamp = lines[index + 1]?.timestamp;
            const end = Math.max(
                line.timestamp + 100,
                nextTimestamp ?? (durationMs > line.timestamp ? durationMs : line.timestamp + 5000)
            );
            return `      <p begin="${formatTtmlTime(line.timestamp)}" end="${formatTtmlTime(end)}">${escapeXml(line.text)}</p>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
${body}
    </div>
  </body>
</tt>`;
}

export function plainLyricsToTtml(content, durationSeconds = 0) {
    if (typeof content !== 'string') return '';
    const lines = content
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (!lines.length) return '';

    const totalMs = Math.max(lines.length * 3000, Number(durationSeconds || 0) * 1000);
    const lineDuration = totalMs / lines.length;
    const body = lines
        .map((text, index) => {
            const start = index * lineDuration;
            const end = index === lines.length - 1 ? totalMs : (index + 1) * lineDuration;
            return `      <p begin="${formatTtmlTime(start)}" end="${formatTtmlTime(end)}">${escapeXml(text)}</p>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
${body}
    </div>
  </body>
</tt>`;
}

export function isTtml(content) {
    if (typeof content !== 'string') return false;
    const source = content.replace(/^\uFEFF/, '').trim();
    if (!/<(?:[\w-]+:)?tt(?:\s|>)/i.test(source) || !/<(?:[\w-]+:)?p(?:\s|>)/i.test(source)) return false;

    if (typeof DOMParser === 'undefined') {
        return /<\/(?:[\w-]+:)?tt>\s*$/i.test(source);
    }

    const document = new DOMParser().parseFromString(source, 'application/xml');
    return (
        !document.querySelector('parsererror') &&
        document.documentElement?.localName === 'tt' &&
        document.getElementsByTagNameNS('*', 'p').length > 0
    );
}

export function lyricsToTtml(content, durationSeconds = 0) {
    if (isTtml(content)) return normalizeTtmlWordTiming(content);
    return lrcToTtml(content, durationSeconds);
}
