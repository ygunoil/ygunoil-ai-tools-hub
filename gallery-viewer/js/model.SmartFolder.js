/**
 * SmartFolder represents a filesystem directory entry (real or virtual).
 */
class SmartFolder {
    /**
     * @param {Object} options
     * @param {FileSystemDirectoryHandle} options.handle - null for pure virtual folders
     * @param {SmartFolder} options.parent - parent folder (`null` for roots)
     * @param {string} options.virtualName - label for synthetic folders only
     * @param {Object} options.virtualConfig - optional behaviours for synthetic folders
     */
    constructor({ handle, parent = null, virtualName = null, virtualConfig = null }) {
        this.handle = handle;           // FileSystemDirectoryHandle
        this.parent = parent;

        if (virtualName) {
            this.name = virtualName;
            this.isVirtual = true;
            this.virtualConfig = virtualConfig || {};
        } else if (handle) {
            this.name = handle.name;
            this.isVirtual = false;
            this.virtualConfig = null;
        } else {
            throw new Error('Provide either handle or virtualName');
        }

        this.files = [];
        this.subFolders = [];
        this.scanned = false;

        this.treeNode = new TreeNode(this);
    }

    /**
     * Subfolder `<ul.tree-sub-list>`.
     * @returns {HTMLElement|null}
     */
    get treeList() {
        return this.treeNode.getChildContainer();
    }

    /**
     * Alias for the outer `<li>`.
     * @returns {HTMLElement|null}
     */
    get treeNodeElement() {
        return this.treeNode.li;
    }

    /**
     * Factory helper: instantiate + `.scan()`
     * @param {Object} options
     * @param {FileSystemDirectoryHandle} options.handle
     * @param {SmartFolder} options.parent
     * @returns {Promise<Object>}
     */
    static async create({ handle, parent = null }) {
        const folder = new SmartFolder({ handle, parent });
        return await folder.scan();
    }

    /**
     * Virtual folder shortcut (skipped during scan pipeline).
     * @param {Object} options
     * @param {string} options.virtualName
     * @param {Object} options.virtualConfig
     * @returns {SmartFolder}
     */
    static createVirtual({ virtualName, virtualConfig = {} }) {
        return new SmartFolder({ handle: null, virtualName, virtualConfig });
    }

    /**
     * Canonical path beneath the remembered root segments.
     * @returns {string}
     */
    get path() {
        if (this.isVirtual && this.virtualConfig.customPath) {
            return this.virtualConfig.customPath;
        }

        if (!this.handle || !appState.rootHandle) {
            const parts = [this.name];
            let current = this.parent;
            while (current) {
                parts.unshift(current.name);
                current = current.parent;
            }
            return parts.join('/');
        }

        const parts = [this.name];
        let current = this.parent;
        while (current) {
            parts.unshift(current.name);
            current = current.parent;
        }
        return parts.join('/');
    }


    /**
     * Remove nested directory recursively from parent.
     */
    async delete() {
        if (!this.parent || !this.parent.handle) {
            throw new Error('Cannot delete root or missing parent reference');
        }

        try {
            await this.parent.handle.removeEntry(this.name, { recursive: true });

            const index = this.parent.subFolders.indexOf(this);
            if (index > -1) {
                this.parent.subFolders.splice(index, 1);
            }

            return true;
        } catch (err) {
            console.error('Failed to delete folder:', err);
            throw err;
        }
    }

    /**
     * Folder moves are unsupported for now.
     * @param {SmartFolder} targetFolder
     */
    async move(targetFolder) {
        throw new Error('Moving folders is not implemented yet');
    }

    /**
     * @param {SmartFile} file
     */
    addFile(file) {
        if (!this.files.includes(file)) {
            this.files.push(file);
            file.parent = this;
        }
    }

    /**
     * @param {SmartFile} file
     */
    addFileAndSort(file) {
        if (!this.files.includes(file)) {
            this.files.push(file);
            file.parent = this;
            this.files.sort((a, b) => windowsCompareStrings(a.name, b.name));
        }
    }

    /**
     * @param {SmartFile} file
     */
    removeFile(file) {
        const index = this.files.indexOf(file);
        if (index > -1) {
            this.files.splice(index, 1);
        }
    }

