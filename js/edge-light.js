import { hslToHex, rgbToHsl } from './vibrant-color.js';

// Ambient edge light of the collapsed Now Playing rail: one vivid colour per horizontal band of the artwork.
const SAMPLE_WIDTH = 16;
const SAMPLE_HEIGHT = 48;
const BANDS = 12;

export function edgeLightColors(data, width, height, bands = BANDS) {
    const colors = [];
    for (let band = 0; band < bands; band++) {
        const top = Math.floor((band * height) / bands);
        const bottom = Math.max(top + 1, Math.floor(((band + 1) * height) / bands));
        let r = 0;
        let g = 0;
        let b = 0;
        let total = 0;
        for (let y = top; y < bottom; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                // Favour saturated pixels so white skies and black borders don't wash the light out.
                const chroma =
                    (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])) / 255;
                const weight = chroma * chroma + 0.01;
                r += data[i] * weight;
                g += data[i + 1] * weight;
                b += data[i + 2] * weight;
                total += weight;
            }
        }
        const [h, s, l] = rgbToHsl(r / total, g / total, b / total);
        // Greyscale artwork stays a neutral glow; anything with colour is lifted to a lit, never neon, tone.
        colors.push(hslToHex(h, s < 0.06 ? s : Math.min(0.85, Math.max(0.55, s)), Math.min(0.6, Math.max(0.42, l))));
    }
    return colors;
}

// Mirrored so the light can scroll forever along the rail without a seam.
export function edgeLightGradient(colors) {
    return `linear-gradient(${[...colors, ...colors.toReversed()].join(', ')})`;
}

export async function loadEdgeLight(src) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_WIDTH;
    canvas.height = SAMPLE_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const { data } = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    return edgeLightGradient(edgeLightColors(data, SAMPLE_WIDTH, SAMPLE_HEIGHT));
}
