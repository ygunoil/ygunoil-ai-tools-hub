
function setupEventListeners() {
    document.querySelector('.intro-content').addEventListener('click', openFolderPicker);
    UI.pinBtn.addEventListener('click', () => toggleSidebarPin());


    UI.searchInput.addEventListener('input', debounce(() => {
        renderGalleryFromCache();
    }, 300));

    document.getElementById('sortSelect').addEventListener('change', renderGalleryFromCache);
    document.getElementById('sortToggleBtn').addEventListener('click', toggleSortDirection);

    document.getElementById('settingBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSettingsModal();
    });

    document.addEventListener('click', (e) => {
        if (UI.settingBar.classList.contains('show') &&
            !UI.settingBar.contains(e.target) &&
            e.target.id !== 'settingBtn') {
            hideSettingsModal();
        }
        // Menu dismissal is handled by contextMenuManager
    });

    UI.refreshBtn.addEventListener('click', handleRefreshAction);
    document.getElementById('clearCurrentBtn').addEventListener('click', forceRegenerateCurrentThumbnails);
    document.getElementById('cleanOldBtn').addEventListener('click', cleanOldCache);
    UI.clearAllBtn.addEventListener('click', () => {
        if (confirm('Clear all thumbnail cache? This cannot be undone.')) {
            clearAllCache();
        }
    });

    const colSlider = document.getElementById('colCountSlider');
    colSlider.addEventListener('input', (e) => {
        document.getElementById('colCountValue').textContent = `${e.target.value} columns`;
    });
    colSlider.addEventListener('change', () => {
        renderGalleryFromCache();
    });
    document.getElementById('thumbSizeSlider').addEventListener('change', () => redrawAllThumbnails(true));

    setupSettingsDrag();
    setupModalEvents();

    document.addEventListener('keydown', handleKeyDown);

    UI.gallery.addEventListener('click', handleGalleryClick);
    UI.gallery.addEventListener('contextmenu', handleContextMenu);
    UI.gallery.addEventListener('dragstart', handleDragStart);

    UI.settingBar.addEventListener('click', (e) => {
    });

    // Menu item handlers live in context-menu-manager.js

    const closePropsBtn = document.querySelector('.close-props-btn');
    const propsModal = document.getElementById('propertiesModal');
    if (closePropsBtn && propsModal) {
        closePropsBtn.addEventListener('click', () => closePropertiesModal());
        propsModal.addEventListener('click', (e) => {
            if (e.target === propsModal) closePropertiesModal();
        });

        // Prevent scroll wheel events from bubbling to the background
        propsModal.addEventListener('wheel', (e) => {
            e.stopPropagation();
        }, { passive: true });
    }
}

function handleGalleryClick(e) {
    if (e.button !== 0) return;
    const card = e.target.closest('.photo-card');
    if (!card || e.target.closest('.card-menu-btn') || e.target.closest('input')) return;
    if (card.fileData) openModal(card.fileData);
}

function handleContextMenu(e) {
    e.preventDefault();
    const card = e.target.closest('.photo-card');
    if (!card || !card.fileData) return;

    // Use the shared context menu manager
    contextMenuManager.show('file', e.clientX, e.clientY, card.fileData, {
        adjustItems: (menu, fileData) => {
            // Stash fileData on the menu element (legacy compatibility)
            menu.fileData = fileData;

            // Preserve display index for other features
            const idx = parseInt(card.dataset.currentIndex);
            menu.dataset.displayIndex = idx;
        }
    });
}

function handleKeyDown(e) {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (isPropertiesModalOpen()) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closePropertiesModal();
            return;
        }
    }

    const isCtrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    const modalState = getModalState();

    if (modalState.isOpen) {
        // When hovering the video in the modal, enable keyboard transport controls
        if (modalState.isHoveringVideo) {
            const videoElement = document.querySelector('#modal video');
            if (videoElement) {
                // Arrow keys seek the video
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const skipTime = 5; // seconds per key press
                    if (e.key === 'ArrowRight') {
                        videoElement.currentTime = Math.min(videoElement.currentTime + skipTime, videoElement.duration);
                    } else if (e.key === 'ArrowLeft') {
                        videoElement.currentTime = Math.max(videoElement.currentTime - skipTime, 0);
                    }
                    return;
                }
                // Space toggles play/pause
                else if (e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    if (videoElement.paused) {
                        videoElement.play();
                    } else {
                        videoElement.pause();
                    }
                    return;
                }
            }
        }

        switch (e.key) {
            case 'Escape': closeModal(); break;
            case 'ArrowRight':
                if (globals.visibleFileList && modalState.currentIndex < globals.visibleFileList.length - 1) {
                    openModalByIndex(modalState.currentIndex + 1);
                }
                break;
            case 'ArrowLeft':
                if (modalState.currentIndex > 0) {
                    openModalByIndex(modalState.currentIndex - 1);
                }
                break;
            case 'c':
            case 'C':
                if (isCtrl) {
                    e.preventDefault();
                    copyCurrentImageToClipboard();
                }
                break;
        }
    } else {
        if (isCtrl && key === 'c') {
            const selectedCard = document.querySelector('.photo-card:hover');
            if (selectedCard && selectedCard.fileData) {
                e.preventDefault();
                copyImage(selectedCard.fileData);
            }
        }
        if (isCtrl && key === 'o') {
            e.preventDefault();
            if (appState.rootHandle) openFolderPicker();
            else UI.folderInput.click();
        }
        if (isCtrl && key === 'z') {
            e.preventDefault();
            handleUndo();
        }
    }
    if (e.key === 'Escape') {
        if (UI.settingBar.classList.contains('show')) hideSettingsModal();
    }
}

