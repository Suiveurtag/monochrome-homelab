import { getTrackArtists, getTrackTitle } from './utils.js';

const CLOSE_MS = 540;
const DOZE_MS = 4800;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOON_PATH =
    'M17.827 14.348a7.92 7.92 0 1 1-8.336-8.335c.356-.019.543.405.354.707a5.28 5.28 0 0 0 7.276 7.276c.303-.189.726-.004.707.353';
const DOZE_Z = ['M16 5.5h2.6l-2.6 2.6h2.6', 'M17 6h2.2l-2.2 2.2h2.2', 'M15.5 6.5h1.9l-1.9 1.9h1.9'];

function svgEl(tag, attrs = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    return element;
}

function buildDoze() {
    const scene = document.createElement('span');
    scene.className = 'sleep-doze';
    scene.setAttribute('aria-hidden', 'true');
    for (const part of ['sky', 'ripple', 'stars', 'cloud']) {
        const layer = document.createElement('span');
        layer.className = `sleep-doze__${part}`;
        scene.append(layer);
    }
    const moon = svgEl('svg', { class: 'sleep-doze__moon', viewBox: '0 0 24 24' });
    moon.append(svgEl('path', { class: 'sleep-doze__crescent', d: MOON_PATH }));
    DOZE_Z.forEach((d) => moon.append(svgEl('path', { class: 'sleep-doze__z', d })));
    scene.append(moon);
    return scene;
}

// Night screen turned off: the same night falls, but only inside the player bar's sleep button.
// A little sky opens around the icon, the moon settles in and rocks, z's float up out of the bar,
// then the sky closes back onto the resting icon.
export function playSleepDoze() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const button of document.querySelectorAll('.now-playing-bar .sleep-timer-button')) {
        if (!button.offsetParent) continue;
        let scene = button.querySelector(':scope > .sleep-doze');
        if (!scene) {
            scene = buildDoze();
            button.append(scene);
        }
        clearTimeout(button.sleepDozeTimer);
        button.classList.remove('is-dozing');
        void button.offsetWidth;
        button.classList.add('is-dozing');
        button.sleepDozeTimer = setTimeout(() => button.classList.remove('is-dozing'), DOZE_MS);
    }
}

// Full-screen "lights out" scene shown when the sleep timer pauses playback.
export function setupSleepNightfall(player, { onExtend } = {}) {
    const root = document.getElementById('sleep-nightfall');
    if (!root) return { show() {} };
    const title = document.getElementById('sleep-nightfall-title');
    const detail = document.getElementById('sleep-nightfall-detail');
    const resumeButton = document.getElementById('sleep-nightfall-resume');
    const extendButton = document.getElementById('sleep-nightfall-extend');
    const closeButton = document.getElementById('sleep-nightfall-close');
    const sky = root.querySelector('.sleep-nightfall__sky');
    const focusables = [resumeButton, extendButton, closeButton];

    let previousFocus = null;
    let closeTimer = null;

    const describe = () => {
        const track = player.currentTrack;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        detail.replaceChildren();
        if (track) {
            const name = document.createElement('strong');
            name.textContent = getTrackTitle(track);
            const artists = getTrackArtists(track);
            detail.append('The sleep timer paused ', name, artists ? ` by ${artists}` : '', ' at ');
        } else {
            detail.append('The sleep timer paused playback at ');
        }
        const clock = document.createElement('span');
        clock.className = 'sleep-nightfall__time';
        clock.textContent = time;
        detail.append(clock, '.');
    };

    const onKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        } else if (event.key === 'Tab') {
            const index = focusables.indexOf(document.activeElement);
            const next = event.shiftKey
                ? (index <= 0 ? focusables.length : index) - 1
                : (index + 1) % focusables.length;
            event.preventDefault();
            focusables[next].focus();
        }
    };

    const onPlaybackIntent = (event) => {
        if (event.detail?.playing) close({ restoreFocus: false });
    };

    function show() {
        clearTimeout(closeTimer);
        describe();
        title.textContent = 'Sleep well';
        // Also re-captured when reopened mid-close, since close() already released the previous one.
        if (!previousFocus && !root.contains(document.activeElement)) previousFocus = document.activeElement;
        root.hidden = false;
        root.classList.remove('is-closing');
        void root.offsetWidth;
        root.classList.add('is-open');
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('player-playback-intent', onPlaybackIntent);
        // The dialog itself takes focus: no ring lights up over a sleeping room, and Tab enters the actions.
        root.focus({ preventScroll: true });
    }

    function close({ restoreFocus = true } = {}) {
        if (root.hidden || root.classList.contains('is-closing')) return;
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('player-playback-intent', onPlaybackIntent);
        root.classList.add('is-closing');
        root.classList.remove('is-open');
        closeTimer = setTimeout(() => {
            root.hidden = true;
            root.classList.remove('is-closing');
        }, CLOSE_MS);
        if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        previousFocus = null;
    }

    const resume = () => {
        close();
        const el = player.activeElement;
        // "End of this track" stopped on an ended element: resuming means the next track, not a replay.
        if (el?.ended) void player.playNext();
        else if (el?.paused) void player.handlePlayPause();
    };

    resumeButton.addEventListener('click', resume);
    extendButton.addEventListener('click', () => {
        resume();
        player.setSleepTimer(15);
        onExtend?.();
    });
    closeButton.addEventListener('click', () => close());
    sky.addEventListener('click', () => close());

    return { show, close };
}
