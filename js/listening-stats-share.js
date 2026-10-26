import I_X from '!lucide/x.svg?svg&icon';
import I_SHARE from '!lucide/share.svg?svg&icon';
import I_DOWNLOAD from '!lucide/download.svg?svg&icon';
import I_COPY from '!lucide/copy.svg?svg&icon';
import I_DATA from '!lucide/file-json.svg?svg&icon';
import I_LOCK from '!lucide/lock-keyhole.svg?svg&icon';
import { syncStatsSegments } from './listening-stats-scene.js';
import { artwork, badge, css, font, lift, rgb, themeFor, write } from './listening-share-themes.js';
import { CLASSICS, EDITIONS, POOLS, loadCollection, loadEditionFont } from './listening-recap-editions.js';

// A share card drawn on canvas: the same numbers as the page, composed for stories and posts.
const FORMATS = {
    story: [1080, 1920, 'Story', '9:16'],
    post: [1080, 1350, 'Post', '4:5'],
    square: [1080, 1080, 'Square', '1:1'],
};
const PARTS = {
    artists: 'Top artists',
    tracks: 'On repeat',
    totals: 'Totals',
    clock: 'Listening clock',
    handle: 'Your name',
};
const HEADLINES = { minutes: 'Minutes', streams: 'Streams' };
const PERIOD_KICKER = { day: 'My day', week: 'My week', month: 'My month', year: 'My year', lifetime: 'All time' };
const BRAND = 'Switzer, Inter, system-ui, sans-serif';
const STORE = 'monochrome-stats-share';
const PAD = 84;

const imageUrl = (url) =>
    url && /^(https?:\/\/|\/api\/files\/|\/assets\/)/i.test(url) && !/\/assets\/appicon\.png/.test(url) ? url : '';

let options = {
    format: 'story',
    style: 'aura',
    headline: 'minutes',
    artists: true,
    tracks: true,
    totals: true,
    clock: false,
    handle: true,
};
try {
    options = { ...options, ...JSON.parse(localStorage.getItem(STORE) || '{}') };
} catch {
    /* Storage can be unavailable; defaults still work. */
}
if (!FORMATS[options.format]) options.format = 'story';
if (!CLASSICS[options.style] && !EDITIONS[options.style]) options.style = 'aura';
if (!HEADLINES[options.headline]) options.headline = 'minutes';

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

export function buildShareModel({ data, period, anchor, label, colors, user }) {
    const n = new Intl.NumberFormat();
    const s = data.summary;
    const coverFor = (artist) =>
        imageUrl(artist.cover) ||
        imageUrl(data.top.tracks.find((track) => track.artists?.some((a) => a.id === artist.id))?.cover);
    const clock = Math.round(s.seconds);
    return {
        kicker: `${PERIOD_KICKER[period]} · ${label}`,
        headlines: {
            minutes: [n.format(Math.round(s.seconds / 60)), 'minutes of music'],
            streams: [n.format(s.streams), s.streams === 1 ? 'stream' : 'streams'],
        },
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
        hours: data.hours || Array(24).fill(0),
        handle: user?.username ? `@${user.username}` : user?.name || '',
        // Edition props: the VHS counter and the ticket serial come from the period itself.
        timecode: `${Math.floor(clock / 3600)}:${String(Math.floor((clock % 3600) / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`,
        serial: `ADMIT ONE  Nº ${String(anchor || '')
            .replaceAll('-', '')
            .slice(2)}`,
        colors,
    };
}

// ---------- Drawing ----------

const cased = (theme, value) => (theme.upper ? String(value).toUpperCase() : String(value));
const body = (theme, extra) => ({ ...theme.body, ...extra });
const display = (theme, extra) => ({
    ...theme.display,
    tracking: (theme.display.tracking || 0) * (extra.size || 0),
    echo: theme.echo,
    glowText: theme.glowText,
    ...extra,
});

function kicker(ctx, label, y, width, theme) {
    const style = body(theme, { size: 28, color: theme.muted, tracking: 4, max: width - PAD * 2 });
    write(ctx, label.toUpperCase(), PAD, y, style);
    ctx.font = font(style, 28);
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
const hourLabel = (hour) =>
    new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2000, 0, 1, hour)).replace(/\s/g, '');

