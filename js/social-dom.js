// js/social-dom.js — DOM helpers shared by the social surfaces: keyed patching
// (live re-renders never restart a spinning deck or replay an entrance), cover
// colors read from the artwork, and real track waveforms cached per track.

import { getVibrantColorFromImage, hslToHex, rgbToHsl } from './vibrant-color.js';
import { waveformGenerator } from './waveform.js';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A one-shot class that replays its animation even when it is already set. */
export function pulse(element, className) {
    if (!element || reducedMotion()) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    element.addEventListener('animationend', () => element.classList.remove(className), { once: true });
}

const htmlOf = new WeakMap();
const template = document.createElement('template');

/**
 * Bring `container`'s children in line with `items` ([{ key, html }]). Unchanged
 * nodes stay in place, changed ones are swapped, moved ones glide from where they
 * were, and new ones get `is-entering` when `animateNew` is set. Returns the new
 * keys' nodes (`created`) and every freshly built node (`fresh`).
 */
export function patchKeyed(container, items, { animateNew = false, flip = true } = {}) {
    if (!container) return { created: [], fresh: [] };
    const existing = new Map();
    for (const child of [...container.children]) {
        if (child.dataset.key) existing.set(child.dataset.key, child);
        else child.remove();
    }
    const before = new Map();
    if (flip && !reducedMotion()) {
        for (const [key, node] of existing) before.set(key, node.getBoundingClientRect());
    }

    const created = [];
    const fresh = [];
    items.forEach(({ key, html }, index) => {
        let node = existing.get(key);
        existing.delete(key);
        if (!node || htmlOf.get(node) !== html) {
            template.innerHTML = html.trim();
            const built = template.content.firstElementChild;
            built.dataset.key = key;
            htmlOf.set(built, html);
            if (node) node.replaceWith(built);
            else created.push(built);
            fresh.push(built);
            node = built;
        }
        const at = container.children[index];
        if (at !== node) container.insertBefore(node, at || null);
    });
    existing.forEach((node) => node.remove());

    for (const [key, rect] of before) {
        const node = container.querySelector(`:scope > [data-key="${CSS.escape(key)}"]`);
        if (!node) continue;
        const now = node.getBoundingClientRect();
        const dx = rect.left - now.left;
        const dy = rect.top - now.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
            duration: 420,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        });
    }
    if (animateNew && !reducedMotion()) {
        for (const node of created) {
            node.classList.add('is-entering');
            node.addEventListener('animationend', () => node.classList.remove('is-entering'), { once: true });
        }
    }
    return { created, fresh };
}

/* --------------------------------- colors --------------------------------- */

const colors = new Map();

/** Read the cover's vibrant color once per image URL and hand it to `apply`. */
export function coverColor(img, apply) {
    if (!img) return;
    const read = () => {
        let color = colors.get(img.src);
        if (color === undefined) {
            try {
                color = getVibrantColorFromImage(img);
            } catch {
                color = null; // Remote artwork may refuse canvas access.
            }
            if (colors.size >= 96) colors.delete(colors.keys().next().value);
            colors.set(img.src, color);
        }
        if (color) apply(color);
    };
    if (img.complete && img.naturalWidth) read();
    else img.addEventListener('load', read, { once: true });
}

/** Paint every `img[data-tint]` color onto its closest `[data-tint-target]`. */
export function applyTints(root) {
    root?.querySelectorAll('img[data-tint]').forEach((img) => {
        const target = img.closest('[data-tint-target]');
        if (target) coverColor(img, (color) => target.style.setProperty('--tint', color));
    });
}

function shiftColor(hex, { hue = 0, minLight = 0, lift = 0 } = {}) {
    const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
    if (!match) return hex;
    const [h, s, l] = rgbToHsl(...match.slice(1).map((part) => parseInt(part, 16)));
    return hslToHex((h + hue) % 1, s, Math.min(0.78, Math.max(minLight, l + lift)));
}

/** A neighbouring hue so a waveform can travel across the cover's palette. */
export function companionColor(hex) {
    return shiftColor(hex, { hue: 0.09, lift: 0.12 });
}