function toggleSettingsModal() {
    if (UI.settingBar.classList.contains('show')) hideSettingsModal();
    else showSettingsModal();
}

function showSettingsModal() {
    updateStorageUsage();
    UI.settingBar.classList.add('show');
    const btnRect = document.getElementById('settingBtn').getBoundingClientRect();
    const modalRect = UI.settingBar.getBoundingClientRect();
    let top = btnRect.bottom + 10;
    let left = btnRect.left;
    if (top + modalRect.height > window.innerHeight) top = btnRect.top - modalRect.height - 10;
    if (left + modalRect.width > window.innerWidth) left = window.innerWidth - modalRect.width - 20;
    UI.settingBar.style.top = `${top}px`;
    UI.settingBar.style.left = `${left}px`;
}

function hideSettingsModal() {
    UI.settingBar.classList.remove('show');
}

let dragData = null;
function setupSettingsDrag() {
    UI.settingBar.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.settings-header')) return;
        e.preventDefault();
        const rect = UI.settingBar.getBoundingClientRect();
        dragData = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        UI.settingBar.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragData) return;
        e.preventDefault();
        const newX = e.clientX - dragData.x;
        const newY = e.clientY - dragData.y;
        const maxX = window.innerWidth - UI.settingBar.offsetWidth;
        const maxY = window.innerHeight - UI.settingBar.offsetHeight;
        UI.settingBar.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
        UI.settingBar.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
    });
    document.addEventListener('mouseup', () => {
        dragData = null;
        UI.settingBar.style.cursor = '';
    });
}

function enableInlineRename(card, fileData) {
    const nameContainer = card.querySelector('.card-info-filename');
    const nameEl = card.querySelector('.file-name');
    const oldName = fileData.name;

    // Disable card dragging
    card.draggable = false;
    // Renaming state: keep hover styling consistent
    card.classList.add('renaming');

    const input = document.createElement('textarea');
    input.value = oldName;
    input.className = 'renaming-input';
    input.rows = 1;

    nameEl.style.display = 'none';
    nameContainer.appendChild(input);
    input.focus();

    // Select the file name part (without extension)
    const dotIndex = oldName.lastIndexOf('.');
    if (dotIndex > 0) {
        input.setSelectionRange(0, dotIndex);
    } else {
        input.select();
    }

    // Auto-grow textarea height with content
    const autoResize = () => {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
    };
    input.addEventListener('input', autoResize);
    autoResize();

    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('dblclick', e => e.stopPropagation());

    const commit = async () => {
        const newName = input.value.trim().replace(/\n/g, ''); // Remove newlines
        if (!newName || newName === oldName) { cleanup(); return; }
        if (/[<>:"/\\|?*]/.test(newName)) {
            showToast("File name contains invalid characters", "error");
            input.focus();
            return;
        }
        try {
            // Rename via operation history (undoable)
            await renameFileWithHistory(fileData, newName);

            // Update the visible label
            nameEl.textContent = newName;

            showToast("Renamed (Ctrl+Z to undo)");
            cleanup();
        } catch (e) {
            showToast("Rename failed: " + e.message, "error");
            cleanup();
        }
    };

    const cleanup = () => {
        input.remove();
        nameEl.style.display = 'block';
        card.draggable = true;
        card.classList.remove('renaming');
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            input.blur();
        }
        else if (e.key === 'Escape') {
            e.preventDefault();
            cleanup();
        }
        e.stopPropagation();
    });
    input.addEventListener('blur', commit);
}

async function handleUndo() {
    try {
        const operation = await undoLastOperation();
        const description = operation.getDescription();
        showToast(`Undone: ${description}`, "success");

        // Re-render current view (no full folder scan needed)
        if (appState.currentFolder) {
            if (appState.allPhotosMode) {
                await switchToAllPhotos();
            } else {
                renderGallery(globals.currentDisplayList);
            }
        }
    } catch (e) {
        console.error(e);
        if (e.message === 'Nothing to undo') {
            showToast("Nothing to undo", "info");
        } else {
            showToast("Undo failed: " + e.message, "error");
        }
    }
}
