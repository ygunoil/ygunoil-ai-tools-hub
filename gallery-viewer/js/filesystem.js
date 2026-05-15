async function openFolderPicker() {
    // Check whether the browser supports the File System Access API
    if (!isFileSystemAccessSupported()) {
        showIncompatibilityAlert();
        return;
    }

    try {
        const handle = await showDirectoryPicker({
            mode: 'readwrite',
            id: 'photo-viewer-start',
            startIn: 'pictures'
        });

        appState.rootHandle = handle;
        UI.hint.style.display = 'none';
        document.body.classList.add('folder-open');
        appState.foldersData.clear();
        appState.foldersData.set('ALL_MEDIA', ALL_MEDIA_FOLDER);
        UI.treeRoot.innerHTML = '';

        // Initialize ALL_MEDIA_FOLDER UI
        ALL_MEDIA_FOLDER.initUI();

        // Reveal folder tree (sidebar is off-screen until pinned or hovered)
        toggleSidebarPin(true);

        rootData = await loadProject(handle);    // Load project
        await switchToAllPhotos(); // Show all media (includes nested folders)

    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error(err);
            alert('Failed to open folder: ' + err.message);
        }
    }
}


let allMediaRefreshTimer = null;

function scheduleAllMediaRefresh() {
    if (!appState.allPhotosMode) return;
    clearTimeout(allMediaRefreshTimer);
    allMediaRefreshTimer = setTimeout(() => {
        switchToAllPhotos();
    }, 300);
}

async function loadProject() {
    // Create root Folder object (automatic scan)
    const rootData = await getFolderData(appState.rootHandle);
    rootData.treeNode.createRoot();     // Create root node
    rootData.treeNode.addToUI();        // Attach to UI
    startBackgroundScan(rootData).then(() => {
        if (appState.allPhotosMode) {
            switchToAllPhotos();
        }
    });
    return rootData;
}


async function reloadProject() {
    if (!appState.rootHandle) {
        showToast("No folder is open", "error");
        return;
    }
    try {
        showToast("Rescanning…", "warning");

        // Clear state and UI
        UI.treeRoot.innerHTML = '';
        UI.gallery.innerHTML = '<div class="loader">Rescanning…</div>';
        appState.foldersData.clear();
        appState.foldersData.set('ALL_MEDIA', ALL_MEDIA_FOLDER);

        // Load project and switch to root
        const rootData = await loadProject();
        await switchToAllPhotos();
        showToast("Project reloaded");
    } catch (err) {
        console.error(err);
        showToast("Reload failed: " + err.message, "error");
    }
}

async function getFolderData(dirHandle) {
    const parts = await appState.rootHandle.resolve(dirHandle);
    path = [appState.rootHandle.name, ...parts].join('/');

    let folderData = appState.foldersData.get(path);
    if (folderData) {
        // Refresh handle (prevent stale handles)
        folderData.handle = dirHandle;
        return folderData;
    }

    // Resolve parent from path
    const pathParts = path.split('/');

    // Resolve parent Folder object
    let parent = null;
    if (pathParts.length > 1) {
        const parentPath = pathParts.slice(0, -1).join('/');
        parent = appState.foldersData.get(parentPath) || null;
    }

    // Create and scan via static factory
    const scanResult = await SmartFolder.create({
        handle: dirHandle,
        parent: parent
    });

    folderData = scanResult.folder;  // folder from scan result

    // Store in app state
    appState.foldersData.set(path, folderData);

    return folderData;
}

async function startBackgroundScan(parentFolder) {
    if (!parentFolder || !parentFolder.subFolders) return;

    for (const subFolderData of parentFolder.subFolders) {
        // Scan child folder (get its files and subfolders)
        if (!subFolderData.scanned) {
            await subFolderData.scan();
        }

        // Update tree (attach to UI)
        subFolderData.parent.treeNode.addChild(subFolderData.treeNode);

        scheduleAllMediaRefresh();

        // Recurse into nested subfolders
        await startBackgroundScan(subFolderData);
    }
}

async function handleFolderClick(li) {
    if (!li) return;

    // Resolve Folder object from DOM element
    const folderData = domToFolderMap.get(li);
    if (!folderData) {
        showToast("Could not find folder data", "error");
        return;
    }

    try {
        // Virtual folders (e.g. ALL_MEDIA_FOLDER) skip validation / refresh shortcut
        if (folderData === ALL_MEDIA_FOLDER) {
            await loadFolder(folderData);
            return;
        }

        // Verify folder access first
        const isValid = await folderData.validate();

        if (!isValid) {
            // Folder missing; attempt recovery
            await handleFolderNotFound(folderData);
            return;
        }

        // On-demand scan only for smaller folders (<200 files)
        const shouldScan = folderData.files.length < 200;
        if (shouldScan) {
            await refreshFolder(folderData, true);
        }

        await loadFolder(folderData);

    } catch (err) {
        console.error("Folder click handling failed:", err);

        // On NotFoundError, attempt recovery
        if (err.name === 'NotFoundError' || err.message?.includes('not found')) {
            await handleFolderNotFound(folderData);
        } else {
            showToast("Failed to load: " + err.message, "error");
        }
    }
}


