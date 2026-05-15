/**
 * Right-click context menu coordinator for the gallery (files, folders, etc.).
 */

class ContextMenuManager {
    constructor() {
        this.menus = new Map();
        this.currentMenu = null;
        this.currentTarget = null;

        document.addEventListener('click', () => this.hideAll());
    }

    /**
     * Register a menu
     * @param {string} menuId - Menu ID
     * @param {HTMLElement|Function} menuElement - Menu element or create function
     */
    register(menuId, menuElement) {
        if (typeof menuElement === 'function') {
            menuElement = menuElement();
        }
        this.menus.set(menuId, menuElement);
    }

    /**
     * Show specific menu
     * @param {string} menuId - Menu ID
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} target - Context (e.g. fileData, folderData)
     * @param {Object} options - Extra options
     */
    show(menuId, x, y, target, options = {}) {
        // Hide other menus
        this.hideAll();

        const menu = this.menus.get(menuId);
        if (!menu) {
            console.error(`[ContextMenuManager] Menu not found: ${menuId}`);
            return;
        }

        // Save current state
        this.currentMenu = menu;
        this.currentTarget = target;

        // Add activation style class for target
        if (menuId === 'file' && target.dom) {
            target.dom.classList.add('context-menu-active');
        } else if (menuId === 'folder' && target.treeNode) {
            target.treeNode.setContextActive();
        }

        // Adjust menu items based on options
        if (options.adjustItems) {
            options.adjustItems(menu, target);
        }

        // Show menu
        menu.classList.remove('hidden');
        menu.classList.add('show');

        // Adjust position
        this.positionMenu(menu, x, y);
    }

    /**
     * Hide all menus
     */
    hideAll() {
        // Remove the target's active style class
        if (this.currentTarget) {
            if (this.currentTarget.dom) {
                this.currentTarget.dom.classList.remove('context-menu-active');
            }
            if (this.currentTarget.treeNode) {
                this.currentTarget.treeNode.setContextInactive();
            }
        }

        this.menus.forEach(menu => {
            menu.classList.remove('show');
            menu.classList.add('hidden');
        });
        this.currentMenu = null;
        this.currentTarget = null;
    }

    /**
     * Hide specific menu
     */
    hide(menuId) {
        const menu = this.menus.get(menuId);
        if (menu) {
            menu.classList.remove('show');
            menu.classList.add('hidden');
        }
    }

    /**
     * Clamp menu position so it stays on screen.
     */
    positionMenu(menu, x, y) {
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = x;
        let top = y;

        // Prevent going beyond the right
        if (x + menuRect.width > viewportWidth) {
            left = viewportWidth - menuRect.width - 10;
        }

        // Prevent going over the bottom
        if (y + menuRect.height > viewportHeight) {
            top = viewportHeight - menuRect.height - 10;
        }

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }

    /**
     * Get current target
     */
    getCurrentTarget() {
        return this.currentTarget;
    }
}

// Create a global instance
const contextMenuManager = new ContextMenuManager();

/**
 * Initialize all right-click menus
 */
function initContextMenus() {
    // 1. Create and register file right-click menu
    const fileMenu = createFileMenu();
    contextMenuManager.register('file', fileMenu);

    // 2. Create and register folder right-click menu
    const folderMenu = createFolderMenu();
    contextMenuManager.register('folder', folderMenu);

    // 3. Bind file tree right-click event
    bindFolderContextMenu();
}

/**
 * Create file right-click menu
 */