/* -------------------------------- waveforms -------------------------------- */

const PEAK_BARS = 180;
const peakJobs = new Map();
let peakQueue = Promise.resolve();

function readStoredPeaks(trackId) {
    try {
        const stored = JSON.parse(localStorage.getItem(`monochrome-social-peaks:${trackId}`) || 'null');
        if (Array.isArray(stored?.p)) return { peaks: stored.p.map((value) => value / 255), duration: stored.d };
    } catch {
        /* Storage may be unavailable; decode again instead. */
    }
    return null;
}

function downsample(peaks, bars) {
    const out = [];
    const step = peaks.length / bars;
    for (let i = 0; i < bars; i++) {
        let max = 0;
        for (let j = Math.floor(i * step); j < Math.min(peaks.length, Math.floor((i + 1) * step)); j++) {
            max = Math.max(max, peaks[j]);
        }
        out.push(max);
    }
    return out;
}

/**
 * Real peaks for a library track, decoded once and kept in localStorage. Decodes
 * run one at a time because each one downloads and decodes the whole file.
 */
export function trackPeaks(trackId, resolveTrack) {
    if (!trackId) return Promise.resolve(null);
    const stored = readStoredPeaks(trackId);
    if (stored) return Promise.resolve(stored);
    if (peakJobs.has(trackId)) return peakJobs.get(trackId);
    const job = peakQueue.then(async () => {
        const meta = await resolveTrack(trackId).catch(() => null);
        if (!meta?.serverAudioUrl) return null;
        const result = await waveformGenerator.getWaveform(meta.serverAudioUrl, trackId);
        if (!result?.peaks?.length) return null;
        const peaks = downsample(Array.from(result.peaks), PEAK_BARS);
        const duration = Number(meta.duration) || result.duration || 0;
        try {
            localStorage.setItem(
                `monochrome-social-peaks:${trackId}`,
                JSON.stringify({ p: peaks.map((value) => Math.round(value * 255)), d: duration })
            );
        } catch {
            /* Full storage only costs a re-decode next time. */
        }
        return { peaks, duration };
    });
    peakQueue = job.catch(() => null);
    peakJobs.set(trackId, job);
    job.catch(() => peakJobs.delete(trackId));
    return job;
}

/**
 * Draw mirrored bars across the canvas. Bars before `progress` (0–1) are lit;
 * a `range` ({ from, to } in 0–1) lights only that slice, like a snippet cue.
 */
export function drawWave(canvas, peaks, { color = '#f5f5f5', progress = 1, range = null } = {}) {
    if (!canvas || !peaks?.length) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Deep cover colors (a navy sky, a black sleeve) still have to read on the dark ground.
    const base = shiftColor(color, { minLight: 0.56 });
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, base);
    gradient.addColorStop(1, companionColor(base));
    const bar = width > 420 ? 2 : 1.5;
    const gap = width > 420 ? 1.6 : 1.2;
    const count = Math.max(8, Math.floor(width / (bar + gap)));
    const sampled = downsample(peaks, Math.min(count, peaks.length));
    // Stretch the track's own dynamic range so loud masters keep their shape.
    const sorted = [...sampled].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.08)] || 0;
    const ceiling = sorted.at(-1) || 1;
    const span = Math.max(0.05, ceiling - floor);
    const pitch = width / sampled.length;
    const middle = height / 2;
    sampled.forEach((peak, index) => {
        const x = index * pitch;
        const position = (index + 0.5) / sampled.length;
        const lit = range ? position >= range.from && position <= range.to : position <= progress;
        const level = 0.12 + 0.88 * Math.pow(Math.max(0, (peak - floor) / span), 1.4);
        const h = Math.max(1.5, level * height * 0.94);
        ctx.globalAlpha = lit ? 1 : range ? 0.28 : 0.5;
        ctx.fillStyle = gradient;
        ctx.fillRect(x, middle - h / 2, bar, h);
    });
    ctx.globalAlpha = 1;
}
