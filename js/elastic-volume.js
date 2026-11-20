// Elastic volume slider, ported from the React Bits ElasticSlider physics: three critically tuned
// springs drive the fill position, the overdrag stretch and the hover/drag "active" state, integrated
// at 240 Hz substeps. Constants are the component's defaults (maxStretch 50, bounce 0.5, thickness
// 6 -> 12, rest opacity 0.7) so the release wobble matches the original.
//
// Departure from the original: the icons beside the bar don't track the stretch 1:1, they follow it
// through a fourth, critically damped spring so the push reads smooth; the whole icon row moves with
// the volume icon so nothing overlaps while the bar stretches left.
//
// The bar itself is the track: it gets scaled along/across like the original track element, so the
// pointer maths uses the untransformed geometry (clientWidth + the fixed edge of the scale origin).

const TAU = Math.PI * 2;
const MAX_STRETCH = 50;
const BOUNCE = 0.5;
const THICKNESS = 6;
const ACTIVE_THICKNESS = 12;
const REST_OPACITY = 0.7;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const rubber = (distance, limit) => 2 * (1 / (1 + Math.exp(-distance / limit)) - 0.5) * limit;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function createElasticVolume({ bar, fill, input, startIcon, pushed = [], onInput, onChangeEnd }) {
    const m = {
        p: 0,
        vp: 0,
        target: 0,
        s: 0,
        vs: 0,
        side: 1,
        held: false,
        a: 0,
        va: 0,
        goal: 0,
        shift: 0,
        vshift: 0,
        length: bar.clientWidth || 1,
        dragging: false,
        hovered: false,
        focused: false,
        raf: 0,
        last: 0,
    };
    let drag = null;
    let wasMax = false;

    const paint = () => {
        const thick = THICKNESS + (ACTIVE_THICKNESS - THICKNESS) * m.a;
        bar.style.height = `${thick.toFixed(2)}px`;
        const length = Math.max(1, m.length);
        const along = 1 + m.s / length;
        const across = 1 - 0.22 * clamp(m.s / MAX_STRETCH, -1, 1);
        const atEnd = m.side > 0;
        bar.style.transformOrigin = atEnd ? '0% 50%' : '100% 50%';
        bar.style.transform = `scale(${along.toFixed(4)}, ${across.toFixed(4)})`;
        fill.style.width = `${(clamp(m.p, 0, 1) * 100).toFixed(3)}%`;
        bar.style.opacity = (REST_OPACITY + (1 - REST_OPACITY) * m.a).toFixed(3);
        const offset = `translate3d(${(-m.shift).toFixed(2)}px, 0, 0)`;
        if (startIcon) startIcon.style.transform = `${offset} scale(${(1 + 0.08 * m.a).toFixed(3)})`;
        for (const element of pushed) element.style.transform = offset;
    };

    const frame = (now) => {
        m.raf = 0;
        const elapsed = clamp((now - m.last) / 1000, 0, 1 / 20);
        m.last = now;
        if (reduceMotion.matches) {
            m.p = m.target;
            m.vp = 0;
            if (!m.held) {
                m.s = 0;
                m.vs = 0;
            }
            m.a = m.goal;
            m.va = 0;
            m.shift = 0;
            m.vshift = 0;
        } else {
            const steps = Math.max(1, Math.ceil(elapsed / (1 / 240)));
            const dt = elapsed / steps;
            const fillOmega = TAU / (m.dragging ? 0.09 : 0.3);
            const fillZeta = m.dragging ? 1 : 0.86;
            const stretchOmega = TAU / 0.42;
            const stretchZeta = 1 - 0.9 * BOUNCE;
            const activeOmega = TAU / 0.32;
            const shiftOmega = TAU / 0.22;
            const shiftGoal = m.side > 0 ? 0 : Math.max(0, m.s);
            for (let i = 0; i < steps; i++) {
                m.vshift += (-shiftOmega * shiftOmega * (m.shift - shiftGoal) - 2 * shiftOmega * m.vshift) * dt;
                m.shift += m.vshift * dt;
                m.vp += (-fillOmega * fillOmega * (m.p - m.target) - 2 * fillZeta * fillOmega * m.vp) * dt;
                m.p += m.vp * dt;
                if (!m.held) {
                    m.vs += (-stretchOmega * stretchOmega * m.s - 2 * stretchZeta * stretchOmega * m.vs) * dt;
                    m.s += m.vs * dt;
                }
                m.va += (-activeOmega * activeOmega * (m.a - m.goal) - 2 * 0.9 * activeOmega * m.va) * dt;
                m.a += m.va * dt;
            }
        }
        const settled =
            Math.abs(m.p - m.target) < 0.0004 &&
            Math.abs(m.vp) < 0.002 &&
            (m.held || (Math.abs(m.s) < 0.05 && Math.abs(m.vs) < 0.5)) &&
            Math.abs(m.a - m.goal) < 0.002 &&
            Math.abs(m.va) < 0.005 &&
            Math.abs(m.shift) < 0.05 &&
            Math.abs(m.vshift) < 0.5;
        if (settled) {
            m.p = m.target;
            m.vp = 0;
            m.a = m.goal;
            m.va = 0;
            if (!m.held) {
                m.s = 0;
                m.vs = 0;
            }
            if (Math.abs(m.shift) < 0.05) {
                m.shift = 0;
                m.vshift = 0;
            }
        }
        paint();
        if (!settled || m.dragging) m.raf = requestAnimationFrame(frame);
    };

    const kick = () => {
        if (m.raf) return;
        m.last = performance.now();
        m.raf = requestAnimationFrame(frame);
    };

    const refreshGoal = () => {
        m.goal = m.hovered || m.dragging || m.focused ? 1 : 0;
        kick();
    };

    const pulse = (side) => {
        if (side > 0 || reduceMotion.matches) return;
        startIcon?.firstElementChild?.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
            { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        );
    };

    // Reaching 100% gets its own small moment: a sheen runs across the fill once.
    const celebrateMax = (fraction) => {
        const isMax = fraction >= 1;
        if (isMax && !wasMax && !reduceMotion.matches) {
            bar.classList.remove('is-maxed');
            void bar.offsetWidth;
            bar.classList.add('is-maxed');
        }
        wasMax = isMax;
    };

    const bump = (side) => {
        if (m.held || Math.abs(m.vs) > 40 || Math.abs(m.s) > 2) return;
        m.side = side;
        m.vs = MAX_STRETCH * 5.5;
        pulse(side);
        kick();
    };

    const commit = (fraction) => {
        m.target = fraction;
        kick();
        celebrateMax(fraction);
        input.value = String(Math.round(fraction * 100));
        onInput(fraction);
    };

    // The bar is scaled from one edge, so that edge stays where layout put it.
    const along = (event) => {
        const rect = bar.getBoundingClientRect();
        const left = m.side > 0 ? rect.left : rect.right - m.length;
        return event.clientX - left;
    };

    const follow = (event) => {
        const length = Math.max(1, m.length);
        const fraction = along(event) / length;
        const over = fraction < 0 ? -fraction * length : fraction > 1 ? (fraction - 1) * length : 0;
        if (over > 0) {
            const side = fraction < 0 ? -1 : 1;
            if (!m.held || m.side !== side) pulse(side);
            m.held = true;
            m.side = side;
            m.s = rubber(over, MAX_STRETCH);
            m.vs = 0;
        } else if (m.held) {
            m.held = false;
        }
        commit(clamp(fraction, 0, 1));
    };

    const release = () => {
        if (!drag) return;
        drag = null;
        m.dragging = false;
        m.held = false;
        bar.removeAttribute('data-dragging');
        refreshGoal();
        onChangeEnd?.(m.target);
    };

    bar.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        bar.setPointerCapture(event.pointerId);
        drag = { id: event.pointerId };
        m.dragging = true;
        bar.setAttribute('data-dragging', '');
        refreshGoal();
        commit(clamp(along(event) / Math.max(1, m.length), 0, 1));
    });
    bar.addEventListener('pointermove', (event) => {
        if (drag?.id === event.pointerId) follow(event);
    });
    bar.addEventListener('pointerup', (event) => {
        event.stopPropagation();
        release();
    });
    bar.addEventListener('pointercancel', release);
    bar.addEventListener('lostpointercapture', release);
    bar.addEventListener('click', (event) => event.stopPropagation());
    bar.addEventListener('pointerenter', () => {
        m.hovered = true;
        refreshGoal();
    });
    bar.addEventListener('pointerleave', () => {
        m.hovered = false;
        refreshGoal();
    });

    input.addEventListener('input', () => commit(Number(input.value) / 100));
    input.addEventListener('change', () => onChangeEnd?.(m.target));
    input.addEventListener('keydown', (event) => {
        const atMax = Number(input.value) >= 100;
        const atMin = Number(input.value) <= 0;
        if ((event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'End') && atMax) bump(1);
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'Home') && atMin) bump(-1);
    });
    input.addEventListener('focus', () => {
        m.focused = input.matches(':focus-visible');
        refreshGoal();
    });
    input.addEventListener('blur', () => {
        m.focused = false;
        refreshGoal();
    });
    bar.addEventListener('animationend', (event) => {
        if (event.animationName === 'volume-max-sheen') bar.classList.remove('is-maxed');
    });

    new ResizeObserver(() => {
        m.length = bar.clientWidth || 1;
        paint();
    }).observe(bar);

    return {
        // External changes (mute, keyboard shortcuts, restored volume) glide with the idle fill spring.
        sync(fraction) {
            if (m.dragging) return;
            const next = clamp(fraction, 0, 1);
            if (Math.abs(next - m.target) < 0.0001) return;
            m.target = next;
            input.value = String(Math.round(next * 100));
            kick();
        },
        jump(fraction) {
            m.p = m.target = clamp(fraction, 0, 1);
            wasMax = m.p >= 1;
            input.value = String(Math.round(m.p * 100));
            paint();
        },
    };
}
