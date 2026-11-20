// Repeat button spin and its easter egg.
//
// Each click winds the icon by whole turns; a spring chases the wound angle, so a single click reads
// as one springy turn and rapid clicks stack momentum. A "heat" value (clicks, decaying over ~0.9 s)
// raises the turns per click and lights a ring around the button. While the heat stays high (about
// five clicks a second) a charge arc fills; it drains when the spam slows. Full charge (a few
// seconds of sustained spam) overloads it:
//   1. implosion: light streams in from the edges of the screen, spiralling into the button;
//   2. snap: flash, three shockwaves, the player bar takes the hit, the icon empties;
//   3. burst: two spiral arms (the two arrows of the loop) thrown out across the screen;
//   4. grooves: vinyl rings around the button with a turning sheen;
//   5. infinity: a comet traces an infinity sign across the viewport;
//   6. echo: the sign glows, breaks into little loop glyphs that spin, then fall home one by one;
//   7. landing: the icon comes back with a pop.
// If the spam is still going at the end, a small comet keeps orbiting the button until it stops.

import { hapticMedium, hapticSuccess } from './haptics.js';

const HEAT_DECAY = 900;
const HEAT_FLOOR = 1.2;
const HEAT_FULL = 5.2;
const CHARGE_HEAT = 4.6;
const CHARGE_NEEDED = 3200;
const COOLDOWN = 2000;
const ORBIT_IDLE = 650;

const IMPLODE = 900;
const BURST_END = 2300;
const GROOVES = [1400, 3100];
const COMET_START = 2300;
const COMET_END = 4300;
const DIVE_END = 4800;
const GLYPHS = 10;
const GLYPH_FLY = 4550;
const GLYPH_STAGGER = 70;
const GLYPH_DUR = 600;
const LAND = GLYPH_FLY + (GLYPHS - 1) * GLYPH_STAGGER + GLYPH_DUR;
const END = LAND + 700;

const TAU = Math.PI * 2;
const states = new WeakMap();
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeIn = (t) => t * t * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function stateOf(button) {
    let state = states.get(button);
    if (!state) {
        state = {
            angle: 0,
            velocity: 0,
            target: 0,
            heat: 0,
            charge: 0,
            lastClick: 0,
            frame: 0,
            last: 0,
            climax: false,
            orbiting: false,
            cooldownUntil: 0,
        };
        states.set(button, state);
    }
    return state;
}

function ensureParts(button) {
    for (const name of ['loop-vortex-ring', 'loop-vortex-charge']) {
        if (button.querySelector(`:scope > .${name}`)) continue;
        const part = document.createElement('span');
        part.className = name;
        part.setAttribute('aria-hidden', 'true');
        button.append(part);
    }
}

const heatNow = (state, now) => state.heat * Math.exp(-(now - state.lastClick) / HEAT_DECAY);
const busy = (state) => state.climax || state.orbiting;

export function spinLoop(button) {
    const state = stateOf(button);
    const now = performance.now();
    state.heat = heatNow(state, now) + 1;
    state.lastClick = now;
    const turns = state.heat > 4.2 ? 3 : state.heat > 2.6 ? 2 : 1;
    // Always whole turns, so the icon can rest upright and the angle can reset to 0 when settled.
    state.target += 360 * turns;
    start(button, state);
}

function start(button, state) {
    if (state.frame) return;
    ensureParts(button);
    button.classList.add('is-clicking', 'is-winding');
    state.last = performance.now();
    state.frame = requestAnimationFrame((time) => step(button, state, time));
}

