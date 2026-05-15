/**
 * Error recovery helpers
 * Recover when files or folders were changed, deleted, or moved on disk.
 */

/**
 * Handle a folder tree node click when the folder is no longer valid.
 * @param {Folder} folderData - The folder that was clicked
 * @returns {Promise<Folder|null>} A usable ancestor after recovery, or null
 */
async function handleFolderNotFound(folderData) {
    try {
        showToast("This folder may no longer be valid", "warning");

        // 1. Walk up to the first usable ancestor
        const validAncestor = await folderData.findValidAncestor();

        if (!validAncestor) {
            showToast("Cannot recover: root folder is invalid. Please open the folder again.", "error");
            return null;
        }

        // 2. Rescan the ancestor (picks up changes automatically)
        const scanResult = await validAncestor.scan();

        // 3. Sync the tree (handles diffs automatically)
        //    - Remove nodes that no longer exist
        //    - Add new nodes
        //    - Keep unchanged nodes
        await syncTreeStructure(validAncestor);

        // 4. Refresh UI counters
        if (validAncestor.updateCount) {
            validAncestor.updateCount();
        }

        // 5. Recursively scan only newly added subfolders (build file tree)
        if (scanResult.newSubFolders && scanResult.newSubFolders.length > 0) {
            for (const newFolder of scanResult.newSubFolders) {
                await startBackgroundScan(newFolder);
            }
        }

        // 6. Load the recovered folder (optional UI hooks)
        // loadFolder(validAncestor);
        // if (validAncestor.setActive) {
        //     validAncestor.setActive();
        // }
        // showToast(`Recovered to: ${validAncestor.name}`, "success");

        return validAncestor;

    } catch (err) {
        console.error("Folder recovery failed:", err);
        showToast("Recovery failed: " + err.message, "error");
        return null;
    }
}

/**
 * Handle a gallery card click when the file is missing or moved.
 * @param {SmartFile} fileData - The file that was clicked
 * @returns {Promise<boolean>} Whether recovery succeeded
 */
async function handleFileNotFound(fileData) {
    try {
        if (!fileData.parent) {
            showToast("Cannot recover: file has no parent reference", "error");
            return false;
        }

        showToast("File may have been moved or deleted. Refreshing…", "warning");

        // 1. Refresh the parent folder
        const parentPath = fileData.parent.path;
        await refreshFolder(fileData.parent, true);

        // 2. Check whether the file still exists
        const stillExists = fileData.parent.findFile(fileData.name);

        if (stillExists) {
            showToast("File list refreshed", "success");
            return true;
        } else {
            showToast("File was deleted or moved", "info");

            // 3. Re-render the current view
            if (fileData.parent === appState.currentFolder || appState.allPhotosMode) {
                renderGallery(globals.currentDisplayList);
            }

            return false;
        }

    } catch (err) {
        console.error("File recovery failed:", err);
        showToast("Refresh failed: " + err.message, "error");
        return false;
    }
}

/**
 * Run a folder operation; on NotFound-like errors, try recovery then retry once.
 * @param {Folder} folderData - Folder context
 * @param {Function} operation - Async function to run
 * @returns {Promise<any>}
 */
async function safelyExecuteFolderOperation(folderData, operation) {
    try {
        return await operation();
    } catch (err) {
        // NotFoundError or stale FileSystemHandle
        if (err.name === 'NotFoundError' ||
            err.message?.includes('not found') ||
            err.message?.includes('not exist')) {

            const recovered = await handleFolderNotFound(folderData);
            if (recovered) {
                try {
                    return await operation();
                } catch (retryErr) {
                    console.error("Retry after recovery failed:", retryErr);
                    throw retryErr;
                }
            }
        }
        throw err;
    }
}

/**
 * Run a file operation; on NotFound-like errors, attempt file-level recovery.
 * @param {SmartFile} fileData - File context
 * @param {Function} operation - Async function to run
 * @returns {Promise<any>}
 */
async function safelyExecuteFileOperation(fileData, operation) {
    try {
        return await operation();
    } catch (err) {
        if (err.name === 'NotFoundError' ||
            err.message?.includes('not found') ||
            err.message?.includes('not exist')) {

            await handleFileNotFound(fileData);
        }
        throw err;
    }
}