/**
 * Load and render the contents of a folder.
 *
 * This function:
 * 1. Switches to single-folder mode (leaves All Media mode)
 * 2. Updates the current-path state
 * 3. Updates UI (breadcrumb path, tree highlight)
 * 4. Renders the gallery with files
 *
 * @param {SmartFolder} folderData - Folder object
 */
async function loadFolder(folderData) {
    // Virtual folders (e.g. ALL_MEDIA_FOLDER)
    if (folderData === ALL_MEDIA_FOLDER) {
        await switchToAllPhotos();
        return;
    }

    appState.allPhotosMode = false;
    UI.refreshBtn.textContent = "Refresh folder";
    UI.refreshBtn.title = "Rescan file changes only in the current folder";
    console.log(folderData);

    const path = folderData.path;
    appState.currentFolder = folderData;

    // setActive clears the previously active node
    folderData.setActive();
    UI.pathDisplay.textContent = path;

    globals.currentDisplayList = folderData.files;

    if (folderData.files.length === 0) {
        const hasSubfolders = folderData.subFolders.length > 0;
        UI.gallery.innerHTML = `<div class="empty-state">${
            hasSubfolders
                ? 'No media in this folder. Pick a subfolder in the sidebar, or open <strong>All Media</strong> to see every file.'
                : 'No supported media files in this folder.'
        }</div>`;
        updateFilterCount(0, 0);
        return;
    }

    renderGallery(globals.currentDisplayList);
}

async function switchToAllPhotos() {
    appState.allPhotosMode = true;
    appState.currentFolder = ALL_MEDIA_FOLDER;
    UI.refreshBtn.textContent = "Reload project";
    UI.refreshBtn.title = "Rescan the entire project tree";
    UI.pathDisplay.textContent = "All media";

    // setActive clears the previously active node
    ALL_MEDIA_FOLDER.setActive();

    UI.gallery.innerHTML = '<div class="loader">Aggregating files…</div>';

    await new Promise(r => setTimeout(r, 10));

    // Collect files from every folder
    let allFiles = [];
    for (const [path, data] of appState.foldersData.entries()) {
        if (path !== 'ALL_MEDIA' && data && data.files && data.files.length > 0) {
            allFiles = allFiles.concat(data.files);
        }
    }
    ALL_MEDIA_FOLDER.files = allFiles;
    globals.currentDisplayList = allFiles;

    if (allFiles.length === 0) {
        UI.gallery.innerHTML = '<div class="empty-state">No media yet — scanning subfolders in the background. Files will appear here automatically.</div>';
    } else {
        renderGallery(allFiles);
    }
}

async function handleRefreshAction() {
    if (appState.allPhotosMode) {
        if (confirm("In All Media mode, refresh reloads the whole project and rescans everything. Continue?")) {
            reloadProject();
        }
    } else {
        if (appState.currentFolder) {
            await refreshFolder(appState.currentFolder);
        }
    }
}

/**
 * Refresh folder data.
 *
 * Rescans folder data only—does not update the gallery by itself.
 * Call loadFolder() or renderGallery() afterward if needed.
 *
 * @param {SmartFolder} folderData - Folder object
 * @param {boolean} silent - When true, skip Toast notifications
 * @returns {Promise<SmartFolder>} Refreshed folder, or null on failure
 */
async function refreshFolder(folderData, silent = false) {
    if (!appState.rootHandle) {
        if (!silent) showToast("Cannot refresh: no directory info", "error");
        return null;
    }

    // Special case: ALL_MEDIA mode
    if (folderData === ALL_MEDIA_FOLDER) {
        if (!silent) showToast("Refreshing all media…", "info");
        await switchToAllPhotos();
        return ALL_MEDIA_FOLDER;
    }

    if (!folderData || typeof folderData !== 'object') {
        console.error("refreshFolder requires a valid SmartFolder object", folderData);
        return null;
    }

    const folderPath = folderData.path;

    try {
        if (!folderData.handle) {
            // Recover from rootHandle when this is the root folder
            if (folderPath === appState.rootHandle.name) {
                folderData.handle = appState.rootHandle;
            } else {
                throw new Error("Directory handle lost");
            }
        }

        // Deep reuse: update folderData in place
        await folderData.scan();

        // Sidebar counts
        folderData.updateCount();

        // Resync subtree if subfolders changed
        await syncTreeStructure(folderData);

        if (!silent) showToast("Folder refreshed");

        return folderData;
    } catch (e) {
        if (e.name === 'NotFoundError' || (e.message && e.message.includes('not found'))) {
            const isCurrent = (folderData === appState.currentFolder);
            if (isCurrent) {
                showToast(`Folder "${folderPath}" was deleted`, "error");
                UI.gallery.innerHTML = '<div class="empty-state">Folder is no longer available</div>';
            }
            folderData.removeDOMNodes();
            appState.foldersData.delete(folderPath);
        } else {
            console.error("Refresh failed", e);
            if (!silent) showToast("Refresh failed: " + e.message, "error");
        }
        return null;
    }
}