function step(button, state, time) {
    const dt = Math.min(0.034, (time - state.last) / 1000);
    state.last = time;
    const heat = state.climax ? HEAT_FULL : heatNow(state, time);

    if (!busy(state) && time > state.cooldownUntil) {
        state.charge = heat >= CHARGE_HEAT ? state.charge + dt * 1000 : Math.max(0, state.charge - dt * 1500);
        if (state.charge >= CHARGE_NEEDED) {
            state.charge = 0;
            overload(button, state);
        }
    }

    const stiffness = 230 + heat * 45;
    const damping = 2 * 0.8 * Math.sqrt(stiffness);
    for (let i = 0; i < 4; i += 1) {
        const h = dt / 4;
        state.velocity += (stiffness * (state.target - state.angle) - damping * state.velocity) * h;
        state.angle += state.velocity * h;
    }

    const level = clamp((heat - HEAT_FLOOR) / (HEAT_FULL - HEAT_FLOOR));
    const svg = button.querySelector(':scope > svg');
    if (svg) svg.style.rotate = `${state.angle % 360}deg`;
    ensureParts(button);
    button.style.setProperty('--loop-level', level.toFixed(3));
    button.style.setProperty('--loop-charge', (state.charge / CHARGE_NEEDED).toFixed(3));
    button.style.setProperty('--loop-angle', `${(state.angle % 360).toFixed(1)}deg`);
    const shake = level ** 2 * (1 + (state.charge / CHARGE_NEEDED) * 1.4);
    button.style.translate =
        shake > 0.05 ? `${(Math.random() - 0.5) * shake}px ${(Math.random() - 0.5) * shake}px` : '';

    const settled = Math.abs(state.target - state.angle) < 0.3 && Math.abs(state.velocity) < 4;
    if (settled && level < 0.01 && state.charge === 0 && !busy(state)) {
        state.frame = 0;
        state.angle = state.target = state.velocity = 0;
        if (svg) svg.style.rotate = '';
        for (const name of ['--loop-level', '--loop-charge', '--loop-angle']) button.style.removeProperty(name);
        button.style.translate = '';
        button.classList.remove('is-clicking', 'is-winding');
        return;
    }
    state.frame = requestAnimationFrame((next) => step(button, state, next));
}

