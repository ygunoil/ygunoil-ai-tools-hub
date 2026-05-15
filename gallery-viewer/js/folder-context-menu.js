/**
 * Folder context menu
 * Delete (and room for future: new folder, rename, etc.)
 */

function createFolderContextMenu() {
    const menu = document.createElement('div');
    menu.id = 'folder-context-menu';
    menu.className = 'context-menu hidden';
    menu.innerHTML = `
        <div class="context-menu-item danger" data-action="delete">
            <i class="fas fa-trash-alt"></i>
            <span>Delete folder</span>
        </div>
    `;
    document.body.appendChild(menu);
    return menu;
}

let folderContextMenu = null;
let currentContextFolder = null;

/**
 * Wire up folder context menu behavior
 */
function initFolderContextMenu() {
    folderContextMenu = createFolderContextMenu();

    folderContextMenu.addEventListener('click', async (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item || !currentContextFolder) return;

        const action = item.dataset.action;
        hideFolderContextMenu();

        switch (action) {
            case 'delete':
                await handleDeleteFolder(currentContextFolder);
                break;
        }

        currentContextFolder = null;
    });

    document.addEventListener('click', (e) => {
        if (!folderContextMenu.contains(e.target)) {
            hideFolderContextMenu();
        }
    });

    if (!UI.treeRoot) {
        console.error('[FolderContextMenu] UI.treeRoot not found');
        return;
    }

    console.log('[FolderContextMenu] Binding contextmenu on tree root:', UI.treeRoot);

    UI.treeRoot.addEventListener('contextmenu', (e) => {
        console.log('[FolderContextMenu] contextmenu event', e.target);

        const li = e.target.closest('li.tree-node');
        console.log('[FolderContextMenu] matched li:', li);

        if (!li) return;

        e.preventDefault();
        e.stopPropagation();

        const folderData = domToFolderMap.get(li);
        console.log('[FolderContextMenu] folderData:', folderData);

        if (!folderData) {
            console.warn('[FolderContextMenu] No folderData for node');
            return;
        }

        currentContextFolder = folderData;
        showFolderContextMenu(e.clientX, e.clientY, folderData);
    });
}

function showFolderContextMenu(x, y, folderData) {
    console.log('[FolderContextMenu] showFolderContextMenu', { x, y, folderData, menu: folderContextMenu });

    if (!folderContextMenu) {
        console.error('[FolderContextMenu] folderContextMenu not initialized');
        return;
    }

    const isRoot = folderData.parent === null;
    const renameItem = folderContextMenu.querySelector('[data-action="rename"]');
    const deleteItem = folderContextMenu.querySelector('[data-action="delete"]');

    console.log('[FolderContextMenu] isRoot:', isRoot, 'renameItem:', renameItem, 'deleteItem:', deleteItem);

    if (isRoot) {
        renameItem.style.display = 'none';
        deleteItem.style.display = 'none';
    } else {
        renameItem.style.display = '';
        deleteItem.style.display = '';
    }

    folderContextMenu.classList.remove('hidden');
    console.log('[FolderContextMenu] after removing hidden:', folderContextMenu.className);

    const menuRect = folderContextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    let top = y;

    if (x + menuRect.width > viewportWidth) {
        left = viewportWidth - menuRect.width - 10;
    }

    if (y + menuRect.height > viewportHeight) {
        top = viewportHeight - menuRect.height - 10;
    }

    folderContextMenu.style.left = left + 'px';
    folderContextMenu.style.top = top + 'px';

    console.log('[FolderContextMenu] position:', { left, top, menuRect });
    console.log('[FolderContextMenu] computed style:', {
        display: window.getComputedStyle(folderContextMenu).display,
        visibility: window.getComputedStyle(folderContextMenu).visibility,
        opacity: window.getComputedStyle(folderContextMenu).opacity
    });
}

function hideFolderContextMenu() {
    if (folderContextMenu) {
        folderContextMenu.classList.add('hidden');
    }
}



async function handleDeleteFolder(folderData) {
    const folderName = folderData.name;
    const hasContent = folderData.files.length > 0 || folderData.subFolders.length > 0;

    let confirmMessage = `Delete folder "${folderName}"?`;
    if (hasContent) {
        confirmMessage += '\n\n⚠️ This folder is not empty. This cannot be undone.';
    }

    if (!confirm(confirmMessage)) return;

    try {
        const parentFolder = folderData.parent;
        if (!parentFolder) {
            showToast('Cannot delete the root folder', 'error');
            return;
        }

        await folderData.delete();

        const path = folderData.path;
        appState.foldersData.delete(path);

        if (typeof folderData.removeDOMNodes === 'function') {
            folderData.removeDOMNodes();
        }

        parentFolder.updateCount();
        parentFolder.updateIconState();

        if (appState.currentFolderPath === path) {
            handleFolderClick(parentFolder.treeNodeElement);
        }

        showToast(`Folder "${folderName}" deleted`, 'success');
    } catch (err) {
        console.error('Failed to delete folder:', err);
        if (err.name === 'NotAllowedError') {
            showToast('No permission to delete this folder', 'error');
        } else if (err.name === 'InvalidModificationError') {
            showToast('Folder is not empty or is in use', 'error');
        } else {
            showToast('Delete failed: ' + err.message, 'error');
        }
    }
}
