import { beforeEach, describe, expect, test, vi } from 'vitest';

beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
        getItem: vi.fn((key) => values.get(key) ?? null),
        setItem: vi.fn((key, value) => values.set(key, String(value))),
    });
});

describe('Canvas settings', () => {
    test('defaults to enabled and persists preference changes', async () => {
        const { canvasSettings } = await import('./canvas-settings.js');
        const changed = vi.fn();
        window.addEventListener('canvas-playback-preference-changed', changed, { once: true });

        expect(canvasSettings.isEnabled()).toBe(true);
        canvasSettings.setEnabled(false);

        expect(canvasSettings.isEnabled()).toBe(false);
        expect(changed).toHaveBeenCalledOnce();
        expect(changed.mock.calls[0][0].detail).toEqual({ enabled: false });
    });
});
