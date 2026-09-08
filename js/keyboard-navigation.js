import {
    keyboardShortcuts,
    matchesShortcut,
    selectionModifierMatches,
    reservedShortcutReason,
    SELECTION_ACTIONS,
} from './keyboard-shortcuts.js';
import '../styles/keyboard-navigation.css';

const ROWS =
    '.track-item[data-track-id], .queue-track-item, .queue-track-row[data-queue-index], .card[data-href], .card[data-track-id], .modal-option, .create-new-playlist';
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"], summary';
const NATIVE = 'a[href], button, input, select, textarea, summary';
const DIALOGS =
    '.modal, body > .modal-overlay:has(.modal-content), #command-palette-overlay, [role="dialog"][aria-modal="true"], dialog[open]';

export function isKeyboardVisible(element) {
    return (
        !!element?.isConnected &&
        !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
        getComputedStyle(element).visibility !== 'hidden' &&
        element.getClientRects().length > 0
    );
}

export function isEditingTarget(target) {
    return !!target?.closest?.(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], audio[controls], video[controls]'
    );
}

export function getFocusableElements(container) {
    return [...container.querySelectorAll(FOCUSABLE)].filter(
        (element) => element.tabIndex >= 0 && !element.disabled && isKeyboardVisible(element)
    );
}

export function focusRegion(selector) {
    const region = [...document.querySelectorAll(selector)].find(isKeyboardVisible);
    if (!region) return;
    const target = getFocusableElements(region)[0] || region;
    if (target === region && !region.hasAttribute('tabindex')) region.tabIndex = -1;
    target.focus({ preventScroll: false });
}

function rowGroup(row) {
    return (
        row.closest('.track-list, .queue-track-list, .card-grid, .modal-list, .playlist-body, [data-keyboard-list]') ||
        row.parentElement
    );
}

function siblingRows(row) {
    const group = rowGroup(row);
    return [...group.querySelectorAll(ROWS)].filter((item) => rowGroup(item) === group && isKeyboardVisible(item));
}

function focusRow(row) {
    if (!row) return;
    const group = rowGroup(row);
    for (const item of group.querySelectorAll('[data-keyboard-row]')) {
        if (rowGroup(item) === group) item.tabIndex = item === row ? 0 : -1;
    }
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}