    /**
     * @param {string} fileName
     * @returns {SmartFile|null}
     */
    findFile(fileName) {
        return this.files.find(f => f.name === fileName) || null;
    }

    /**
     * Direct files in this folder only.
     * @returns {number}
     */
    getFileCount() {
        return this.files.length;
    }

    /**
     * Recursive count including all nested subfolders.
     * @returns {number}
     */
    getTotalFileCount() {
        let count = this.files.length;
        for (const sub of this.subFolders) {
            count += sub.getTotalFileCount();
        }
        return count;
    }

    /**
     * All files under this folder tree.
     * @returns {SmartFile[]}
     */
    getAllFiles() {
        let allFiles = [...this.files];

        for (const sub of this.subFolders) {
            allFiles = allFiles.concat(sub.getAllFiles());
        }

        return allFiles;
    }

    /**
     * Dispose every SmartFile under this folder.
     */
    dispose() {
        for (const file of this.files) {
            file.dispose();
        }
        this.files = [];
    }

    /**
     * Incremental directory scan reused across refreshes.
     * @returns {Promise<SmartFolder>}
     */
    async scan() {
        if (!this.handle) {
            throw new Error('scan() requires a valid handle');
        }

        const dirHandle = this.handle;
        const start = performance.now();

        const existingFilesMap = new Map(this.files.map(f => [f.name, f]));
        const existingFoldersMap = new Map(this.subFolders.map(f => [f.name, f]));

        const filesToKeep = [];
        const foldersToKeep = [];
        const newFiles = [];
        const newSubFolders = [];

        const scanStart = performance.now();
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const ext = entry.name.split('.').pop().toLowerCase();
                if (!FileTypes.allMedia.includes(ext)) continue;

                const existingFile = existingFilesMap.get(entry.name);
                if (existingFile) {
                    try {
                        const file = await entry.getFile();

                        if (existingFile.size !== file.size || existingFile.lastModified !== file.lastModified) {
                            await existingFile.refresh();
                        }

                        filesToKeep.push(existingFile);
                        existingFilesMap.delete(entry.name);
                    } catch (e) {
                        console.log(`Stale handle for file ${entry.name}; dropping`);
                    }
                } else {
                    try {
                        const file = await entry.getFile();
                        const fileObj = new SmartFile({
                            handle: entry,
                            file: file,
                            parent: this
                        });

                        filesToKeep.push(fileObj);
                        newFiles.push(fileObj);
                    } catch (e) {
                        console.warn('Unable to read file:', entry.name, e);
                    }
                }
            } else if (entry.kind === 'directory') {
                if (entry.name.startsWith('.')) continue;

                const existingFolder = existingFoldersMap.get(entry.name);
                if (existingFolder) {
                    foldersToKeep.push(existingFolder);
                    existingFoldersMap.delete(entry.name);
                } else {
                    const subFolderData = new SmartFolder({
                        handle: entry,
                        parent: this
                    });

                    const subPath = this.path + '/' + entry.name;
                    appState.foldersData.set(subPath, subFolderData);

                    foldersToKeep.push(subFolderData);
                    newSubFolders.push(subFolderData);
                }
            }
        }
        console.log(`Single scan elapsed: ${performance.now() - scanStart} ms`);

        const cleanupStart = performance.now();

        for (const fileObj of existingFilesMap.values()) {
            fileObj.dispose();
        }

        for (const folderObj of existingFoldersMap.values()) {
            const deletedPath = folderObj.path;
            appState.foldersData.delete(deletedPath);
            folderObj.removeDOMNodes();
        }

        console.log(`Cleanup elapsed: ${performance.now() - cleanupStart} ms`);

        const sortStart = performance.now();
        filesToKeep.sort((a, b) => windowsCompareStrings(a.name, b.name));
        foldersToKeep.sort((a, b) => windowsCompareStrings(a.name, b.name));
        console.log(`Sorting elapsed: ${performance.now() - sortStart} ms`);

        this.files = filesToKeep;
        this.subFolders = foldersToKeep;
        this.scanned = true;

        console.log(`Scan total elapsed: ${performance.now() - start} ms`);

        return {
            folder: this,
            newFiles,
            newSubFolders,
            removedFileCount: existingFilesMap.size,
            removedFolderCount: existingFoldersMap.size
        };
    }

    /**
     * Sidebar badge refresh.
     */
    updateCount() {
        if (this.isVirtual && this.virtualConfig.skipUpdateCount) {
            return;
        }
        if (this.treeNode) {
            this.treeNode.updateCount();
        }
        if (this.parent) {
            this.parent.updateCount();
        }
    }

    /**
     * Toggle empty-folder iconography.
     */
    updateIconState() {
        if (this.isVirtual && this.virtualConfig.skipUpdateIconState) {
            return;
        }
        if (this.treeNode) {
            this.treeNode.updateIconState();
        }
    }

    /**
     * Expand/collapse chevron parity.
     */
    toggleExpanded() {
        if (this.treeNode) {
            this.treeNode.toggleExpanded();
        }
    }

    /**
     * Highlight matching tree row.
     */
    setActive() {
        if (this.treeNode) {
            this.treeNode.setActive();
        }
    }

    /**
     * Remove associated DOM scaffolding.
     */
    removeDOMNodes() {
        if (this.treeNode) {
            this.treeNode.remove();
        }
    }

    /**
     * Bootstrap synthetic nodes driven by uiConfig hooks.
     */
    initUI() {
        if (!this.isVirtual || !this.virtualConfig.uiConfig) {
            return;
        }

        if (!this.treeNode.li) {
            const config = this.virtualConfig.uiConfig;
            this.treeNode.createSpecial({
                iconHTML: config.iconHTML,
                text: config.text,
                onClick: config.onClick,
                id: config.id
            });
            this.treeNode.addToUI();
        }
    }

    /**
     * @returns {Promise<boolean>}
     */
    async validate() {
        if (!this.handle) return false;
        try {
            const permission = await this.handle.queryPermission({ mode: 'read' });
            if (permission === 'denied') return false;

            for await (const entry of this.handle.values()) {
                break;
            }
            return true;
        } catch (err) {
            if (err.name === 'NotFoundError') {
                return false;
            }
            console.warn(`Validation failed for folder ${this.name}:`, err);
            return false;
        }
    }

    /**
     * Walk parents until a reachable folder handle shows up.
     * @returns {Promise<SmartFolder|null>}
     */
    async findValidAncestor() {
        let current = this;

        while (current) {
            const isValid = await current.validate();
            if (isValid) {
                return current;
            }
            current = current.parent;
        }

        return null;
    }

    /**
     * @deprecated Prefer incremental `scan()` + `syncTreeStructure`.
     * @param {Map} foldersDataMap - appState.foldersData
     */
    clearSubtree(foldersDataMap) {
        this.dispose();

        const pathPrefix = this.path + '/';
        const pathsToDelete = [];

        for (const [path, folderData] of foldersDataMap) {
            if (path.startsWith(pathPrefix)) {
                if (folderData.dispose) folderData.dispose();
                if (folderData.removeDOMNodes) folderData.removeDOMNodes();
                pathsToDelete.push(path);
            }
        }

        for (const path of pathsToDelete) {
            foldersDataMap.delete(path);
        }

        if (this.treeList) {
            this.treeList.innerHTML = '';
        }

        this.files = [];
        this.subFolders = [];
        this.scanned = false;
    }

    /**
     * @deprecated Prefer incremental `scan()` + `syncTreeStructure`.
     * @returns {Promise<void>}
     */
    async rescanSubtree() {
        try {
            await this.scan();

            if (this.updateCount) {
                this.updateCount();
            }

            if (this.subFolders && this.subFolders.length > 0) {
                await syncTreeStructure(this);
            }

            return true;
        } catch (err) {
            console.error('Rescan subtree failed:', err);
            throw err;
        }
    }
}

/**
 * Virtual SmartFolder powering the aggregated All Media view.
 */
function createAllMediaFolder() {
    return SmartFolder.createVirtual({
        virtualName: 'ALL_MEDIA',
        virtualConfig: {
            customPath: 'ALL_MEDIA',
            skipUpdateCount: true,
            skipUpdateIconState: true,
            uiConfig: {
                iconHTML: '<i class="fas fa-layer-group"></i>',
                text: 'All Media',
                id: 'allPhotosNode'
            }
        }
    });
}

const ALL_MEDIA_FOLDER = createAllMediaFolder();
appState.foldersData.set('ALL_MEDIA', ALL_MEDIA_FOLDER);

