import I_X from '!lucide/x.svg?svg&icon';
import I_SHARE from '!lucide/share.svg?svg&icon';
import I_DOWNLOAD from '!lucide/download.svg?svg&icon';
import I_COPY from '!lucide/copy.svg?svg&icon';
import I_DATA from '!lucide/file-json.svg?svg&icon';
import { syncStatsSegments } from './listening-stats-scene.js';

// A share card drawn on canvas: the same numbers as the page, composed for stories and posts.
const FORMATS = { story: [1080, 1920, 'Story', '9:16'], post: [1080, 1350, 'Post', '4:5'] };
const STYLES = { aura: 'Aura', vivid: 'Vivid', ink: 'Ink', paper: 'Paper' };
const PARTS = { artists: 'Top artists', tracks: 'On repeat', totals: 'Totals', handle: 'Your name' };
const PERIOD_KICKER = { day: 'My day', week: 'My week', month: 'My month', year: 'My year', lifetime: 'All time' };
const FONT = 'Switzer, Inter, system-ui, sans-serif';
const STORE = 'monochrome-stats-share';
const PAD = 84;

const imageUrl = (url) =>
    url && /^(https?:\/\/|\/api\/files\/|\/assets\/)/i.test(url) && !/\/assets\/appicon\.png/.test(url) ? url : '';

let options = { format: 'story', style: 'aura', artists: true, tracks: true, totals: true, handle: true };
try {
    options = { ...options, ...JSON.parse(localStorage.getItem(STORE) || '{}') };
} catch {
    /* Storage can be unavailable; defaults still work. */
}
if (!FORMATS[options.format]) options.format = 'story';
if (!STYLES[options.style]) options.style = 'aura';

const images = new Map();
function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (!images.has(url)) {
        images.set(
            url,
            new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.decoding = 'async';
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                // A cached copy fetched without CORS would taint the canvas, so remote artwork gets its own request.
                const remote = new URL(url, location.href).origin !== location.origin;
                img.src = remote ? `${url}${url.includes('?') ? '&' : '?'}share-card` : url;
            })
        );
    }
    return images.get(url);
}

export function buildShareModel({ data, period, label, colors, user }) {
    const n = new Intl.NumberFormat();
    const s = data.summary;
    const coverFor = (artist) =>
        imageUrl(artist.cover) ||
        imageUrl(data.top.tracks.find((track) => track.artists?.some((a) => a.id === artist.id))?.cover);
    return {
        kicker: `${PERIOD_KICKER[period]} · ${label}`,
        minutes: n.format(Math.round(s.seconds / 60)),
        artists: data.top.artists.slice(0, 3).map((artist) => ({ name: artist.name, image: coverFor(artist) })),
        tracks: data.top.tracks.slice(0, 3).map((track) => ({
            title: track.title,
            artist: (track.artists || []).map((a) => a.name).join(', '),
            streams: `${n.format(track.streams)} ${track.streams === 1 ? 'stream' : 'streams'}`,
            image: imageUrl(track.cover),
        })),
        totals: [
            [s.streams, 'streams'],
            [s.artists, 'artists'],
            [s.tracks, 'tracks'],
        ].map(([value, noun]) => [n.format(value), value === 1 ? noun.slice(0, -1) : noun]),
        handle: user?.username ? `@${user.username}` : user?.name || '',
        colors,
    };
}

// ---------- Color ----------

