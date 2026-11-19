// Player bar icon motion.
//
// Click: each icon's parts play the button's verb once with SMIL (toggles redraw their strokes,
// actions act out what they do). Repeat is the exception: the whole icon spins, on request.
// Hover: the icon takes a held pose while the pointer is on it, through CSS transitions defined in
// player-refined.css (smooth and interruptible), and eases back when the pointer leaves. A click
// always wins: hover poses are switched off for the length of the click motion.
// The play/pause button is deliberately not handled here.
//
// The build (vite-plugin-svg-use, svgo) merges an icon's paths, so the parts can't be read from the
// shipped SVG. Each recipe stages its own copy of the source geometry, invisible at rest; it shows
// only while a motion or a hover pose is active, which leaves the resting icon untouched.
// Volume, repeat and save replace their SVG at runtime, so everything is built lazily on the SVG
// present at trigger time.

const NS = 'http://www.w3.org/2000/svg';
const OUT = '0.16 1 0.3 1';
const IN = '0.5 0 0.75 0';
const IN_OUT = '0.65 0 0.35 1';
const LINEAR = '0 0 1 1';
const POSE_RELEASE = 380;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const fineHover = matchMedia('(hover: hover) and (pointer: fine)');

const CANON = {
    arrowLeft: '<path class="m-bar" d="M3 19V5"/><g class="m-arrow"><path d="m13 6-6 6 6 6"/><path d="M7 12h14"/></g>',
    arrowRight:
        '<g class="m-arrow"><path d="M17 12H3"/><path d="m11 18 6-6-6-6"/></g><path class="m-bar" d="M21 5v14"/>',
    shuffle:
        '<path class="m-head m-head-low" d="m18 14 4 4-4 4"/><path class="m-head m-head-up" d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>',
    repeat: '<path class="m-head-top" d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path class="m-head-bottom" d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    repeatOne: '<path d="M11 10h1v4"/>',
    mic: '<g class="m-mic"><path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12"/><circle class="m-mic-head" cx="16" cy="7" r="5"/></g><path class="m-cable" d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5"/>',
    download:
        '<g class="m-arrow"><path d="M12 15V3"/><path d="m7 10 5 5 5-5"/></g><path class="m-tray" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    cast: '<path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><path class="m-wave-big" d="M2 12a9 9 0 0 1 8 8"/><path class="m-wave-small" d="M2 16a5 5 0 0 1 4 4"/><line class="m-dot" x1="2" x2="2.01" y1="20" y2="20"/>',
    queue: '<path class="m-line m-line-1" d="M16 5H3"/><path class="m-line m-line-2" d="M11 12H3"/><path class="m-line m-line-3" d="M11 19H3"/><g class="m-note"><path d="M21 16V5"/><circle class="m-note-head" cx="18" cy="16" r="3"/></g>',
    sleep: '<g class="m-moon"><path class="s-moon" d="M17.827 14.348a7.92 7.92 0 1 1-8.336-8.335c.356-.019.543.405.354.707a5.28 5.28 0 0 0 7.276 7.276c.303-.189.726-.004.707.353"/></g><path class="m-z-out" opacity="0" d="M16.5 3h4l-4 4h4"/><path class="m-z s-z" d="M16.5 3h4l-4 4h4"/>',
    equalizer: '<path class="m-eq" d="M4 18V13M4 9V4M12 18V10M12 6V4M20 18V15M20 11V4M2 13h4M10 6h4M18 15h4"/>',
    speaker:
        '<path class="m-speaker" d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>',
    waveNear: '<path class="m-wave-1" d="M16 9a5 5 0 0 1 0 6"/>',
    waveFar: '<path class="m-wave-2" d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
    cross: '<g class="m-cross"><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></g>',
    note: '<g class="m-note"><circle cx="10" cy="17" r="4"/><path class="m-stem" d="M12 3h6v4h-4v10h-2z"/></g>',
};

function node(tag, attrs = {}) {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    return element;
}

function stage(svg, markup) {
    const originals = [...svg.children];
    originals.forEach((part) => part.classList.add('motion-original'));
    const group = node('g', { class: 'motion-stage', opacity: '0' });
    group.innerHTML = markup;
    svg.append(group);
    svg.motionStage = { group, originals };
    return group;
}

