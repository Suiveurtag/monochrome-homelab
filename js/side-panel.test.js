import { afterEach, describe, expect, test } from 'vitest';
import { SidePanelManager } from './side-panel.js';

function mountSidePanel() {
    document.body.innerHTML = `
        <aside id="side-panel" class="side-panel">
            <div id="side-panel-resizer"></div>
            <h2 id="side-panel-title"></h2>
            <div id="side-panel-controls"></div>
            <div id="side-panel-content"></div>
        </aside>
    `;
    return new SidePanelManager();
}

afterEach(() => document.body.replaceChildren());

describe('SidePanelManager async rendering', () => {
    test('aborts an in-flight renderer and clears the panel immediately for fullscreen transfer', async () => {
        const manager = mountSidePanel();
        let releaseRender;
        let markStarted;
        const started = new Promise((resolve) => (markStarted = resolve));
        const holdRender = new Promise((resolve) => (releaseRender = resolve));

        manager.open('lyrics', 'Lyrics', null, async (container, { signal }) => {
            markStarted();
            await holdRender;
            if (!signal.aborted) container.textContent = 'stale lyrics';
        });

        await started;
        const pendingRender = manager.pendingRender;
        manager.close({ immediate: true });
        releaseRender();
        await pendingRender;

        expect(manager.panel.classList.contains('active')).toBe(false);
        expect(manager.currentView).toBe(null);
        expect(manager.contentElement.textContent).toBe('');
    });
});
