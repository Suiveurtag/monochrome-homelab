// Constellation design: a starfield with tilted orbits, glossy orbs and a comet drawn around the covers.
// Two canvases give depth, and both sit behind the covers: the sky, then the near canvas for the moving light.

const runs = new WeakMap();
const TAU = Math.PI * 2;

// Ring geometry is relative to the scene box; tilt is in degrees.
const RINGS = [
    { rx: 0.418, ry: 0.44, tilt: -2.5, width: 1.4, alpha: 1 },
    { rx: 0.31, ry: 0.335, tilt: -8, width: 1, alpha: 0.38, dash: [1.5, 7] },
    { rx: 0.205, ry: 0.25, tilt: -3, width: 1, alpha: 0.42 },
];
// Stops run around the orbit from its right end clockwise; each takes one slot of the period's palette.
const HUE_SLOTS = [
    [0, 2, 0.95],
    [0.13, 1, 0.55],
    [0.3, 2, 0.75],
    [0.43, 0, 0.95],
    [0.5, 0, 1],
    [0.58, 1, 0.95],
    [0.67, 2, 0.7],
    [0.77, 1, 0.3],
    [0.9, 2, 0.75],
    [1, 2, 0.95],
];
const mix = (rgb, to, k) => rgb.map((v, i) => Math.round(v + (to[i] - v) * k));
// Canvas parses any CSS color, so a palette color comes out as numbers without a color parser.
function rgbOf(css) {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
}
// Glossy spheres: [highlight, body, rim] as rgb triplets. Ice and pearl stay white; the rest follow the palette.
function orbTones([p0, p1, p2]) {
    const glossy = (c) => [mix(c, [255, 255, 255], 0.75), c, mix(c, [0, 0, 0], 0.8)];
    return {
        ice: [[255, 255, 255], [143, 180, 255], [26, 39, 104]],
        pearl: [[255, 255, 255], [185, 191, 214], [43, 47, 69]],
        violet: glossy(p1),
        pink: glossy(p2),
        blue: glossy(mix(p0, p1, 0.5)),
        cyan: glossy(p0),
    };
}
// The outer ring turns as one body, like the reference; inner rings run faster.
const ORBS = [
    { ring: 0, angle: 3.6, speed: 0.045, size: 13, tone: 'ice' },
    { ring: 0, angle: 2.89, speed: 0.045, size: 14, tone: 'violet' },
    { ring: 0, angle: 2.02, speed: 0.045, size: 6, tone: 'pink' },
    { ring: 0, angle: 1.01, speed: 0.045, size: 7.5, tone: 'blue' },
    { ring: 0, angle: 5.27, speed: 0.045, size: 5.5, tone: 'pearl' },
    { ring: 1, angle: 5.5, speed: 0.085, size: 6, tone: 'cyan' },
    { ring: 1, angle: 0.55, speed: 0.085, size: 4.5, tone: 'blue' },
    { ring: 2, angle: 0.25, speed: 0.13, size: 3.2, tone: 'pearl' },
    { ring: 2, angle: 3.4, speed: 0.13, size: 3, tone: 'pink' },
];
const SPARK_COLORS = ['255,255,255', '255,120,220', '120,200,255', '190,150,255'];

// A seeded generator keeps the sky identical between renders of the same size.
function random(seed) {
    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}
