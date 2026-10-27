import { describe, expect, test } from 'vitest';
import { edgeLightColors, edgeLightGradient } from './edge-light.js';

const pixels = (rows) => new Uint8ClampedArray(rows.flatMap((row) => [...row, 255, ...row, 255]));

describe('Edge light', () => {
    test('takes the saturated colour of each band over white and black', () => {
        // Each row: one coloured pixel next to a neutral one.
        const data = new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 255]);
        const [top, bottom] = edgeLightColors(data, 2, 2, 2);
        expect(top).toMatch(/^#[a-f0-9]{6}$/);
        expect(parseInt(top.slice(1, 3), 16)).toBeGreaterThan(parseInt(top.slice(5, 7), 16));
        expect(parseInt(bottom.slice(5, 7), 16)).toBeGreaterThan(parseInt(bottom.slice(1, 3), 16));
    });

    test('keeps greyscale artwork neutral and mirrors the gradient', () => {
        const [grey] = edgeLightColors(pixels([[250, 250, 250]]), 2, 1, 1);
        expect(grey.slice(1, 3)).toBe(grey.slice(3, 5));
        expect(edgeLightGradient(['#111111', '#222222'])).toBe('linear-gradient(#111111, #222222, #222222, #111111)');
    });
});
