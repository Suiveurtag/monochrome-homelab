import { describe, expect, test } from 'vitest';
import { prepareTtmlForAmll } from './amll-ttml.js';

describe('AMLL TTML preparation', () => {
    test('converts Spicy Lyrics x-translation lanes to AMLL duet agents', () => {
        const input = `<?xml version="1.0"?>
            <tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal">
                <head><metadata /></head>
                <body><div>
                    <p begin="1s" end="2s">Main</p>
                    <p ttm:role="x-translation" begin="2s" end="3s">Second</p>
                </div></body>
            </tt>`;

        const documentNode = new DOMParser().parseFromString(prepareTtmlForAmll(input), 'application/xml');
        const lines = Array.from(documentNode.getElementsByTagNameNS('http://www.w3.org/ns/ttml', 'p'));
        const metadata = documentNode.getElementsByTagNameNS('http://www.w3.org/ns/ttml', 'metadata')[0];

        expect(lines.map((line) => line.getAttributeNS('http://www.w3.org/ns/ttml#metadata', 'agent'))).toEqual(['v1', 'v2']);
        expect(metadata.getElementsByTagNameNS('http://www.w3.org/ns/ttml#metadata', 'agent')).toHaveLength(2);
        expect(metadata.querySelector('[*|id="v2"]')).toBeTruthy();
    });

    test('keeps background and duet lanes when role attributes are unprefixed', () => {
        const input = `<?xml version="1.0"?>
            <tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal">
                <head><metadata /></head>
                <body><div>
                    <p begin="1s" end="3s">Main</p>
                    <p role="x-bg" begin="1s" end="2s">(background)</p>
                    <p itunes:align="right" begin="3s" end="4s">Second</p>
                </div></body>
            </tt>`;

        const documentNode = new DOMParser().parseFromString(prepareTtmlForAmll(input), 'application/xml');
        const lines = Array.from(documentNode.getElementsByTagNameNS('http://www.w3.org/ns/ttml', 'p'));
        expect(lines).toHaveLength(2);
        expect(lines[0].getElementsByTagNameNS('http://www.w3.org/ns/ttml', 'span')[0]?.textContent).toBe(
            '(background)',
        );
        expect(lines[1].getAttributeNS('http://www.w3.org/ns/ttml#metadata', 'agent')).toBe('v2');
    });

    test('keeps a source that starts on the second vocal lane on AMLL right side', () => {
        const input = `<?xml version="1.0"?>
            <tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
                <head><metadata /></head>
                <body><div><p ttm:agent="v2" begin="1s" end="2s">Second first</p><p begin="2s" end="3s">Main later</p></div></body>
            </tt>`;

        const documentNode = new DOMParser().parseFromString(prepareTtmlForAmll(input), 'application/xml');
        const duetAgent = Array.from(
            documentNode.getElementsByTagNameNS('http://www.w3.org/ns/ttml#metadata', 'agent'),
        ).find((agent) => agent.getAttribute('xml:id') === 'v2');

        expect(duetAgent?.getAttribute('type')).toBe('other');
    });
});