const smooth = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function orbSprite([hi, body, rim], scale) {
    const size = Math.ceil(64 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
    halo.addColorStop(0, `rgba(${body},0.67)`);
    halo.addColorStop(0.35, `rgba(${body},0.2)`);
    halo.addColorStop(1, `rgba(${body},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);
    const r = size * 0.19;
    const ball = ctx.createRadialGradient(c - r * 0.4, c - r * 0.45, r * 0.05, c, c, r);
    ball.addColorStop(0, `rgb(${hi})`);
    ball.addColorStop(0.35, `rgb(${body})`);
    ball.addColorStop(1, `rgb(${rim})`);
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.fill();
    // A thin lit rim on the side facing away from the highlight.
    ctx.strokeStyle = `rgba(${hi},0.33)`;
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    ctx.arc(c, c, r * 0.92, 0.1 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
    return canvas;
}

export function animateConstellation(root, entrance) {
    runs.get(root)?.abort();
    const scene = root.querySelector('.stats-cosmos');
    if (!scene) return;
    const controller = new AbortController();
    runs.set(root, controller);
    const { signal } = controller;
    const back = scene.querySelector('.stats-cosmos-sky');
    const front = scene.querySelector('.stats-cosmos-near');
    const bctx = back.getContext('2d');
    const fctx = front.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const covers = [...scene.querySelectorAll('.stats-cosmos-star')];
    const core = scene.querySelector('.stats-cosmos-core');
    const ringLayer = document.createElement('canvas');
    let width = 0,
        height = 0,
        dpr = 1,
        sky = [],
        glints = [],
        dust = [],
        sprites = {},
        sparks = [],
        meteor = null,
        starColor = '255,255,255',
        frame = 0,
        running = false,
        last = 0;
    // A quiet update starts the clock past the entrance.
    const start = performance.now() - (entrance ? 0 : 60000);
    let nextMeteor = (entrance ? 0 : 60) + 4 + Math.random() * 5;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    // The palette follows the covers' colors; the orbit, dust and orbs are rebuilt when it changes.
    let paletteKey = '',
        hues = [],
        tones = {},
        orbScale = 1;

    function hueAt(fraction) {
        const f = ((fraction % 1) + 1) % 1;
        const next = hues.findIndex(([at]) => at >= f);
        return hues[Math.max(0, next)][1];
    }

    function syncPalette(force = false) {
        const style = getComputedStyle(scene);
        const css = [0, 1, 2].map((i) => style.getPropertyValue(`--stats-color-${i}`).trim());
        const key = css.join('|');
        if (!force && key === paletteKey) return false;
        paletteKey = key;
        const glows = css.map((c) => mix(rgbOf(c), [255, 255, 255], 0.3));
        hues = HUE_SLOTS.map(([at, slot, alpha]) => [at, glows[slot].join(','), alpha]);
        tones = orbTones(glows);
        sprites = Object.fromEntries(
            Object.entries(tones).map(([tone, colors]) => [
                tone,
                orbSprite(
                    colors.map((c) => c.join(',')),
                    orbScale * dpr
                ),
            ])
        );
        drawRings();
        return true;
    }

    const center = () => ({ x: width * 0.5, y: height * 0.5 });
    const point = (ring, angle, offset = 0) => {
        const r = RINGS[ring];
        const { x: cx, y: cy } = center();
        const ex = Math.cos(angle) * width * r.rx * (1 + offset);
        const ey = Math.sin(angle) * height * r.ry * (1 + offset);
        const tilt = (r.tilt * Math.PI) / 180;
        return {
            x: cx + ex * Math.cos(tilt) - ey * Math.sin(tilt),
            y: cy + ex * Math.sin(tilt) + ey * Math.cos(tilt),
            // The lower half of an orbit is nearer the viewer.
            z: Math.sin(angle),
        };
    };

    function drawRings() {
        ringLayer.width = back.width;
        ringLayer.height = back.height;
        const ctx = ringLayer.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        const { x: cx, y: cy } = center();
        const blur = 'filter' in ctx;
        RINGS.forEach((ring, index) => {
            const gradient = ctx.createConicGradient(0, cx, cy);
            for (const [at, rgb, alpha] of hues) gradient.addColorStop(at, `rgba(${rgb},${alpha * ring.alpha})`);
            const passes = index
                ? [[ring.width, 0, 1]]
                : [
                      [9, 14, 0.5],
                      [4, 5, 0.75],
                      [ring.width, 0, 1],
                  ];
            for (const [lineWidth, blurRadius, alpha] of passes) {
                ctx.save();
                if (blur) ctx.filter = blurRadius ? `blur(${blurRadius}px)` : 'none';
                // Without canvas filters the glow passes stay as faint wide strokes.
                ctx.globalAlpha = blur || !blurRadius ? alpha : alpha * 0.25;
                ctx.strokeStyle = gradient;
                ctx.lineWidth = lineWidth;
                ctx.setLineDash(ring.dash || []);
                ctx.beginPath();
                ctx.ellipse(cx, cy, width * ring.rx, height * ring.ry, (ring.tilt * Math.PI) / 180, 0, TAU);
                ctx.stroke();
                ctx.restore();
            }
        });
        // A white core along the bright left and right arcs, like light catching the edge of the orbit.
        const outer = RINGS[0];
        ctx.lineWidth = 0.8;
        for (const [from, to] of [
            [2.55, 3.75],
            [-0.45, 0.35],
        ]) {
            const a = point(0, from),
                b = point(0, to);
            const shine = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            shine.addColorStop(0, 'rgba(255,255,255,0)');
            shine.addColorStop(0.5, 'rgba(255,255,255,0.75)');
            shine.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.strokeStyle = shine;
            ctx.beginPath();
            ctx.ellipse(cx, cy, width * outer.rx, height * outer.ry, (outer.tilt * Math.PI) / 180, from, to);
            ctx.stroke();
        }
    }

    function resize() {
        const box = scene.getBoundingClientRect();
        if (!box.width || !box.height) return false;
        width = box.width;
        height = box.height;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        for (const canvas of [back, front]) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }
        const rgb = getComputedStyle(scene).color.match(/[\d.]+/g);
        if (rgb) starColor = rgb.slice(0, 3).join(',');
        const rand = random(Math.round(width) * 7 + Math.round(height));
        sky = Array.from({ length: Math.round((width * height) / 2600) }, () => ({
            x: rand() * width,
            y: rand() * height,
            r: 0.35 + Math.pow(rand(), 3) * 1.3,
            alpha: 0.15 + rand() * 0.6,
            speed: 0.4 + rand() * 1.6,
            phase: rand() * TAU,
            depth: 0.3 + rand() * 0.7,
            tint: rand() < 0.18 ? SPARK_COLORS[1 + Math.floor(rand() * 3)] : null,
        }));
        glints = Array.from({ length: 7 }, () => ({
            x: 0.08 + rand() * 0.84,
            y: 0.06 + rand() * 0.88,
            size: 5 + rand() * 7,
            speed: 0.25 + rand() * 0.35,
            phase: rand() * TAU,
        }));
        dust = Array.from({ length: 90 }, () => {
            const ring = rand() < 0.55 ? 0 : rand() < 0.5 ? 1 : 2;
            return {
                ring,
                angle: rand() * TAU,
                offset: (rand() - 0.5) * 0.05,
                speed: (ring ? 0.07 : 0.035) * (0.7 + rand() * 0.6),
                size: 0.5 + rand() * 1.2,
                alpha: 0.25 + rand() * 0.65,
                phase: rand() * TAU,
            };
        });
        orbScale = Math.min(1.4, Math.max(0.75, width / 1200));
        syncPalette(true);
        return true;
    }

    function burst(x, y, count, power = 1) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * TAU;
            const speed = (40 + Math.random() * 140) * power;
            sparks.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0,
                max: 0.6 + Math.random() * 0.8,
                size: 0.6 + Math.random() * 1.6,
                color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
            });
        }
    }
    const coverCenter = (cover) => {
        const box = cover.querySelector('.stats-cosmos-art').getBoundingClientRect();
        const origin = scene.getBoundingClientRect();
        return { x: box.left - origin.left + box.width / 2, y: box.top - origin.top + box.height / 2 };
    };

    function glow(ctx, x, y, radius, rgb, alpha) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, `rgba(255,255,255,${alpha})`);
        g.addColorStop(0.2, `rgba(${rgb},${alpha * 0.8})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    function draw(now) {
        syncPalette();
        const t = (now - start) / 1000;
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
        last = now;
        pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3.5);
        pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3.5);
        const px = pointer.x,
            py = pointer.y;
        for (const ctx of [bctx, fctx]) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';
        }
        const intro = smooth((t - 0.1) / 1.2);
        // Stars drift a little against the pointer; far ones less.
        for (const star of sky) {
            const twinkle = 0.55 + 0.45 * Math.sin(t * star.speed + star.phase);
            bctx.fillStyle = `rgba(${star.tint || starColor},${star.alpha * twinkle * intro})`;
            const x = star.x - px * 10 * star.depth,
                y = star.y - py * 6 * star.depth;
            if (star.r < 0.9) bctx.fillRect(x, y, star.r * 1.6, star.r * 1.6);
            else {
                bctx.beginPath();
                bctx.arc(x, y, star.r, 0, TAU);
                bctx.fill();
            }
        }
        for (const glint of glints) {
            const pulse = Math.pow(Math.max(0, Math.sin(t * glint.speed * TAU * 0.25 + glint.phase)), 6) * intro;
            if (pulse < 0.02) continue;
            const x = glint.x * width - px * 8,
                y = glint.y * height - py * 5,
                s = glint.size * (0.6 + pulse * 0.6);
            bctx.strokeStyle = `rgba(255,255,255,${pulse * 0.8})`;
            bctx.lineWidth = 0.8;
            bctx.beginPath();
            bctx.moveTo(x - s, y);
            bctx.lineTo(x + s, y);
            bctx.moveTo(x, y - s);
            bctx.lineTo(x, y + s);
            bctx.stroke();
            glow(bctx, x, y, s * 0.6, '200,180,255', pulse * 0.7);
        }
        // The orbit draws itself behind a comet that sweeps once around, then settles into a slow loop.
        const sweep = smooth((t - 0.2) / 1.9);
        const head = Math.PI + sweep * TAU + Math.max(0, t - 0.2) * 0.42;
        const ox = -px * 12,
            oy = -py * 7;
        bctx.save();
        bctx.translate(ox, oy);
        // The reveal wedge follows the comet's own angle, pushed far out past every ring.
        if (head - Math.PI < TAU) {
            const { x: cx, y: cy } = center();
            bctx.beginPath();
            bctx.moveTo(cx, cy);
            for (let a = Math.PI - 0.03; a < head + 0.05; a += 0.06) {
                const p = point(0, a);
                bctx.lineTo(cx + (p.x - cx) * 3, cy + (p.y - cy) * 3);
            }
            bctx.closePath();
            bctx.clip();
        }
        bctx.globalCompositeOperation = 'lighter';
        bctx.setTransform(1, 0, 0, 1, ox * dpr, oy * dpr);
        bctx.drawImage(ringLayer, 0, 0);
        bctx.restore();
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bctx.globalCompositeOperation = 'lighter';
        const motes = smooth((t - 1.2) / 1.2);
        for (const mote of dust) {
            const p = point(mote.ring, mote.angle + t * mote.speed, mote.offset);
            const ctx = p.z > 0.15 ? fctx : bctx;
            const near = (p.z + 1) / 2;
            const alpha = mote.alpha * motes * (0.35 + near * 0.65) * (0.6 + 0.4 * Math.sin(t * 1.3 + mote.phase));
            ctx.fillStyle = `rgba(${hueAt((mote.angle + t * mote.speed) / TAU)},${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x + ox, p.y + oy, mote.size * (0.7 + near * 0.5), 0, TAU);
            ctx.fill();
        }
        // Orbs fade in once the orbit is drawn and grow as they come forward.
        const orbsIn = smooth((t - 1.4) / 1);
        for (const [i, orb] of ORBS.entries()) {
            const angle = orb.angle + t * orb.speed;
            const p = point(orb.ring, angle);
            const near = (p.z + 1) / 2;
            const ctx = p.z > 0.15 ? fctx : bctx;
            const appear = smooth((t - 1.4 - i * 0.08) / 0.9);
            const size = orb.size * (0.72 + near * 0.5) * (0.4 + appear * 0.6);
            const sprite = sprites[orb.tone];
            // The sprite's ball spans 0.19 of its box.
            const extent = size / 0.19;
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = orbsIn * appear * (0.55 + near * 0.45);
            ctx.drawImage(sprite, p.x + ox - extent / 2, p.y + oy - extent / 2, extent, extent);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'lighter';
        }
        // Comet: a bright head with a tapering tail along the outer orbit.
        const speedBoost = sweep < 1 ? 1 - sweep : 0;
        const tail = 0.55 + speedBoost * 1.1;
        const headPoint = point(0, head);
        const cctx = headPoint.z > 0.15 ? fctx : bctx;
        const steps = 36;
        let previous = headPoint;
        for (let i = 1; i <= steps; i++) {
            const p = point(0, head - (tail * i) / steps);
            const fade = 1 - i / steps;
            cctx.strokeStyle = `rgba(${hueAt((head - (tail * i) / steps) / TAU)},${fade * 0.9})`;
            cctx.lineWidth = 0.4 + fade * 2.6;
            cctx.lineCap = 'round';
            cctx.beginPath();
            cctx.moveTo(previous.x + ox, previous.y + oy);
            cctx.lineTo(p.x + ox, p.y + oy);
            cctx.stroke();
            previous = p;
        }
        glow(cctx, headPoint.x + ox, headPoint.y + oy, 16, hueAt(head / TAU), 0.95);
        glow(cctx, headPoint.x + ox, headPoint.y + oy, 3.5, '255,255,255', 1);
        // A shooting star now and then, across the upper sky.
        if (t > nextMeteor && !meteor) {
            meteor = {
                born: t,
                x: width * (0.35 + Math.random() * 0.55),
                y: height * Math.random() * 0.25,
                angle: Math.PI * (0.78 + Math.random() * 0.1),
            };
        }
        if (meteor) {
            const age = (t - meteor.born) / 1.1;
            if (age >= 1) {
                meteor = null;
                nextMeteor = t + 6 + Math.random() * 9;
            } else {
                const distance = smooth(age) * width * 0.32;
                const hx = meteor.x + Math.cos(meteor.angle) * distance;
                const hy = meteor.y + Math.sin(meteor.angle) * distance;
                const length = 90 * Math.sin(age * Math.PI);
                const trail = bctx.createLinearGradient(
                    hx,
                    hy,
                    hx - Math.cos(meteor.angle) * length,
                    hy - Math.sin(meteor.angle) * length
                );
                const alpha = Math.sin(age * Math.PI);
                trail.addColorStop(0, `rgba(255,255,255,${alpha})`);
                trail.addColorStop(1, 'rgba(160,140,255,0)');
                bctx.strokeStyle = trail;
                bctx.lineWidth = 1.3;
                bctx.beginPath();
                bctx.moveTo(hx, hy);
                bctx.lineTo(hx - Math.cos(meteor.angle) * length, hy - Math.sin(meteor.angle) * length);
                bctx.stroke();
                glow(bctx, hx, hy, 5, '200,190,255', alpha);
            }
        }
        sparks = sparks.filter((spark) => (spark.life += dt) < spark.max);
        for (const spark of sparks) {
            const drag = Math.pow(0.12, dt);
            spark.vx *= drag;
            spark.vy *= drag;
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt;
            const fade = 1 - spark.life / spark.max;
            fctx.fillStyle = `rgba(${spark.color},${fade})`;
            fctx.beginPath();
            fctx.arc(spark.x, spark.y, spark.size * (0.5 + fade * 0.5), 0, TAU);
            fctx.fill();
        }
        // Covers sit at different depths, so the pointer moves near ones more.
        for (const cover of covers) {
            const depth = Number(cover.dataset.depth) || 10;
            cover.style.transform = `translate3d(${(px * depth).toFixed(2)}px, ${(py * depth * 0.6).toFixed(2)}px, 0)`;
        }
        if (core) core.style.transform = `translate3d(${(-px * 4).toFixed(2)}px, ${(-py * 3).toFixed(2)}px, 0)`;
    }

    const loop = (now) => {
        if (signal.aborted || !scene.isConnected) return stop();
        draw(now);
        frame = requestAnimationFrame(loop);
    };
    function play() {
        if (running || reduced.matches || document.hidden || signal.aborted) return;
        running = true;
        last = 0;
        frame = requestAnimationFrame(loop);
    }
    function stop() {
        running = false;
        cancelAnimationFrame(frame);
    }
    // Reduced motion gets one finished frame: full orbit, orbs in place, no comet sweep.
    const still = () => {
        if (resize()) draw(start + 60000);
    };

    let visible = false;
    const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) play();
        else stop();
    });
    observer.observe(scene);
    const resizer = new ResizeObserver(() => {
        if (!resize()) return;
        if (!running) draw(reduced.matches ? start + 60000 : performance.now());
    });
    resizer.observe(scene);
    document.addEventListener(
        'visibilitychange',
        () => {
            if (document.hidden) stop();
            else if (visible) play();
        },
        { signal }
    );
    reduced.addEventListener(
        'change',
        () => {
            if (reduced.matches) {
                stop();
                still();
            } else if (visible) play();
        },
        { signal }
    );
    signal.addEventListener(
        'abort',
        () => {
            stop();
            observer.disconnect();
            resizer.disconnect();
        },
        { once: true }
    );

    scene.addEventListener(
        'pointermove',
        (event) => {
            if (event.pointerType !== 'mouse') return;
            const box = scene.getBoundingClientRect();
            pointer.tx = ((event.clientX - box.left) / box.width - 0.5) * 2;
            pointer.ty = ((event.clientY - box.top) / box.height - 0.5) * 2;
        },
        { signal }
    );
    scene.addEventListener(
        'pointerleave',
        () => {
            pointer.tx = 0;
            pointer.ty = 0;
        },
        { signal }
    );

    for (const cover of covers) {
        const art = cover.querySelector('.stats-cosmos-art');
        let tilt;
        art.addEventListener(
            'pointerenter',
            () => {
                if (running) {
                    const { x, y } = coverCenter(cover);
                    burst(x, y, 10, 0.6);
                }
            },
            { signal }
        );
        art.addEventListener(
            'pointermove',
            (event) => {
                if (reduced.matches || event.pointerType !== 'mouse') return;
                const box = art.getBoundingClientRect();
                const x = (event.clientX - box.left) / box.width,
                    y = (event.clientY - box.top) / box.height;
                cancelAnimationFrame(tilt);
                tilt = requestAnimationFrame(() => {
                    art.style.setProperty('--cosmos-tilt-x', `${((0.5 - y) * 14).toFixed(2)}deg`);
                    art.style.setProperty('--cosmos-tilt-y', `${((x - 0.5) * 18).toFixed(2)}deg`);
                    art.style.setProperty('--cosmos-glare', `${(x * 100).toFixed(1)}%`);
                });
            },
            { signal }
        );
        art.addEventListener(
            'pointerleave',
            () => {
                cancelAnimationFrame(tilt);
                art.style.removeProperty('--cosmos-tilt-x');
                art.style.removeProperty('--cosmos-tilt-y');
            },
            { signal }
        );
        art.addEventListener(
            'pointerdown',
            () => {
                if (!running) return;
                const { x, y } = coverCenter(cover);
                burst(x, y, 28, 1.1);
            },
            { signal }
        );
    }

    if (reduced.matches) {
        still();
        return;
    }
    resize();
    // Artwork that loads after the first frame recolors the scene; a still scene has no loop to pick that up.
    scene.querySelectorAll('.stats-cosmos-halo').forEach((img) =>
        img.addEventListener(
            'load',
            () => {
                if (syncPalette() && !running && width) draw(reduced.matches ? start + 60000 : performance.now());
            },
            { signal }
        )
    );
    // Each cover lands with a small burst of light, in step with its CSS entrance.
    if (entrance) {
        covers.forEach((cover, i) => {
            const timer = setTimeout(
                () => {
                    if (!running || !width) return;
                    const { x, y } = coverCenter(cover);
                    burst(x, y, 18, 0.8);
                },
                1000 + i * 120
            );
            signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
        });
    }
}