const q = (group, selector) => group.querySelector(selector);

// Holds `from` until t0, eases to `to` by t1, holds after. Delays live in keyTimes so nothing
// flickers before its turn (beginElementAt would show the final state during the wait).
function segment(from, to, t0, t1) {
    const values = [];
    const times = [];
    if (t0 > 0) {
        values.push(from);
        times.push(0);
    }
    values.push(from, to);
    times.push(t0, t1);
    if (t1 < 1) {
        values.push(to);
        times.push(1);
    }
    return { values, times };
}

function add(target, { attr, type, values, times, dur, ease = OUT }) {
    const keyTimes = times ?? values.map((_, index) => index / (values.length - 1));
    const splines = Array.isArray(ease) ? ease : keyTimes.slice(1).map(() => ease);
    const animation = node(type ? 'animateTransform' : 'animate', {
        attributeName: type ? 'transform' : attr,
        values: values.join(';'),
        keyTimes: keyTimes.join(';'),
        calcMode: 'spline',
        keySplines: splines.join(';'),
        dur: `${dur}ms`,
        begin: 'indefinite',
        fill: 'remove',
    });
    if (type) animation.setAttribute('type', type);
    animation.dataset.motion = '';
    target.append(animation);
}

// A dash as long as the path, offset out of view, then brought back to 0. At rest (offset 0) the
// single dash covers the whole path.
function draw(path, { from = 'start', t0 = 0, t1 = 1, dur }) {
    const length = path.getTotalLength?.() || 24;
    path.setAttribute('stroke-dasharray', `${length} ${length + 2}`);
    const hidden = from === 'start' ? length + 1 : -(length + 1);
    add(path, { attr: 'stroke-dashoffset', dur, ...segment(String(hidden), '0', t0, t1) });
}

function arrive(part, { offset, t0, t1, dur }) {
    add(part, { type: 'translate', dur, ...segment(offset, '0 0', t0, t1) });
    add(part, { attr: 'opacity', dur, ...segment('0', '1', t0, t1) });
}

// Skip: the arrow strikes the bar, the bar flexes, a fresh arrow slides back in from the far edge.
function skip(direction) {
    return (svg) => {
        const group = stage(svg, direction < 0 ? CANON.arrowLeft : CANON.arrowRight);
        const rest = direction < 0 ? 'M3 19V5' : 'M21 5v14';
        const flexed = direction < 0 ? 'M3 20.5V3.5' : 'M21 3.5v17';
        add(q(group, '.m-arrow'), {
            type: 'translate',
            values: ['0 0', `${2.5 * direction} 0`, `${-16 * direction} 0`, '0 0'],
            times: [0, 0.3, 0.31, 1],
            ease: [IN, LINEAR, OUT],
            dur: 640,
        });
        add(q(group, '.m-bar'), {
            attr: 'd',
            values: [rest, rest, flexed, rest, rest],
            times: [0, 0.26, 0.34, 0.62, 1],
            ease: [LINEAR, OUT, IN_OUT, LINEAR],
            dur: 640,
        });
    };
}

// Shuffle: the two strands redraw from the left, crossing, and their arrowheads land last.
function shuffle(svg) {
    const [lowerHead, upperHead, crossing, upperStub, lowerStub] = stage(svg, CANON.shuffle).children;
    const dur = 820;
    draw(upperStub, { t1: 0.36, dur });
    draw(crossing, { t1: 0.62, dur });
    draw(lowerStub, { from: 'end', t0: 0.32, t1: 0.7, dur });
    arrive(upperHead, { offset: '-3 0', t0: 0.5, t1: 0.8, dur });
    arrive(lowerHead, { offset: '-3 0', t0: 0.6, t1: 0.92, dur });
}

// Repeat: no part motion on click, the whole icon spins (see SPIN). The stage carries the hover pose.
function repeat(svg) {
    const isOne = /11 10h1v4/.test(svg.innerHTML);
    stage(svg, CANON.repeat + (isOne ? CANON.repeatOne : ''));
}

