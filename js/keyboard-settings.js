import { keyboardShortcuts, formatShortcut, shortcutFromEvent, SELECTION_ACTIONS } from './keyboard-shortcuts.js';

const controllers = new WeakMap();
const GROUPS = [
    ['Playback', ['playPause', 'seekForward', 'seekBackward', 'nextTrack', 'previousTrack', 'volumeUp', 'volumeDown', 'mute', 'shuffle', 'repeat', 'like']],
    ['Navigation', ['search', 'commandPalette', 'home', 'library', 'uploads', 'settings', 'focusNavigation', 'focusContent', 'focusPlayer', 'queue', 'lyrics', 'fullscreen', 'shortcuts', 'escape']],
    ['Tracks and visualizer', ['multiSelectToggle', 'multiSelectRange', 'moveTrackUp', 'moveTrackDown', 'visualizerNext', 'visualizerPrev', 'visualizerCycle']],
];

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
}

export function showKeyboardShortcuts() {
    const modal = document.getElementById('shortcuts-modal');
    if (!modal) return;
    controllers.get(modal)?.abort();
    const controller = new AbortController();
    controllers.set(modal, controller);
    const { signal } = controller;
    const opener = document.activeElement;
    const content = modal.querySelector('.shortcuts-content');
    content.replaceChildren();
    content.classList.add('keyboard-shortcuts-reference');
    content.append(element('p', 'Tab moves between controls. Use arrow keys and Home / End in track lists and settings tabs. Enter opens or plays the focused item. Shift + F10 opens its menu. Escape closes dialogs.', 'shortcut-hint'));
    const shortcuts = keyboardShortcuts.getShortcuts();
    for (const [title, actions] of GROUPS) {
        content.append(element('h4', title, 'shortcut-group-title'));
        for (const action of actions) {
            const row = element('div', null, 'shortcut-item');
            row.append(element('span', shortcuts[action].description), element('kbd', formatShortcut(shortcuts[action])));
            content.append(row);
        }
    }
    const customize = element('button', 'Customize shortcuts', 'btn-secondary');
    content.append(customize);
    const close = () => {
        modal.classList.remove('active');
        modal.style.removeProperty('display');
        controller.abort();
        if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    modal.querySelector('.close-shortcuts')?.setAttribute('aria-label', 'Close keyboard shortcuts');
    modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('.close-shortcuts, .modal-overlay')) close();
    }, { signal });
    customize.addEventListener('click', () => { close(); showCustomizeShortcutsModal(); }, { signal });
    modal.classList.add('active');
    modal.querySelector('button')?.focus();
}