const scratch = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
function rgb(color, fallback = '#8a8a8a') {
    scratch.clearRect(0, 0, 1, 1);
    scratch.fillStyle = fallback;
    scratch.fillStyle = color || fallback;
    scratch.fillRect(0, 0, 1, 1);
    return [...scratch.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}
const mix = (a, b, t) => a.map((value, i) => Math.round(value + (b[i] - value) * t));
const css = (c, alpha = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${alpha})`;
const luminance = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
// Cover colors are lifted into light on dark styles, the way the page's ambience is.
const lift = (c) => mix(c, [255, 255, 255], Math.max(0, 0.62 - luminance(c)));
const BLACK = [0, 0, 0];

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

function themeFor(style, colors) {
    const [c0, c1, c2] = colors.map((color) => rgb(color));
    const dark = {
        text: '#ffffff',
        muted: 'rgb(255 255 255 / 0.62)',
        surface: 'rgb(255 255 255 / 0.09)',
        line: 'rgb(255 255 255 / 0.16)',
        shadow: 'rgb(0 0 0 / 0.5)',
        accent: css(lift(c0)),
        onAccent: '#0b0b0c',
    };
    if (style === 'paper')
        return {
            text: '#141414',
            muted: 'rgb(20 20 20 / 0.58)',
            surface: 'rgb(20 20 20 / 0.06)',
            line: 'rgb(20 20 20 / 0.16)',
            shadow: 'rgb(40 30 20 / 0.22)',
            accent: '#141414',
            onAccent: '#f3f1ec',
            paint(ctx, w, h) {
                ctx.fillStyle = '#f3f1ec';
                ctx.fillRect(0, 0, w, h);
                glow(ctx, w * 0.85, h * 0.08, w * 0.7, mix(c0, [243, 241, 236], 0.35), 0.28);
                paintGrain(ctx, w, h, 'multiply', 0.06);
            },
        };
    if (style === 'ink')
        return {
            ...dark,
            accent: '#ffffff',
            paint(ctx, w, h) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, w, h);
                glow(ctx, w * 0.5, -h * 0.05, w * 0.9, lift(c0), 0.14);
                paintGrain(ctx, w, h, 'overlay', 0.08);
            },
        };
    if (style === 'vivid')
        return {
            ...dark,
            accent: '#ffffff',
            paint(ctx, w, h) {
                const gradient = ctx.createLinearGradient(0, 0, w * 0.3, h);
                gradient.addColorStop(0, css(mix(c0, BLACK, 0.2)));
                gradient.addColorStop(0.55, css(mix(mix(c0, c1, 0.5), BLACK, 0.55)));
                gradient.addColorStop(1, css(mix(c1, BLACK, 0.82)));
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, w, h);
                glow(ctx, w * 0.9, h * 0.05, w * 0.8, lift(c2), 0.3);
                paintGrain(ctx, w, h, 'overlay', 0.1);
            },
        };
    return {
        ...dark,
        paint(ctx, w, h) {
            ctx.fillStyle = '#0b0b0d';
            ctx.fillRect(0, 0, w, h);
            glow(ctx, w * 0.82, h * 0.1, w * 0.75, lift(c0), 0.5);
            glow(ctx, w * 0.08, h * 0.38, w * 0.7, lift(c1), 0.34);
            glow(ctx, w * 0.9, h * 0.72, w * 0.65, lift(c2), 0.3);
            glow(ctx, w * 0.25, h * 1.02, w * 0.6, lift(c0), 0.22);
            paintGrain(ctx, w, h, 'overlay', 0.09);
        },
    };
}

// ---------- Drawing ----------

function fit(ctx, value, max) {
    if (ctx.measureText(value).width <= max) return value;
    let cut = value;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
}
function write(ctx, value, x, top, { size, weight = 600, color, align = 'left', max = Infinity, tracking = 0 }) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fit(ctx, String(value), max), x, top + size * 0.76);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}
function artwork(ctx, img, x, y, size, radius, theme, initial) {
    ctx.save();
    ctx.shadowColor = theme.shadow;
    ctx.shadowBlur = 56;
    ctx.shadowOffsetY = 22;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
    ctx.clip();
    if (img) {
        const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
        const w = img.naturalWidth * scale,
            h = img.naturalHeight * scale;
        ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
    } else {
        ctx.fillStyle = theme.surface;
        ctx.fillRect(x, y, size, size);
        write(ctx, initial.toUpperCase(), x + size / 2, y + size / 2 - size * 0.2, {
            size: size * 0.4,
            weight: 700,
            color: theme.muted,
            align: 'center',
        });
    }
    ctx.restore();
}
function kicker(ctx, label, y, width, theme) {
    write(ctx, label.toUpperCase(), PAD, y, {
        size: 28,
        weight: 600,
        color: theme.muted,
        tracking: 4,
        max: width - PAD * 2,
    });
    ctx.font = `600 28px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    const end = PAD + Math.min(ctx.measureText(label.toUpperCase()).width, width - PAD * 2) + 24;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (end < width - PAD) {
        ctx.fillStyle = theme.line;
        ctx.fillRect(end, y + 14, width - PAD - end, 2);
    }
}
// Up to three items share the width in equal columns, centered when there are fewer.
const columns = (count, width) => {
    const column = (width - PAD * 2) / 3;
    return Array.from({ length: count }, (_, i) => width / 2 + (i - (count - 1) / 2) * column);
};