// Lyrics: the mic tips toward the singer, the head pulses twice like two syllables, the cable follows.
function lyrics(svg) {
    const group = stage(svg, CANON.mic);
    const pivot = '7 17';
    add(q(group, '.m-mic'), {
        type: 'rotate',
        values: [`0 ${pivot}`, `-11 ${pivot}`, `4 ${pivot}`, `0 ${pivot}`],
        times: [0, 0.3, 0.62, 1],
        ease: [OUT, IN_OUT, IN_OUT],
        dur: 820,
    });
    add(q(group, '.m-mic-head'), {
        attr: 'r',
        values: ['5', '5.7', '5', '5.45', '5', '5'],
        times: [0, 0.18, 0.36, 0.52, 0.7, 1],
        ease: [OUT, IN_OUT, OUT, IN_OUT, LINEAR],
        dur: 820,
    });
    draw(q(group, '.m-cable'), { from: 'end', t0: 0.12, t1: 0.75, dur: 820 });
}

// Download: the arrow drops into the tray, the tray takes the weight, a new arrow comes down from above.
function download(svg) {
    const group = stage(svg, CANON.download);
    const rest = 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4';
    const loaded = 'M21 16.4v2.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.6';
    add(q(group, '.m-arrow'), {
        type: 'translate',
        values: ['0 0', '0 4', '0 -16', '0 0'],
        times: [0, 0.32, 0.33, 1],
        ease: [IN, LINEAR, OUT],
        dur: 760,
    });
    add(q(group, '.m-tray'), {
        attr: 'd',
        values: [rest, rest, loaded, rest, rest],
        times: [0, 0.24, 0.34, 0.6, 1],
        ease: [LINEAR, OUT, IN_OUT, LINEAR],
        dur: 760,
    });
}

// Cast: the two waves leave the source dot one after the other.
function cast(svg) {
    const group = stage(svg, CANON.cast);
    const dur = 820;
    add(q(group, '.m-dot'), {
        attr: 'stroke-width',
        values: ['2', '3.6', '2', '2'],
        times: [0, 0.16, 0.36, 1],
        ease: [OUT, IN_OUT, LINEAR],
        dur,
    });
    arrive(q(group, '.m-wave-small'), { offset: '-1.6 1.6', t0: 0.12, t1: 0.46, dur });
    arrive(q(group, '.m-wave-big'), { offset: '-2.4 2.4', t0: 0.32, t1: 0.74, dur });
}

// Queue: the list writes itself in, line by line, and the note lands on the last beat.
function queue(svg) {
    const group = stage(svg, CANON.queue);
    const dur = 760;
    [...group.querySelectorAll('.m-line')].forEach((line, index) => {
        draw(line, { from: 'end', t0: index * 0.14, t1: 0.42 + index * 0.14, dur });
    });
    add(q(group, '.m-note'), {
        type: 'translate',
        values: ['0 0', '0 -3.5', '0 0', '0 0'],
        times: [0, 0.3, 0.62, 1],
        ease: [OUT, IN, LINEAR],
        dur,
    });
    add(q(group, '.m-note-head'), {
        attr: 'r',
        values: ['3', '3', '3.7', '3', '3'],
        times: [0, 0.58, 0.68, 0.86, 1],
        ease: [LINEAR, OUT, IN_OUT, LINEAR],
        dur,
    });
}

// Sleep timer: the moon rocks like a cradle while its z drifts up and fades, then a fresh z writes
// itself back in, a slow breath out.
function sleep(svg) {
    const group = stage(svg, CANON.sleep);
    const dur = 1000;
    // No pivot in the values: the CSS transform-origin (10px 14px, set for the hover pose) also
    // applies to this transform attribute, and a second pivot would swing the moon out of the box.
    add(q(group, '.m-moon'), {
        type: 'rotate',
        values: ['0', '-16', '9', '-4', '0'],
        times: [0, 0.26, 0.54, 0.78, 1],
        ease: [OUT, IN_OUT, IN_OUT, IN_OUT],
        dur,
    });
    const leaving = q(group, '.m-z-out');
    add(leaving, { type: 'translate', dur, ...segment('0 0', '2.5 -5', 0, 0.48) });
    add(leaving, { attr: 'opacity', dur, ...segment('1', '0', 0.06, 0.48) });
    draw(q(group, '.m-z'), { t0: 0.46, t1: 0.92, dur });
}

