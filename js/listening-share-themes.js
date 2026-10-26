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
export function halftone(ctx, cx, cy, radius, color, cell, angle) {
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
export function stars(ctx, w, h, count, seed, alpha = 0.8) {
    const random = prng(seed);
    for (let i = 0; i < count; i++) {
        const r = random() < 0.08 ? 2.6 : 1.2 + random();
        ctx.fillStyle = `rgb(255 255 255 / ${alpha * (0.3 + random() * 0.7)})`;
        ctx.beginPath();
        ctx.arc(random() * w, random() * h, r, 0, TAU);
        ctx.fill();
    }
}
export function sparkle(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x, y, x + size, y);
    ctx.quadraticCurveTo(x, y, x, y + size);
    ctx.quadraticCurveTo(x, y, x - size, y);
    ctx.quadraticCurveTo(x, y, x, y - size);
    ctx.fill();
}
export const gold = (ctx, x0, y0, x1, y1) =>
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

// ---------- Collectible editions ----------

// None ship right now. An edition is a theme like the classic ones above, keyed by its id in
// listening-recap-editions.js; it may also draw its own decorations and treat the artwork.
const EDITION = {};

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
