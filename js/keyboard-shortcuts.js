// A shared registry keeps execution, settings and command-palette hints in sync.
const binding = (key, description, modifiers = {}) => ({ key, shift: false, ctrl: false, alt: false, ...modifiers, description });
export const DEFAULT_SHORTCUTS = {
    playPause: binding(' ', 'Play / pause'),
    seekForward: binding('arrowright', 'Seek forward 10 seconds'),
    seekBackward: binding('arrowleft', 'Seek backward 10 seconds'),
    nextTrack: binding('arrowright', 'Next track', { shift: true }),
    previousTrack: binding('arrowleft', 'Previous track', { shift: true }),
    volumeUp: binding('arrowup', 'Volume up'),
    volumeDown: binding('arrowdown', 'Volume down'),
    mute: binding('m', 'Mute / unmute'),
    shuffle: binding('s', 'Toggle shuffle'),
    repeat: binding('r', 'Toggle repeat'),
    queue: binding('q', 'Open queue'),
    lyrics: binding('l', 'Toggle lyrics'),
    like: binding('l', 'Like current track', { shift: true }),
    fullscreen: binding('f', 'Open now playing'),
    search: binding('/', 'Focus search'),
    commandPalette: binding('k', 'Search commands', { ctrl: true }),
    home: binding('1', 'Go to Home', { alt: true }),
    library: binding('2', 'Go to Library', { alt: true }),
    uploads: binding('3', 'Go to Uploads', { alt: true }),
    settings: binding('4', 'Go to Settings', { alt: true }),
    focusNavigation: binding('1', 'Focus navigation', { ctrl: true, shift: true }),
    focusContent: binding('2', 'Focus page content', { ctrl: true, shift: true }),
    focusPlayer: binding('3', 'Focus player', { ctrl: true, shift: true }),
    moveTrackUp: binding('arrowup', 'Move playlist track up', { alt: true, shift: true }),
    moveTrackDown: binding('arrowdown', 'Move playlist track down', { alt: true, shift: true }),
    shortcuts: binding('?', 'Show keyboard shortcuts', { shift: true }),
    escape: binding('escape', 'Close panel'),
    visualizerNext: binding(']', 'Next visualizer preset'),
    visualizerPrev: binding('[', 'Previous visualizer preset'),
    visualizerCycle: binding('\\', 'Toggle visualizer auto-cycle'),
    multiSelectToggle: binding('control', 'Toggle track selection', { ctrl: true }),
    multiSelectRange: binding('shift', 'Select track range', { shift: true }),
};
export const SELECTION_ACTIONS = new Set(['multiSelectToggle', 'multiSelectRange']);
const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta']);

export function normalizeShortcut(shortcut = {}, fallback = {}) {
    const value = { ...fallback, ...shortcut };
    const aliases = { space: ' ', spacebar: ' ', esc: 'escape', ctrl: 'control', meta: 'control' };
    const key = typeof value.key === 'string' ? value.key.toLowerCase() : null;
    return {
        key: aliases[key] || key,
        shift: !!value.shift,
        ctrl: !!value.ctrl,
        alt: !!value.alt,
        description: fallback.description || value.description || '',
    };
}

export function shortcutFromEvent(event) {
    return normalizeShortcut({ key: event.key, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey, alt: event.altKey });
}

export function shortcutSignature(shortcut) {
    const value = normalizeShortcut(shortcut);
    return value.key ? [value.ctrl ? 'ctrl' : '', value.alt ? 'alt' : '', value.shift ? 'shift' : '', value.key].join('|') : '';
}

export function matchesShortcut(event, shortcut) {
    if (!shortcut?.key || event.isComposing || event.key === 'Dead' || event.getModifierState?.('AltGraph')) return false;
    return shortcutSignature(shortcutFromEvent(event)) === shortcutSignature(shortcut);
}

export function selectionModifierMatches(event, shortcut) {
    if (!shortcut?.key) return false;
    const normalized = normalizeShortcut(shortcut);
    if (!MODIFIER_KEYS.has(normalized.key)) return matchesShortcut(event, shortcut);
    return (
        (normalized.ctrl ? !!(event.ctrlKey || event.metaKey) : true) &&
        (normalized.shift ? !!event.shiftKey : true) &&
        (normalized.alt ? !!event.altKey : true)
    );
}

