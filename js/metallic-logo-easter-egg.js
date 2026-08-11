import { MetallicPaint } from './metallic-paint.js';

const REQUIRED_CLICKS = 5;
const CLICK_WINDOW = 1200;

function initializeMetallicLogoEasterEgg() {
    const logo = document.querySelector('.sidebar-logo-link');
    const modal = document.getElementById('metallic-logo-easter-egg');
    const canvas = document.getElementById('metallic-logo-paint');
    const closeButton = document.getElementById('metallic-logo-easter-egg-close');
    if (!logo || !modal || !canvas || !closeButton) return;

    let clicks = 0;
    let resetTimer;
    let previousFocus;
    let paint;
    const reset = () => {
        clicks = 0;
        clearTimeout(resetTimer);
    };
    const close = () => {
        modal.hidden = true;
        document.body.classList.remove('metallic-easter-egg-open');
        paint?.destroy();
        paint = null;
        previousFocus?.focus();
    };
    const open = () => {
        reset();
        previousFocus = document.activeElement;
        modal.hidden = false;
        document.body.classList.add('metallic-easter-egg-open');
        paint = new MetallicPaint(canvas, '/images/monochrome-logo.svg');
        closeButton.focus();
    };

    logo.addEventListener('click', (event) => {
        event.preventDefault();
        clicks += 1;
        clearTimeout(resetTimer);
        if (clicks === REQUIRED_CLICKS) return open();
        resetTimer = setTimeout(() => {
            if (clicks) window.location.assign(logo.href);
            reset();
        }, CLICK_WINDOW);
    });
    closeButton.addEventListener('click', close);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) close();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.hidden) close();
    });
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initializeMetallicLogoEasterEgg, { once: true });
else initializeMetallicLogoEasterEgg();
