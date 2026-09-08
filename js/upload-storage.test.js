import { afterEach, expect, test } from 'vitest';
import { createUploadStorage } from './upload-storage.js';

afterEach(() => document.body.replaceChildren());

test('upload storage updates totals, selection and individual song sizes without duplicating badges', () => {
    document.body.innerHTML = '<p id="stats"></p><button class="upload-gallery-card" data-track-id="a"><span class="upload-card-art"></span></button>';
    const tracks = [{ id: 'a', audioSize: 2000000 }, { id: 'b', audioSize: 3000000 }, { id: 'c' }];
    let selected = [];
    const storage = createUploadStorage({ anchor: document.getElementById('stats'), getTracks: () => tracks, getSelection: () => selected });
    expect(document.querySelector('[data-storage-library]').textContent).toBe('3 songs · 5 MB + 1 unknown');
    expect(document.querySelector('[data-storage-selection]').textContent).toBe('No songs selected');
    expect(document.querySelector('.upload-card-size').textContent).toBe('2 MB');
    selected = tracks.slice(0, 2);
    storage.update();
    expect(document.querySelector('[data-storage-selection]').textContent).toBe('2 songs · 5 MB');
    selected = [tracks[2]];
    storage.update();
    expect(document.querySelector('[data-storage-selection]').textContent).toBe('1 songs · Size unavailable');
    expect(document.querySelectorAll('.upload-card-size')).toHaveLength(1);
});

test('storage disclosure closes with Escape and restores keyboard focus', () => {
    document.body.innerHTML = '<p id="stats"></p>';
    createUploadStorage({ anchor: document.getElementById('stats'), getTracks: () => [], getSelection: () => [] });
    const details = document.querySelector('details');
    details.open = true;
    details.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(details.querySelector('summary'));
});
