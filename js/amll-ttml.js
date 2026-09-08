const TTML_NAMESPACE = 'http://www.w3.org/ns/ttml';
const TTM_NAMESPACE = 'http://www.w3.org/ns/ttml#metadata';
const ITUNES_NAMESPACE = 'http://music.apple.com/lyric-ttml-internal';

function parseTtmlTime(value) {
    const parts = String(value || '')
        .trim()
        .replace(/s$/i, '')
        .split(':')
        .map(Number);
    if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0) * 1000;
}

function getLineRange(line) {
    return {
        start: parseTtmlTime(line.getAttribute('begin')),
        end: parseTtmlTime(line.getAttribute('end')),
    };
}

function findBackgroundLead(backgroundLine, leadLines) {
    const background = getLineRange(backgroundLine);
    let bestLead = null;
    let bestOverlap = -1;

    for (const lead of leadLines) {
        const range = getLineRange(lead);
        const overlap = Math.max(0, Math.min(background.end, range.end) - Math.max(background.start, range.start));
        if (overlap > bestOverlap) {
            bestLead = lead;
            bestOverlap = overlap;
        }
    }

    return bestLead;
}

export function prepareTtmlForAmll(ttml) {
    const document = new DOMParser().parseFromString(ttml, 'application/xml');
    if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid TTML XML');

    const lines = Array.from(document.getElementsByTagNameNS(TTML_NAMESPACE, 'p'));
    const backgroundLines = lines.filter((line) => line.getAttributeNS(TTM_NAMESPACE, 'role') === 'x-bg');
    const leadLines = lines.filter((line) => !backgroundLines.includes(line));

    for (const backgroundLine of backgroundLines) {
        const lead = findBackgroundLead(backgroundLine, leadLines);
        if (!lead) continue;

        const background = document.createElementNS(TTML_NAMESPACE, 'span');
        background.setAttributeNS(TTM_NAMESPACE, 'ttm:role', 'x-bg');
        for (const attribute of ['begin', 'end']) {
            const value = backgroundLine.getAttribute(attribute);
            if (value) background.setAttribute(attribute, value);
        }
        while (backgroundLine.firstChild) background.appendChild(backgroundLine.firstChild);
        lead.appendChild(document.createTextNode(' '));
        lead.appendChild(background);
        backgroundLine.parentNode?.removeChild(backgroundLine);
    }

    leadLines.forEach((line, index) => {
        if (!line.hasAttributeNS(ITUNES_NAMESPACE, 'key')) {
            line.setAttributeNS(ITUNES_NAMESPACE, 'itunes:key', `line-${index + 1}`);
        }
    });

    return new XMLSerializer().serializeToString(document);
}
