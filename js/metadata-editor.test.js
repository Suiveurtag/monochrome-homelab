import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./db.js', () => ({
    db: {
        putUploadedTrack: vi.fn(async (track) => track),
        putLocalArtist: vi.fn(async () => {}),
        putLocalAlbum: vi.fn(async () => {}),
    },
}));
vi.mock('./downloads.js', () => ({ showNotification: vi.fn() }));
vi.mock('./selfhost-server-api.js', () => ({ updateSelfHostedTrack: vi.fn() }));

beforeEach(() => {
    document.body.replaceChildren();
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('track metadata Canvas control', () => {
    test('keeps static artwork separate and offers MP4 replace and removal controls', async () => {
        const { openMetadataEditor } = await import('./metadata-editor.js');
        const { modal, close } = openMetadataEditor({
            type: 'track',
            entity: {
                id: 'track-1',
                title: 'Canvas song',
                artist: { name: 'Artist' },
                album: { title: 'Album', cover: '/cover.jpg' },
                videoCoverUrl: '/canvas.mp4',
            },
        });

        const coverInput = modal.querySelector('input[name="cover"]');
        const canvasInput = modal.querySelector('input[name="canvas"]');
        const removeButton = modal.querySelector('[data-canvas-remove]');

        expect(coverInput.accept).not.toContain('video/mp4');
        expect(canvasInput.accept).toContain('video/mp4');
        expect(modal.querySelector('[data-canvas-preview] video')?.getAttribute('src')).toBe('/canvas.mp4');
        expect(removeButton.hidden).toBe(false);

        removeButton.click();
        expect(modal.querySelector('input[name="removeCanvas"]').value).toBe('true');
        expect(removeButton.hidden).toBe(true);
        expect(modal.querySelector('[data-canvas-file-name]').textContent).toContain('will be removed');
        close();
    });
});