/** Enhances generated rows and legacy dialogs without replacing their click/data handlers. */
export function initializeKeyboardNavigation(root = document) {
    let lastFocus = document.activeElement;
    let openDialogs = [];
    const returnTargets = new WeakMap();
    const activeDialog = () => openDialogs.at(-1);
    const enhance = (node) => {
        if (!(node instanceof Element) && node !== document) return;
        const rows = [...(node.matches?.(ROWS) ? [node] : []), ...node.querySelectorAll(ROWS)];
        for (const row of rows) {
            if (row.dataset.keyboardRow) continue;
            row.dataset.keyboardRow = 'true';
            const hasEntry = rowGroup(row).querySelector('[data-keyboard-row][tabindex="0"]');
            if (!row.hasAttribute('tabindex')) row.tabIndex = hasEntry ? -1 : 0;
            if (!row.hasAttribute('role'))
                row.setAttribute('role', row.matches('.modal-option, .create-new-playlist') ? 'button' : 'group');
            if (!row.hasAttribute('aria-label')) {
                const title = row
                    .querySelector('.title, .card-title, .queue-track-title, .queue-track-copy strong')
                    ?.textContent.trim();
                if (title) row.setAttribute('aria-label', title);
            }
            row.setAttribute('aria-keyshortcuts', 'Enter Shift+F10');
        }
        const checkboxes = [
            ...(node.matches?.('.track-checkbox') ? [node] : []),
            ...node.querySelectorAll('.track-checkbox'),
        ];
        for (const checkbox of checkboxes) {
            checkbox.setAttribute('role', 'checkbox');
            checkbox.tabIndex = 0;
            checkbox.setAttribute('aria-label', 'Select track');
            checkbox.setAttribute('aria-checked', String(checkbox.classList.contains('checked')));
        }
    };
    const syncDialogs = () => {
        const visible = [...root.querySelectorAll(DIALOGS)]
            .filter(isKeyboardVisible)
            .filter((dialog, _, all) => !all.some((other) => other !== dialog && other.contains(dialog)));
        // Keep opening order, including a pre-existing modal opened over a newer one.
        const next = [
            ...openDialogs.filter((dialog) => visible.includes(dialog)),
            ...visible.filter((dialog) => !openDialogs.includes(dialog)),
        ];
        for (const closed of openDialogs.filter((dialog) => !next.includes(dialog)).reverse()) {
            const target = returnTargets.get(closed);
            if (
                target &&
                isKeyboardVisible(target) &&
                (closed.contains(document.activeElement) || document.activeElement === document.body)
            )
                target.focus({ preventScroll: true });
        }
        for (const dialog of next.filter((item) => !openDialogs.includes(item))) {
            returnTargets.set(dialog, dialog.contains(lastFocus) ? null : lastFocus);
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
                const heading = dialog.querySelector('h1, h2, h3');
                if (heading) dialog.setAttribute('aria-label', heading.textContent.trim());
            }
            if (!dialog.contains(document.activeElement)) {
                const target = getFocusableElements(dialog)[0] || dialog;
                if (target === dialog) dialog.tabIndex = -1;
                target.focus({ preventScroll: true });
            }
        }
        openDialogs = next;
    };
    const onFocus = (event) => {
        lastFocus = event.target;
        const row = event.target.closest?.('[data-keyboard-row]');
        if (row && event.target === row) {
            for (const item of siblingRows(row)) item.tabIndex = item === row ? 0 : -1;
        }
    };
    const closeDialog = (dialog) => {
        if (dialog instanceof HTMLDialogElement) {
            dialog.close();
            return;
        }
        if (dialog.id === 'command-palette-overlay') {
            window.dispatchEvent(new CustomEvent('command-palette-close'));
            return;
        }
        const overlay = dialog.querySelector(':scope > .modal-overlay');
        const close = dialog.querySelector(
            '[data-dismiss="modal"], .modal-close, .close-shortcuts, .close-customize-shortcuts, .queue-back-button, button[id$="-cancel"], button[id$="-close"]'
        );
        if (close) close.click();
        else if (overlay) overlay.click();
        else dialog.click();
    };
    const onDialogKey = (event) => {
        const dialog = activeDialog();
        if (!dialog || !isKeyboardVisible(dialog) || event.defaultPrevented || event.isComposing) return;
        // Recording owns all keys, including Escape/Tab cancellation.
        if (dialog.dataset.shortcutRecording === 'true') return;
        if (event.key === 'Tab') {
            const items = getFocusableElements(dialog);
            const first = items[0];
            const last = items.at(-1);
            if (
                !items.length ||
                !dialog.contains(document.activeElement) ||
                (event.shiftKey && document.activeElement === first) ||
                (!event.shiftKey && document.activeElement === last)
            ) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
            }
        } else if (event.key === 'Escape' && dialog.id !== 'command-palette-overlay') {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeDialog(dialog);
        }
    };
    const onKey = (event) => {
        if (event.defaultPrevented || event.isComposing || isEditingTarget(event.target)) return;
        const target = event.target;
        const checkbox = target.closest?.('.track-checkbox');
        if (checkbox && (event.key === ' ' || event.key === 'Enter')) {
            event.preventDefault();
            checkbox.click();
            return;
        }
        const tabs = target.closest?.('.settings-tabs, [role="tablist"]');
        if (tabs && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) && !event.ctrlKey && !event.altKey) {
            const items = [...tabs.querySelectorAll('button, [role="tab"]')].filter(isKeyboardVisible);
            const index = items.indexOf(target);
            const next =
                event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
            event.preventDefault();
            items[next]?.focus();
            items[next]?.click();
            return;
        }
        if (target.matches?.(NATIVE)) return;
        const row = target.closest?.('[data-keyboard-row]');
        if (!row || row !== target) return;
        if (row.matches('.track-item[data-track-id]')) {
            const selects = (action) => {
                const shortcut = keyboardShortcuts.getShortcutForAction(action);
                return ['control', 'shift', 'alt', 'meta'].includes(shortcut?.key)
                    ? event.key === ' ' && selectionModifierMatches(event, shortcut)
                    : matchesShortcut(event, shortcut);
            };
            const range = selects('multiSelectRange');
            if (range || selects('multiSelectToggle')) {
                event.preventDefault();
                root.dispatchEvent(
                    new CustomEvent('keyboard-track-selection', { bubbles: true, detail: { row, range } })
                );
                return;
            }
        }
        if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
            event.preventDefault();
            const menuButton = row.querySelector('.track-menu-btn, .card-menu-btn, [data-action="menu"]');
            if (menuButton) menuButton.click();
            else {
                const rect = row.getBoundingClientRect();
                row.dispatchEvent(
                    new MouseEvent('contextmenu', {
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left + 32,
                        clientY: rect.top + Math.min(rect.height, 36),
                    })
                );
            }
            return;
        }
        if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            event.preventDefault();
            if (!row.matches('.unavailable, .blocked, [aria-disabled="true"]')) {
                (row.querySelector('.queue-track-main') || row).click();
            }
            return;
        }
        if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        const rows = siblingRows(row);
        const index = rows.indexOf(row);
        let next;
        if (event.key === 'ArrowDown' || (row.matches('.card') && event.key === 'ArrowRight'))
            next = Math.min(rows.length - 1, index + 1);
        else if (event.key === 'ArrowUp' || (row.matches('.card') && event.key === 'ArrowLeft'))
            next = Math.max(0, index - 1);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = rows.length - 1;
        else if (event.key === 'PageDown') next = Math.min(rows.length - 1, index + 10);
        else if (event.key === 'PageUp') next = Math.max(0, index - 10);
        else return;
        event.preventDefault();
        focusRow(rows[next]);
    };
    enhance(root);
    syncDialogs();
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) enhance(node);
            if (record.type === 'attributes' && record.target.matches('.track-checkbox')) {
                record.target.setAttribute('aria-checked', String(record.target.classList.contains('checked')));
            }
        }
        syncDialogs();
    });
    observer.observe(root === document ? document.body : root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'open'],
    });
    root.addEventListener('focusin', onFocus);
    root.addEventListener('keydown', onDialogKey, true);
    root.addEventListener('keydown', onKey);
    return () => {
        observer.disconnect();
        root.removeEventListener('focusin', onFocus);
        root.removeEventListener('keydown', onDialogKey, true);
        root.removeEventListener('keydown', onKey);
    };
}

export function installKeyboardShortcuts(actions, { registry = keyboardShortcuts, root = document } = {}) {
    const handleKey = (event) => {
        if (event.defaultPrevented || event.isComposing || isEditingTarget(event.target)) return;
        const shortcuts = registry.getShortcuts();
        const modal = [...document.querySelectorAll(DIALOGS)].some(isKeyboardVisible);
        for (const [action, shortcut] of Object.entries(shortcuts)) {
            if (
                SELECTION_ACTIONS.has(action) ||
                !actions[action] ||
                reservedShortcutReason(shortcut, action) ||
                !matchesShortcut(event, shortcut)
            )
                continue;
            if (modal && action !== 'escape') return;
            if (
                event.target.closest?.(NATIVE) &&
                [' ', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'home', 'end'].includes(
                    event.key.toLowerCase()
                )
            )
                return;
            if (event.repeat && !['seekForward', 'seekBackward', 'volumeUp', 'volumeDown'].includes(action)) return;
            event.preventDefault();
            Promise.resolve(actions[action]()).catch(console.error);
            return;
        }
    };
    root.addEventListener('keydown', handleKey);
    return () => root.removeEventListener('keydown', handleKey);
}
