// Canvas looks for the share card: the four classic styles and the collectible recap editions.
// A theme paints the background, names its type and colors, and may treat artwork and overlay the card.

const SANS = 'Switzer, Inter, system-ui, sans-serif';

const scratch = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
export function rgb(color, fallback = '#8a8a8a') {
    scratch.clearRect(0, 0, 1, 1);
    scratch.fillStyle = fallback;
    scratch.fillStyle = color || fallback;
    scratch.fillRect(0, 0, 1, 1);
    return [...scratch.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}
export const mix = (a, b, t) => a.map((value, i) => Math.round(value + (b[i] - value) * t));
export const css = (c, alpha = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${alpha})`;
const luminance = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
// Cover colors are lifted into light on dark styles, the way the page's ambience is.
export const lift = (c) => mix(c, [255, 255, 255], Math.max(0, 0.62 - luminance(c)));
const BLACK = [0, 0, 0];
const TAU = Math.PI * 2;

// Seeded, so decorations stay put between redraws.
function prng(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let grain;
function paintGrain(ctx, width, height, mode, alpha) {
    if (!grain) {
        grain = document.createElement('canvas');
        grain.width = grain.height = 256;
        const g = grain.getContext('2d');
        const noise = g.createImageData(256, 256);
        for (let i = 0; i < noise.data.length; i += 4) {
            const v = Math.random() * 255;
            noise.data.set([v, v, v, 255], i);
        }
        g.putImageData(noise, 0, 0);
    }
    ctx.save();
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ctx.createPattern(grain, 'repeat');
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}
function glow(ctx, x, y, radius, color, alpha) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, css(color, alpha));
    gradient.addColorStop(1, css(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
function fill(ctx, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
}
function linear(ctx, x0, y0, x1, y1, stops) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1), color));
    return gradient;
}
// A dot screen that fades out from its center, like a riso or newsprint halftone.
function halftone(ctx, cx, cy, radius, color, cell, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    for (let y = -radius; y <= radius; y += cell)
        for (let x = -radius; x <= radius; x += cell) {
            const t = 1 - Math.hypot(x, y) / radius;
            if (t <= 0) continue;
            ctx.beginPath();
            ctx.arc(x, y, cell * 0.52 * Math.pow(t, 0.8), 0, TAU);
            ctx.fill();
        }
    ctx.restore();
}
function stars(ctx, w, h, count, seed, alpha = 0.8) {
    const random = prng(seed);
    for (let i = 0; i < count; i++) {
        const r = random() < 0.08 ? 2.6 : 1.2 + random();
        ctx.fillStyle = `rgb(255 255 255 / ${alpha * (0.3 + random() * 0.7)})`;
        ctx.beginPath();
        ctx.arc(random() * w, random() * h, r, 0, TAU);
        ctx.fill();
    }
}
function sparkle(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x, y, x + size, y);
    ctx.quadraticCurveTo(x, y, x, y + size);
    ctx.quadraticCurveTo(x, y, x - size, y);
    ctx.quadraticCurveTo(x, y, x, y - size);
    ctx.fill();
}
const gold = (ctx, x0, y0, x1, y1) =>
    linear(ctx, x0, y0, x1, y1, ['#f9e08b', '#c7972f', '#fff1b8', '#a87922', '#f3d272']);

const dark = (c0) => ({
    text: '#ffffff',
    muted: 'rgb(255 255 255 / 0.62)',
    surface: 'rgb(255 255 255 / 0.09)',
    line: 'rgb(255 255 255 / 0.16)',
    shadow: 'rgb(0 0 0 / 0.5)',
    accent: css(lift(c0)),
    onAccent: '#0b0b0c',
    display: { family: SANS, weight: 700, style: 'normal' },
    body: { family: SANS, weight: 600 },
    shapes: { artist: 'circle', track: 'round' },
    radius: 18,
    tile: 30,
    badge: 'disc',
});

// ---------- Classic styles: painted from the period's cover colors ----------

const CLASSIC = {
    aura: ([c0, c1, c2]) => ({
        ...dark(c0),
        paint(ctx, w, h) {
            fill(ctx, w, h, '#0b0b0d');
            glow(ctx, w * 0.82, h * 0.1, w * 0.75, lift(c0), 0.5);
            glow(ctx, w * 0.08, h * 0.38, w * 0.7, lift(c1), 0.34);
            glow(ctx, w * 0.9, h * 0.72, w * 0.65, lift(c2), 0.3);
            glow(ctx, w * 0.25, h * 1.02, w * 0.6, lift(c0), 0.22);
            paintGrain(ctx, w, h, 'overlay', 0.09);
        },
    }),
    vivid: ([c0, c1, c2]) => ({
        ...dark(c0),
        accent: '#ffffff',
        paint(ctx, w, h) {
            ctx.fillStyle = linear(ctx, 0, 0, w * 0.3, h, [
                css(mix(c0, BLACK, 0.2)),
                css(mix(mix(c0, c1, 0.5), BLACK, 0.55)),
                css(mix(c1, BLACK, 0.82)),
            ]);
            ctx.fillRect(0, 0, w, h);
            glow(ctx, w * 0.9, h * 0.05, w * 0.8, lift(c2), 0.3);
            paintGrain(ctx, w, h, 'overlay', 0.1);
        },
    }),
    ink: ([c0]) => ({
        ...dark(c0),
        accent: '#ffffff',
        paint(ctx, w, h) {
            fill(ctx, w, h, '#000000');
            glow(ctx, w * 0.5, -h * 0.05, w * 0.9, lift(c0), 0.14);
            paintGrain(ctx, w, h, 'overlay', 0.08);
        },
    }),
    paper: ([c0]) => ({
        ...dark(c0),
        text: '#141414',
        muted: 'rgb(20 20 20 / 0.58)',
        surface: 'rgb(20 20 20 / 0.06)',
        line: 'rgb(20 20 20 / 0.16)',
        shadow: 'rgb(40 30 20 / 0.22)',
        accent: '#141414',
        onAccent: '#f3f1ec',
        paint(ctx, w, h) {
            fill(ctx, w, h, '#f3f1ec');
            glow(ctx, w * 0.85, h * 0.08, w * 0.7, mix(c0, [243, 241, 236], 0.35), 0.28);
            paintGrain(ctx, w, h, 'multiply', 0.06);
        },
    }),
};

// ---------- Weekly editions ----------

const EDITION = {
    vinyl: () => ({
        ...dark(BLACK),
        text: '#f4e9dc',
        muted: 'rgb(244 233 220 / 0.6)',
        surface: 'rgb(244 233 220 / 0.08)',
        line: 'rgb(244 233 220 / 0.16)',
        accent: '#e2483d',
        onAccent: '#f4e9dc',
        display: { family: '"Fraunces", Georgia, serif', weight: 900, style: 'italic' },
        shapes: { artist: 'circle', track: 'record' },
        paint(ctx, w, h) {
            fill(ctx, w, h, '#16110d');
            glow(ctx, w * 0.1, h * 0.04, w * 0.9, [226, 72, 61], 0.2);
            glow(ctx, w * 0.95, h * 0.95, w * 0.8, [217, 164, 65], 0.14);
            // A record sliding out of the bottom corner.
            const cx = w * 1.02,
                cy = h * 0.93,
                r = w * 0.6;
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, TAU);
            ctx.fillStyle = '#0a0807';
            ctx.fill();
            ctx.lineWidth = 1.5;
            for (let ring = r * 0.38, i = 0; ring < r * 0.97; ring += 5, i++) {
                ctx.strokeStyle = `rgb(255 240 220 / ${i % 4 ? 0.035 : 0.08})`;
                ctx.beginPath();
                ctx.arc(cx, cy, ring, 0, TAU);
                ctx.stroke();
            }
            if (ctx.createConicGradient) {
                const sheen = ctx.createConicGradient(-0.9, cx, cy);
                [
                    [0, 0],
                    [0.05, 0.16],
                    [0.11, 0],
                    [0.5, 0],
                    [0.55, 0.1],
                    [0.61, 0],
                    [1, 0],
                ].forEach(([at, a]) => sheen.addColorStop(at, `rgb(255 236 210 / ${a})`));
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = sheen;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, TAU);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.fillStyle = '#e2483d';
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.32, 0, TAU);
            ctx.fill();
            ctx.fillStyle = '#16110d';
            ctx.beginPath();
            ctx.arc(cx, cy, 14, 0, TAU);
            ctx.fill();
            ctx.restore();
            paintGrain(ctx, w, h, 'overlay', 0.1);
        },
        art: {
            frame(ctx, x, y, size, shape) {
                if (shape !== 'record') return;
                const cx = x + size / 2,
                    cy = y + size / 2;
                ctx.save();
                ctx.lineWidth = 1.2;
                for (let ring = size * 0.36; ring < size * 0.5; ring += 3.5) {
                    ctx.strokeStyle = 'rgb(10 8 7 / 0.32)';
                    ctx.beginPath();
                    ctx.arc(cx, cy, ring, 0, TAU);
                    ctx.stroke();
                }
                ctx.fillStyle = '#16110d';
                ctx.beginPath();
                ctx.arc(cx, cy, size * 0.05, 0, TAU);
                ctx.fill();
                ctx.restore();
            },
        },
    }),
    riso: () => ({
        ...dark(BLACK),
        text: '#0078bf',
        muted: 'rgb(0 120 191 / 0.72)',
        surface: 'rgb(255 72 176 / 0.13)',
        line: 'rgb(0 120 191 / 0.3)',
        shadow: 'rgb(0 0 0 / 0)',
        accent: '#ff48b0',
        onAccent: '#f2ede4',
        display: { family: '"Bricolage Grotesque", ' + SANS, weight: 800, style: 'normal' },
        body: { family: '"Bricolage Grotesque", ' + SANS, weight: 600 },
        shapes: { artist: 'circle', track: 'square' },
        echo: [{ color: '#ff48b0', dx: 9, dy: 7, mode: 'multiply' }],
        paint(ctx, w, h) {
            fill(ctx, w, h, '#f2ede4');
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            halftone(ctx, w * 0.98, h * 0.06, w * 0.62, '#ff48b0', 26, 0.26);
            halftone(ctx, w * 0.02, h * 0.95, w * 0.72, '#0078bf', 24, 0.78);
            halftone(ctx, w * 0.12, h * 0.05, w * 0.3, '#ffe800', 20, 0.1);
            ctx.restore();
            paintGrain(ctx, w, h, 'multiply', 0.09);
        },
        art: {
            filter: 'grayscale(1) contrast(1.35) brightness(1.08)',
            tint: '#ff48b0',
            echo: [{ color: '#0078bf', dx: 12, dy: 10, mode: 'multiply' }],
        },
    }),
    flyer: () => ({
        ...dark(BLACK),
        text: '#111111',
        muted: 'rgb(17 17 17 / 0.66)',
        surface: 'rgb(17 17 17 / 0.08)',
        line: 'rgb(17 17 17 / 0.4)',
        shadow: 'rgb(0 0 0 / 0.28)',
        accent: '#ff4f1a',
        onAccent: '#111111',
        display: { family: '"Anton", Impact, sans-serif', weight: 400, style: 'normal' },
        body: { family: '"Anton", Impact, sans-serif', weight: 400 },
        upper: true,
        shapes: { artist: 'square', track: 'square' },
        tile: 4,
        badge: 'sticker',
        paint(ctx, w, h) {
            fill(ctx, w, h, '#ecebe5');
            const random = prng(7);
            // Photocopier streaks and toner specks.
            for (let i = 0; i < 9; i++) {
                ctx.fillStyle = `rgb(0 0 0 / ${0.02 + random() * 0.04})`;
                ctx.fillRect(random() * w, 0, 1 + random() * 5, h);
            }
            for (let i = 0; i < 900; i++) {
                ctx.fillStyle = `rgb(0 0 0 / ${random() * 0.35})`;
                ctx.fillRect(random() * w, random() * h, 1 + random() * 2.5, 1 + random() * 2.5);
            }
            const edge = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, h * 0.78);
            edge.addColorStop(0, 'rgb(0 0 0 / 0)');
            edge.addColorStop(1, 'rgb(0 0 0 / 0.32)');
            ctx.fillStyle = edge;
            ctx.fillRect(0, 0, w, h);
            paintGrain(ctx, w, h, 'multiply', 0.2);
        },
        overlay(ctx, w) {
            tape(ctx, 70, 34, 210, -0.18);
            tape(ctx, w - 70, 40, 230, 0.2);
        },
        art: {
            filter: 'grayscale(1) contrast(1.9) brightness(1.05)',
            frame(ctx, x, y, size) {
                tape(ctx, x + size / 2, y - 6, size * 0.5, (x % 3) * 0.06 - 0.06);
            },
        },
    }),
    led: () => ({
        ...dark(BLACK),
        text: '#ffb000',
        muted: 'rgb(255 176 0 / 0.62)',
        surface: 'rgb(255 176 0 / 0.08)',
        line: 'rgb(255 176 0 / 0.24)',
        accent: '#ffb000',
        onAccent: '#0b0702',
        display: { family: '"DotGothic16", monospace', weight: 400, style: 'normal' },
        body: { family: '"DotGothic16", monospace', weight: 400 },
        upper: true,
        shapes: { artist: 'square', track: 'square' },
        tile: 6,
        badge: 'square',
        glowText: 'rgb(255 160 0 / 0.75)',
        paint(ctx, w, h) {
            fill(ctx, w, h, '#090806');
            glow(ctx, w * 0.5, h * 0.18, w * 0.9, [255, 150, 0], 0.08);
            ctx.fillStyle = ctx.createPattern(dots(14, 3, 'rgb(255 176 0 / 0.09)'), 'repeat');
            ctx.fillRect(0, 0, w, h);
        },
        art: {
            filter: 'grayscale(1) sepia(1) saturate(4.5) hue-rotate(-14deg) brightness(1.2) contrast(1.15)',
            post(ctx, size) {
                ctx.globalCompositeOperation = 'destination-in';
                ctx.fillStyle = ctx.createPattern(dots(10, 4, '#000'), 'repeat');
                ctx.fillRect(0, 0, size, size);
            },
        },
    }),
    vhs: () => ({
        ...dark(BLACK),
        text: '#f4f4f4',
        muted: 'rgb(244 244 244 / 0.66)',
        surface: 'rgb(255 255 255 / 0.08)',
        line: 'rgb(255 255 255 / 0.2)',
        accent: '#f4f4f4',
        onAccent: '#101018',
        display: { family: '"VT323", monospace', weight: 400, style: 'normal' },
        body: { family: '"VT323", monospace', weight: 400 },
        upper: true,
        shapes: { artist: 'square', track: 'square' },
        tile: 4,
        badge: 'square',
        echo: [
            { color: 'rgb(255 30 70 / 0.85)', dx: -5, dy: 0, mode: 'screen' },
            { color: 'rgb(30 230 255 / 0.85)', dx: 5, dy: 0, mode: 'screen' },
        ],
        paint(ctx, w, h) {
            fill(ctx, w, h, '#0d0d14');
            glow(ctx, w * 0.2, h * 0.08, w * 0.9, [40, 60, 255], 0.22);
            glow(ctx, w * 0.9, h * 0.85, w * 0.8, [200, 40, 180], 0.14);
            paintGrain(ctx, w, h, 'screen', 0.07);
        },
        overlay(ctx, w, h, model) {
            ctx.save();
            ctx.fillStyle = 'rgb(0 0 0 / 0.24)';
            for (let y = 0; y < h; y += 5) ctx.fillRect(0, y, w, 2);
            // A tracking band rolling through the lower third.
            const band = linear(ctx, 0, h * 0.62, 0, h * 0.66, [
                'rgb(255 255 255 / 0)',
                'rgb(255 255 255 / 0.07)',
                'rgb(255 255 255 / 0)',
            ]);
            ctx.fillStyle = band;
            ctx.fillRect(0, h * 0.62, w, h * 0.04);
            ctx.restore();
            const osd = { size: 50, color: '#f4f4f4', family: '"VT323", monospace', weight: 400 };
            write(ctx, 'PLAY ▶', w - 84, 58, { ...osd, align: 'right' });
            write(ctx, `SP ${model.timecode}`, 84, 58, osd);
        },
        art: {
            echo: [
                { color: 'rgb(255 30 70 / 0.8)', dx: -8, dy: 0, mode: 'screen' },
                { color: 'rgb(30 230 255 / 0.8)', dx: 8, dy: 0, mode: 'screen' },
            ],
            post(ctx, size) {
                ctx.fillStyle = 'rgb(0 0 0 / 0.28)';
                for (let y = 0; y < size; y += 5) ctx.fillRect(0, y, size, 2);
            },
        },
    }),
    ticket: () => ({
        ...dark(BLACK),
        text: '#23201b',
        muted: 'rgb(35 32 27 / 0.62)',
        surface: 'rgb(42 92 138 / 0.09)',
        line: 'rgb(35 32 27 / 0.28)',
        shadow: 'rgb(60 40 10 / 0.22)',
        accent: '#c8322b',
        onAccent: '#f3e7cf',
        display: { family: '"Barlow Condensed", ' + SANS, weight: 800, style: 'normal' },
        body: { family: '"Barlow Condensed", ' + SANS, weight: 600 },
        upper: true,
        shapes: { artist: 'square', track: 'square' },
        radius: 6,
        tile: 6,
        badge: 'square',
        paint(ctx, w, h) {
            fill(ctx, w, h, '#f3e7cf');
            // Security guilloche across the face of the ticket.
            ctx.save();
            ctx.lineWidth = 1.4;
            for (let i = 0; i < 46; i++) {
                ctx.strokeStyle = i % 2 ? 'rgb(42 92 138 / 0.1)' : 'rgb(200 50 43 / 0.07)';
                ctx.beginPath();
                for (let x = 0; x <= w; x += 12) {
                    const y = h * 0.02 + i * 14 + Math.sin(x / 70 + i * 0.35) * 22 + Math.sin(x / 23 + i) * 4;
                    if (x) ctx.lineTo(x, y);
                    else ctx.moveTo(x, y);
                }
                ctx.stroke();
            }
            ctx.restore();
            paintGrain(ctx, w, h, 'multiply', 0.08);
        },
        overlay(ctx, w, h, model) {
            const y = h - 84 - 44 - 46;
            ctx.save();
            ctx.setLineDash([14, 12]);
            ctx.strokeStyle = 'rgb(35 32 27 / 0.45)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(48, y);
            ctx.lineTo(w - 48, y);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = '#16130f';
            for (const x of [0, w]) {
                ctx.beginPath();
                ctx.arc(x, y, 30, 0, TAU);
                ctx.fill();
            }
            // Serial and barcode, from the period itself.
            const random = prng([...model.kicker].reduce((sum, c) => sum * 31 + c.charCodeAt(0), 7) | 0);
            let x = w - 84 - 300;
            ctx.fillStyle = '#23201b';
            while (x < w - 84) {
                const bar = 2 + Math.floor(random() * 4) * 2;
                ctx.fillRect(x, 50, bar, 64);
                x += bar + 3 + Math.floor(random() * 3) * 2;
            }
            write(ctx, model.serial, 84, 54, {
                size: 40,
                color: '#c8322b',
                family: '"Barlow Condensed", ' + SANS,
                weight: 800,
                tracking: 3,
            });
        },
    }),
    swiss: () => ({
        ...dark(BLACK),
        text: '#ffffff',
        muted: 'rgb(255 255 255 / 0.78)',
        surface: 'rgb(0 0 0 / 0.16)',
        line: 'rgb(255 255 255 / 0.5)',
        shadow: 'rgb(60 0 0 / 0.3)',
        accent: '#111111',
        onAccent: '#ffffff',
        display: { family: SANS, weight: 700, style: 'normal', tracking: -0.06 },
        shapes: { artist: 'square', track: 'square' },
        tile: 0,
        badge: 'square',
        paint(ctx, w, h) {
            fill(ctx, w, h, '#e3271b');
            // Concert-poster geometry: a black sun with its sound rings, and one diagonal.
            const cx = w * 0.84,
                cy = h * 0.13,
                r = w * 0.36;
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            for (let i = 1; i <= 7; i++) {
                ctx.lineWidth = 9 - i;
                ctx.beginPath();
                ctx.arc(cx, cy, r + i * 30, Math.PI * 0.42, Math.PI * 1.08);
                ctx.stroke();
            }
            ctx.fillStyle = '#111111';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, TAU);
            ctx.fill();
            ctx.translate(w * 0.1, h * 0.96);
            ctx.rotate(-0.42);
            ctx.fillRect(-w, -18, w * 2.4, 36);
            ctx.restore();
        },
    }),
    lava: () => ({
        ...dark(BLACK),
        text: '#fff4e0',
        muted: 'rgb(255 244 224 / 0.7)',
        surface: 'rgb(255 244 224 / 0.12)',
        line: 'rgb(255 244 224 / 0.22)',
        accent: '#ffd23f',
        onAccent: '#2a0a3d',
        display: { family: '"Shrikhand", Georgia, serif', weight: 400, style: 'normal' },
        shapes: { artist: 'blob', track: 'blob' },
        paint(ctx, w, h) {
            ctx.fillStyle = linear(ctx, 0, 0, w * 0.4, h, ['#3b0d52', '#24083a', '#14051f']);
            ctx.fillRect(0, 0, w, h);
            ctx.save();
            ctx.lineWidth = 16;
            const cx = w * 0.5,
                cy = h * 1.08;
            for (let i = 0; i < 22; i++) {
                ctx.strokeStyle = ['rgb(255 122 24 / 0.1)', 'rgb(224 33 138 / 0.1)', 'rgb(255 210 63 / 0.07)'][i % 3];
                ctx.beginPath();
                for (let a = 0; a <= TAU + 0.01; a += 0.05) {
                    const r = 120 + i * 58 + Math.sin(a * 6 + i * 0.7) * 18;
                    const x = cx + Math.cos(a) * r,
                        y = cy + Math.sin(a) * r;
                    if (a) ctx.lineTo(x, y);
                    else ctx.moveTo(x, y);
                }
                ctx.stroke();
            }
            ctx.restore();
            glow(ctx, w * 0.15, h * 0.12, w * 0.55, [255, 122, 24], 0.5);
            glow(ctx, w * 0.92, h * 0.32, w * 0.5, [224, 33, 138], 0.45);
            glow(ctx, w * 0.3, h * 0.68, w * 0.45, [255, 210, 63], 0.22);
            paintGrain(ctx, w, h, 'overlay', 0.1);
        },
    }),

    // ---------- Monthly editions ----------

    holo: () => ({
        ...dark(BLACK),
        text: '#11111f',
        muted: 'rgb(17 17 31 / 0.62)',
        surface: 'rgb(255 255 255 / 0.5)',
        line: 'rgb(17 17 31 / 0.16)',
        shadow: 'rgb(40 30 90 / 0.28)',
        accent: '#11111f',
        onAccent: '#ffffff',
        display: { family: '"Unbounded", ' + SANS, weight: 800, style: 'normal', tracking: -0.03 },
        body: { family: SANS, weight: 600 },
        radius: 26,
        paint(ctx, w, h) {
            ctx.fillStyle = linear(ctx, 0, 0, w, h, ['#d9e4ff', '#f7d9f3', '#d8fbe8', '#fdf3cf', '#e2dcff']);
            ctx.fillRect(0, 0, w, h);
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = linear(
                ctx,
                0,
                0,
                w,
                h * 0.7,
                ['#ff7ad9', '#7af0ff', '#b6ff7a', '#ffe07a', '#ff7ad9', '#7a9cff', '#7af0ff'].map((c) => `${c}88`)
            );
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
            const random = prng(31);
            for (let i = 0; i < 26; i++)
                sparkle(
                    ctx,
                    random() * w,
                    random() * h,
                    8 + random() * 22,
                    `rgb(255 255 255 / ${0.5 + random() * 0.5})`
                );
            paintGrain(ctx, w, h, 'soft-light', 0.18);
        },
        overlay(ctx, w, h) {
            ctx.save();
            ctx.lineWidth = 10;
            ctx.strokeStyle = linear(ctx, 0, 0, w, h, ['#ffffff', '#a9a9c8', '#ffffff', '#8f8fb3', '#ffffff']);
            ctx.beginPath();
            ctx.roundRect(28, 28, w - 56, h - 56, 46);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgb(17 17 31 / 0.18)';
            ctx.beginPath();
            ctx.roundRect(44, 44, w - 88, h - 88, 34);
            ctx.stroke();
            ctx.restore();
        },
        art: {
            post(ctx, size) {
                ctx.globalCompositeOperation = 'soft-light';
                ctx.fillStyle = linear(ctx, 0, 0, size, size, ['#ff7ad9', '#7af0ff', '#ffe07a', '#b47aff']);
                ctx.fillRect(0, 0, size, size);
            },
        },
    }),
    gold: () => ({
        ...dark(BLACK),
        text: '#f5ecd6',
        muted: 'rgb(245 236 214 / 0.6)',
        surface: 'rgb(212 175 55 / 0.1)',
        line: 'rgb(212 175 55 / 0.4)',
        accent: '#d4af37',
        onAccent: '#0b0a08',
        display: { family: '"Cinzel", Georgia, serif', weight: 800, style: 'normal' },
        body: { family: '"Cinzel", Georgia, serif', weight: 500 },
        upper: true,
        shapes: { artist: 'circle', track: 'circle' },
        tile: 4,
        numberFill: (ctx, x, y, width, size) => gold(ctx, x, y, x + width, y + size),
        paint(ctx, w, h) {
            fill(ctx, w, h, '#0b0a08');
            glow(ctx, w * 0.5, -h * 0.12, h * 0.85, [120, 92, 36], 0.55);
            paintGrain(ctx, w, h, 'overlay', 0.12);
        },
        overlay(ctx, w, h) {
            ctx.save();
            ctx.strokeStyle = gold(ctx, 0, 0, w, h);
            ctx.lineWidth = 5;
            ctx.strokeRect(34, 34, w - 68, h - 68);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(50, 50, w - 100, h - 100);
            ctx.fillStyle = gold(ctx, 0, 0, w, h);
            for (const [x, y] of [
                [42, 42],
                [w - 42, 42],
                [42, h - 42],
                [w - 42, h - 42],
            ]) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-9, -9, 18, 18);
                ctx.restore();
            }
            ctx.restore();
        },
        art: {
            frame(ctx, x, y, size) {
                ctx.save();
                ctx.strokeStyle = gold(ctx, x, y, x + size, y + size);
                ctx.lineWidth = 7;
                ctx.beginPath();
                ctx.arc(x + size / 2, y + size / 2, size / 2 - 3.5, 0, TAU);
                ctx.stroke();
                ctx.restore();
            },
        },
    }),
    aurora: () => ({
        ...dark(BLACK),
        text: '#eafff6',
        muted: 'rgb(234 255 246 / 0.64)',
        surface: 'rgb(234 255 246 / 0.08)',
        line: 'rgb(69 240 165 / 0.25)',
        accent: '#45f0a5',
        onAccent: '#03101a',
        display: { family: '"Instrument Serif", Georgia, serif', weight: 400, style: 'italic' },
        radius: 30,
        paint(ctx, w, h) {
            ctx.fillStyle = linear(ctx, 0, 0, 0, h, ['#020b14', '#05182a', '#08263a']);
            ctx.fillRect(0, 0, w, h);
            stars(ctx, w, h * 0.7, 160, 11, 0.7);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            [
                { base: h * 0.16, color: [69, 240, 165], strength: 0.9, phase: 0 },
                { base: h * 0.26, color: [43, 208, 208], strength: 0.7, phase: 2 },
                { base: h * 0.1, color: [143, 107, 255], strength: 0.55, phase: 4 },
            ].forEach(({ base, color, strength, phase }) => {
                for (let x = 0; x < w; x += 5) {
                    const top = base + Math.sin(x / 160 + phase) * 70 + Math.sin(x / 47 + phase) * 16;
                    const length = 260 + Math.sin(x / 90 + phase * 2) * 120;
                    const ray = ctx.createLinearGradient(0, top, 0, top + length);
                    ray.addColorStop(0, css(color, 0));
                    ray.addColorStop(0.2, css(color, 0.075 * strength));
                    ray.addColorStop(1, css(color, 0));
                    ctx.fillStyle = ray;
                    ctx.fillRect(x, top, 5, length);
                }
            });
            ctx.restore();
            const random = prng(5);
            ctx.fillStyle = '#020a10';
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let x = 0, y = h * 0.86; x <= w + 60; x += 60) {
                y = Math.min(h * 0.94, Math.max(h * 0.8, y + (random() - 0.5) * 90));
                ctx.lineTo(x, y);
            }
            ctx.lineTo(w, h);
            ctx.fill();
        },
        art: {
            frame(ctx, x, y, size) {
                ctx.save();
                ctx.globalCompositeOperation = 'destination-over';
                ctx.shadowColor = 'rgb(69 240 165 / 0.6)';
                ctx.shadowBlur = 60;
                ctx.fillStyle = '#05182a';
                ctx.beginPath();
                ctx.roundRect(x, y, size, size, 30);
                ctx.fill();
                ctx.restore();
            },
        },
    }),
    cosmos: () => ({
        ...dark(BLACK),
        text: '#f1edff',
        muted: 'rgb(241 237 255 / 0.62)',
        surface: 'rgb(185 166 255 / 0.1)',
        line: 'rgb(185 166 255 / 0.22)',
        accent: '#b9a6ff',
        onAccent: '#05040f',
        display: { family: '"Syne", ' + SANS, weight: 800, style: 'normal' },
        shapes: { artist: 'circle', track: 'circle' },
        paint(ctx, w, h) {
            fill(ctx, w, h, '#05040f');
            glow(ctx, w * 0.18, h * 0.24, w * 0.7, [107, 60, 255], 0.38);
            glow(ctx, w * 0.88, h * 0.55, w * 0.6, [255, 79, 163], 0.22);
            glow(ctx, w * 0.5, h * 0.95, w * 0.7, [60, 140, 255], 0.2);
            stars(ctx, w, h, 260, 23, 0.9);
            ctx.save();
            ctx.translate(w * 0.5, h * 0.32);
            ctx.rotate(-0.2);
            ctx.lineWidth = 2;
            for (const [rx, ry, a] of [
                [w * 0.62, w * 0.16, 0.16],
                [w * 0.8, w * 0.22, 0.1],
            ]) {
                ctx.strokeStyle = `rgb(255 255 255 / ${a})`;
                ctx.beginPath();
                ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
                ctx.stroke();
            }
            ctx.restore();
            paintGrain(ctx, w, h, 'overlay', 0.06);
        },
        art: {
            frame(ctx, x, y, size) {
                ctx.save();
                ctx.translate(x + size / 2, y + size / 2);
                ctx.rotate(-0.3);
                ctx.strokeStyle = 'rgb(241 237 255 / 0.55)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.ellipse(0, 0, size * 0.72, size * 0.16, 0, Math.PI * 0.04, Math.PI * 0.96);
                ctx.stroke();
                ctx.restore();
            },
        },
    }),
    marquee: () => ({
        ...dark(BLACK),
        text: '#fff3dc',
        muted: 'rgb(255 243 220 / 0.66)',
        surface: 'rgb(255 210 122 / 0.1)',
        line: 'rgb(255 210 122 / 0.3)',
        accent: '#ffd27a',
        onAccent: '#1a0606',
        display: { family: '"Limelight", Georgia, serif', weight: 400, style: 'normal' },
        radius: 10,
        badge: 'bulb',
        paint(ctx, w, h) {
            fill(ctx, w, h, '#1a0606');
            // Velvet curtain folds.
            for (let x = 0; x < w; x += 60) {
                ctx.fillStyle = linear(ctx, x, 0, x + 60, 0, [
                    'rgb(0 0 0 / 0.35)',
                    'rgb(140 24 24 / 0.55)',
                    'rgb(0 0 0 / 0.35)',
                ]);
                ctx.fillRect(x, 0, 60, h);
            }
            glow(ctx, w * 0.5, h * 0.02, h * 0.6, [255, 210, 122], 0.22);
            paintGrain(ctx, w, h, 'overlay', 0.1);
        },
        overlay(ctx, w, h) {
            const inset = 30,
                step = 54;
            const bulbs = [];
            for (let x = inset; x <= w - inset; x += step) bulbs.push([x, inset], [x, h - inset]);
            for (let y = inset + step; y < h - inset; y += step) bulbs.push([inset, y], [w - inset, y]);
            for (const [x, y] of bulbs) {
                const halo = ctx.createRadialGradient(x, y, 0, x, y, 26);
                halo.addColorStop(0, 'rgb(255 214 130 / 0.55)');
                halo.addColorStop(1, 'rgb(255 214 130 / 0)');
                ctx.fillStyle = halo;
                ctx.fillRect(x - 26, y - 26, 52, 52);
                ctx.fillStyle = '#fff1c9';
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, TAU);
                ctx.fill();
            }
        },
        art: {
            frame(ctx, x, y, size) {
                ctx.save();
                ctx.strokeStyle = '#ffd27a';
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.roundRect(x - 8, y - 8, size + 16, size + 16, 16);
                ctx.stroke();
                ctx.restore();
            },
        },
    }),
    eclipse: () => ({
        ...dark(BLACK),
        text: '#f7f3ea',
        muted: 'rgb(247 243 234 / 0.56)',
        surface: 'rgb(255 207 138 / 0.07)',
        line: 'rgb(255 207 138 / 0.2)',
        accent: '#ffcf8a',
        onAccent: '#000000',
        display: { family: '"Bodoni Moda", Didot, Georgia, serif', weight: 800, style: 'italic' },
        shapes: { artist: 'circle', track: 'circle' },
        badge: 'ring',
        paint(ctx, w, h) {
            fill(ctx, w, h, '#000000');
            const cx = w * 0.74,
                cy = h * 0.15,
                r = w * 0.19;
            const corona = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 2.6);
            corona.addColorStop(0, 'rgb(255 244 222 / 0.95)');
            corona.addColorStop(0.08, 'rgb(255 214 160 / 0.55)');
            corona.addColorStop(0.35, 'rgb(255 160 90 / 0.14)');
            corona.addColorStop(1, 'rgb(255 160 90 / 0)');
            ctx.fillStyle = corona;
            ctx.fillRect(0, 0, w, h);
            if (ctx.createConicGradient) {
                const rays = ctx.createConicGradient(0, cx, cy);
                for (let i = 0; i <= 48; i++) rays.addColorStop(i / 48, `rgb(255 230 190 / ${i % 2 ? 0 : 0.07})`);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = rays;
                ctx.beginPath();
                ctx.arc(cx, cy, r * 3.4, 0, TAU);
                ctx.fill();
                ctx.restore();
            }
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgb(255 90 60 / 0.65)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 1, Math.PI * 0.9, Math.PI * 1.3);
            ctx.stroke();
            // The diamond ring.
            const dx = cx + Math.cos(-0.7) * r,
                dy = cy + Math.sin(-0.7) * r;
            glow(ctx, dx, dy, 90, [255, 250, 235], 0.9);
            paintGrain(ctx, w, h, 'overlay', 0.06);
        },
        art: {
            frame(ctx, x, y, size) {
                ctx.save();
                ctx.globalCompositeOperation = 'destination-over';
                ctx.shadowColor = 'rgb(255 200 140 / 0.7)';
                ctx.shadowBlur = 44;
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(x + size / 2, y + size / 2, size / 2, 0, TAU);
                ctx.fill();
                ctx.restore();
            },
        },
    }),
};

function tape(ctx, x, y, width, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgb(235 228 200 / 0.72)';
    ctx.shadowColor = 'rgb(0 0 0 / 0.15)';
    ctx.shadowBlur = 6;
    ctx.fillRect(-width / 2, -22, width, 44);
    ctx.restore();
}

const dotTiles = new Map();
function dots(cell, radius, color) {
    const key = `${cell}:${radius}:${color}`;
    if (!dotTiles.has(key)) {
        const tile = document.createElement('canvas');
        tile.width = tile.height = cell;
        const g = tile.getContext('2d');
        g.fillStyle = color;
        g.beginPath();
        g.arc(cell / 2, cell / 2, radius, 0, TAU);
        g.fill();
        dotTiles.set(key, tile);
    }
    return dotTiles.get(key);
}

export function themeFor(style, colors) {
    const palette = colors.map((color) => rgb(color));
    return (EDITION[style] || CLASSIC[style] || CLASSIC.aura)(palette);
}

// ---------- Text ----------

export function fit(ctx, value, max) {
    if (ctx.measureText(value).width <= max) return value;
    let cut = value;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
}
export const font = ({ family = SANS, weight = 600, style = 'normal' }, size) =>
    `${style === 'italic' ? 'italic ' : ''}${weight} ${size}px ${family}`;
// Draws text whose top sits at `top`; echoes and glow come from the theme when asked for.
export function write(
    ctx,
    value,
    x,
    top,
    { size, weight, color, align = 'left', max = Infinity, tracking = 0, family, style, echo, glowText, fillStyle }
) {
    ctx.font = font({ family, weight, style }, size);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    const text = fit(ctx, String(value), max);
    const y = top + size * 0.76;
    for (const copy of echo || []) {
        ctx.save();
        ctx.globalCompositeOperation = copy.mode;
        ctx.fillStyle = copy.color;
        ctx.fillText(text, x + copy.dx, y + copy.dy);
        ctx.restore();
    }
    ctx.save();
    if (glowText) {
        ctx.shadowColor = glowText;
        ctx.shadowBlur = size * 0.35;
    }
    ctx.fillStyle = fillStyle || color;
    ctx.fillText(text, x, y);
    ctx.restore();
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

// ---------- Artwork ----------

function blobPath(ctx, x, y, size, seed) {
    const random = prng(seed);
    const cx = x + size / 2,
        cy = y + size / 2;
    const points = Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * TAU,
            r = size * (0.44 + random() * 0.08);
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
    ctx.moveTo((points[0][0] + points[6][0]) / 2, (points[0][1] + points[6][1]) / 2);
    points.forEach((point, i) => {
        const next = points[(i + 1) % points.length];
        ctx.quadraticCurveTo(point[0], point[1], (point[0] + next[0]) / 2, (point[1] + next[1]) / 2);
    });
    ctx.closePath();
}
function shapePath(ctx, shape, x, y, size, radius) {
    ctx.beginPath();
    if (shape === 'circle' || shape === 'record') ctx.arc(x + size / 2, y + size / 2, size / 2, 0, TAU);
    else if (shape === 'blob') blobPath(ctx, x, y, size, Math.round(x * 7 + y));
    else ctx.roundRect(x, y, size, size, shape === 'square' ? Math.min(radius, 6) : radius);
}

// The cover is treated on its own layer (filters, tints, masks), then placed in the theme's shape.
export function artwork(ctx, img, x, y, size, theme, initial, kind) {
    const shape = theme.shapes[kind];
    const radius = kind === 'artist' && shape === 'round' ? size / 2 : theme.radius;
    const art = theme.art || {};
    const layer = document.createElement('canvas');
    layer.width = layer.height = Math.ceil(size);
    const g = layer.getContext('2d');
    if (img) {
        if (art.tint) {
            g.fillStyle = art.tint;
            g.fillRect(0, 0, size, size);
            g.globalCompositeOperation = 'multiply';
        }
        if (art.filter && 'filter' in g) g.filter = art.filter;
        const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
        const w = img.naturalWidth * scale,
            h = img.naturalHeight * scale;
        g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        g.filter = 'none';
        g.globalCompositeOperation = 'source-over';
    } else {
        g.fillStyle = theme.surface;
        g.fillRect(0, 0, size, size);
        write(g, initial.toUpperCase(), size / 2, size / 2 - size * 0.2, {
            size: size * 0.4,
            ...theme.display,
            color: theme.muted,
            align: 'center',
        });
    }
    if (art.post) {
        g.save();
        art.post(g, size);
        g.restore();
    }
    for (const copy of art.echo || []) {
        ctx.save();
        ctx.globalCompositeOperation = copy.mode;
        ctx.fillStyle = copy.color;
        shapePath(ctx, shape, x + copy.dx, y + copy.dy, size, radius);
        ctx.fill();
        ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = theme.shadow;
    ctx.shadowBlur = 56;
    ctx.shadowOffsetY = 22;
    shapePath(ctx, shape, x, y, size, radius);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.restore();
    ctx.save();
    shapePath(ctx, shape, x, y, size, radius);
    ctx.clip();
    ctx.drawImage(layer, x, y, size, size);
    ctx.restore();
    art.frame?.(ctx, x, y, size, shape);
}

export function badge(ctx, theme, x, y, label) {
    const r = 34;
    ctx.save();
    ctx.fillStyle = theme.accent;
    if (theme.badge === 'square') ctx.fillRect(x - r, y - r, r * 2, r * 2);
    else if (theme.badge === 'sticker') {
        ctx.translate(x, y);
        ctx.rotate(-0.2);
        ctx.translate(-x, -y);
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, TAU);
        ctx.fill();
    } else if (theme.badge === 'ring') {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 3;
        ctx.stroke();
    } else {
        if (theme.badge === 'bulb') {
            ctx.shadowColor = theme.accent;
            ctx.shadowBlur = 30;
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
    write(ctx, label, x, y - 17, {
        size: 34,
        ...theme.display,
        color: theme.badge === 'ring' ? theme.accent : theme.onAccent,
        align: 'center',
    });
}
