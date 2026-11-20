import { MetallicPaint } from './metallic-paint.js';

const REQUIRED_CLICKS = 5;
const CLICK_WINDOW = 1200;

function initializeMetallicLogoEasterEgg() {
    const logo = document.querySelector('.sidebar-logo-link');
    const logoImage = logo?.querySelector('.app-logo');
    const logoLabel = logo?.querySelector('.sidebar-label');
    const modal = document.getElementById('metallic-logo-easter-egg');
    const canvas = document.getElementById('metallic-logo-paint');
    const stage = modal?.querySelector('.metallic-logo-easter-egg__stage');
    const closeButton = document.getElementById('metallic-logo-easter-egg-close');
    if (!logo || !logoImage || !modal || !canvas || !stage || !closeButton) return;

    let clicks = 0;
    let resetTimer;
    let previousFocus;
    let paint;
    let sidebarCanvas;
    let animation;
    let closing = false;
    let sequence = 0;
    const travellingLogo = logoImage.cloneNode(true);
    travellingLogo.classList.add('metallic-logo-easter-egg__original');
    travellingLogo.setAttribute('aria-hidden', 'true');
    stage.append(travellingLogo);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (logoLabel) {
        logoLabel.dataset.metallicText = logoLabel.textContent;
        const labelText = document.createElement('span');
        labelText.className = 'metallic-logo-label-original';
        labelText.textContent = logoLabel.textContent;
        logoLabel.replaceChildren(labelText);
    }

    const logoTransform = () => {
        const source = logoImage.getBoundingClientRect();
        const modalRect = modal.getBoundingClientRect();
        const target = {
            left: modalRect.left + stage.offsetLeft,
            top: modalRect.top + stage.offsetTop,
            width: stage.offsetWidth,
            height: stage.offsetHeight,
        };
        if (!source.width || !target.width) return 'none';
        const x = source.left + source.width / 2 - (target.left + target.width / 2);
        const y = source.top + source.height / 2 - (target.top + target.height / 2);
        return `translate(${x}px, ${y}px) scale(${source.width / target.width}, ${source.height / target.height})`;
    };
    const travel = (from, to) => {
        animation?.cancel();
        if (reducedMotion.matches) return Promise.resolve();
        animation = stage.animate([{ transform: from }, { transform: to }], {
            duration: 500,
            easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
            fill: 'both',
        });
        return animation.finished.catch(() => {});
    };
    const showSidebarPaint = () => {
        if (!sidebarCanvas) {
            sidebarCanvas = document.createElement('canvas');
            sidebarCanvas.className = 'metallic-logo-sidebar-paint';
            sidebarCanvas.setAttribute('aria-hidden', 'true');
            logo.append(sidebarCanvas);
            new MetallicPaint(sidebarCanvas, '/images/monochrome-logo.svg', {
                onReady: () => logo.classList.add('has-metallic-logo'),
            });
        }
        logo.classList.remove('metallic-logo-in-flight');
    };
    const resetTilt = () => {
        canvas.style.removeProperty('--logo-tilt-x');
        canvas.style.removeProperty('--logo-tilt-y');
    };
    const reset = () => {
        clicks = 0;
        clearTimeout(resetTimer);
    };
    const close = async () => {
        if (closing || modal.hidden) return;
        closing = true;
        const currentSequence = ++sequence;
        const currentTransform = getComputedStyle(stage).transform;
        stage.classList.add('is-travelling');
        resetTilt();
        await travel(currentTransform, logoTransform());
        if (sequence !== currentSequence) return;
        showSidebarPaint();
        modal.hidden = true;
        document.body.classList.remove('metallic-easter-egg-open');
        paint?.destroy();
        paint = null;
        animation?.cancel();
        stage.classList.remove('is-travelling');
        closing = false;
        previousFocus?.focus();
    };
    const open = async () => {
        reset();
        const currentSequence = ++sequence;
        previousFocus = document.activeElement;
        modal.hidden = false;
        document.body.classList.add('metallic-easter-egg-open');
        logo.classList.add('metallic-logo-in-flight');
        stage.classList.add('is-travelling');
        stage.classList.remove('is-metallic');
        closeButton.focus();
        paint = new MetallicPaint(canvas, '/images/monochrome-logo.svg', {
            onReady: () => stage.classList.add('is-metallic'),
        });
        await travel(logoTransform(), 'none');
        if (sequence !== currentSequence) return;
        animation?.cancel();
        stage.classList.remove('is-travelling');
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
    stage.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse' || reducedMotion.matches) return;
        const rect = stage.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        canvas.style.setProperty('--logo-tilt-x', `${(0.5 - y) * 12}deg`);
        canvas.style.setProperty('--logo-tilt-y', `${(x - 0.5) * 12}deg`);
    });
    stage.addEventListener('pointerleave', resetTilt);
    closeButton.addEventListener('click', close);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) void close();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.hidden) void close();
    });
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initializeMetallicLogoEasterEgg, { once: true });
else initializeMetallicLogoEasterEgg();
