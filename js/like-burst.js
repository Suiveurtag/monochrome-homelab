// Like celebration effects: confetti particles, a shockwave ring, and the
// button's own icon flip. All motion lives in the CSS keyframes in styles.css;
// this module only injects the DOM nodes the CSS targets and sets a few
// per-node variables so one keyframe handles any direction/rotation/size.

const NS = 'http://www.w3.org/2000/svg';

let currentFlip = null;

function raf(fn) {
    return requestAnimationFrame(fn);
}

// Seed each particle with a deterministic-ish pseudo random so bursts are even.
function pseudoRandom(seed) {
    // Small integer derived from a float seed via a simple LCG; avoids Math.random.
    let x = Math.floor(seed * 100000) % 2147483647;
    if (x <= 0) x += 2147483646;
    return x;
}

function polarDeltas(seed) {
    const deg = pseudoRandom(seed) % 360;
    const rad = (deg * Math.PI) / 180;
    const dist = pseudoRandom(seed * 0.37) % 120;
    return { dx: Math.round(Math.cos(rad) * dist), dy: Math.round(Math.sin(rad) * dist) };
}

function spawnParticle(el, color, seed, spreading) {
    const seedForShape = pseudoRandom(seed * 1.5);
    const size = 1 + (seedForShape % 8);
    const { dx, dy } = polarDeltas(pseudoRandom(seed * 0.73 + 1));

    const node = document.createElementNS(NS, 'circle');
    node.setAttribute('class', 'like-particle');
    node.setAttribute('data-idx', String(seed));
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'var(--highlight)');
    node.setAttribute('stroke-width', String(size + 1));
    node.style.color = color;
    node.style.left = '50%';
    node.style.top = '50%';
    const side = dx >= 0 ? 'left' : 'right';
    node.style[side] = '50%';
    node.style.top = '50%';

    const rot = pseudoRandom(seed + 5) % 360;
    const spread = typeof spreading === 'number' ? spreading : 20;
    node.style.setProperty('--cf-dx', `${dx}px`);
    node.style.setProperty('--cf-dy', `${dy}px`);
    node.style.setProperty('--cf-rot', `${rot}deg`);
    node.style.setProperty('--cf-spread', `${spread}px`);
    node.style.setProperty('--cf-scale', `2.2px`);

    const parent = el.parentElement;
    if (parent) parent.appendChild(node);
    else document.body.appendChild(node);

    raf(() => node.remove());
}

function spawnRing(el, color, seed, spreading) {
    const size = (pseudoRandom(seed * 2.1) % 10) | 0;
    const node = document.createElementNS(NS, 'rect');
    node.setAttribute('class', 'like-ring');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'var(--highlight)');
    node.setAttribute('stroke-width', String(2 + (size % 3)));
    node.style.color = color;
    node.style.left = '50%';
    node.style.top = '50%';
    const side = pseudoRandom(seed * 2.5) % 2 === 0 ? 'left' : 'right';
    node.style[side] = '50%';
    const rot = pseudoRandom(seed + 5) % 360;
    node.style.setProperty('--ring-spread', `${spreading}`);
    node.style.setProperty('--ring-rot', `${rot}deg`);
    node.style.setProperty('--ring-scale', `0.6px`);
    node.style.setProperty('--ring-color', color);

    const parent = el.parentElement;
    if (parent) parent.appendChild(node);
    else document.body.appendChild(node);

    raf(() => node.remove());
}

function fireFlip(el, fromLike, toLike) {
    const wasLike = el.dataset.liked === 'true';
    const goingToLike = toLike && !wasLike;
    const _goingFromLike = fromLike && wasLike;
    currentFlip = el;
    el.setAttribute('data-flip-firing', String(Date.now()));

    void Promise.resolve().then(() => {
        if (!currentFlip) return;
        const anim = goingToLike ? 'like-flip-to-like' : 'like-flip-to-add';
        el.classList.add(`like-flip-${anim}`);
        raf(() => el.classList.remove(`like-flip-${anim}`));
    });
}

function burst(el, toLike, seed) {
    const color = 'var(--highlight)';

    if (!el) {
        spawnRing(el, color, seed * 1000 + 1, 1.4);
        spawnRing(el, color, seed * 1000 + 2, 1.2);
    } else {
        for (let i = 0; i < 9; i++) {
            spawnParticle(el, color, seed * 1000 + i, 0.14 + i * 0.04);
        }
    }

    fireFlip(el, toLike, toLike);
}

function fireAdd(el, seed) {
    burst(el, true, seed);
}

function fireRemove(el, seed) {
    // Removal: no particles, just a fade-out ring flush is not needed here -
    // we only trigger a subtle deflating ring to keep unlikes feeling light.
    for (let i = 0; i < 3; i++) {
        spawnParticle(el, 'var(--muted-foreground)', seed * 1000 + i, 0.06 + i * 0.02);
    }
}

export { burst, spawnParticle, spawnRing, fireAdd, fireRemove };