// Equalizer: the three faders move to new levels and settle back, like a quick retune.
function equalizer(svg) {
    const group = stage(svg, CANON.equalizer);
    const faders = (a, b, c) =>
        `M4 18V${a}M4 ${a - 4}V4M12 18V${b + 4}M12 ${b}V4M20 18V${c}M20 ${c - 4}V4M2 ${a}h4M10 ${b}h4M18 ${c}h4`;
    const rest = faders(13, 6, 15);
    add(q(group, '.m-eq'), {
        attr: 'd',
        values: [rest, faders(9, 13, 9), faders(15, 8, 12), rest],
        times: [0, 0.34, 0.66, 1],
        ease: [OUT, IN_OUT, IN_OUT],
        dur: 900,
    });
}

// Track mix: the staged note is split into head and stem/flag (same union), so it can hop twice
// while the flag flaps on the landing.
function mix(svg) {
    const group = stage(svg, CANON.note);
    const rest = 'M12 3h6v4h-4v10h-2z';
    add(q(group, '.m-note'), {
        type: 'translate',
        values: ['0 0', '0 -3', '0 0', '0 -1.5', '0 0', '0 0'],
        times: [0, 0.22, 0.44, 0.62, 0.8, 1],
        ease: [OUT, IN, OUT, IN, LINEAR],
        dur: 720,
    });
    add(q(group, '.m-stem'), {
        attr: 'd',
        values: [rest, rest, 'M12 3h6v5.4h-4v8.6h-2z', rest, rest],
        times: [0, 0.4, 0.5, 0.7, 1],
        ease: [LINEAR, OUT, IN_OUT, LINEAR],
        dur: 720,
    });
}

function volumeState(svg) {
    const markup = svg.innerHTML;
    if (/M22 9|x1="22"/.test(markup)) return 'mute';
    return markup.includes('19.364') ? 'high' : 'low';
}

// Volume has three icons (mute, low, high) chosen by the level. The new icon animates the change it
// represents: waves arrive from the cone, the far wave joins the near one, the cross strikes in.
function volume(svg) {
    const state = volumeState(svg);
    const from = svg.parentElement?.dataset.volumeFrom || '';
    const waves = state === 'high' ? CANON.waveNear + CANON.waveFar : state === 'low' ? CANON.waveNear : '';
    const group = stage(svg, CANON.speaker + (state === 'mute' ? CANON.cross : waves));
    add(q(group, '.m-speaker'), {
        type: 'translate',
        values: ['0 0', '-0.9 0', '0 0', '0 0'],
        times: [0, 0.14, 0.4, 1],
        ease: [OUT, IN_OUT, LINEAR],
        dur: 680,
    });
    if (state === 'mute') {
        const [first, second] = group.querySelectorAll('line');
        draw(first, { t0: 0.1, t1: 0.46, dur: 620 });
        draw(second, { t0: 0.36, t1: 0.76, dur: 620 });
        return;
    }
    const near = q(group, '.m-wave-1');
    const far = q(group, '.m-wave-2');
    if (state === 'high' && from === 'low') {
        arrive(far, { offset: '-2.4 0', t0: 0.12, t1: 0.6, dur: 680 });
        return;
    }
    if (state === 'low' && from === 'high') {
        add(near, { attr: 'opacity', values: ['1', '0.35', '1'], times: [0, 0.3, 1], ease: [OUT, IN_OUT], dur: 520 });
        return;
    }
    arrive(near, { offset: '-1.6 0', t0: 0.12, t1: 0.48, dur: 680 });
    if (far) arrive(far, { offset: '-2.4 0', t0: 0.3, t1: 0.74, dur: 680 });
}

// Save: the click morph (plus to check, confetti) belongs to track-save-ui.js and is shared with the
// whole app; only the hover pose (CSS) applies here, so nothing is staged.
function save() {}

