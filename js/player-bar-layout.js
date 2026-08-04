import { playerBarLayoutSettings } from './storage.js';

const ICONS = {
    favorite:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    mix: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l10 10h3M17 7h3v3M4 17h3l3-3m4-4 3-3h3"/></svg>',
    lyrics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l10-2v13M9 9l10-2M6 21c-2 0-3-1-3-2.5S4 16 6 16s3 1 3 2.5S8 21 6 21Zm10-2c-2 0-3-1-3-2.5s1-2.5 3-2.5 3 1 3 2.5S18 19 16 19Z"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></svg>',
    cast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 16.1A5 5 0 0 1 6 20M2 12a9 9 0 0 1 8 8M2 7V4h20v15h-8"/></svg>',
    equalizer:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18v-5m0-4V4m8 14v-8m0-4V4m8 14v-3m0-4V4M2 13h4M10 6h4m4 9h4"/></svg>',
    'sleep-timer':
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/></svg>',
    queue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h8m5-3 3 3-3 3"/></svg>',
};

export const PLAYER_ACTIONS = [
    ['favorite', 'Favorites'],
    ['mix', 'Track Mix'],
    ['lyrics', 'Lyrics'],
    ['download', 'Download'],
    ['cast', 'Cast'],
    ['equalizer', 'Equalizer'],
    ['sleep-timer', 'Sleep timer'],
    ['queue', 'Queue'],
].map(([id, label]) => ({ id, label, icon: ICONS[id] }));

export function applyPlayerActionLayout(layout = playerBarLayoutSettings.getLayout()) {
    const hidden = new Set(layout.hidden);
    layout.visible.forEach((id, index) => {
        document.querySelectorAll(`[data-player-action="${id}"]`).forEach((button) => {
            button.style.order = String(index);
        });
    });
    document.querySelectorAll('[data-player-action]').forEach((button) => {
        button.classList.toggle('player-action-user-hidden', hidden.has(button.dataset.playerAction));
    });
}

export function initializePlayerActionLayout() {
    applyPlayerActionLayout();
    window.addEventListener('player-bar-layout-changed', (event) => applyPlayerActionLayout(event.detail));
}

function actionCard(action, zone) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'player-action-card';
    card.draggable = true;
    card.dataset.actionId = action.id;
    card.dataset.zone = zone;
    card.setAttribute('aria-label', `${action.label}. Drag to reorder or press Enter to move.`);
    card.innerHTML = `<span class="player-action-card-icon">${action.icon}</span><span>${action.label}</span><span class="player-action-grip" aria-hidden="true">⠿</span>`;
    return card;
}

export function initializePlayerLayoutEditor() {
    const editor = document.getElementById('player-action-editor');
    if (!editor || editor.dataset.ready === 'true') return;
    editor.dataset.ready = 'true';
    const zones = [...editor.querySelectorAll('[data-player-action-zone]')];
    let layout = playerBarLayoutSettings.getLayout();
    let draggedId = null;

    const saveFromDom = () => {
        layout = playerBarLayoutSettings.setLayout({
            visible: [...editor.querySelectorAll('[data-player-action-zone="visible"] .player-action-card')].map(
                (el) => el.dataset.actionId
            ),
            hidden: [...editor.querySelectorAll('[data-player-action-zone="hidden"] .player-action-card')].map(
                (el) => el.dataset.actionId
            ),
        });
    };
    const render = () => {
        zones.forEach((zone) => {
            zone.replaceChildren();
        });
        ['visible', 'hidden'].forEach((zoneName) => {
            const zone = editor.querySelector(`[data-player-action-zone="${zoneName}"]`);
            layout[zoneName].forEach((id) => {
                const action = PLAYER_ACTIONS.find((item) => item.id === id);
                if (action) zone.appendChild(actionCard(action, zoneName));
            });
        });
    };

    editor.addEventListener('dragstart', (event) => {
        const card = event.target.closest('.player-action-card');
        if (!card) return;
        draggedId = card.dataset.actionId;
        card.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedId);
    });
    editor.addEventListener('dragend', (event) => {
        event.target.closest('.player-action-card')?.classList.remove('is-dragging');
        zones.forEach((zone) => zone.classList.remove('is-drag-over'));
        draggedId = null;
    });
    zones.forEach((zone) => {
        zone.addEventListener('dragover', (event) => {
            event.preventDefault();
            zone.classList.add('is-drag-over');
            const dragged = editor.querySelector(`[data-action-id="${draggedId}"]`);
            const target = event.target.closest('.player-action-card');
            if (dragged && target && target !== dragged) {
                const rect = target.getBoundingClientRect();
                zone.insertBefore(dragged, event.clientX < rect.left + rect.width / 2 ? target : target.nextSibling);
            } else if (dragged && !target) zone.appendChild(dragged);
        });
        zone.addEventListener('dragleave', (event) => {
            if (!zone.contains(event.relatedTarget)) zone.classList.remove('is-drag-over');
        });
        zone.addEventListener('drop', (event) => {
            event.preventDefault();
            zone.classList.remove('is-drag-over');
            saveFromDom();
        });
    });
    editor.addEventListener('keydown', (event) => {
        const card = event.target.closest('.player-action-card');
        if (!card) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const targetZone =
                card.closest('[data-player-action-zone]').dataset.playerActionZone === 'visible' ? 'hidden' : 'visible';
            editor.querySelector(`[data-player-action-zone="${targetZone}"]`).appendChild(card);
            saveFromDom();
            card.focus();
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const sibling = event.key === 'ArrowLeft' ? card.previousElementSibling : card.nextElementSibling;
            if (sibling)
                card.parentElement.insertBefore(card, event.key === 'ArrowLeft' ? sibling : sibling.nextSibling);
            saveFromDom();
            card.focus();
        }
    });
    document.getElementById('player-layout-reset')?.addEventListener('click', () => {
        layout = playerBarLayoutSettings.reset();
        render();
    });
    render();
}
