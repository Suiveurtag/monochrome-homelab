import { getTrackArtists, getTrackTitle } from './utils.js';

const CLOSE_MS = 540;

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