function sections(model, picks, width) {
    const inner = width - PAD * 2;
    const column = inner / 3;
    const list = [
        {
            height: 0,
            measure(ctx) {
                ctx.font = `700 100px ${FONT}`;
                this.size = Math.min(290, (inner / ctx.measureText(model.minutes).width) * 98);
                this.height = 34 + 34 + this.size * 0.74 + 30 + 54;
            },
            draw(ctx, y, theme) {
                write(ctx, model.kicker.toUpperCase(), PAD, y, {
                    size: 28,
                    weight: 600,
                    color: theme.muted,
                    tracking: 4,
                    max: inner,
                });
                const top = y + 68;
                ctx.font = `700 ${this.size}px ${FONT}`;
                if ('letterSpacing' in ctx) ctx.letterSpacing = `${-this.size * 0.04}px`;
                ctx.fillStyle = theme.text;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(model.minutes, PAD - this.size * 0.03, top + this.size * 0.74);
                if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
                write(ctx, 'minutes of music', PAD, top + this.size * 0.74 + 30, {
                    size: 50,
                    weight: 500,
                    color: theme.text,
                });
            },
        },
    ];
    if (picks.artists && model.artists.length)
        list.push({
            height: 34 + 40 + 232 + 30 + 44,
            draw(ctx, y, theme, art) {
                kicker(ctx, 'Top artists', y, width, theme);
                const top = y + 74;
                columns(model.artists.length, width).forEach((cx, i) => {
                    const artist = model.artists[i];
                    artwork(ctx, art.artists[i], cx - 116, top, 232, 116, theme, artist.name[0] || '?');
                    const bx = cx + 82,
                        by = top + 198;
                    ctx.beginPath();
                    ctx.arc(bx, by, 34, 0, Math.PI * 2);
                    ctx.fillStyle = theme.accent;
                    ctx.fill();
                    write(ctx, i + 1, bx, by - 17, { size: 34, weight: 700, color: theme.onAccent, align: 'center' });
                    write(ctx, artist.name, cx, top + 262, {
                        size: 40,
                        weight: 600,
                        color: theme.text,
                        align: 'center',
                        max: column - 24,
                    });
                });
            },
        });
    if (picks.tracks && model.tracks.length)
        list.push({
            height: 34 + 40 + 236 + 28 + 54 + 26 + 42 + 10 + 36,
            draw(ctx, y, theme, art) {
                kicker(ctx, 'On repeat', y, width, theme);
                const top = y + 74;
                columns(model.tracks.length, width).forEach((cx, i) => {
                    const track = model.tracks[i];
                    artwork(ctx, art.tracks[i], cx - 118, top, 236, 18, theme, track.title[0] || '?');
                    const pill = top + 264;
                    ctx.beginPath();
                    ctx.roundRect(cx - 118, pill, 236, 54, 27);
                    ctx.fillStyle = theme.surface;
                    ctx.fill();
                    write(ctx, track.streams, cx, pill + 13, {
                        size: 28,
                        weight: 600,
                        color: theme.text,
                        align: 'center',
                        max: 210,
                    });
                    write(ctx, track.title, cx, pill + 80, {
                        size: 38,
                        weight: 600,
                        color: theme.text,
                        align: 'center',
                        max: column - 24,
                    });
                    write(ctx, track.artist, cx, pill + 132, {
                        size: 32,
                        weight: 500,
                        color: theme.muted,
                        align: 'center',
                        max: column - 24,
                    });
                });
            },
        });
    if (picks.totals)
        list.push({
            height: 176,
            draw(ctx, y, theme) {
                const gap = 24,
                    tile = (inner - gap * 2) / 3;
                model.totals.forEach(([value, label], i) => {
                    const x = PAD + i * (tile + gap);
                    ctx.beginPath();
                    ctx.roundRect(x, y, tile, 176, 30);
                    ctx.fillStyle = theme.surface;
                    ctx.fill();
                    write(ctx, value, x + tile / 2, y + 34, {
                        size: 72,
                        weight: 700,
                        color: theme.text,
                        align: 'center',
                        max: tile - 32,
                        tracking: -2,
                    });
                    write(ctx, label, x + tile / 2, y + 118, {
                        size: 30,
                        weight: 500,
                        color: theme.muted,
                        align: 'center',
                    });
                });
            },
        });
    return list;
}
function footer(ctx, model, picks, width, height, theme) {
    const y = height - 84 - 44;
    if (picks.handle && model.handle)
        write(ctx, model.handle, PAD, y + 4, { size: 34, weight: 500, color: theme.muted, max: width / 2 - PAD });
    // The Monochrome mark: two offset squares, then the wordmark.
    ctx.font = `700 40px ${FONT}`;
    const word = ctx.measureText('monochrome').width;
    const mark = width - PAD - word - 58;
    ctx.fillStyle = theme.text;
    ctx.fillRect(mark, y + 4, 20, 20);
    ctx.fillRect(mark + 20, y + 24, 20, 20);
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(mark + 1.25, y + 5.25, 37.5, 37.5);
    write(ctx, 'monochrome', width - PAD, y + 2, {
        size: 40,
        weight: 700,
        color: theme.text,
        align: 'right',
        tracking: -1,
    });
}

