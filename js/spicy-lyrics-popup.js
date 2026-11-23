import { clearLyricsContainerSync, renderLyricsInContainer } from './lyrics.js';

export async function openSpicyLyricsPopup(player, lyricsManager) {
    const pip = window.documentPictureInPicture;
    if (!pip || !lyricsManager) return;
    if (pip.window) {
        pip.window.focus();
        return;
    }
    const view = await pip.requestWindow({ width: 420, height: 310 });
    const doc = view.document;
    doc.title = 'Spicy Lyrics';
    const style = doc.createElement('style');
    style.textContent = `
        html { color-scheme: dark; }
        body { background: #121212; color: white; margin: 0; font: 14px system-ui; }
        main { height: 100dvh; }
        main > div { padding: 1rem; }
        button { position: fixed; bottom: 10px; right: 10px; padding: .45rem .7rem; border-radius: 6px; z-index: 1; }
    `;
    doc.head.append(style);
    const host = doc.createElement('main');
    const resync = doc.createElement('button');
    resync.type = 'button';
    resync.textContent = 'Scroll to active lyric';
    resync.hidden = true;
    doc.body.append(host, resync);
    const lifetime = new AbortController();
    let render;
    let element;
    const renderTrack = async () => {
        render?.abort();
        const controller = new AbortController();
        render = controller;
        const { signal } = controller;
        resync.hidden = true;
        const track = player.currentTrack;
        if (!track || track.type === 'video') {
            clearLyricsContainerSync(host);
            const message = doc.createElement('div');
            message.textContent = 'Lyrics are not available for this track.';
            host.replaceChildren(message);
            return;
        }
        element = await renderLyricsInContainer(track, player.activeElement, lyricsManager, host, { signal });
        if (signal.aborted) return;
        element?.addEventListener('lyrics-sync-change', () => { resync.hidden = !element.isOffSync(); }, { signal });
    };
    resync.addEventListener('click', () => element?.resync());
    window.addEventListener('player-track-changed', renderTrack, { signal: lifetime.signal });
    view.addEventListener('pagehide', () => {
        lifetime.abort();
        render?.abort();
        clearLyricsContainerSync(host);
        host.replaceChildren();
    }, { once: true });
    await renderTrack();
}
