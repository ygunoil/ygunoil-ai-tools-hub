/**
 * Operation history manager.
 * Tracks file/folder ops (delete, rename, …) with undo support.
 */

/**
 * Operation type enum
 */
const OperationType = {
    FILE_DELETE: 'file_delete',
    FILE_RENAME: 'file_rename',
    FILE_MOVE: 'file_move',
};

/**
 * Base operation type
 */
class Operation {
    constructor(type, target) {
        this.type = type;
        this.target = target;
        this.timestamp = Date.now();
    }

    /**
     * Execute the operation.
     * @abstract
     */
    async execute() {
        throw new Error('execute() must be implemented');
    }

    /**
     * Undo the operation.
     * @abstract
     */
    async undo() {
        throw new Error('undo() must be implemented');
    }

    /**
     * Human-readable description for the operation.
     * @abstract
     */
    getDescription() {
        throw new Error('getDescription() must be implemented');
    }
}

/**
 * File delete → trash (.trash) flow
 */
class FileDeleteOperation extends Operation {
    constructor(fileData) {
        super(OperationType.FILE_DELETE, fileData);
        this.fileData = fileData;

        this.parentFolder = fileData.parent;
        this.originalName = fileData.name;
        this.trashPath = null;
    }

    /**
     * Relative path inside .trash (no leading root segment).
     * @returns {string}
     */
    _getRelativePath() {
        const fullPath = this.fileData.path;
        const pathParts = fullPath.split('/');
        const rootName = appState.rootHandle.name;

        if (pathParts[0] === rootName) {
            pathParts.shift();
        }

        pathParts.pop();
        return pathParts.join('/');
    }

    /**
     * Build mirrored directory tree under `.trash`.
     * @returns {Promise<FileSystemDirectoryHandle>}
     */
    async _createTrashDirectory() {
        const rootTrashHandle = await appState.rootHandle.getDirectoryHandle('.trash', { create: true });
        const relativePath = this._getRelativePath();

        if (!relativePath) {
            return rootTrashHandle;
        }

        let currentDirHandle = rootTrashHandle;
        const dirs = relativePath.split('/');
        for (const dir of dirs) {
            currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true });
        }

        return currentDirHandle;
    }

    /**
     * Produce a collision-free trash filename.
     * @param {FileSystemDirectoryHandle} trashDirHandle
     * @returns {Promise<string>}
     */
    async _generateUniqueTrashName(trashDirHandle) {
        const fileName = this.originalName;
        const dotIdx = fileName.lastIndexOf('.');
        const baseName = dotIdx !== -1 ? fileName.substring(0, dotIdx) : fileName;
        const ext = dotIdx !== -1 ? fileName.substring(dotIdx) : '';

        let targetName = fileName;
        let counter = 1;

        while (true) {
            try {
                await trashDirHandle.getFileHandle(targetName);
                targetName = `${baseName}_${counter}${ext}`;
                counter++;
            } catch (e) {
                if (e.name === 'NotFoundError') break;
                throw e;
            }
        }

        return targetName;
    }

    /**
     * Remove file from globals.currentDisplayList if present.
     */
    _removeFromDisplayList() {
        const listIdx = globals.currentDisplayList.indexOf(this.fileData);
        if (listIdx > -1) {
            globals.currentDisplayList.splice(listIdx, 1);
        }
    }

    async execute() {
        if (!this.parentFolder || !this.parentFolder.handle) {
            throw new Error("Cannot locate parent folder");
        }

        const trashDirHandle = await this._createTrashDirectory();

        const trashName = await this._generateUniqueTrashName(trashDirHandle);

        await this.fileData.handle.move(trashDirHandle, trashName);

        const relativePath = this._getRelativePath();
        this.trashPath = relativePath ? `${relativePath}/${trashName}` : trashName;

        this.parentFolder.removeFile(this.fileData);
        this._removeFromDisplayList();

        this.parentFolder.updateCount();
    }

    async undo() {
        if (!this.trashPath) {
            throw new Error('Nothing to undo: missing delete metadata');
        }

        const rootTrashHandle = await appState.rootHandle.getDirectoryHandle('.trash');
        const pathParts = this.trashPath.split('/');
        const trashName = pathParts.pop();

        let trashDirHandle = rootTrashHandle;
        for (const dir of pathParts) {
            trashDirHandle = await trashDirHandle.getDirectoryHandle(dir);
        }

        const trashedFileHandle = await trashDirHandle.getFileHandle(trashName);
        await trashedFileHandle.move(this.parentFolder.handle, this.originalName);

        const restoredHandle = await this.parentFolder.handle.getFileHandle(this.originalName);
        const restoredFile = await restoredHandle.getFile();

        this.fileData.handle = restoredHandle;
        this.fileData.file = restoredFile;

        this.parentFolder.addFileAndSort(this.fileData);

        if (!globals.currentDisplayList.includes(this.fileData)) {
            globals.currentDisplayList.push(this.fileData);
            globals.currentDisplayList.sort((a, b) => windowsCompareStrings(a.name, b.name));
        }

        this.parentFolder.updateCount();
    }

    getDescription() {
        return `Delete file: ${this.originalName}`;
    }
}

