// js/queue-add-animation.js — Spotify-style queue add animation
// Track slides right revealing theme-colored bg with queue icon morphing into checkmark, then slides back.
// Smooth, transform/opacity only, respects prefers-reduced-motion.

const QUEUE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 5H3"/><path d="M11 12H3"/><path d="M16 19H3"/><path d="M18 9v6"/><path d="M21 12h-6"/></svg>`;
const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

const MORPH_DELAY_MS = 360;
const HOLD_MS = 420;
const CLEANUP_DELAY_MS = 1220;

function isReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function isTransparentColor(c) {
    return !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
}

function flashFallback(el) {
    const prevBg = el.style.backgroundColor;
    const prevTransition = el.style.transition;
    el.style.transition = 'background-color 300ms ease';
    el.style.backgroundColor = 'rgb(var(--highlight-rgb) / 0.18)';
    setTimeout(() => {
        el.style.backgroundColor = prevBg;
        setTimeout(() => {
            el.style.transition = prevTransition;
        }, 320);
    }, 420);
}

/**
 * Animate a single .track-item element.
 * @param {HTMLElement} trackEl
 */
export function animateSingleTrackEl(trackEl) {
    if (!trackEl || !(trackEl instanceof HTMLElement)) return;
    if (trackEl.classList.contains('queue-animating')) return;
    if (trackEl.classList.contains('blocked') || trackEl.classList.contains('unavailable')) return;

    if (isReducedMotion()) {
        flashFallback(trackEl);
        return;
    }

    // Ensure element is still in DOM
    if (!trackEl.isConnected) return;

    const computed = getComputedStyle(trackEl);
    const gridCols = computed.gridTemplateColumns;
    const gap = computed.gap;
    const padding = computed.padding;
    const originalBg = computed.backgroundColor;
    const originalBorderRadius = computed.borderRadius;

    let parentBg = '';
    if (trackEl.parentElement) {
        try {
            parentBg = getComputedStyle(trackEl.parentElement).backgroundColor;
        } catch {
            parentBg = '';
        }
    }

    const bg = document.createElement('div');
    bg.className = 'track-queue-bg';
    bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = `<div class="track-queue-bg__icon-wrap"><span class="track-queue-bg__icon track-queue-bg__icon--queue">${QUEUE_SVG}</span><span class="track-queue-bg__icon track-queue-bg__icon--check">${CHECK_SVG}</span></div>`;

    const fg = document.createElement('div');
    fg.className = 'track-queue-foreground';

    // Move all existing children into foreground wrapper
    while (trackEl.firstChild) {
        fg.appendChild(trackEl.firstChild);
    }

    trackEl.classList.add('queue-animating');
    // Keep original border-radius on trackEl for overflow clipping, CSS handles rest via class
    if (originalBorderRadius && originalBorderRadius !== '0px') {
        trackEl.style.borderRadius = originalBorderRadius;
    }

    trackEl.appendChild(bg);
    trackEl.appendChild(fg);

    // Replicate grid layout onto foreground
    // gridTemplateColumns may be 'none' if not grid (unlikely), fallback to computed via inline style
    if (gridCols && gridCols !== 'none') {
        fg.style.gridTemplateColumns = gridCols;
    } else {
        // Fallback: let CSS handle, but explicitly set common variant if we can detect class
        if (trackEl.classList.contains('track-item--inline-like')) {
            fg.style.gridTemplateColumns = '40px 1fr auto 3.25rem auto';
        } else if (trackEl.classList.contains('collection-track-item')) {
            fg.style.gridTemplateColumns = '';
        }
    }
    fg.style.gap = gap;
    fg.style.padding = padding;
    fg.style.borderRadius = originalBorderRadius || 'var(--radius-sm)';

    // Background for foreground to fully cover highlight behind when at 0
    // Prefer originalBg if opaque and not playing (playing handled by CSS), otherwise parentBg, otherwise var(--background)
    let fgBg = '';
    if (!isTransparentColor(originalBg) && !trackEl.classList.contains('playing')) {
        // originalBg may be rgb(...) opaque; use it
        fgBg = originalBg;
    } else if (!isTransparentColor(parentBg) && !trackEl.classList.contains('playing')) {
        fgBg = parentBg;
    } else if (trackEl.classList.contains('playing')) {
        // Let CSS .playing rule paint foreground; keep inline empty so CSS wins
        fgBg = '';
    } else {
        fgBg = 'var(--background)';
    }
    if (fgBg) fg.style.background = fgBg;
    // Ensure foreground covers full width
    fg.style.width = '100%';
    fg.style.boxSizing = 'border-box';

    // Force reflow before starting transition
    void fg.offsetWidth;

    let cleaned = false;
    let safetyTimer = null;

    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        trackEl.classList.remove('is-slid', 'is-morphed', 'queue-animating');
        trackEl.style.borderRadius = '';
        // Move children back out of foreground
        if (fg.parentNode === trackEl) {
            while (fg.firstChild) {
                trackEl.appendChild(fg.firstChild);
            }
            fg.remove();
        }
        if (bg.parentNode === trackEl) bg.remove();
    };

    safetyTimer = setTimeout(cleanup, CLEANUP_DELAY_MS + 300);

    // Timeline: slide out → morph → slide back → cleanup
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (cleaned) return;
            trackEl.classList.add('is-slid');
        });
    });

    const morphTimer = setTimeout(() => {
        if (cleaned) return;
        trackEl.classList.add('is-morphed');
    }, MORPH_DELAY_MS);

    const slideBackTimer = setTimeout(() => {
        if (cleaned) return;
        trackEl.classList.remove('is-slid');
    }, MORPH_DELAY_MS + HOLD_MS);

    const cleanupTimer = setTimeout(() => {
        if (cleaned) return;
        cleanup();
    }, CLEANUP_DELAY_MS);

    // If element removed from DOM prematurely, cleanup listeners
    const observer = new MutationObserver(() => {
        if (!trackEl.isConnected) {
            clearTimeout(morphTimer);
            clearTimeout(slideBackTimer);
            clearTimeout(cleanupTimer);
            observer.disconnect();
            // Don't try to restore if detached; just remove nodes if still present
            try {
                cleanup();
            } catch {}
        }
    });
    try {
        observer.observe(document.body, { childList: true, subtree: true });
        // Stop observing after animation
        setTimeout(() => observer.disconnect(), CLEANUP_DELAY_MS + 500);
    } catch {
        // MutationObserver may fail in some test envs
    }

    // Haptic tick on morph for mobile
    setTimeout(() => {
        try {
            import('./haptics.js').then(({ hapticLight }) => hapticLight?.()).catch(() => {});
        } catch {}
    }, MORPH_DELAY_MS + 40);
}