let fontsReady;
export async function drawShareCard(canvas, model, picks) {
    const [width, height] = FORMATS[picks.format];
    fontsReady ||= Promise.all(
        ['500', '600', '700'].map((weight) => document.fonts.load(`${weight} 40px Switzer`))
    ).catch(() => {});
    const [, artists, tracks] = await Promise.all([
        fontsReady,
        Promise.all(model.artists.map((artist) => loadImage(artist.image))),
        Promise.all(model.tracks.map((track) => loadImage(track.image))),
    ]);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    const theme = themeFor(picks.style, model.colors);
    theme.paint(ctx, width, height);
    const parts = sections(model, picks, width);
    parts[0].measure(ctx);
    // Sections share the space above the footer; gaps grow first, and only a crowded post scales down.
    const top = picks.format === 'story' ? 150 : 100,
        bottom = height - 84 - 44 - 70;
    const natural = parts.reduce((sum, part) => sum + part.height, 0);
    const gaps = parts.length - 1;
    const room = bottom - top;
    const gap = gaps ? Math.min(150, Math.max(56, (room - natural) / gaps)) : 0;
    const scale = Math.min(1, room / (natural + gap * gaps));
    let y = top + Math.max(0, (room - (natural + gap * gaps) * scale) / 2) / scale;
    ctx.save();
    ctx.translate(width / 2, 0);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, 0);
    for (const part of parts) {
        part.draw(ctx, y, theme, { artists, tracks });
        y += part.height + gap;
    }
    ctx.restore();
    footer(ctx, model, picks, width, height, theme);
}