export function formatShortcut(shortcut, { mac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || '') } = {}) {
    const value = normalizeShortcut(shortcut);
    if (!value.key) return 'Unassigned';
    const labels = { ' ': 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', control: mac ? '⌘' : 'Ctrl', shift: 'Shift', alt: 'Alt', pageup: 'Page Up', pagedown: 'Page Down', contextmenu: 'Menu' };
    const keys = [];
    if (value.ctrl && value.key !== 'control') keys.push(mac ? '⌘' : 'Ctrl');
    if (value.alt && value.key !== 'alt') keys.push('Alt');
    if (value.shift && value.key !== 'shift') keys.push('Shift');
    keys.push(labels[value.key] || (value.key.length === 1 ? value.key.toUpperCase() : value.key[0].toUpperCase() + value.key.slice(1)));
    return keys.join(' + ');
}

export function reservedShortcutReason(shortcut, action) {
    const value = normalizeShortcut(shortcut);
    if (!value.key) return null;
    if (value.key === 'tab') return 'Tab is reserved for moving keyboard focus.';
    if (MODIFIER_KEYS.has(value.key) && !SELECTION_ACTIONS.has(action)) return 'Choose a key together with this modifier.';
    if (value.key === 'enter' && !value.ctrl && !value.alt && !value.shift) return 'Enter is reserved for activating the focused item.';
    if (value.key === 'escape' && action !== 'escape') return 'Escape is reserved for dismissing menus and dialogs.';
    if ((value.ctrl && ['l', 't', 'w', 'n', 'r', 'tab', 'q', '+', '-', '=', '0'].includes(value.key)) ||
        (value.alt && ['arrowleft', 'arrowright', 'f4'].includes(value.key)) ||
        ['f5', 'f6', 'f11', 'f12'].includes(value.key)) return 'This shortcut is reserved by your browser or operating system.';
    return null;
}

export function findShortcutConflicts(shortcuts, action, shortcut) {
    const signature = shortcutSignature(shortcut);
    if (!signature) return [];
    return Object.entries(shortcuts).filter(([other, value]) => other !== action && shortcutSignature(value) === signature).map(([other]) => other);
}

export function createKeyboardShortcuts(storage = globalThis.localStorage, notify = () => {
    globalThis.window?.dispatchEvent(new CustomEvent('keyboard-shortcuts-changed'));
}) {
    return {
        STORAGE_KEY: 'keyboard-shortcuts',
        DEFAULT_SHORTCUTS,
        getDefaultShortcuts() { return Object.fromEntries(Object.entries(DEFAULT_SHORTCUTS).map(([id, value]) => [id, { ...value }])); },
        getShortcuts() {
            let saved = {};
            try {
                const parsed = JSON.parse(storage?.getItem(this.STORAGE_KEY) || '{}');
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
            } catch { /* Corrupt or unavailable storage falls back to the registry. */ }
            return Object.fromEntries(Object.entries(DEFAULT_SHORTCUTS).map(([id, value]) => [id, normalizeShortcut(saved[id] && typeof saved[id] === 'object' ? saved[id] : {}, value)]));
        },
        getShortcutForAction(action) { return this.getShortcuts()[action]; },
        validateShortcut(action, shortcut) {
            if (!Object.hasOwn(DEFAULT_SHORTCUTS, action)) return { ok: false, reason: 'Unknown shortcut.', conflicts: [] };
            const reason = reservedShortcutReason(shortcut, action);
            const conflicts = findShortcutConflicts(this.getShortcuts(), action, shortcut);
            return { ok: !reason && !conflicts.length, reason, conflicts };
        },
        setShortcut(action, shortcut, { replaceConflicts = false } = {}) {
            const validation = this.validateShortcut(action, shortcut);
            if (validation.reason || (validation.conflicts.length && !replaceConflicts)) return validation;
            const shortcuts = this.getShortcuts();
            for (const conflict of validation.conflicts) shortcuts[conflict] = normalizeShortcut({ key: null }, DEFAULT_SHORTCUTS[conflict]);
            shortcuts[action] = normalizeShortcut(shortcut, DEFAULT_SHORTCUTS[action]);
            try { storage.setItem(this.STORAGE_KEY, JSON.stringify(shortcuts)); }
            catch { return { ok: false, reason: 'Your browser could not save shortcuts. Check its storage settings.', conflicts: [] }; }
            notify();
            return { ok: true, conflicts: validation.conflicts };
        },
        resetShortcuts() {
            try { storage.removeItem(this.STORAGE_KEY); }
            catch { return { ok: false, reason: 'Your browser could not reset shortcuts.' }; }
            notify();
            return { ok: true };
        },
    };
}

export const keyboardShortcuts = createKeyboardShortcuts();
