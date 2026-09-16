//js/ui-interactions.js
import { db } from './db.js';
import { syncManager } from './accounts/pocketbase.js';
import { showNotification } from './downloads.js';

export function initializeUIInteractions(player, _api, ui) {
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const libraryPage = document.getElementById('page-library');

    if (libraryPage) {
        libraryPage.addEventListener('dragstart', (e) => {
            const playlistCard = e.target.closest('.card.user-playlist');
            if (playlistCard) {
                e.dataTransfer.setData('text/playlist-id', playlistCard.dataset.userPlaylistId);
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        const handleDragOver = (e) => {
            const folderCard = e.target.closest('.card[data-folder-id]');
            if (folderCard && e.dataTransfer.types.includes('text/playlist-id')) {
                e.preventDefault();
                folderCard.classList.add('drag-over');
            }
        };

        const handleDragLeave = (e) => {
            const folderCard = e.target.closest('.card[data-folder-id]');
            if (folderCard) {
                folderCard.classList.remove('drag-over');
            }
        };

        const handleDrop = async (e) => {
            e.preventDefault();
            const folderCard = e.target.closest('.card[data-folder-id]');
            if (folderCard) {
                folderCard.classList.remove('drag-over');
                const playlistId = e.dataTransfer.getData('text/playlist-id');
                const folderId = folderCard.dataset.folderId;

                if (playlistId && folderId) {
                    const updatedFolder = await db.addPlaylistToFolder(folderId, playlistId);
                    await syncManager.syncUserFolder(updatedFolder, 'update');
                    const subtitle = folderCard.querySelector('.card-subtitle');
                    if (subtitle) {
                        subtitle.textContent = `${updatedFolder.playlists.length} playlists`;
                    }
                    showNotification('Playlist added to folder');
                }
            }
        };

        libraryPage.addEventListener('dragover', handleDragOver);
        libraryPage.addEventListener('dragleave', handleDragLeave);
        libraryPage.addEventListener('drop', handleDrop);
    }

    // Sidebar mobile
    hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.add('is-open');
        sidebarOverlay.classList.add('is-visible');
    });

    const closeSidebar = () => {
        sidebar.classList.remove('is-open');
        sidebarOverlay.classList.remove('is-visible');
    };

    sidebarOverlay.addEventListener('click', closeSidebar);

    sidebar.addEventListener('click', (e) => {
        if (e.target.closest('a')) {
            closeSidebar();
        }
    });

    // Queue is rendered exclusively by the integrated Now Playing panel.
    const queueBtn = document.getElementById('queue-btn');
    queueBtn?.addEventListener('click', () => {
        window.nowPlayingPanel?.openQueue?.();
    });

    // Expose queue updates to the integrated Now Playing panel.
    window.renderQueueFunction = async () => {
        if (window.nowPlayingPanel?.activeView === 'queue') {
            await window.nowPlayingPanel.render({ preserveScroll: true });
        }

        const overlay = document.getElementById('fullscreen-cover-overlay');
        if (overlay && getComputedStyle(overlay).display !== 'none') {
            ui.updateFullscreenMetadata(player.currentTrack, player.getNextTrack());
        }
    };

    const folderPage = document.getElementById('page-folder');
    if (folderPage) {
        folderPage.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('text/playlist-id')) {
                e.preventDefault();
                folderPage.classList.add('drag-over-folder-page');
            }
        });
        folderPage.addEventListener('dragleave', () => {
            folderPage.classList.remove('drag-over-folder-page');
        });
        folderPage.addEventListener('drop', async (e) => {
            e.preventDefault();
            folderPage.classList.remove('drag-over-folder-page');
            const playlistId = e.dataTransfer.getData('text/playlist-id');
            const folderId = window.location.pathname.split('/')[2];
            if (playlistId && folderId) {
                try {
                    const updatedFolder = await db.addPlaylistToFolder(folderId, playlistId);
                    await syncManager.syncUserFolder(updatedFolder, 'update');
                    window.dispatchEvent(new HashChangeEvent('hashchange'));
                    showNotification('Playlist added to folder');
                } catch (error) {
                    console.error('Failed to add playlist to folder:', error);
                    showNotification('Failed to add playlist to folder', 'error');
                }
            }
        });
    }

    // Search and Library tabs
    document.querySelectorAll('.search-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const page = tab.closest('.page');
            if (!page) return;

            page.querySelectorAll('.search-tab').forEach((t) => t.classList.remove('active'));
            page.querySelectorAll('.search-tab-content').forEach((c) => c.classList.remove('active'));

            tab.classList.add('active');

            const prefix = page.id === 'page-library' ? 'library-tab-' : 'search-tab-';
            const contentId = `${prefix}${tab.dataset.tab}`;
            document.getElementById(contentId)?.classList.add('active');
        });
    });

    // Settings tabs
    document.querySelectorAll('.settings-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab').forEach((t) => t.classList.remove('active'));
            document.querySelectorAll('.settings-tab-content').forEach((c) => c.classList.remove('active'));

            tab.classList.add('active');

            const contentId = `settings-tab-${tab.dataset.tab}`;
            document.getElementById(contentId)?.classList.add('active');

            // Save active tab
            import('./storage.js')
                .then(({ settingsUiState }) => {
                    settingsUiState.setActiveTab(tab.dataset.tab);
                })
                .catch(console.error);
        });
    });

    // Tooltip for truncated text (desktop hover only)
    const canUseHoverTooltips = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let tooltipEl = null;

    if (canUseHoverTooltips) {
        tooltipEl = document.getElementById('custom-tooltip');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'custom-tooltip';
            document.body.appendChild(tooltipEl);
        }

        const updateTooltipPosition = (e) => {
            const x = e.clientX + 15;
            const y = e.clientY + 15;

            // Prevent going off-screen
            const rect = tooltipEl.getBoundingClientRect();
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            let finalX = x;
            let finalY = y;

            if (x + rect.width > winWidth) {
                finalX = e.clientX - rect.width - 10;
            }

            if (y + rect.height > winHeight) {
                finalY = e.clientY - rect.height - 10;
            }

            // Ensure it stays within viewport
            if (finalX < 5) finalX = 5;
            if (finalY < 5) finalY = 5;
            if (finalX + rect.width > winWidth - 5) finalX = winWidth - rect.width - 5;
            if (finalY + rect.height > winHeight - 5) finalY = winHeight - rect.height - 5;

            tooltipEl.style.transform = `translate(${finalX}px, ${finalY}px)`;
            // Reset top/left to 0 since we use transform
            tooltipEl.style.top = '0';
            tooltipEl.style.left = '0';
        };

        document.body.addEventListener('mouseover', (e) => {
            const selector =
                '.card-title, .card-subtitle, .track-item-details .title, .track-item-details .artist, .now-playing-bar .title, .now-playing-bar .artist, .now-playing-bar .album, .pinned-item-name';
            const target = e.target.closest(selector);

            if (target) {
                // Remove native title if present to avoid double tooltip
                if (target.hasAttribute('title')) {
                    target.removeAttribute('title');
                }

                if (target.scrollWidth > target.clientWidth) {
                    tooltipEl.innerHTML = target.innerHTML.trim();
                    tooltipEl.classList.add('visible');
                    updateTooltipPosition(e);

                    const moveHandler = (moveEvent) => {
                        updateTooltipPosition(moveEvent);
                    };

                    const outHandler = () => {
                        tooltipEl.classList.remove('visible');
                        target.removeEventListener('mousemove', moveHandler);
                        target.removeEventListener('mouseleave', outHandler);
                        target.removeEventListener('click', outHandler);
                    };

                    target.addEventListener('mousemove', moveHandler);
                    target.addEventListener('mouseleave', outHandler);
                    target.addEventListener('click', outHandler);
                }
            }
        });
    }

    // Hide tooltip and context menu on any click to be safe
    document.addEventListener('mousedown', (e) => {
        if (tooltipEl) {
            tooltipEl.classList.remove('visible');
        }

        const contextMenu = document.getElementById('context-menu');
        if (contextMenu && contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });
}
