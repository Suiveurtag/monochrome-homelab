const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const STORAGE_KEY = 'monochrome-download-popup-corner';
const CHANGE_EVENT = 'download-popup-corner-changed';
const DRAG_THRESHOLD = 5;
const VIEWPORT_GAP = 12;
const initialized = new WeakMap();

export function normalizeCorner(value, fallback = 'bottom-left') {
    return CORNERS.includes(value) ? value : fallback;
}

export function getNearestCorner(rect, viewportWidth, viewportHeight) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const horizontal = centerX < viewportWidth / 2 ? 'left' : 'right';
    const vertical = centerY < viewportHeight / 2 ? 'top' : 'bottom';
    return `${vertical}-${horizontal}`;
}

function readSavedCorner(defaultCorner) {
    try {
        return normalizeCorner(localStorage.getItem(STORAGE_KEY), defaultCorner);
    } catch {
        return defaultCorner;
    }
}

function saveCorner(corner) {
    try {
        localStorage.setItem(STORAGE_KEY, corner);
    } catch {
        // Storage can be unavailable in private browsing contexts.
    }
}

function ensureDropZones() {
    let zones = document.getElementById('download-popup-drop-zones');
    if (zones) return zones;

    zones = document.createElement('div');
    zones.id = 'download-popup-drop-zones';
    zones.setAttribute('aria-hidden', 'true');
    zones.innerHTML = CORNERS.map((corner) => `<i data-corner="${corner}"></i>`).join('');
    document.body.appendChild(zones);
    return zones;
}

function showDropZones(activeCorner) {
    const zones = ensureDropZones();
    zones.classList.add('visible');
    zones.querySelectorAll('[data-corner]').forEach((zone) => {
        zone.classList.toggle('active', zone.dataset.corner === activeCorner);
    });
}

function hideDropZones() {
    const zones = document.getElementById('download-popup-drop-zones');
    zones?.classList.remove('visible');
    zones?.querySelectorAll('.active').forEach((zone) => zone.classList.remove('active'));
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

export function enableCornerDrag(element, { defaultCorner = 'bottom-left' } = {}) {
    if (!element || initialized.has(element)) return initialized.get(element)?.cleanup || null;

    const state = {
        pointerId: null,
        startPointerX: 0,
        startPointerY: 0,
        startLeft: 0,
        startTop: 0,
        dragging: false,
        snapTimer: null,
    };

    const setCorner = (corner) => {
        element.dataset.floatingCorner = normalizeCorner(corner, defaultCorner);
    };

    setCorner(readSavedCorner(defaultCorner));
    element.classList.add('floating-corner-draggable');
    element.setAttribute('data-drag-hint', 'Drag to move');
    element.querySelectorAll('img').forEach((image) => {
        image.draggable = false;
    });

    const clearPointerListeners = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
    };

    const finishDrag = () => {
        if (!state.dragging) return;
        const currentRect = element.getBoundingClientRect();
        const corner = getNearestCorner(currentRect, window.innerWidth, window.innerHeight);

        element.classList.remove('is-dragging');
        element.classList.add('is-snapping');
        document.body.classList.remove('is-dragging-download-popup');
        hideDropZones();

        element.style.removeProperty('left');
        element.style.removeProperty('top');
        element.style.removeProperty('right');
        element.style.removeProperty('bottom');
        setCorner(corner);

        const targetRect = element.getBoundingClientRect();
        element.style.setProperty('--popup-drag-x', `${currentRect.left - targetRect.left}px`);
        element.style.setProperty('--popup-drag-y', `${currentRect.top - targetRect.top}px`);
        void element.offsetWidth;

        requestAnimationFrame(() => {
            element.style.setProperty('--popup-drag-x', '0px');
            element.style.setProperty('--popup-drag-y', '0px');
        });

        clearTimeout(state.snapTimer);
        state.snapTimer = window.setTimeout(() => {
            element.classList.remove('is-snapping');
            element.style.removeProperty('--popup-drag-x');
            element.style.removeProperty('--popup-drag-y');
        }, 560);

        saveCorner(corner);
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { corner, source: element } }));
    };

    function onPointerMove(event) {
        if (event.pointerId !== state.pointerId) return;
        const deltaX = event.clientX - state.startPointerX;
        const deltaY = event.clientY - state.startPointerY;

        if (!state.dragging && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
        if (!state.dragging) {
            state.dragging = true;
            element.classList.add('is-dragging');
            document.body.classList.add('is-dragging-download-popup');
        }

        event.preventDefault();
        const maxLeft = window.innerWidth - element.offsetWidth - VIEWPORT_GAP;
        const maxTop = window.innerHeight - element.offsetHeight - VIEWPORT_GAP;
        const left = clamp(state.startLeft + deltaX, VIEWPORT_GAP, maxLeft);
        const top = clamp(state.startTop + deltaY, VIEWPORT_GAP, maxTop);

        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
        element.style.right = 'auto';
        element.style.bottom = 'auto';
        const liveRect = { left, top, width: element.offsetWidth, height: element.offsetHeight };
        showDropZones(getNearestCorner(liveRect, window.innerWidth, window.innerHeight));
    }

    function onPointerUp(event) {
        if (event.pointerId !== state.pointerId) return;
        clearPointerListeners();
        try {
            if (element.hasPointerCapture?.(state.pointerId)) element.releasePointerCapture(state.pointerId);
        } catch {
            // The pointer may already have been released by the browser.
        }
        finishDrag();
        state.pointerId = null;
        state.dragging = false;
    }

    const onPointerDown = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.target.closest('button, a, input, select, textarea, [role="button"]')) return;

        const rect = element.getBoundingClientRect();
        state.pointerId = event.pointerId;
        state.startPointerX = event.clientX;
        state.startPointerY = event.clientY;
        state.startLeft = rect.left;
        state.startTop = rect.top;
        state.dragging = false;
        try {
            element.setPointerCapture?.(event.pointerId);
        } catch {
            // Synthetic or interrupted pointers can be tracked through the window listeners instead.
        }
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    };

    const onSharedCornerChange = (event) => {
        if (event.detail?.source === element || state.dragging) return;
        setCorner(event.detail?.corner);
    };

    const onResize = () => {
        element.classList.remove('is-dragging', 'is-snapping');
        element.style.removeProperty('left');
        element.style.removeProperty('top');
        element.style.removeProperty('right');
        element.style.removeProperty('bottom');
        element.style.removeProperty('--popup-drag-x');
        element.style.removeProperty('--popup-drag-y');
    };

    const preventNativeDrag = (event) => event.preventDefault();
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('dragstart', preventNativeDrag);
    window.addEventListener(CHANGE_EVENT, onSharedCornerChange);
    window.addEventListener('resize', onResize);

    const cleanup = () => {
        clearPointerListeners();
        clearTimeout(state.snapTimer);
        element.removeEventListener('pointerdown', onPointerDown);
        element.removeEventListener('dragstart', preventNativeDrag);
        window.removeEventListener(CHANGE_EVENT, onSharedCornerChange);
        window.removeEventListener('resize', onResize);
        initialized.delete(element);
        delete element.cornerDragCleanup;
    };

    element.cornerDragCleanup = cleanup;
    initialized.set(element, { cleanup });
    return cleanup;
}
