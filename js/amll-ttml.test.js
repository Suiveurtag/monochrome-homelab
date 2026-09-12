import { describe, expect, test } from 'vitest';
import { prepareTtmlForAmll } from './amll-ttml.js';

describe('AMLL TTML preparation', () => {
    test('converts Spicy Lyrics x-translation lanes to AMLL duet agents', () => {
        const input = `<?xml version="1.0"?>
            <tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
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
});