// ---------- Sheet ----------

let dialog;
function sheet() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'stats-share';
    dialog.setAttribute('aria-labelledby', 'stats-share-title');
    dialog.innerHTML = `<div class="stats-share-sheet">
        <header class="stats-share-header"><div><h2 id="stats-share-title">Share your listening</h2><p class="stats-share-period"></p></div><button type="button" class="stats-icon-button" data-share-close aria-label="Close">${I_X(18)}</button></header>
        <div class="stats-share-preview"><canvas role="img"></canvas></div>
        <div class="stats-share-controls">
            <div class="stats-share-field"><span class="stats-share-label" id="stats-share-format">Format</span><div class="stats-segments" role="group" aria-labelledby="stats-share-format">${Object.entries(
                FORMATS
            )
                .map(
                    ([key, [, , name, ratio]]) =>
                        `<button type="button" data-share-format="${key}" aria-pressed="false">${name}<small>${ratio}</small></button>`
                )
                .join('')}</div></div>
            <div class="stats-share-field"><span class="stats-share-label" id="stats-share-style">Style</span><div class="stats-share-styles" role="group" aria-labelledby="stats-share-style">${Object.entries(
                STYLES
            )
                .map(
                    ([key, name]) =>
                        `<button type="button" data-share-style="${key}" aria-pressed="false"><i class="is-${key}"></i><span>${name}</span></button>`
                )
                .join('')}</div></div>
            <div class="stats-share-field"><span class="stats-share-label" id="stats-share-parts">Show</span><div class="stats-share-parts" role="group" aria-labelledby="stats-share-parts">${Object.entries(
                PARTS
            )
                .map(
                    ([key, name]) =>
                        `<label><input type="checkbox" data-share-part="${key}" /><span>${name}</span></label>`
                )
                .join('')}</div></div>
            <div class="stats-share-actions"><button type="button" class="stats-share-primary" data-share-action="share">${I_SHARE(18)}<span>Share image</span></button><button type="button" class="stats-share-secondary" data-share-action="download">${I_DOWNLOAD(18)}<span>Save</span></button><button type="button" class="stats-share-secondary" data-share-action="copy">${I_COPY(18)}<span>Copy</span></button></div>
            <button type="button" class="stats-share-data" data-share-action="data">${I_DATA(15)}<span>Download raw data (JSON)</span></button>
            <p class="stats-share-status" role="status"></p>
        </div>
    </div>`;
    document.body.append(dialog);
    return dialog;
}

