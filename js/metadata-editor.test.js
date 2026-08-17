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
    vi.clearAllMocks();
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

describe('track metadata alternative versions', () => {
    test('links sibling tracks symmetrically and stores the artist-page visibility choice', async () => {
        const { db } = await import('./db.js');
        const { openMetadataEditor } = await import('./metadata-editor.js');
        const original = {
            id: 'track-original',
            title: 'Afterglow',
            artist: { id: 'artist-1', name: 'Artist' },
            album: { id: 'album-1', title: 'Album', cover: '/original.jpg' },
        };
        const instrumental = {
            id: 'track-instrumental',
            title: 'Afterglow (Instrumental)',
            artist: { id: 'artist-1', name: 'Artist' },
            album: { id: 'album-2', title: 'Instrumentals', cover: '/instrumental.jpg' },
            versionLabel: 'Instrumental',
        };
        const { modal, close } = openMetadataEditor({
            type: 'track',
            entity: instrumental,
            availableTracks: [original, instrumental],
        });

        modal.querySelector('input[name="alternativeVersionIds"]').click();
        modal.querySelector('select[name="versionMainTrackId"]').value = 'track-original';
        modal.querySelector('select[name="versionMainTrackId"]').dispatchEvent(new Event('change', { bubbles: true }));
        modal.querySelector('input[name="title"]').value = 'Afterglow instrumental final';
        modal.querySelector('input[name="versionLabel"]').value = 'Instrumental';
        modal.querySelector('input[name="hideFromArtistPage"]').click();
        modal.querySelector('form').requestSubmit();

        await vi.waitFor(() => expect(db.putUploadedTrack.mock.calls).toHaveLength(2));
        const saved = db.putUploadedTrack.mock.calls.map(([track]) => track);
        expect(saved).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'track-instrumental',
                    title: 'Afterglow instrumental final',
                    versionGroupId: 'versions:track-original',
                    versionMainTrackId: 'track-original',
                    alternativeVersionIds: ['track-original'],
                    versionLabel: 'Instrumental',
                    hideFromArtistPage: true,
                    album: null,
                    versionMainAlbum: original.album,
                }),
                expect.objectContaining({
                    id: 'track-original',
                    versionGroupId: 'versions:track-original',
                    versionMainTrackId: 'track-original',
                    alternativeVersionIds: ['track-instrumental'],
                    hideFromArtistPage: false,
                }),
            ])
        );
        close();
    });
});