function createFileMenu() {
    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.className = 'context-menu hidden';
    menu.innerHTML = `
        <div class="context-menu-item" id="ctxProperties">
            <i class="fas fa-info-circle"></i>
            <span>Properties</span>
        </div>
        <div class="context-menu-item" id="ctxRename">
            <i class="fas fa-edit"></i>
            <span>Rename</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" id="ctxDelete">
            <i class="fas fa-trash-alt"></i>
            <span>Delete</span>
        </div>
    `;

    // Bind menu item click event
    const propertiesBtn = menu.querySelector('#ctxProperties');
    const renameBtn = menu.querySelector('#ctxRename');
    const deleteBtn = menu.querySelector('#ctxDelete');

    propertiesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        contextMenuManager.hideAll();
        showImageProperties();
    });

    renameBtn.addEventListener('click', () => {
        const fileData = contextMenuManager.getCurrentTarget();
        if (fileData && fileData.dom) {
            contextMenuManager.hideAll();
            enableInlineRename(fileData.dom, fileData);
        }
    });

    deleteBtn.addEventListener('click', async () => {
        const fileData = contextMenuManager.getCurrentTarget();
        if (fileData) {
            contextMenuManager.hideAll();
            await handleFileDelete(fileData);
        }
    });

    document.body.appendChild(menu);

    // Expose on UI for older call sites
    UI.contextMenu = menu;

    return menu;
}

// File deletion processing function
async function handleFileDelete(fileData) {
    try {
        // Use the operation history system to perform deletions
        await deleteFileWithHistory(fileData);

        // Remove DOM
        if (fileData.dom) {
            fileData.dom.remove();
        }

        if (appState.currentFolder) {
            renderGallery(globals.currentDisplayList);
        }

        showToast("Moved to .trash (Ctrl+Z to undo)");
    } catch (e) {
        console.error(e);
        showToast("Operation failed: " + e.message, "error");
    }
}

/**
 * Create folder right-click menu
 */
function createFolderMenu() {
    const menu = document.createElement('div');
    menu.id = 'folder-context-menu';
    menu.className = 'context-menu hidden';
    menu.innerHTML = `
        <div class="context-menu-item danger" data-action="delete">
            <i class="fas fa-trash-alt"></i>
            <span>Delete folder</span>
        </div>
    `;

    // Bind menu item click event
    menu.addEventListener('click', async (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item) return;

        const action = item.dataset.action;
        const folderData = contextMenuManager.getCurrentTarget();

        if (!folderData) return;

        contextMenuManager.hideAll();

        if (action === 'delete') {
            await handleDeleteFolder(folderData);
        }
    });

    document.body.appendChild(menu);
    return menu;
}

/**
 * Bind file tree right-click event
 */
function bindFolderContextMenu() {
    if (!UI.treeRoot) {
        console.error('[ContextMenuManager] UI.treeRoot not found!');
        return;
    }

    UI.treeRoot.addEventListener('contextmenu', (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.preventDefault();
        e.stopPropagation();

        const folderData = domToFolderMap.get(li);
        if (!folderData) return;

        // Root node does not display menu
        if (folderData.parent === null) return;

        // Show menu using manager
        contextMenuManager.show('folder', e.clientX, e.clientY, folderData);
    });
}

// Folder delete function
async function handleDeleteFolder(folderData) {
    const folderName = folderData.name;
    const hasContent = folderData.files.length > 0 || folderData.subFolders.length > 0;

    // Use a custom confirmation dialog
    const confirmed = await confirmDialog.show(folderName, hasContent);

    if (!confirmed) return;

    try {
        if (!folderData.parent) {
            showToast('Unable to delete root folder', 'error');
            return;
        }

        const path = folderData.path;
        const parentPath = folderData.parent.path;

        await folderData.delete();

        appState.foldersData.delete(path);

        // Remove DOM node
        if (folderData.treeNode) {
            folderData.treeNode.remove();
        }
        if (folderData.treeList) {
            folderData.treeList.remove();
        }

        if (folderData.parent) {
            await refreshFolder(folderData.parent);
        }

        if (appState.currentFolder === folderData) {
            await loadFolder(folderData.parent);
        }

        showToast(`Folder "${folderName}" deleted`, 'success');
    } catch (err) {
        console.error('Failed to delete folder:', err);
        if (err.name === 'NotAllowedError') {
            showToast('No permission to delete folder', 'error');
        } else if (err.name === 'InvalidModificationError') {
            showToast('The folder is not empty or is in use', 'error');
        } else {
            showToast('Delete failed: ' + err.message, 'error');
        }
    }
}
