const TTML_NAMESPACE = 'http://www.w3.org/ns/ttml';
const TTM_NAMESPACE = 'http://www.w3.org/ns/ttml#metadata';
const ITUNES_NAMESPACE = 'http://music.apple.com/lyric-ttml-internal';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const DUET_AGENT = 'v2';
const DEFAULT_AGENT = 'v1';

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
    const duetLines = leadLines.filter((line) => line.getAttributeNS(TTM_NAMESPACE, 'role') === 'x-translation');

    // Spicy Lyrics marks the second vocal lane as x-translation. AMLL uses
    // ttm:agent to identify duet lines and applies its native right alignment.
    if (duetLines.length > 0) {
        const metadata = document.getElementsByTagNameNS(TTML_NAMESPACE, 'metadata')[0];
        if (metadata) {
            const declaredAgents = new Set(
                Array.from(metadata.getElementsByTagNameNS(TTM_NAMESPACE, 'agent'))
                    .map((agent) => agent.getAttributeNS(XML_NAMESPACE, 'id'))
                    .filter(Boolean),
            );
            for (const [id, name] of [
                [DEFAULT_AGENT, 'Main vocal'],
                [DUET_AGENT, 'Second vocal'],
            ]) {
                if (declaredAgents.has(id)) continue;
                const agent = document.createElementNS(TTM_NAMESPACE, 'ttm:agent');
                agent.setAttribute('type', 'person');
                agent.setAttributeNS(XML_NAMESPACE, 'xml:id', id);
                const agentName = document.createElementNS(TTM_NAMESPACE, 'ttm:name');
                agentName.setAttribute('type', 'full');
                agentName.textContent = name;
                agent.appendChild(agentName);
                metadata.appendChild(agent);
            }
        }
    }

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
        if (!line.hasAttributeNS(TTM_NAMESPACE, 'agent')) {
            const role = line.getAttributeNS(TTM_NAMESPACE, 'role');
            line.setAttributeNS(TTM_NAMESPACE, 'ttm:agent', role === 'x-translation' ? DUET_AGENT : DEFAULT_AGENT);
        }
    });

    return new XMLSerializer().serializeToString(document);
}
