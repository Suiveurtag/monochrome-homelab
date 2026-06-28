const INTRO_ACTIVITY_KEY = 'monochrome-site-intro-last-activity';
export const INTRO_INACTIVITY_MS = 2 * 60 * 60 * 1000;

let replayPromise = null;

function readLastActivity() {
    try {
        return Number.parseInt(localStorage.getItem(INTRO_ACTIVITY_KEY) || '', 10) || 0;
    } catch {
        return 0;
    }
}

function writeLastActivity(timestamp = Date.now()) {
    try {
        localStorage.setItem(INTRO_ACTIVITY_KEY, String(timestamp));
    } catch {
        // Storage can be unavailable in private or embedded browser contexts.
    }
}

export function shouldPlaySiteIntro(lastActivity, now = Date.now(), inactivityMs = INTRO_INACTIVITY_MS) {
    return !lastActivity || now - lastActivity >= inactivityMs;
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function wait(duration) {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function isUsableTarget(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth;
}

function animateMaskWidth(overlay, selector, targetWidth, duration, delay) {
    const element = overlay.querySelector(selector);
    if (!element) return;
    const startedAt = performance.now() + delay;

    const draw = (now) => {
        const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
        const easedProgress = progress * progress * (3 - 2 * progress);
        element.setAttribute('width', String(targetWidth * easedProgress));
        if (progress < 1) overlay.siteIntroFrames.push(window.requestAnimationFrame(draw));
    };
    overlay.siteIntroFrames.push(window.requestAnimationFrame(draw));
}

function animateFillOpacity(overlay, selector, duration, delay) {
    const element = overlay.querySelector(selector);
    if (!element) return;
    const startedAt = performance.now() + delay;

    const fill = (now) => {
        const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
        element.style.opacity = String(progress * progress * (3 - 2 * progress));
        if (progress < 1) overlay.siteIntroFrames.push(window.requestAnimationFrame(fill));
    };
    overlay.siteIntroFrames.push(window.requestAnimationFrame(fill));
}

export function resolveSiteIntroTarget() {
    const gate = document.getElementById('access-gate');
    if (gate && !gate.hidden) return document.querySelector('.access-brand');

    const sidebarBrand = document.querySelector('.sidebar-logo-link');
    return isUsableTarget(sidebarBrand) ? sidebarBrand : null;
}

function prepareOverlay(overlay) {
    for (const animation of overlay.getAnimations({ subtree: true })) animation.cancel();
    for (const frame of overlay.siteIntroFrames || []) window.cancelAnimationFrame(frame);
    overlay.siteIntroFrames = [];
    overlay.querySelector('.site-intro-mark-reveal')?.setAttribute('width', '0');
    overlay.querySelector('.site-intro-word-reveal')?.setAttribute('width', '0');
    overlay.querySelector('.site-intro-mark-fill')?.style.setProperty('opacity', '0');
    overlay.querySelector('.site-intro-word-fill')?.style.setProperty('opacity', '0');
    for (const brand of document.querySelectorAll('.access-brand, .sidebar-logo-link')) {
        brand.classList.add('site-intro-target-hidden');
    }
    overlay.hidden = false;
    overlay.classList.remove('is-playing');
    void overlay.offsetWidth;
    overlay.classList.add('is-playing');
    document.body.classList.add('site-intro-active');
    animateMaskWidth(overlay, '.site-intro-mark-reveal', 78, 900, 100);
    animateMaskWidth(overlay, '.site-intro-word-reveal', 530, 1350, 180);
    animateFillOpacity(overlay, '.site-intro-mark-fill', 460, 1000);
    animateFillOpacity(overlay, '.site-intro-word-fill', 500, 1250);
}

async function dockIntro(overlay, target) {
    const lockup = overlay.querySelector('.site-intro-lockup');
    const veil = overlay.querySelector('.site-intro-veil');
    if (!lockup) return;

    const sourceRect = lockup.getBoundingClientRect();
    const targetRect = isUsableTarget(target)
        ? target.getBoundingClientRect()
        : { left: 20, top: 20, width: Math.min(150, window.innerWidth - 40), height: 28 };
    const targetWidth = Math.max(96, targetRect.width || 0);
    const scale = Math.min(1, targetWidth / sourceRect.width);
    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const translateX = targetCenterX - sourceCenterX;
    const translateY = targetCenterY - sourceCenterY;

    target?.classList.add('site-intro-target-hidden');

    const easing = 'cubic-bezier(0.76, 0, 0.24, 1)';
    const lockupAnimation = lockup.animate(
        [
            { transform: 'translate3d(0, 0, 0) scale(1)' },
            { transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})` },
        ],
        { duration: 760, easing, fill: 'forwards' }
    );
    const veilAnimation = veil?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 680,
        delay: 80,
        easing: 'ease-out',
        fill: 'forwards',
    });

    await lockupAnimation.finished.catch(() => {});
    await veilAnimation?.finished.catch(() => {});
    target?.classList.remove('site-intro-target-hidden');

    const fadeAnimation = lockup.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 120,
        easing: 'ease-out',
        fill: 'forwards',
    });
    await fadeAnimation.finished.catch(() => {});
}

export function beginSiteIntro({ force = false } = {}) {
    const overlay = document.getElementById('site-intro');
    const now = Date.now();
    const play = Boolean(overlay) && !prefersReducedMotion() && (force || shouldPlaySiteIntro(readLastActivity(), now));
    writeLastActivity(now);

    if (!play) {
        if (overlay) overlay.hidden = true;
        return {
            played: false,
            finish: async (target) => {
                target?.classList.remove('site-intro-target-hidden');
            },
        };
    }

    prepareOverlay(overlay);
    const startedAt = performance.now();
    let finished = false;

    return {
        played: true,
        finish: async (target) => {
            if (finished) return;
            finished = true;
            const remainingDrawTime = Math.max(0, 1850 - (performance.now() - startedAt));
            if (remainingDrawTime) await wait(remainingDrawTime);
            await dockIntro(overlay, target);
            overlay.hidden = true;
            overlay.classList.remove('is-playing');
            for (const animation of overlay.getAnimations({ subtree: true })) animation.cancel();
            for (const frame of overlay.siteIntroFrames || []) window.cancelAnimationFrame(frame);
            overlay.siteIntroFrames = [];
            for (const brand of document.querySelectorAll('.site-intro-target-hidden')) {
                brand.classList.remove('site-intro-target-hidden');
            }
            document.body.classList.remove('site-intro-active');
        },
    };
}

function buildTextEffect(element, per) {
    if (!element || element.dataset.textEffectReady === 'true') return;
    element.dataset.textEffectReady = 'true';
    const text = element.textContent.trim();
    element.setAttribute('aria-label', text);
    element.replaceChildren();

    const audibleText = document.createElement('span');
    audibleText.className = 'sr-only';
    audibleText.textContent = text;
    element.append(audibleText);

    const segments = per === 'char' ? [...text] : text.split(/(\s+)/);
    let animatedIndex = 0;
    for (const segment of segments) {
        if (/^\s+$/.test(segment)) {
            element.append(document.createTextNode(segment));
            continue;
        }
        const span = document.createElement('span');
        span.setAttribute('aria-hidden', 'true');
        span.className = per === 'char' ? 'access-text-effect-char' : 'access-text-effect-word';
        span.style.setProperty('--text-effect-index', String(animatedIndex++));
        span.textContent = segment;
        element.append(span);
    }
}

export function revealAccessGate() {
    const gate = document.getElementById('access-gate');
    if (!gate || gate.classList.contains('access-gate-ready')) return;

    if (!prefersReducedMotion()) {
        buildTextEffect(document.getElementById('access-title'), 'char');
        buildTextEffect(document.querySelector('.access-card-heading p'), 'word');
    }
    gate.classList.add('access-gate-ready');
}

async function replaySiteIntro() {
    if (replayPromise) return replayPromise;
    const intro = beginSiteIntro({ force: true });
    replayPromise = intro.finish(resolveSiteIntroTarget()).finally(() => {
        replayPromise = null;
    });
    return replayPromise;
}

export function initializeSiteIntroActivityTracking() {
    let lastWrite = 0;
    let hiddenAt = 0;

    const recordActivity = (force = false) => {
        const now = Date.now();
        if (!force && now - lastWrite < 30_000) return;
        lastWrite = now;
        writeLastActivity(now);
    };

    const handleVisibility = () => {
        if (document.hidden) {
            hiddenAt = Date.now();
            recordActivity(true);
            return;
        }

        const now = Date.now();
        if (hiddenAt && now - hiddenAt >= INTRO_INACTIVITY_MS && shouldPlaySiteIntro(readLastActivity(), now)) {
            void replaySiteIntro();
        } else {
            recordActivity(true);
        }
        hiddenAt = 0;
    };

    const handleActivity = () => recordActivity();
    const handlePageHide = () => recordActivity(true);
    for (const eventName of ['pointerdown', 'keydown', 'touchstart', 'scroll']) {
        window.addEventListener(eventName, handleActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
        for (const eventName of ['pointerdown', 'keydown', 'touchstart', 'scroll']) {
            window.removeEventListener(eventName, handleActivity);
        }
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('pagehide', handlePageHide);
    };
}