// The overload sequence, drawn on a full-screen canvas above everything (pointer-events: none).
function overload(button, state) {
    state.climax = true;
    state.target += 360 * 5;
    void hapticMedium();

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    canvas.className = 'loop-vortex-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const veil = document.createElement('div');
    veil.className = 'loop-vortex-veil';
    veil.setAttribute('aria-hidden', 'true');
    document.body.append(veil, canvas);
    const ctx = canvas.getContext('2d');

    let width = 0;
    let height = 0;
    const resize = () => {
        width = innerWidth;
        height = innerHeight;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize);

    const center = () => {
        const rect = button.getBoundingClientRect();
        return rect.width
            ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
            : { x: width / 2, y: height - 48 };
    };
    const origin = center();
    veil.style.setProperty('--x', `${origin.x}px`);
    veil.style.setProperty('--y', `${origin.y}px`);

    // The veil darkens the page in every theme, so the light is always drawn light.
    const ink = '#fff';
    const rootStyle = getComputedStyle(document.documentElement);
    const glow = `rgb(${rootStyle.getPropertyValue('--highlight-rgb').trim() || '245, 245, 245'})`;
    const reach = Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y));

    const inward = Array.from({ length: 190 }, () => ({
        radius: reach * (0.7 + Math.random() * 0.5),
        theta: Math.random() * TAU,
        delay: Math.random() * 0.3,
        swirl: 2.2 + Math.random() * 2.4,
        size: 0.6 + Math.random() * 1.4,
        prev: null,
    }));
    const outward = Array.from({ length: 260 }, (_, index) => ({
        arm: (index % 2) * Math.PI + (Math.random() - 0.5) * 0.5,
        distance: reach * (0.35 + Math.random() * 0.75),
        life: 0.7 + Math.random() * 0.6,
        delay: Math.random() * 0.12,
        twist: 1.1 + Math.random() * 0.9,
        size: 0.5 + Math.random() * 1.6,
        prev: null,
    }));
    const glyphs = Array.from({ length: GLYPHS }, (_, index) => ({
        u: (index / GLYPHS) * TAU + 0.15,
        spin: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4),
        bend: (Math.random() - 0.5) * 2,
        landed: false,
    }));
    const sparks = [];

    const lemniscate = (u, size, mid) => {
        const s = Math.sin(u);
        const d = 1 + s * s;
        return { x: mid.x + (size * Math.cos(u)) / d, y: mid.y + (size * s * Math.cos(u)) / d };
    };
    const curve = (from, control, to, k) => {
        const a = 1 - k;
        return {
            x: a * a * from.x + 2 * a * k * control.x + k * k * to.x,
            y: a * a * from.y + 2 * a * k * control.y + k * k * to.y,
        };
    };
    let cometPrev = null;
    let snapped = false;
    let landed = false;

    const svg = button.querySelector(':scope > svg');
    svg?.animate(
        [
            { scale: 1, opacity: 1, offset: 0 },
            { scale: 1.3, opacity: 1, offset: IMPLODE / END - 0.01 },
            { scale: 0.45, opacity: 0.2, offset: IMPLODE / END + 0.02 },
            { scale: 0.45, opacity: 0.2, offset: LAND / END - 0.01 },
            { scale: 1.5, opacity: 1, offset: LAND / END + 0.03 },
            { scale: 1, opacity: 1, offset: 1 },
        ],
        { duration: END, easing: 'linear' }
    );
    veil.animate(
        [
            { opacity: 0, offset: 0 },
            { opacity: 1, offset: IMPLODE / END },
            { opacity: 0.9, offset: (IMPLODE + 300) / END },
            { opacity: 0.9, offset: LAND / END },
            { opacity: 0, offset: 1 },
        ],
        { duration: END, easing: 'ease-in-out', fill: 'forwards' }
    );

    const streak = (from, to, lineWidth, alpha, color = ink) => {
        if (!from || alpha <= 0) return;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
    };
    const ring = (at, radius, lineWidth, alpha, color = glow) => {
        if (alpha <= 0) return;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(at.x, at.y, Math.max(0, radius), 0, TAU);
        ctx.stroke();
    };
    const arc = (at, radius, from, to, lineWidth, alpha, color = ink) => {
        if (alpha <= 0) return;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(at.x, at.y, radius, from, to);
        ctx.stroke();
    };
    const bloom = (at, radius, alpha, color = glow) => {
        if (alpha <= 0) return;
        const gradient = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'transparent');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(at.x, at.y, radius, 0, TAU);
        ctx.fill();
    };
    // A tiny repeat sign: an open circle with an arrowhead at its end.
    const loopGlyph = (at, radius, rotation, alpha, color = ink) => {
        if (alpha <= 0 || radius <= 0.5) return;
        const end = rotation + TAU - 0.7;
        arc(at, radius, rotation, end, 1.6, alpha, color);
        const tip = { x: at.x + Math.cos(end) * radius, y: at.y + Math.sin(end) * radius };
        const along = { x: -Math.sin(end), y: Math.cos(end) };
        const out = { x: Math.cos(end), y: Math.sin(end) };
        const size = radius * 0.6;
        for (const side of [1, -1]) {
            streak(
                tip,
                { x: tip.x - along.x * size + out.x * size * side, y: tip.y - along.y * size + out.y * size * side },
                1.6,
                alpha,
                color
            );
        }
    };
    const emitSpark = (at, speed = 0.06) => {
        const angle = Math.random() * TAU;
        const velocity = 0.02 + Math.random() * speed;
        sparks.push({ x: at.x, y: at.y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, age: 0 });
    };

    const bar = button.closest('.now-playing-bar');
    const thump = (strength) =>
        bar?.animate(
            [
                { translate: '0 0' },
                { translate: `0 ${3 * strength}px` },
                { translate: `0 ${-2 * strength}px` },
                { translate: `0 ${strength}px` },
                { translate: '0 0' },
            ],
            { duration: 360, easing: 'ease-out' }
        );

    // After the sequence: a small comet orbits the button for as long as the spam continues.
    const orbit = { angle: 0, fade: 1, prev: null, stopping: 0 };
    const orbitInk = () => getComputedStyle(button).color || ink;

    const begin = performance.now();
    let lastFrame = begin;

    const teardown = () => {
        canvas
            .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' })
            .finished.catch(() => {})
            .finally(() => {
                canvas.remove();
                veil.remove();
                removeEventListener('resize', resize);
            });
        state.orbiting = false;
        state.heat = 0;
        state.cooldownUntil = performance.now() + COOLDOWN;
    };

    const frame = (time) => {
        const t = time - begin;
        const dt = Math.min(50, time - lastFrame);
        lastFrame = time;
        const home = center();
        ctx.lineCap = 'round';

        // Trails: fade what is already there instead of clearing it.
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(0,0,0,${clamp(0.2 * (dt / 16.7), 0.05, 0.6)})`;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = t < END ? 'lighter' : 'source-over';

        // 1. Implosion.
        if (t < IMPLODE) {
            const p = t / IMPLODE;
            for (const dot of inward) {
                const local = clamp((p - dot.delay) / (1 - dot.delay));
                if (local <= 0) continue;
                const e = easeIn(local);
                const r = dot.radius * (1 - e);
                const theta = dot.theta + dot.swirl * e;
                const at = { x: home.x + Math.cos(theta) * r, y: home.y + Math.sin(theta) * r };
                streak(dot.prev, at, dot.size * (0.6 + e * 1.4), 0.25 + 0.75 * e);
                dot.prev = local < 1 ? at : null;
            }
            bloom(home, 18 + 46 * easeIn(p), 0.25 + 0.55 * easeIn(p));
        }

        // 2. Snap and 3. burst.
        if (t >= IMPLODE && !snapped) {
            snapped = true;
            void hapticMedium();
            thump(1);
        }
        if (t >= IMPLODE && t < BURST_END + 600) {
            const since = t - IMPLODE;
            const flash = clamp(since / 280);
            bloom(home, 70 + 260 * easeOut(flash), (1 - flash) ** 2, ink);
            [0, 90, 210].forEach((lag, index) => {
                const wave = clamp((since - lag) / (900 + index * 250));
                if (wave <= 0 || wave >= 1) return;
                ring(
                    home,
                    reach * (0.45 + index * 0.3) * easeOut(wave),
                    (1 - wave) * (5 - index * 1.2),
                    (1 - wave) ** 1.6
                );
            });
            for (const dot of outward) {
                const local = clamp((since / 1000 - dot.delay) / dot.life);
                if (local <= 0 || local >= 1) {
                    dot.prev = null;
                    continue;
                }
                const r = dot.distance * easeOut(local);
                const theta = dot.arm + dot.twist * Math.log(1 + r / 36);
                const at = { x: home.x + Math.cos(theta) * r, y: home.y + Math.sin(theta) * r };
                streak(dot.prev, at, dot.size * (1.6 - local), (1 - local) ** 1.4, local < 0.25 ? glow : ink);
                dot.prev = at;
            }
        }

        // 4. Grooves: a record turning under the button, its sheen sweeping round.
        if (t >= GROOVES[0] && t <= GROOVES[1]) {
            const p = (t - GROOVES[0]) / (GROOVES[1] - GROOVES[0]);
            const envelope = Math.sin(p * Math.PI);
            const sheen = t / 260;
            for (let i = 0; i < 9; i += 1) {
                const radius = 34 + i * 15 * (0.6 + 0.4 * easeOut(clamp(p * 2.5)));
                ring(home, radius, 0.8, 0.07 * envelope, ink);
                arc(home, radius, sheen + i * 0.22, sheen + i * 0.22 + 0.55, 1.6, 0.55 * envelope, glow);
                arc(home, radius, sheen + i * 0.22 + Math.PI, sheen + i * 0.22 + Math.PI + 0.3, 1.2, 0.3 * envelope);
            }
        }

        // 5. Infinity, then the comet dives home.
        const mid = { x: width / 2, y: height * 0.44 };
        const size = Math.min(width * 0.36, height * 0.5);
        if (t >= COMET_START && t <= DIVE_END) {
            const finish = lemniscate(0, size, mid);
            const position = (moment) => {
                if (moment <= COMET_END) {
                    const u = easeInOut(clamp((moment - COMET_START) / (COMET_END - COMET_START))) * TAU;
                    return lemniscate(u, size, mid);
                }
                const k = easeIn(clamp((moment - COMET_END) / (DIVE_END - COMET_END)));
                return curve(finish, { x: finish.x + size * 0.25, y: home.y - size * 0.1 }, home, k);
            };
            const head = position(t);
            if (cometPrev) {
                let from = cometPrev.at;
                for (let i = 1; i <= 6; i += 1) {
                    const at = position(cometPrev.t + ((t - cometPrev.t) * i) / 6);
                    streak(from, at, 3.2, 0.9, glow);
                    streak(from, at, 1.2, 1, ink);
                    from = at;
                }
            }
            cometPrev = { t, at: head };
            bloom(head, 26, 0.55);
            bloom(head, 7, 1, ink);
            if (Math.random() < 0.8) emitSpark(head);
        }

        // 6. Echo: the whole sign glows, breaks into loop glyphs that spin, then fall home.
        if (t >= COMET_END && t < COMET_END + 600) {
            const p = (t - COMET_END) / 600;
            ctx.globalAlpha = 0.5 * (1 - p) ** 2;
            ctx.strokeStyle = glow;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            for (let i = 0; i <= 120; i += 1) {
                const point = lemniscate((i / 120) * TAU, size, mid);
                if (i === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            }
            ctx.stroke();
        }
        if (t >= COMET_END && t < LAND) {
            glyphs.forEach((glyph, index) => {
                const anchor = lemniscate(glyph.u, size, mid);
                const appear = easeOut(clamp((t - COMET_END - index * 25) / 260));
                const leave = GLYPH_FLY + index * GLYPH_STAGGER;
                const k = easeIn(clamp((t - leave) / GLYPH_DUR));
                if (k >= 1) {
                    if (!glyph.landed) {
                        glyph.landed = true;
                        ring(home, 22, 1.5, 0.8);
                        for (let i = 0; i < 4; i += 1) emitSpark(home, 0.08);
                    }
                    return;
                }
                const control = {
                    x: (anchor.x + home.x) / 2 + (home.y - anchor.y) * 0.4 * glyph.bend,
                    y: (anchor.y + home.y) / 2 + (anchor.x - home.x) * 0.4 * glyph.bend,
                };
                const at = curve(anchor, control, home, k);
                const radius = 9 * appear * (1 - 0.6 * k);
                const rotation = ((t - COMET_END) / 1000) * glyph.spin;
                bloom(at, 18 * appear, 0.25 * appear);
                loopGlyph(at, radius, rotation, appear, k > 0.4 ? glow : ink);
            });
        }

        for (let i = sparks.length - 1; i >= 0; i -= 1) {
            const spark = sparks[i];
            spark.age += dt;
            const life = spark.age / 650;
            if (life >= 1) {
                sparks.splice(i, 1);
                continue;
            }
            const from = { x: spark.x, y: spark.y };
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt + 0.00004 * spark.age * dt;
            streak(from, spark, 1.1, (1 - life) ** 2, t < END ? ink : orbitInk());
        }

        // 7. Landing.
        if (t >= LAND && t < END) {
            if (!landed) {
                landed = true;
                state.target += 360 * 2;
                void hapticSuccess();
                thump(0.6);
            }
            const ping = clamp((t - LAND) / 520);
            ring(home, 10 + 90 * easeOut(ping), 2.5 * (1 - ping), (1 - ping) ** 1.5);
            ring(home, 10 + 50 * easeOut(ping), 1.5 * (1 - ping), (1 - ping) ** 2, ink);
            bloom(home, 40 * (1 - ping) + 12, (1 - ping) * 0.7, ink);
        }

        if (t >= END && state.climax) {
            state.climax = false;
            state.orbiting = true;
        }

        // Afterloop: a small comet chases its tail round the button while the clicks keep coming.
        if (t >= END) {
            const idle = performance.now() - state.lastClick > ORBIT_IDLE;
            if (idle && !orbit.stopping) orbit.stopping = time;
            if (!idle) orbit.stopping = 0;
            orbit.fade = orbit.stopping ? 1 - clamp((time - orbit.stopping) / 450) : Math.min(1, orbit.fade + dt / 300);
            const heat = heatNow(state, performance.now());
            orbit.angle += (dt / 1000) * (5 + heat * 1.6);
            const radius = 23 + Math.sin(time / 180) * 1.2;
            const head = { x: home.x + Math.cos(orbit.angle) * radius, y: home.y + Math.sin(orbit.angle) * radius };
            const color = orbitInk();
            if (orbit.prev) streak(orbit.prev, head, 2.2, orbit.fade, color);
            ring(home, radius, 0.8, 0.12 * orbit.fade, color);
            orbit.prev = head;
            if (Math.random() < 0.25 * orbit.fade) emitSpark(head, 0.03);
            if (orbit.stopping && orbit.fade <= 0) {
                teardown();
                return;
            }
        }

        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}