function sections(model, picks, width, theme) {
    const inner = width - PAD * 2;
    const column = inner / 3;
    const [headline, unit] = model.headlines[picks.headline];
    const list = [
        {
            height: 0,
            measure(ctx) {
                ctx.font = font(theme.display, 100);
                const metrics = ctx.measureText(headline);
                this.size = Math.min(290, (inner / metrics.width) * 98);
                // Old-style figures (Syne, Fraunces) hang below the baseline; the label clears them.
                this.drop = (Math.max(0, metrics.actualBoundingBoxDescent || 0) * this.size) / 100;
                this.height = 34 + 34 + this.size * 0.74 + this.drop + 30 + 54;
            },
            draw(ctx, y) {
                write(
                    ctx,
                    model.kicker.toUpperCase(),
                    PAD,
                    y,
                    body(theme, {
                        size: 28,
                        color: theme.muted,
                        tracking: 4,
                        max: inner,
                    })
                );
                const top = y + 68;
                ctx.font = font(theme.display, this.size);
                const measured = ctx.measureText(headline).width;
                write(
                    ctx,
                    headline,
                    PAD - this.size * 0.03,
                    top - this.size * 0.02,
                    display(theme, {
                        size: this.size,
                        color: theme.text,
                        tracking: (theme.display.tracking ?? -0.04) * this.size,
                        fillStyle: theme.numberFill?.(ctx, PAD, top, measured, this.size),
                    })
                );
                write(
                    ctx,
                    cased(theme, unit),
                    PAD,
                    top + this.size * 0.74 + this.drop + 30,
                    body(theme, {
                        size: 50,
                        weight: theme.body.weight - 100,
                        color: theme.text,
                    })
                );
            },
        },
    ];
    if (picks.artists && model.artists.length)
        list.push({
            height: 34 + 40 + 232 + 30 + 44,
            draw(ctx, y, art) {
                kicker(ctx, 'Top artists', y, width, theme);
                const top = y + 74;
                columns(model.artists.length, width).forEach((cx, i) => {
                    const artist = model.artists[i];
                    artwork(ctx, art.artists[i], cx - 116, top, 232, theme, artist.name[0] || '?', 'artist');
                    badge(ctx, theme, cx + 82, top + 198, i + 1);
                    write(
                        ctx,
                        cased(theme, artist.name),
                        cx,
                        top + 262,
                        body(theme, {
                            size: 40,
                            color: theme.text,
                            align: 'center',
                            max: column - 24,
                        })
                    );
                });
            },
        });
    if (picks.tracks && model.tracks.length)
        list.push({
            height: 34 + 40 + 236 + 28 + 54 + 26 + 42 + 10 + 36,
            draw(ctx, y, art) {
                kicker(ctx, 'On repeat', y, width, theme);
                const top = y + 74;
                columns(model.tracks.length, width).forEach((cx, i) => {
                    const track = model.tracks[i];
                    artwork(ctx, art.tracks[i], cx - 118, top, 236, theme, track.title[0] || '?', 'track');
                    const pill = top + 264;
                    ctx.beginPath();
                    ctx.roundRect(cx - 118, pill, 236, 54, Math.min(27, theme.tile));
                    ctx.fillStyle = theme.surface;
                    ctx.fill();
                    write(
                        ctx,
                        cased(theme, track.streams),
                        cx,
                        pill + 13,
                        body(theme, {
                            size: 28,
                            color: theme.text,
                            align: 'center',
                            max: 210,
                        })
                    );
                    write(
                        ctx,
                        cased(theme, track.title),
                        cx,
                        pill + 80,
                        body(theme, {
                            size: 38,
                            color: theme.text,
                            align: 'center',
                            max: column - 24,
                        })
                    );
                    write(
                        ctx,
                        cased(theme, track.artist),
                        cx,
                        pill + 132,
                        body(theme, {
                            size: 32,
                            weight: theme.body.weight - 100,
                            color: theme.muted,
                            align: 'center',
                            max: column - 24,
                        })
                    );
                });
            },
        });
    if (picks.clock)
        list.push({
            height: 34 + 40 + 170 + 18 + 30,
            draw(ctx, y) {
                kicker(ctx, 'When I listen', y, width, theme);
                const top = y + 74,
                    base = top + 170;
                const gap = 10,
                    bar = (inner - gap * 23) / 24;
                const max = Math.max(1, ...model.hours);
                const peak = model.hours.indexOf(Math.max(...model.hours));
                model.hours.forEach((seconds, hour) => {
                    const height = Math.max(8, (seconds / max) * 170);
                    ctx.beginPath();
                    ctx.roundRect(PAD + hour * (bar + gap), base - height, bar, height, Math.min(bar / 2, theme.tile));
                    ctx.fillStyle = seconds && hour === peak ? theme.accent : theme.line;
                    ctx.fill();
                });
                [0, 6, 12, 18].forEach((hour) =>
                    write(
                        ctx,
                        cased(theme, hourLabel(hour)),
                        PAD + hour * (bar + gap),
                        base + 18,
                        body(theme, {
                            size: 26,
                            color: theme.muted,
                        })
                    )
                );
            },
        });
    if (picks.totals)
        list.push({
            height: 176,
            draw(ctx, y) {
                const gap = 24,
                    tile = (inner - gap * 2) / 3;
                model.totals.forEach(([value, label], i) => {
                    const x = PAD + i * (tile + gap);
                    ctx.beginPath();
                    ctx.roundRect(x, y, tile, 176, theme.tile);
                    ctx.fillStyle = theme.surface;
                    ctx.fill();
                    write(
                        ctx,
                        value,
                        x + tile / 2,
                        y + 34,
                        display(theme, {
                            size: 72,
                            color: theme.text,
                            align: 'center',
                            max: tile - 32,
                            tracking: -2,
                            fillStyle: theme.numberFill?.(ctx, x, y + 34, tile, 72),
                        })
                    );
                    write(
                        ctx,
                        cased(theme, label),
                        x + tile / 2,
                        y + 118,
                        body(theme, {
                            size: 30,
                            weight: theme.body.weight - 100,
                            color: theme.muted,
                            align: 'center',
                        })
                    );
                });
            },
        });
    return list;
}
function footer(ctx, model, picks, width, height, theme) {
    const y = height - 84 - 44;
    if (picks.handle && model.handle)
        write(
            ctx,
            model.handle,
            PAD,
            y + 4,
            body(theme, {
                size: 34,
                weight: theme.body.weight - 100,
                color: theme.muted,
                max: width / 2 - PAD,
            })
        );
    // The Monochrome mark: two offset squares, then the wordmark.
    ctx.font = `700 40px ${BRAND}`;
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
        family: BRAND,
        color: theme.text,
        align: 'right',
        tracking: -1,
    });
}