const SPIN = { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' };

const RECIPES = [
    ['#prev-btn', { build: skip(-1) }],
    ['#next-btn', { build: skip(1) }],
    ['#shuffle-btn', { build: shuffle }],
    ['#repeat-btn', { build: repeat, spin: true }],
    ['#toggle-lyrics-btn', { build: lyrics }],
    ['#download-current-btn', { build: download }],
    ['#cast-btn', { build: cast }],
    ['#queue-btn', { build: queue }],
    ['#sleep-timer-btn', { build: sleep }],
    ['#sleep-timer-btn-desktop', { build: sleep }],
    ['#equalizer-player-btn', { build: equalizer }],
    ['#now-playing-mix-btn', { build: mix }],
    ['#compact-mix-btn', { build: mix }],
    ['#volume-btn', { build: volume, replayOnSwap: true }],
    ['#now-playing-like-btn', { build: save }],
];

const iconOf = (button) => button.querySelector(':scope > svg');

function prepare(svg, recipe) {
    if (svg.dataset.motionReady) return;
    svg.dataset.motionReady = 'true';
    recipe.build(svg);
}

function markClicking(button, duration) {
    clearTimeout(button.motionClickTimer);
    button.classList.add('is-clicking');
    button.motionClickTimer = setTimeout(() => button.classList.remove('is-clicking'), duration);
}

function spin(button, svg, from = 0) {
    const animation = svg.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], SPIN);
    animation.currentTime = from;
    button.motionSpin = animation;
    markClicking(button, SPIN.duration - from);
}

function playClick(button, recipe) {
    if (reduceMotion.matches || button.disabled) return;
    const svg = iconOf(button);
    if (!svg) return;
    prepare(svg, recipe);
    if (recipe.spin) {
        spin(button, svg);
        return;
    }
    const animations = [...svg.querySelectorAll('[data-motion]')];
    if (!animations.length) return;
    const longest = Math.max(...animations.map((animation) => parseFloat(animation.getAttribute('dur'))));
    const { group, originals } = svg.motionStage ?? {};
    if (group && !svg.motionSwapReady) {
        svg.motionSwapReady = true;
        add(group, { attr: 'opacity', values: ['1', '1'], ease: LINEAR, dur: longest });
        originals.forEach((part) => add(part, { attr: 'opacity', values: ['0', '0'], ease: LINEAR, dur: longest }));
    }
    markClicking(button, longest);
    svg.querySelectorAll('[data-motion]').forEach((animation) => animation.beginElement?.());
}

function pose(button, recipe, on) {
    clearTimeout(button.motionPoseTimer);
    if (on) {
        const svg = iconOf(button);
        if (svg) prepare(svg, recipe);
        button.classList.add('is-staged', 'is-posed');
        return;
    }
    button.classList.remove('is-posed');
    // Keep the staged copy visible until it has eased back to rest.
    button.motionPoseTimer = setTimeout(() => button.classList.remove('is-staged'), POSE_RELEASE);
}

export function initPlayerIconMotion(bar) {
    if (!bar) return;
    for (const [selector, recipe] of RECIPES) {
        const button = bar.querySelector(selector);
        if (!button || button.dataset.iconMotion !== undefined) continue;
        button.dataset.iconMotion = '';
        button.addEventListener('pointerenter', (event) => {
            if (event.pointerType === 'mouse' && fineHover.matches && !reduceMotion.matches && !button.disabled) {
                pose(button, recipe, true);
            }
        });
        button.addEventListener('pointerleave', () => pose(button, recipe, false));
        button.addEventListener('click', () => {
            if (!recipe.replayOnSwap) playClick(button, recipe);
        });
        // Volume, repeat and save replace their SVG; keep the motion going on the new icon.
        new MutationObserver((mutations) => {
            const replaced = mutations.some((mutation) =>
                [...mutation.removedNodes].some((removed) => removed.nodeName.toLowerCase() === 'svg')
            );
            if (!replaced) return;
            const svg = iconOf(button);
            if (svg && button.classList.contains('is-staged')) prepare(svg, recipe);
            const running = button.motionSpin;
            if (recipe.spin && svg && running?.playState === 'running') {
                const elapsed = Number(running.currentTime) || 0;
                running.cancel();
                if (!reduceMotion.matches) spin(button, svg, elapsed);
                return;
            }
            if (recipe.replayOnSwap) playClick(button, recipe);
        }).observe(button, { childList: true });
    }
}
