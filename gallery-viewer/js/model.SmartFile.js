/**
 * SmartFile represents a browsable media file.
 */
class SmartFile {
    constructor({ handle, file, parent = null }) {
        this.handle = handle;           // FileSystemFileHandle
        this.file = file;               // File instance
        this.parent = parent;           // Folder reference
        this.blobUrl = URL.createObjectURL(file);
        this.dom = null;                // Linked gallery DOM node
        this.md5 = null;                // Cached MD5
    }

    /**
     * Derive lowercase extension/type from filename.
     * @param {string} filename
     * @returns {string} e.g. 'png', 'jpg', 'svg', 'gif'
     * @private
     */
    _extractType(filename) {
        const parts = filename.split('.');
        if (parts.length < 2) return '';
        return parts.pop().toLowerCase();
    }

    /**
     * @returns {string} File basename from handle.name
     */
    get name() {
        return this.handle.name;
    }

    /**
     * @returns {number} Bytes
     */
    get size() {
        return this.file.size;
    }

    /**
     * @returns {number} lastModified timestamp
     */
    get lastModified() {
        return this.file.lastModified;
    }

    /**
     * Extension-based type inferred from {@link SmartFile#name}.
     * @returns {string}
     */
    get type() {
        return this._extractType(this.name);
    }

    /**
     * Full relative path segments joined up to the project root.
     * @returns {string}
     */
    get path() {
        const parts = [this.name];
        let current = this.parent;

        while (current) {
            parts.unshift(current.name);
            current = current.parent;
        }

        return parts.join('/');
    }


    /**
     * Rename in place via handle.move.
     * @param {string} newName
     */
    async rename(newName) {
        if (!this.handle || !this.parent) {
            throw new Error('Cannot rename: missing handle or parent reference');
        }

        try {
            await this.handle.move(newName);

            const newFile = await this.handle.getFile();
            this.file = newFile;

            if (this.blobUrl) {
                URL.revokeObjectURL(this.blobUrl);
            }
            this.blobUrl = URL.createObjectURL(newFile);

            this.md5 = null;

            return true;
        } catch (err) {
            console.error('Rename failed:', err);
            throw err;
        }
    }

    /**
     * Move into another SmartFolder.
     * @param {SmartFolder} targetFolder
     */
    async move(targetFolder) {
        if (!this.parent || !this.parent.handle) {
            throw new Error('Cannot move: missing parent reference');
        }
        if (!targetFolder || !targetFolder.handle) {
            throw new Error('Cannot move: invalid target folder');
        }

        try {
            const sourceFolder = this.parent;

            await this.handle.move(targetFolder.handle);

            sourceFolder.removeFile(this);

            this.parent = targetFolder;

            targetFolder.addFileAndSort(this);

            sourceFolder.updateCount();
            targetFolder.updateCount();

            return true;
        } catch (err) {
            console.error('Move failed:', err);
            throw err;
        }
    }

    /**
     * Reload metadata from disk when user refreshes.
     */
    async refresh() {
        try {
            const file = await this.handle.getFile();

            if (this.size !== file.size || this.lastModified !== file.lastModified) {
                if (this.blobUrl) {
                    URL.revokeObjectURL(this.blobUrl);
                }

                this.file = file;
                this.size = file.size;
                this.lastModified = file.lastModified;
                this.blobUrl = URL.createObjectURL(file);
                this.md5 = null;
            }

            return true;
        } catch (err) {
            console.error('Failed to refresh file:', err);
            throw err;
        }
    }

    /**
     * Revoke Blob URLs owned by this file.
     */
    dispose() {
        if (this.blobUrl) {
            URL.revokeObjectURL(this.blobUrl);
            this.blobUrl = null;
        }
    }

    /**
     * Whether the backing handle still resolves.
     * @returns {Promise<boolean>}
     */
    async validate() {
        if (!this.handle) return false;
        try {
            await this.handle.getFile();
            return true;
        } catch (err) {
            if (err.name === 'NotFoundError') {
                return false;
            }
            console.warn(`Validation failed for file ${this.name}:`, err);
            return false;
        }
    }

    /**
     * Detect real format from magic bytes (best-effort).
     * @returns {Promise<string>} e.g. 'png', 'jpg', …
     */
    async getActualType() {
        try {
            const file = await this.handle.getFile();

            const buffer = await file.slice(0, 12).arrayBuffer();
            const bytes = new Uint8Array(buffer);

            if (bytes.length >= 8 &&
                bytes[0] === 0x89 && bytes[1] === 0x50 &&
                bytes[2] === 0x4E && bytes[3] === 0x47) {
                return 'png';
            }

            if (bytes.length >= 3 &&
                bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
                return 'jpg';
            }

            if (bytes.length >= 4 &&
                bytes[0] === 0x47 && bytes[1] === 0x49 &&
                bytes[2] === 0x46 && bytes[3] === 0x38) {
                return 'gif';
            }

            if (bytes.length >= 12 &&
                bytes[0] === 0x52 && bytes[1] === 0x49 &&
                bytes[2] === 0x46 && bytes[3] === 0x46 &&
                bytes[8] === 0x57 && bytes[9] === 0x45 &&
                bytes[10] === 0x42 && bytes[11] === 0x50) {
                return 'webp';
            }

            if (bytes.length >= 2 &&
                bytes[0] === 0x42 && bytes[1] === 0x4D) {
                return 'bmp';
            }

            if (this.type === 'svg') {
                const text = await file.slice(0, 1000).text();
                if (text.includes('<svg') || text.includes('<?xml')) {
                    return 'svg';
                }
            }

            return this.type;

        } catch (err) {
            console.warn(`Unable to sniff format for ${this.name}:`, err);
            return this.type;
        }
    }
}


