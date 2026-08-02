import { beforeEach, describe, expect, test } from 'vitest';
import { enableCornerDrag, getNearestCorner, normalizeCorner } from './corner-drag.js';

describe('download popup corner drag', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });

    test('selects each nearest viewport corner', () => {
        expect(getNearestCorner({ left: 10, top: 10, width: 100, height: 50 }, 1000, 800)).toBe('top-left');
        expect(getNearestCorner({ left: 800, top: 10, width: 100, height: 50 }, 1000, 800)).toBe('top-right');
        expect(getNearestCorner({ left: 10, top: 700, width: 100, height: 50 }, 1000, 800)).toBe('bottom-left');
        expect(getNearestCorner({ left: 800, top: 700, width: 100, height: 50 }, 1000, 800)).toBe('bottom-right');
    });

    test('rejects invalid stored corners', () => {
        expect(normalizeCorner('middle', 'top-right')).toBe('top-right');
    });

    test('restores the saved corner and initializes only once', () => {
        localStorage.setItem('monochrome-download-popup-corner', 'top-right');
        const popup = document.createElement('div');
        popup.innerHTML = '<button>Cancel</button>';
        document.body.appendChild(popup);

        const firstCleanup = enableCornerDrag(popup);
        const secondCleanup = enableCornerDrag(popup);

        expect(popup.dataset.floatingCorner).toBe('top-right');
        expect(popup.classList.contains('floating-corner-draggable')).toBe(true);
        expect(secondCleanup).toBe(firstCleanup);
    });

    test('drags freely and saves the nearest corner on release', () => {
        const popup = document.createElement('div');
        document.body.appendChild(popup);
        Object.defineProperties(popup, {
            offsetWidth: { value: 200 },
            offsetHeight: { value: 100 },
        });
        let rectCall = 0;
        popup.getBoundingClientRect = () => {
            rectCall += 1;
            return rectCall === 1
                ? { left: 12, top: 12, width: 200, height: 100 }
                : { left: 760, top: 620, width: 200, height: 100 };
        };
        enableCornerDrag(popup);

        const pointerEvent = (type, clientX, clientY) => {
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperties(event, {
                pointerId: { value: 7 },
                pointerType: { value: 'mouse' },
                button: { value: 0 },
                clientX: { value: clientX },
                clientY: { value: clientY },
            });
            return event;
        };

        popup.dispatchEvent(pointerEvent('pointerdown', 30, 30));
        window.dispatchEvent(pointerEvent('pointermove', 820, 680));
        expect(popup.classList.contains('is-dragging')).toBe(true);
        window.dispatchEvent(pointerEvent('pointerup', 820, 680));

        expect(popup.dataset.floatingCorner).toBe('bottom-right');
        expect(localStorage.getItem('monochrome-download-popup-corner')).toBe('bottom-right');
    });
});
