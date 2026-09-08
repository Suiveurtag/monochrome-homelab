import { formatBytes, trackStorageBytes, storageSummaryLabel } from './storage-units.js';
import '../storage-offline.css';

export function createUploadStorage({ anchor, getTracks, getSelection }) {
    const details = document.createElement('details');
    details.className = 'upload-storage';
    details.innerHTML = `<summary aria-label="Upload storage information">Storage <span data-storage-total></span></summary>
        <div class="upload-storage-popover"><strong>Audio storage</strong>
            <dl><div><dt>All uploads</dt><dd data-storage-library></dd></div>
            <div><dt>Selected songs</dt><dd data-storage-selection></dd></div></dl>
            <p>Original audio files on this server. Artwork and browser downloads are separate.</p>
        </div>`;
    anchor.insertAdjacentElement('afterend', details);
    const update = () => {
        const tracks = getTracks();
        const selection = getSelection();
        const byId = new Map(tracks.map((track) => [String(track.id), track]));
        details.querySelector('[data-storage-total]').textContent = storageSummaryLabel(tracks);
        details.querySelector('[data-storage-library]').textContent = `${tracks.length} songs · ${storageSummaryLabel(tracks)}`;
        details.querySelector('[data-storage-selection]').textContent = selection.length
            ? `${selection.length} songs · ${storageSummaryLabel(selection)}` : 'No songs selected';
        document.querySelectorAll('.upload-gallery-card[data-track-id]').forEach((card) => {
            const track = byId.get(card.dataset.trackId);
            let size = card.querySelector('.upload-card-size');
            if (!size) {
                size = document.createElement('span');
                size.className = 'upload-card-size';
                card.querySelector('.upload-card-art')?.appendChild(size);
            }
            size.textContent = formatBytes(trackStorageBytes(track));
            size.title = 'Original audio file size';
        });
    };
    details.addEventListener('toggle', () => { if (details.open) update(); });
    document.addEventListener('pointerdown', (event) => { if (!details.contains(event.target)) details.open = false; });
    details.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { details.open = false; details.querySelector('summary').focus(); event.stopPropagation(); }
    });
    update();
    return { update };
}
