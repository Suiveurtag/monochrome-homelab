import { formatBytes, trackStorageBytes, storageSummaryLabel } from './storage-units.js';
import { getCachedAppConfig } from './access-control.js';
import '../storage-offline.css';

export function createUploadStorage({ anchor, getTracks, getSelection }) {
    const details = document.createElement('details');
    details.className = 'upload-storage';
    details.innerHTML = `<summary aria-label="Upload storage information">Storage <span data-storage-total></span></summary>
        <div class="upload-storage-popover"><strong>Audio storage</strong>
            <div class="upload-storage-quota" role="status" aria-live="polite"><div class="upload-storage-quota-label"><span data-storage-quota-label></span><span data-storage-quota-percent></span></div><div class="upload-storage-quota-track"><span data-storage-quota-bar></span></div></div>
            <dl><div><dt>All uploads</dt><dd data-storage-library></dd></div>
            <div><dt>Selected songs</dt><dd data-storage-selection></dd></div></dl>
            <p>Original audio files on this server. Artwork and browser downloads are separate.</p>
        </div>`;
    anchor.insertAdjacentElement('afterend', details);
    const update = () => {
        const tracks = getTracks();
        const selection = getSelection();
        const { bytes } = tracks.reduce((result, track) => {
            const value = trackStorageBytes(track);
            if (value != null) result.bytes += value;
            return result;
        }, { bytes: 0 });
        const limit = Number(getCachedAppConfig().storage_limit_bytes) || 0;
        const quotaLabel = details.querySelector('[data-storage-quota-label]');
        const quotaPercent = details.querySelector('[data-storage-quota-percent]');
        const quotaBar = details.querySelector('[data-storage-quota-bar]');
        if (limit > 0) {
            const percent = Math.min(100, (bytes / limit) * 100);
            quotaLabel.textContent = `${formatBytes(bytes)} of ${formatBytes(limit)} used`;
            quotaPercent.textContent = `${Math.round(percent)}%`;
            quotaBar.style.width = `${percent}%`;
            quotaBar.parentElement.classList.toggle('is-near-limit', percent >= 80);
            quotaBar.parentElement.classList.toggle('is-full', percent >= 100);
        } else {
            quotaLabel.textContent = `${formatBytes(bytes)} used · No limit`;
            quotaPercent.textContent = '';
            quotaBar.style.width = '0%';
            quotaBar.parentElement.classList.remove('is-near-limit', 'is-full');
        }
        const byId = new Map(tracks.map((track) => [String(track.id), track]));
        details.querySelector('[data-storage-total]').textContent = storageSummaryLabel(tracks);
        details.querySelector('[data-storage-library]').textContent =
            `${tracks.length} songs · ${storageSummaryLabel(tracks)}`;
        details.querySelector('[data-storage-selection]').textContent = selection.length
            ? `${selection.length} songs · ${storageSummaryLabel(selection)}`
            : 'No songs selected';
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
    details.addEventListener('toggle', () => {
        if (details.open) update();
    });
    window.addEventListener('instance-policy-applied', update);
    document.addEventListener('pointerdown', (event) => {
        if (!details.contains(event.target)) details.open = false;
    });
    details.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            details.open = false;
            details.querySelector('summary').focus();
            event.stopPropagation();
        }
    });
    update();
    return { update };
}