/**
 * File rename operation
 */
class FileRenameOperation extends Operation {
    constructor(fileData, oldName, newName) {
        super(OperationType.FILE_RENAME, fileData);
        this.fileData = fileData;
        this.oldName = oldName;
        this.newName = newName;
    }

    async execute() {
        await this.fileData.rename(this.newName);
    }

    async undo() {
        await this.fileData.rename(this.oldName);

        if (this.fileData.dom) {
            const nameEl = this.fileData.dom.querySelector('.file-name');
            if (nameEl) {
                nameEl.textContent = this.oldName;
            }
        }
    }

    getDescription() {
        return `Rename: ${this.oldName}`;
    }
}

/**
 * File move operation
 */
class FileMoveOperation extends Operation {
    constructor(fileData, targetFolder) {
        super(OperationType.FILE_MOVE, fileData);
        this.fileData = fileData;

        if (!fileData.parent) {
            throw new Error('File missing parent folder reference');
        }

        this.sourceFolder = fileData.parent;

        this.targetFolder = targetFolder;
    }

    async execute() {
        await this.fileData.move(this.targetFolder);
    }

    async undo() {
        if (!this.sourceFolder) {
            throw new Error('Source folder reference missing');
        }

        await this.fileData.move(this.sourceFolder);
    }

    getDescription() {
        return `Move file: ${this.fileData.name}`;
    }
}

/**
 * History stack wrapper
 */
class OperationHistory {
    constructor(maxSize = 50) {
        this.history = [];
        this.maxSize = maxSize;
    }

    /**
     * Push an executed operation onto the stack.
     */
    push(operation) {
        this.history.push(operation);

        if (this.history.length > this.maxSize) {
            this.history.shift();
        }
    }

    /**
     * Undo the most recent operation.
     * @returns {Promise<Operation>}
     */
    async undo() {
        if (this.history.length === 0) {
            throw new Error('Nothing to undo');
        }

        const operation = this.history.pop();
        await operation.undo();

        return operation;
    }

    /**
     * Clear history.
     */
    clear() {
        this.history = [];
    }

    /**
     * Stack depth.
     */
    size() {
        return this.history.length;
    }

    /**
     * Description of latest op, if any.
     */
    getLastOperationDescription() {
        if (this.history.length === 0) {
            return null;
        }
        return this.history[this.history.length - 1].getDescription();
    }
}

const operationHistory = new OperationHistory();

/**
 * Execute delete + enqueue history entry.
 */
async function deleteFileWithHistory(fileData) {
    const operation = new FileDeleteOperation(fileData);
    const deleteInfo = await operation.execute();
    operationHistory.push(operation);
    return deleteInfo;
}

/**
 * Execute rename + enqueue history entry.
 */
async function renameFileWithHistory(fileData, newName) {
    const oldName = fileData.name;
    const operation = new FileRenameOperation(fileData, oldName, newName);
    await operation.execute();
    operationHistory.push(operation);
}

/**
 * Execute move + enqueue history entry.
 */
async function moveFileWithHistory(fileData, targetFolder) {
    const operation = new FileMoveOperation(fileData, targetFolder);
    await operation.execute();
    operationHistory.push(operation);
}


/**
 * Undo the last operation on the stack.
 * @returns {Promise<Operation>}
 */
async function undoLastOperation() {
    const operation = await operationHistory.undo();
    return operation;
}