async function handleDropOnFolder(e, targetFolder, liElement) {
    e.preventDefault();
    liElement.classList.remove('drag-over');

    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    if (!data || !data.name) return;

    // Source is the currently displayed folder
    const sourceFolder = appState.currentFolder;
    if (!sourceFolder) {
        showToast("Could not determine source folder", "error");
        return;
    }

    if (sourceFolder === targetFolder) return;

    try {
        const sourceFile = sourceFolder.files.find(f => f.name === data.name);
        if (!sourceFile) throw new Error("Source file missing");

        await moveFileWithHistory(sourceFile, targetFolder);

        showToast(`Moved: ${data.name} (Ctrl+Z to undo)`, "success");

        targetFolder.addFileAndSort(sourceFile);
        targetFolder.updateCount();

        if (appState.allPhotosMode) {
            // All Media mode: file stays in aggregated list—no reload
        } else {
            sourceFolder.removeFile(sourceFile);
            sourceFolder.updateCount();
            await loadFolder(sourceFolder);
        }

    } catch (err) {
        console.error(err);
        showToast(`Move failed: ${err.message}`, "error");
    }
}

async function forceRegenerateCurrentThumbnails() {
    if (globals.currentDisplayList.length === 0) {
        showToast("No files in current view");
        return;
    }

    const targetSize = parseInt(document.getElementById('thumbSizeSlider')?.value) || 400;

    let deleteCount = 0;
    for (const fileData of globals.currentDisplayList) {
        if (fileData.md5) {
            const id = `${fileData.md5}_${targetSize}`;
            deleteThumbnail(id); // Global helper
            deleteCount++;
        }
    }

    console.log(`Cleared ${deleteCount} thumbnail cache entries for current view`);
    showToast("Cache cleared, regenerating…", "success");
    redrawAllThumbnails(true); // Global helper
}

async function moveFileToTrash(fileData) {
    const fullPath = fileData.path;
    const pathParts = fullPath.split('/');
    const rootName = appState.rootHandle.name;

    // Strip root name for relative path
    if (pathParts[0] === rootName) {
        pathParts.shift();
    }

    const fileName = pathParts.pop();
    const relativeDirPath = pathParts.join('/');

    if (!fileData.parent || !fileData.parent.handle) {
        throw new Error("Could not locate parent folder handle");
    }
    const parentCache = fileData.parent;

    // 1. Ensure .trash at project root
    const rootTrashHandle = await appState.rootHandle.getDirectoryHandle('.trash', { create: true });

    // 2. Mirror directory structure inside .trash
    let currentDirHandle = rootTrashHandle;
    if (relativeDirPath) {
        const dirs = relativeDirPath.split('/');
        for (const dir of dirs) {
            currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true });
        }
    }

    // 3. Target filename (avoid collisions)
    const dotIdx = fileName.lastIndexOf('.');
    const baseName = dotIdx !== -1 ? fileName.substring(0, dotIdx) : fileName;
    const ext = dotIdx !== -1 ? fileName.substring(dotIdx) : '';

    let targetName = fileName;
    let counter = 1;
    while (true) {
        try {
            await currentDirHandle.getFileHandle(targetName);
            targetName = `${baseName}_${counter}${ext}`;
            counter++;
        } catch (e) {
            if (e.name === 'NotFoundError') break;
            throw e;
        }
    }

    // 4. Move into mirrored .trash path
    await fileData.handle.move(currentDirHandle, targetName);

    // 5. Update in-memory models via Folder.removeFile
    parentCache.removeFile(fileData);

    const listIdx = globals.currentDisplayList.indexOf(fileData);
    if (listIdx > -1) globals.currentDisplayList.splice(listIdx, 1);

    // 6. Metadata for undo
    return {
        parentPath: parentCache.path,
        originalName: fileName,
        trashName: targetName,
        trashDirHandle: currentDirHandle,
        parentHandle: parentCache.handle,
        relativeDirPath
    };
}

async function restoreFromTrash(deleteInfo) {
    const { parentPath, originalName, trashName, trashDirHandle, parentHandle } = deleteInfo;

    const fileHandle = await trashDirHandle.getFileHandle(trashName);

    await fileHandle.move(parentHandle, originalName);

    const parentFolder = appState.foldersData.get(parentPath);
    if (parentFolder) {
        await refreshFolder(parentFolder, true);
    }

    return originalName;
}
