export class SidePanelManager {
    constructor() {
        this.panel = document.getElementById('side-panel');
        this.titleElement = document.getElementById('side-panel-title');
        this.controlsElement = document.getElementById('side-panel-controls');
        this.contentElement = document.getElementById('side-panel-content');
        this.resizerElement = document.getElementById('side-panel-resizer');
        this.currentView = null; // 'queue' or 'lyrics'
        this.isResizing = false;
        this.renderController = null;
        this.pendingRender = null;
        this.clearTimer = null;

        if (this.resizerElement) {
            this.initResizer();
        }
    }

    emitChange() {
        window.dispatchEvent(
            new CustomEvent('side-panel-changed', {
                detail: {
                    active: this.panel.classList.contains('active'),
                    view: this.currentView,
                },
            })
        );
    }

    initResizer() {
        this.resizerElement.addEventListener('mousedown', this.startResize.bind(this));

        // Restore saved width if available
        const savedWidth = localStorage.getItem('side-panel-width');
        if (savedWidth) {
            this.panel.style.setProperty('--side-panel-width', savedWidth + 'px');
        }
    }

    startResize(e) {
        e.preventDefault();
        this.isResizing = true;
        this.panel.style.transition = 'none'; // Disable transition for smooth resizing
        document.body.style.cursor = 'ew-resize';

        this.resizeBind = this.resize.bind(this);
        this.stopResizeBind = this.stopResize.bind(this);

        document.addEventListener('mousemove', this.resizeBind);
        document.addEventListener('mouseup', this.stopResizeBind);
    }

    resize(e) {
        if (!this.isResizing) return;
        // The panel is on the right side. Screen width - mouse X = desired width.
        const minWidth = 300;
        const maxWidth = window.innerWidth * 0.9;
        let newWidth = window.innerWidth - e.clientX;

        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;

        this.panel.style.setProperty('--side-panel-width', `${newWidth}px`);
    }

    stopResize() {
        this.isResizing = false;
        this.panel.style.transition = ''; // Restore transitions
        document.body.style.cursor = '';

        document.removeEventListener('mousemove', this.resizeBind);
        document.removeEventListener('mouseup', this.stopResizeBind);

        // Save the width
        const currentWidth = this.panel.style.getPropertyValue('--side-panel-width').replace('px', '');
        if (currentWidth) {
            localStorage.setItem('side-panel-width', currentWidth);
        }
    }

    open(view, title, renderControlsCallback, renderContentCallback, forceOpen = false) {
        // If clicking the same view that is already open, close it
        if (!forceOpen && this.currentView === view && this.panel.classList.contains('active')) {
            this.close();
            return;
        }

        this.cancelPendingRender();
        if (this.clearTimer) {
            clearTimeout(this.clearTimer);
            this.clearTimer = null;
        }

        this.currentView = view;
        this.panel.dataset.view = view;
        this.titleElement.textContent = title;

        // Clear previous content
        this.controlsElement.innerHTML = '';
        this.contentElement.innerHTML = '';

        // Render new content
        if (renderControlsCallback) renderControlsCallback(this.controlsElement);
        if (renderContentCallback) {
            const controller = new AbortController();
            const renderContext = {
                signal: controller.signal,
                isCurrent: () =>
                    !controller.signal.aborted && this.renderController === controller && this.currentView === view,
            };
            this.renderController = controller;
            this.pendingRender = Promise.resolve()
                .then(() => renderContentCallback(this.contentElement, renderContext))
                .catch((error) => {
                    if (error?.name !== 'AbortError') console.error(`Failed to render ${view} side panel:`, error);
                })
                .finally(() => {
                    if (this.renderController === controller) this.renderController = null;
                    if (this.pendingRender && this.renderController === null) this.pendingRender = null;
                });
        }

        this.panel.classList.add('active');
        this.emitChange();
    }

    cancelPendingRender() {
        if (this.renderController) {
            this.renderController.abort();
            this.renderController = null;
        }
    }

    close({ immediate = false } = {}) {
        this.cancelPendingRender();
        this.panel.classList.remove('active');
        this.currentView = null;
        this.emitChange();

        const clearContent = () => {
            if (!this.panel.classList.contains('active')) {
                this.controlsElement.innerHTML = '';
                this.contentElement.innerHTML = '';
            }
            this.clearTimer = null;
        };

        if (this.clearTimer) clearTimeout(this.clearTimer);
        if (immediate) {
            clearContent();
        } else {
            // Keep the closing animation intact for regular panel interactions.
            this.clearTimer = setTimeout(clearContent, 300);
        }
    }

    isActive(view) {
        return this.currentView === view && this.panel.classList.contains('active');
    }

    async refresh(view, renderControlsCallback, renderContentCallback, options = {}) {
        if (this.isActive(view)) {
            if (renderControlsCallback) {
                this.controlsElement.innerHTML = '';
                await renderControlsCallback(this.controlsElement);
            }
            if (renderContentCallback) {
                if (!options.noClear) {
                    this.contentElement.innerHTML = '';
                }
                await renderContentCallback(this.contentElement);
            }
        }
    }

    async updateContent(view, renderContentCallback) {
        if (this.isActive(view)) {
            this.contentElement.innerHTML = '';
            await renderContentCallback(this.contentElement);
        }
    }
}

export const sidePanelManager = new SidePanelManager();
