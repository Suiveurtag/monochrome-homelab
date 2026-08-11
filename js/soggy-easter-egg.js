const SECRET = 'SOGGY';

function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable], [role="textbox"]'));
}

function initializeSoggyEasterEgg() {
    const trigger = document.getElementById('soggy-easter-egg-trigger');
    const modal = document.getElementById('soggy-easter-egg-modal');
    const closeButton = document.getElementById('soggy-easter-egg-close');
    const audio = document.getElementById('soggy-easter-egg-audio');
    if (!trigger || !modal || !closeButton || !audio) return;

    let sequence = '';
    let previousFocus = null;

    const close = () => {
        audio.pause();
        audio.currentTime = 0;
        modal.hidden = true;
        trigger.hidden = true;
        trigger.classList.remove('is-revealed');
        if (previousFocus !== trigger) previousFocus?.focus();
    };

    const open = async () => {
        previousFocus = document.activeElement;
        modal.hidden = false;
        closeButton.focus();
        try {
            await audio.play();
        } catch {
            // Native controls remain available if a browser blocks playback.
        }
    };

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.hidden) {
            close();
            return;
        }
        if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key.length !== 1) return;

        sequence = `${sequence}${event.key.toUpperCase()}`.slice(-SECRET.length);
        if (sequence === SECRET) {
            trigger.hidden = false;
            trigger.classList.add('is-revealed');
            sequence = '';
        }
    });

    trigger.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) close();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSoggyEasterEgg, { once: true });
} else {
    initializeSoggyEasterEgg();
}