export function showCustomizeShortcutsModal() {
    const modal = document.getElementById('customize-shortcuts-modal');
    if (!modal) return;
    controllers.get(modal)?.abort();
    const controller = new AbortController();
    controllers.set(modal, controller);
    const { signal } = controller;
    const opener = document.activeElement;
    const list = document.getElementById('shortcuts-list');
    const content = modal.querySelector('.customize-shortcuts-content');
    modal.querySelector('.shortcut-hint').textContent = 'Choose a shortcut, then press a key combination. Escape cancels recording. Clear disables a shortcut. Selection modifiers also work with Space on a focused track.';
    modal.querySelector('.close-customize-shortcuts').setAttribute('aria-label', 'Close shortcut settings');
    content.querySelector('.shortcut-status')?.remove();
    content.querySelector('.shortcut-conflict')?.remove();
    const status = element('p', '', 'shortcut-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const conflict = element('div', null, 'shortcut-conflict');
    conflict.hidden = true;
    conflict.setAttribute('role', 'alert');
    content.insertBefore(status, list);
    content.insertBefore(conflict, list);
    let recording = null;
    let modifierCandidate = null;
    let pendingConflict = null;
    const setStatus = (message) => { status.textContent = message; };
    const focusAction = (action) => list.querySelector(`[data-action="${action}"] .shortcut-record-button`)?.focus({ preventScroll: true });
    const stopRecording = () => {
        recording = null;
        modifierCandidate = null;
        delete modal.dataset.shortcutRecording;
    };
    const render = (focus) => {
        const shortcuts = keyboardShortcuts.getShortcuts();
        list.replaceChildren();
        for (const [title, actions] of GROUPS) {
            list.append(element('h4', title, 'shortcut-group-title'));
            for (const action of actions) {
                const shortcut = shortcuts[action];
                const row = element('div', null, 'customize-shortcut-item');
                row.dataset.action = action;
                row.append(element('span', shortcut.description, 'shortcut-description'));
                const controls = element('div', null, 'shortcut-key');
                const record = element('button', null, 'shortcut-record-button');
                record.type = 'button';
                record.setAttribute('aria-label', `Change ${shortcut.description}: ${formatShortcut(shortcut)}`);
                record.setAttribute('aria-pressed', String(recording === action));
                record.append(element('kbd', recording === action ? 'Press keys…' : formatShortcut(shortcut)));
                const clear = element('button', 'Clear', 'shortcut-clear-button');
                clear.type = 'button';
                clear.disabled = !shortcut.key;
                clear.setAttribute('aria-label', `Clear ${shortcut.description}`);
                const reset = element('button', 'Reset', 'shortcut-reset-button');
                reset.type = 'button';
                reset.setAttribute('aria-label', `Reset ${shortcut.description} to default`);
                controls.append(record, clear, reset);
                row.append(controls);
                list.append(row);
            }
        }
        if (focus) focusAction(focus);
    };
    const save = (action, shortcut, replaceConflicts = false) => {
        const result = keyboardShortcuts.setShortcut(action, shortcut, { replaceConflicts });
        stopRecording();
        if (result.ok) {
            conflict.hidden = true;
            pendingConflict = null;
            setStatus(`${keyboardShortcuts.DEFAULT_SHORTCUTS[action].description}: ${formatShortcut(shortcut)}. Saved.`);
            render(action);
        } else if (result.reason) {
            conflict.hidden = true;
            pendingConflict = null;
            setStatus(result.reason);
            render(action);
        } else {
            pendingConflict = { action, shortcut };
            const names = result.conflicts.map((id) => keyboardShortcuts.DEFAULT_SHORTCUTS[id].description).join(', ');
            conflict.replaceChildren(element('p', `${formatShortcut(shortcut)} is already assigned to ${names}. Reassigning will clear those shortcuts.`));
            const actions = element('div', null, 'shortcut-conflict-actions');
            const replace = element('button', 'Reassign shortcut', 'btn-secondary');
            replace.dataset.conflictAction = 'replace';
            const cancel = element('button', 'Keep existing', 'btn-secondary');
            cancel.dataset.conflictAction = 'cancel';
            actions.append(replace, cancel);
            conflict.append(actions);
            conflict.hidden = false;
            setStatus('Shortcut conflict. Your existing bindings are unchanged.');
            render();
            cancel.focus();
        }
    };
    list.addEventListener('click', (event) => {
        const row = event.target.closest('[data-action]');
        if (!row) return;
        const action = row.dataset.action;
        if (event.target.closest('.shortcut-record-button')) {
            const wasRecording = recording === action;
            stopRecording();
            conflict.hidden = true;
            pendingConflict = null;
            if (!wasRecording) {
                recording = action;
                modal.dataset.shortcutRecording = 'true';
                setStatus(`Recording ${keyboardShortcuts.DEFAULT_SHORTCUTS[action].description}. Press Escape to cancel.`);
            } else setStatus('Recording cancelled.');
            render(action);
        } else if (event.target.closest('.shortcut-clear-button')) save(action, { key: null });
        else if (event.target.closest('.shortcut-reset-button')) save(action, keyboardShortcuts.DEFAULT_SHORTCUTS[action]);
    }, { signal });
    conflict.addEventListener('click', (event) => {
        const choice = event.target.closest('[data-conflict-action]')?.dataset.conflictAction;
        if (!choice || !pendingConflict) return;
        const { action, shortcut } = pendingConflict;
        if (choice === 'replace') save(action, shortcut, true);
        else {
            pendingConflict = null;
            conflict.hidden = true;
            setStatus('Existing shortcuts kept.');
            focusAction(action);
        }
    }, { signal });
    document.addEventListener('keydown', (event) => {
        if (!recording || event.isComposing) return;
        event.stopImmediatePropagation();
        if (event.key === 'Tab' || event.key === 'Escape') {
            if (event.key === 'Escape') event.preventDefault();
            const action = recording;
            stopRecording();
            setStatus('Recording cancelled.');
            render(action);
            return;
        }
        event.preventDefault();
        if (event.repeat || event.key === 'Dead' || event.getModifierState?.('AltGraph')) return;
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
            if (SELECTION_ACTIONS.has(recording)) modifierCandidate = shortcutFromEvent(event);
            return;
        }
        save(recording, shortcutFromEvent(event));
    }, { signal, capture: true });
    document.addEventListener('keyup', (event) => {
        if (!recording || !modifierCandidate || !['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        save(recording, modifierCandidate);
    }, { signal, capture: true });
    const close = () => {
        stopRecording();
        modal.classList.remove('active');
        controller.abort();
        if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('.close-customize-shortcuts, #close-customize-shortcuts-btn, .modal-overlay')) close();
    }, { signal });
    document.getElementById('reset-shortcuts-btn').addEventListener('click', () => {
        const result = keyboardShortcuts.resetShortcuts();
        stopRecording();
        pendingConflict = null;
        conflict.hidden = true;
        setStatus(result.ok ? 'Default shortcuts restored.' : result.reason);
        render();
    }, { signal });
    render();
    const savedConflicts = Object.keys(keyboardShortcuts.getShortcuts()).filter((action) => !keyboardShortcuts.validateShortcut(action, keyboardShortcuts.getShortcutForAction(action)).ok);
    if (savedConflicts.length) setStatus('Some saved shortcuts conflict or use reserved keys. Edit them below or restore defaults.');
    modal.classList.add('active');
    modal.querySelector('button')?.focus();
}
