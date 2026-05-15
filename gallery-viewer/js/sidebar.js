
function toggleSidebarPin(forceState) {
    const isPinned = typeof forceState === 'boolean' ? forceState : !UI.sidebar.classList.contains('pinned');
    const mainWrapper = document.querySelector('.main-content-wrapper');
    const resizeHelper = document.getElementById('resize-helper');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

    if (isPinned) {
        UI.sidebar.classList.add('pinned');
        document.body.classList.add('sidebar-pinned');
        UI.pinBtn.querySelector('i').style.transform = 'rotate(45deg)';
        UI.pinBtn.style.color = '#3498db';
        if (sidebarToggleBtn) sidebarToggleBtn.classList.add('active');
        const currentWidth = resizeHelper.offsetWidth || 280;
        mainWrapper.style.marginLeft = `${currentWidth}px`;
        mainWrapper.style.width = `calc(100% - ${currentWidth}px)`;
    } else {
        UI.sidebar.classList.remove('pinned');
        document.body.classList.remove('sidebar-pinned');
        UI.pinBtn.querySelector('i').style.transform = 'rotate(0deg)';
        UI.pinBtn.style.color = '';
        if (sidebarToggleBtn) sidebarToggleBtn.classList.remove('active');
        mainWrapper.style.marginLeft = '0px';
        mainWrapper.style.width = '100%';
    }
    localStorage.setItem('sidebarPinned', isPinned);
}

function setupCSSBasedResizer() {
    const resizeHelper = document.getElementById('resize-helper');
    if (!resizeHelper) return;

    const setWidth = (w) => {
        document.documentElement.style.setProperty('--sidebar-width', w + 'px');
        if (document.body.classList.contains('sidebar-pinned')) {
            document.querySelector('.main-content-wrapper').style.marginLeft = w + 'px';
        }
    };

    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const newWidth = entry.target.offsetWidth;
            if (newWidth > 0) {
                setWidth(newWidth);
                localStorage.setItem('sidebarWidth', newWidth);
            }
        }
    });

    resizeObserver.observe(resizeHelper);
    const savedWidth = localStorage.getItem('sidebarWidth') || 280;
    resizeHelper.style.width = savedWidth + 'px';
    setWidth(savedWidth);
}

function setupSidebarEvents() {
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => toggleSidebarPin());
    }

    // Shared folder click handler (virtual and regular folders)
    const handleTreeClick = (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.stopPropagation();

        // Hide context menus
        contextMenuManager.hideAll();

        // Resolve Folder via WeakMap
        const folderData = domToFolderMap.get(li);
        if (!folderData) return;

        const isIconClick = e.target.classList.contains('fa-folder') ||
            e.target.classList.contains('fa-folder-open');

        handleFolderClick(li);

        // Virtual folders have no expand/collapse
        if (isIconClick && folderData.treeList) {
            folderData.toggleExpanded();
        }
    };

    UI.virtualTreeRoot.addEventListener('click', handleTreeClick);
    UI.treeRoot.addEventListener('click', handleTreeClick);

    UI.treeRoot.addEventListener('dragover', (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.preventDefault();
        domToFolderMap.get(li).treeNode.setDragOver();
    });

    UI.treeRoot.addEventListener('dragleave', (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        domToFolderMap.get(li).treeNode.setDragLeave();
    });

    UI.treeRoot.addEventListener('drop', (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.preventDefault();

        const folderData = domToFolderMap.get(li);
        folderData.treeNode.setDragLeave();
        handleDropOnFolder(e, folderData, li);
    });
}


// activeTreeNode removed; call folderData.setActive() directly



async function syncTreeStructure(parentFolder) {
    if (!parentFolder || !parentFolder.treeNode) return;

    // Sync DOM structure via TreeNode.syncChildren
    await parentFolder.treeNode.syncChildren(parentFolder.subFolders);
}