/**
 * Find and animate visible track-items for given track id(s).
 * @param {string|number|Array<string|number>|object|Array<object>} trackOrIds
 * @param {{ sourceElement?: HTMLElement, limit?: number }} opts
 */
export function animateQueueAdd(trackOrIds, opts = {}) {
    const { sourceElement = null, limit = 3 } = opts;

    // If a source element is provided, animate it directly (most accurate, preserves event target)
    if (sourceElement instanceof HTMLElement) {
        const direct = sourceElement.closest('.track-item');
        if (direct) {
            animateSingleTrackEl(direct);
            return;
        }
    }

    let ids = [];
    if (Array.isArray(trackOrIds)) {
        ids = trackOrIds
            .map((t) => (t && typeof t === 'object' ? t.id : t))
            .filter((v) => v != null)
            .map(String);
    } else if (trackOrIds && typeof trackOrIds === 'object' && 'id' in trackOrIds) {
        ids = [String(trackOrIds.id)];
    } else if (trackOrIds != null) {
        ids = [String(trackOrIds)];
    }

    if (ids.length === 0) return;

    // For single id, try to find all matching elements; for multiple, find each id's first visible match
    const animated = new Set();
    let count = 0;

    for (const id of ids) {
        if (count >= limit) break;
        const selector = `.track-item[data-track-id="${CSS.escape(id)}"]`;
        const candidates = document.querySelectorAll(selector);
        for (const el of candidates) {
            if (count >= limit) break;
            if (animated.has(el)) continue;
            // Only animate if element is visible in viewport-ish (offsetParent or getClientRects)
            const isVisible = el.offsetParent !== null || el.getClientRects().length > 0;
            if (!isVisible) continue;
            // Avoid animating hidden filtered-out items
            if (el.style.display === 'none') continue;
            animateSingleTrackEl(el);
            animated.add(el);
            count++;
            break; // only first visible per id
        }
    }

    // Fallback: if no ids matched (e.g., tracks not yet rendered), try sourceElement again
    if (count === 0 && sourceElement) {
        const fallback = sourceElement.closest?.('.track-item');
        if (fallback) animateSingleTrackEl(fallback);
    }
}

// Auto-listen for queue add events dispatched by Player
if (typeof window !== 'undefined') {
    window.animateQueueAdd = animateQueueAdd;
    window.animateSingleTrackEl = animateSingleTrackEl;

    window.addEventListener('queue-tracks-added', (event) => {
        const detail = event.detail || {};
        const ids = detail.ids || (detail.tracks || []).map((t) => t?.id).filter((v) => v != null);
        const tracks = detail.tracks || ids;
        if (!ids || ids.length === 0) return;
        // Slight delay to allow DOM to be in stable state (player.saveQueueState may trigger re-renders)
        // Use rAF to ensure track-item elements are still the ones the user interacted with before any virtualization updates
        requestAnimationFrame(() => {
            // Prefer animating by ids; sourceElement could be added to event detail in future
            const sourceEl = detail.sourceElement || null;
            if (sourceEl) {
                animateQueueAdd(tracks, { sourceElement: sourceEl });
            } else {
                animateQueueAdd(ids);
            }
        });
    });
}
