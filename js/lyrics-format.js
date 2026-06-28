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
    if (isTtml(content)) return content.replace(/^\uFEFF/, '').trim();
    return lrcToTtml(content, durationSeconds);
}