export function openStatsShare(context) {
    const root = sheet();
    const canvas = root.querySelector('canvas');
    const status = root.querySelector('.stats-share-status');
    const model = buildShareModel(context);
    const controller = new AbortController();
    const { signal } = controller;
    const fileName = `monochrome-${context.period}-${context.anchor}.png`;
    let image;
    let token = 0;
    let statusTimer;
    const say = (text) => {
        status.textContent = text;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => (status.textContent = ''), 4000);
    };
    // The image is prepared after every change, so Share runs inside the click's activation.
    const redraw = () => {
        const current = ++token;
        root.classList.add('is-drawing');
        image = drawShareCard(canvas, model, options)
            .then(
                () =>
                    new Promise((resolve, reject) =>
                        canvas.toBlob(
                            (blob) => (blob ? resolve(blob) : reject(new Error('Image export failed'))),
                            'image/png'
                        )
                    )
            )
            .finally(() => current === token && root.classList.remove('is-drawing'));
        image.catch(() => current === token && say('The image could not be prepared. Try another style.'));
    };
    const sync = () => {
        for (const button of root.querySelectorAll('[data-share-format]'))
            button.setAttribute('aria-pressed', String(button.dataset.shareFormat === options.format));
        for (const button of root.querySelectorAll('[data-share-style]'))
            button.setAttribute('aria-pressed', String(button.dataset.shareStyle === options.style));
        for (const input of root.querySelectorAll('[data-share-part]'))
            input.checked = Boolean(options[input.dataset.sharePart]);
        root.querySelector('[data-share-part="handle"]').closest('label').hidden = !model.handle;
        root.dataset.format = options.format;
        syncStatsSegments(root);
        try {
            localStorage.setItem(STORE, JSON.stringify(options));
        } catch {
            /* Choices simply reset next time. */
        }
    };
    const probe = typeof File === 'function' ? new File([''], 'probe.png', { type: 'image/png' }) : null;
    root.querySelector('[data-share-action="share"]').hidden = !(probe && navigator.canShare?.({ files: [probe] }));
    root.querySelector('[data-share-action="copy"]').hidden = !(window.ClipboardItem && navigator.clipboard?.write);
    root.querySelector('.stats-share-period').textContent = model.kicker;
    canvas.setAttribute(
        'aria-label',
        `${model.kicker}: ${model.minutes} minutes of music. ${model.artists.length ? `Top artists ${model.artists.map((a) => a.name).join(', ')}.` : ''}`
    );
    root.style.setProperty('--share-accent', css(lift(rgb(context.colors[0]))));
    context.colors.forEach((color, i) => root.style.setProperty(`--share-c${i}`, color));
    status.textContent = '';
    sync();
    redraw();

    const close = () => {
        if (!root.open || root.classList.contains('is-closing')) return;
        root.classList.add('is-closing');
        const done = () => {
            root.classList.remove('is-closing');
            root.close();
        };
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
        else setTimeout(done, 160);
    };
    root.addEventListener(
        'click',
        async (event) => {
            if (event.target === root || event.target.closest('[data-share-close]')) return close();
            const choice = event.target.closest('[data-share-format], [data-share-style]');
            if (choice) {
                if (choice.dataset.shareFormat) options.format = choice.dataset.shareFormat;
                else options.style = choice.dataset.shareStyle;
                sync();
                redraw();
                return;
            }
            const action = event.target.closest('[data-share-action]')?.dataset.shareAction;
            if (!action) return;
            try {
                if (action === 'share') {
                    const file = new File([await image], fileName, { type: 'image/png' });
                    await navigator.share({
                        files: [file],
                        title: model.kicker,
                        text: `${model.kicker} on Monochrome`,
                    });
                } else if (action === 'download') {
                    download(await image, fileName);
                    say('Image saved.');
                } else if (action === 'copy') {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]);
                    say('Image copied. Paste it into a story or a chat.');
                } else if (action === 'data') {
                    const data = await context.exportData();
                    if (data.locked) return say('Exports are locked for this period.');
                    download(
                        new Blob(
                            [
                                JSON.stringify(
                                    { ...data, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                                    null,
                                    2
                                ),
                            ],
                            {
                                type: 'application/json',
                            }
                        ),
                        `monochrome-listening-${context.period}-${context.anchor}.json`
                    );
                    say('Data downloaded.');
                }
            } catch (error) {
                if (error?.name !== 'AbortError')
                    say(
                        action === 'data'
                            ? 'Export failed. Check your connection and retry.'
                            : 'That did not work. Try Save instead.'
                    );
            }
        },
        { signal }
    );
    root.addEventListener(
        'change',
        (event) => {
            const part = event.target.dataset.sharePart;
            if (!part) return;
            options[part] = event.target.checked;
            sync();
            redraw();
        },
        { signal }
    );
    root.addEventListener(
        'cancel',
        (event) => {
            event.preventDefault();
            close();
        },
        { signal }
    );
    window.addEventListener('popstate', () => root.close(), { signal });
    root.addEventListener(
        'close',
        () => {
            controller.abort();
            context.returnFocus?.focus({ preventScroll: true });
        },
        { signal }
    );
    root.showModal();
    syncStatsSegments(root);
}

function download(blob, name) {
    const url = URL.createObjectURL(blob),
        a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