let switzer;
export async function drawShareCard(canvas, model, picks) {
    const [width, height] = FORMATS[picks.format];
    switzer ||= Promise.all(['500', '600', '700'].map((weight) => document.fonts.load(`${weight} 40px Switzer`))).catch(
        () => {}
    );
    const [, , artists, tracks] = await Promise.all([
        switzer,
        loadEditionFont(picks.style),
        Promise.all(model.artists.map((artist) => loadImage(artist.image))),
        Promise.all(model.tracks.map((track) => loadImage(track.image))),
    ]);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    const theme = themeFor(picks.style, model.colors);
    ctx.save();
    theme.paint(ctx, width, height);
    ctx.restore();
    const parts = sections(model, picks, width, theme);
    parts[0].measure(ctx);
    // Sections share the space above the footer; gaps grow first, and only a crowded card scales down.
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
        part.draw(ctx, y, { artists, tracks });
        y += part.height + gap;
    }
    ctx.restore();
    ctx.save();
    theme.overlay?.(ctx, width, height, model);
    ctx.restore();
    footer(ctx, model, picks, width, height, theme);
}

// ---------- Sheet ----------

// Edition swatches carry the edition's own scene, the same one its recap plays in.
const scene = '<span class="stats-recap-scene" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
const styleTile = (key, name) =>
    `<button type="button" data-share-style="${key}" aria-pressed="false"><i class="stats-ed-swatch stats-ed-${key}">${EDITIONS[key] ? scene : ''}</i><span>${name}</span><b class="stats-share-lock" aria-hidden="true">${I_LOCK(13)}</b></button>`;

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
            <div class="stats-share-field"><span class="stats-share-label" id="stats-share-style">Style</span>
                <div class="stats-share-styles" role="group" aria-labelledby="stats-share-style">${Object.entries(
                    CLASSICS
                )
                    .map(([key, name]) => styleTile(key, name))
                    .join('')}</div>
                ${['week', 'month']
                    .map(
                        (period) =>
                            `<p class="stats-share-group" id="stats-share-${period}"><span>${period === 'week' ? 'Weekly' : 'Monthly'} editions</span><small data-share-owned="${period}"></small></p><div class="stats-share-styles" role="group" aria-labelledby="stats-share-${period}">${POOLS[
                                period
                            ]
                                .map((key) => styleTile(key, EDITIONS[key].name))
                                .join('')}</div>`
                    )
                    .join('')}
            </div>
            <div class="stats-share-field"><span class="stats-share-label" id="stats-share-headline">Big number</span><div class="stats-segments" role="group" aria-labelledby="stats-share-headline">${Object.entries(
                HEADLINES
            )
                .map(
                    ([key, name]) =>
                        `<button type="button" data-share-headline="${key}" aria-pressed="false">${name}</button>`
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

// context.edition preselects a collected edition, as the end of a recap does.
export function openStatsShare(context) {
    const root = sheet();
    const canvas = root.querySelector('canvas');
    const status = root.querySelector('.stats-share-status');
    const model = buildShareModel(context);
    const controller = new AbortController();
    const { signal } = controller;
    const fileName = `monochrome-${context.period}-${context.anchor}.png`;
    let owned = new Set(context.edition ? [context.edition] : []);
    if (context.edition) options.style = context.edition;
    let image;
    let token = 0;
    let statusTimer;
    const say = (text) => {
        status.textContent = text;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => (status.textContent = ''), 4000);
    };
    const available = (style) => Boolean(CLASSICS[style] || owned.has(style));
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
        for (const button of root.querySelectorAll('[data-share-headline]'))
            button.setAttribute('aria-pressed', String(button.dataset.shareHeadline === options.headline));
        for (const button of root.querySelectorAll('[data-share-style]')) {
            const key = button.dataset.shareStyle;
            const locked = !available(key);
            button.setAttribute('aria-pressed', String(key === options.style));
            button.classList.toggle('is-locked', locked);
            if (locked) button.setAttribute('aria-disabled', 'true');
            else button.removeAttribute('aria-disabled');
            button.title = locked
                ? `Find ${EDITIONS[key].name} in a ${EDITIONS[key].period === 'week' ? 'weekly' : 'monthly'} recap to unlock it`
                : '';
        }
        for (const counter of root.querySelectorAll('[data-share-owned]')) {
            const pool = POOLS[counter.dataset.shareOwned];
            counter.textContent = `${pool.filter((key) => owned.has(key)).length} of ${pool.length} collected`;
        }
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
    root.querySelector('[data-share-action="data"]').hidden = !context.exportData;
    root.querySelector('.stats-share-period').textContent = model.kicker;
    canvas.setAttribute(
        'aria-label',
        `${model.kicker}: ${model.headlines.minutes[0]} minutes of music. ${model.artists.length ? `Top artists ${model.artists.map((a) => a.name).join(', ')}.` : ''}`
    );
    root.style.setProperty('--share-accent', css(lift(rgb(context.colors[0]))));
    context.colors.forEach((color, i) => root.style.setProperty(`--share-c${i}`, color));
    status.textContent = '';
    // A remembered edition from another account falls back until the collection says it is owned.
    const remembered = options.style;
    if (!available(options.style)) options.style = 'aura';
    sync();
    redraw();
    void loadCollection().then((state) => {
        if (signal.aborted) return;
        owned = new Set([...owned, ...Object.keys(state.editions)]);
        const restore = options.style === 'aura' && remembered !== 'aura' && available(remembered);
        if (restore) options.style = remembered;
        sync();
        if (restore) redraw();
    });

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
            const choice = event.target.closest('[data-share-format], [data-share-style], [data-share-headline]');
            if (choice) {
                const style = choice.dataset.shareStyle;
                if (style && !available(style)) {
                    say(choice.title);
                    return;
                }
                if (choice.dataset.shareFormat) options.format = choice.dataset.shareFormat;
                else if (choice.dataset.shareHeadline) options.headline = choice.dataset.shareHeadline;
                else options.style = style;
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
