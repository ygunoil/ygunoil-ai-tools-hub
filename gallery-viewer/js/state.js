const appState = {
    rootHandle: null,
    currentFolder: null, // Folder currently shown (SmartFolder instance)
    foldersData: new Map(),
    allPhotosMode: false,
    dirMap: new Map(),
    deleteHistory: []
};

// WeakMap associates DOM nodes with Folder instances (avoids leaks)
const domToFolderMap = new WeakMap();

const globals = {
    currentDisplayList: [],
    visibleFileList: [], // On-screen list after filtering and sorting
    get currentImageIndex() { return this._currentImageIndex || -1; },
    set currentImageIndex(val) { this._currentImageIndex = val; }
};
