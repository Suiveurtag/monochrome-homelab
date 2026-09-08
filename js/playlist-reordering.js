import { keyboardShortcuts, matchesShortcut, formatShortcut } from './keyboard-shortcuts.js';

/** Persist exactly the order/revision the user saw, with a reversible DOM preview. */
export function bindPlaylistReordering(container, {
    tracks, revision, save, onSaved = () => {}, onError = () => {}, registry = keyboardShortcuts,
}) {
    let rows = [...container.querySelectorAll('.track-item')];
    const trackForRow = new Map(rows.map((row, index) => [row, tracks[index]]));
    let dragging = null;
    let busy = false;
    const restore = () => rows.forEach((row) => container.append(row));
    const updateRows = () => {
        rows.forEach((row, index) => {
            row.draggable = !busy;
            row.dataset.index = index;
            row.title = `Move track: ${formatShortcut(registry.getShortcutForAction('moveTrackUp'))} / ${formatShortcut(registry.getShortcutForAction('moveTrackDown'))}`;
        });
    };
    const persist = async (focusedRow) => {
        if (busy) return;
        const proposed = [...container.querySelectorAll('.track-item')];
        if (proposed.every((row, index) => row === rows[index])) return;
        busy = true;
        container.setAttribute('aria-busy', 'true');
        updateRows();
        let saved;
        try {
            saved = await save(proposed.map((row) => trackForRow.get(row)), revision);
        } catch (error) {
            restore();
            focusedRow?.focus({ preventScroll: true });
            await Promise.resolve(onError(error));
            return;
        } finally {
            busy = false;
            container.removeAttribute('aria-busy');
            updateRows();
        }
        rows = proposed;
        revision = saved?.collaboration?.revision;
        tracks.splice(0, tracks.length, ...rows.map((row) => trackForRow.get(row)));
        updateRows();
        focusedRow?.focus({ preventScroll: true });
        // Persistence succeeded; a later notification/sync error must not roll it back.
        await Promise.resolve(onSaved(saved));
    };
    const onDragStart = (event) => {
        if (busy || event.target.closest('button, input, a, textarea, select')) {
            event.preventDefault();
            return;
        }
        dragging = event.target.closest('.track-item');
        if (!trackForRow.has(dragging)) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dragging.dataset.index);
        dragging.classList.add('dragging');
    };
    const onDragOver = (event) => {
        if (!dragging || busy) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const after = [...container.querySelectorAll('.track-item')].find((row) => {
            if (row === dragging) return false;
            const rect = row.getBoundingClientRect();
            return event.clientY < rect.top + rect.height / 2;
        });
        container.insertBefore(dragging, after || null);
    };
    const onDrop = (event) => {
        if (!dragging || busy) return;
        event.preventDefault();
        dragging.classList.remove('dragging');
        dragging = null;
        void persist().catch(onError);
    };
    const onDragEnd = () => {
        if (!dragging) return;
        dragging.classList.remove('dragging');
        dragging = null;
        if (!busy) restore();
    };
    const onKey = (event) => {
        if (event.defaultPrevented || event.isComposing || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        const row = event.target.closest('.track-item');
        if (!trackForRow.has(row)) return;
        const direction = matchesShortcut(event, registry.getShortcutForAction('moveTrackUp')) ? -1
            : matchesShortcut(event, registry.getShortcutForAction('moveTrackDown')) ? 1 : 0;
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        if (busy || dragging || event.repeat) return;
        const index = rows.indexOf(row);
        const neighbor = rows[index + direction];
        if (!neighbor) return;
        container.insertBefore(row, direction < 0 ? neighbor : neighbor.nextSibling);
        void persist(row).catch(onError);
    };
    updateRows();
    container.addEventListener('dragstart', onDragStart);
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);
    container.addEventListener('dragend', onDragEnd);
    container.addEventListener('keydown', onKey);
    return () => {
        container.removeEventListener('dragstart', onDragStart);
        container.removeEventListener('dragover', onDragOver);
        container.removeEventListener('drop', onDrop);
        container.removeEventListener('dragend', onDragEnd);
        container.removeEventListener('keydown', onKey);
    };
}
