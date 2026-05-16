
/**
 * Media type strategies — how each media kind is handled in the lightbox.
 */
const MediaStrategies = {
    // Images
    image: {
        types: [...FileTypes.image.standard, ...FileTypes.image.gif],
        createDOM: () => {
            const img = document.createElement('img');
            img.className = 'modal-media modal-image';
            img.draggable = false;
            img.alt = 'Full view';
            return img;
        },
        load: async (dom, blobUrl) => {
            return new Promise((resolve, reject) => {
                dom.onload = () => {
                    dom.style.filter = 'brightness(1)';
                    resolve();
                };
                dom.onerror = () => reject(new Error('Failed to load image'));
                dom.style.filter = 'brightness(0.7)';
                dom.src = blobUrl;
            });
        }
    },

    // SVG
    svg: {
        types: FileTypes.image.svg,
        createDOM: () => {
            const container = document.createElement('div');
            container.className = 'modal-media svg-container';
            return container;
        },
        load: async (dom, blobUrl) => {
            const response = await fetch(blobUrl);
            const svgText = await response.text();
            dom.innerHTML = svgText;
        }
    },

    // Video
    video: {
        types: FileTypes.video.all,
        createDOM: () => {
            const video = document.createElement('video');
            video.className = 'modal-media modal-video';
            video.controls = true;
            video.autoplay = false; // Do not autoplay; let the user control playback
            video.loop = false;
            return video;
        },
        load: async (dom, blobUrl) => {
            // Set src directly; no need to wait for load
            dom.src = blobUrl;
        }
    },

    // Audio
    audio: {
        types: FileTypes.audio.all,
        createDOM: () => audioPlayerInstance.createDOM(),
        load: async (dom, blobUrl, fileData) => {
            await audioPlayerInstance.load(dom, blobUrl, fileData);

            // Store cleanup for teardown
            dom._audioCleanup = () => {
                audioPlayerInstance.cleanup();
            };
        }
    }
};

/**
 * Returns the media strategy for a file extension.
 * @param {string} fileType - File extension
 * @returns {Object} Strategy object
 */
function getMediaStrategy(fileType) {
    for (const [strategyName, strategy] of Object.entries(MediaStrategies)) {
        if (strategy.types.includes(fileType)) {
            return { name: strategyName, ...strategy };
        }
    }
    // Default: treat as image
    return { name: 'image', ...MediaStrategies.image };
}

/**
 * Lightbox / modal media viewer.
 * Supports images, SVG, video, and audio.
 */
class ImageModal {
    constructor() {
        // Current file
        this.fileData = null;

        // View state
        this.isOpen = false;
        this.currentIndex = -1;
        this.scale = 1;
        this.panning = false;
        this.pointX = 0;
        this.pointY = 0;
        this.startX = 0;
        this.startY = 0;
        this.mouseDownTime = 0;
        this.mouseDownX = 0;
        this.mouseDownY = 0;

        // Ctrl held — drag/pan mode for video/audio
        this.isCtrlPressed = false;

        // Video hover — keyboard seek controls
        this.isHoveringVideo = false;

        // Pinch zoom
        this.initialDistance = 0;
        this.initialScale = 1;

        // DOM refs
        this.modal = UI.modal;
        this.modalImage = UI.modalImage;
        this.modalLoader = UI.modalLoader;
        this.modalContent = this.modal.querySelector('.modal-content');
        this.prevBtn = document.getElementById('lightboxPrevBtn');
        this.nextBtn = document.getElementById('lightboxNextBtn');

        // DOM cache (LRU by insert order in Map)
        this.maxCacheSize = 10; // Max cached media DOM nodes

        // Map key: blobUrl → { dom, strategy, loaded }
        this.cache = new Map();

        this.setupEvents();
    }

    /**
     * Get or create a cached DOM node for this file.
     * @param {SmartFile} fileData
     * @returns {Object} { dom, strategy, loaded }
     */
    getOrCreateCache(fileData) {
        const key = fileData.blobUrl;

        // Promote to MRU if already cached
        if (this.cache.has(key)) {
            const cached = this.cache.get(key);
            console.log(`[Modal Cache] cache hit:`, {
                file: fileData.name,
                type: cached.strategy.name,
                loaded: cached.loaded,
                cacheSize: this.cache.size
            });
            this.cache.delete(key);
            this.cache.set(key, cached);
            return cached;
        }

        // Resolve strategy
        const strategy = getMediaStrategy(fileData.type);

        console.log(`[Modal Cache] creating cache entry:`, {
            file: fileData.name,
            type: strategy.name,
            cacheSize: this.cache.size
        });

        // Build DOM
        const dom = strategy.createDOM();

        const cached = {
            dom: dom,
            strategy: strategy,
            loaded: false
        };

        // Insert into cache
        this.cache.set(key, cached);

        // Evict LRU if over capacity
        if (this.cache.size > this.maxCacheSize) {
            const oldestKey = this.cache.keys().next().value;
            const oldest = this.cache.get(oldestKey);

            console.log(`[Modal Cache] evicting LRU:`, {
                type: oldest.strategy.name,
                newCacheSize: this.cache.size - 1
            });

            if (oldest.dom && oldest.dom.parentNode) {
                oldest.dom.remove();
            }

            this.cache.delete(oldestKey);
        }

        return cached;
    }

    /**
     * Clear the entire cache.
     */
    clearCache() {
        for (const [key, cached] of this.cache) {
            if (cached.dom && cached.dom.parentNode) {
                cached.dom.remove();
            }
        }
        this.cache.clear();
    }

    /**
     * Attach modal event listeners.
     */
    setupEvents() {
        // Wheel zoom
        this.modal.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // Drag with mouse
        this.modal.addEventListener('mousedown', this.handleMouseDown.bind(this));
        window.addEventListener('mousemove', this.handleMouseMove.bind(this));
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // Touch gestures
        this.modal.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.modal.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.modal.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Ctrl — drag mode for video/audio controls vs pan
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));

        // Track hover on video for arrow-key seeking
        this.modal.addEventListener('mouseover', (e) => {
            if (e.target.tagName === 'VIDEO') {
                this.isHoveringVideo = true;
            }
        });
        this.modal.addEventListener('mouseout', (e) => {
            if (e.target.tagName === 'VIDEO') {
                this.isHoveringVideo = false;
            }
        });

        if (this.prevBtn) {
            this.prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.currentIndex > 0) this.openByIndex(this.currentIndex - 1);
            });
        }
        if (this.nextBtn) {
            this.nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const list = globals.visibleFileList || [];
                if (this.currentIndex >= 0 && this.currentIndex < list.length - 1) {
                    this.openByIndex(this.currentIndex + 1);
                }
            });
        }
    }

    /**
     * Show / hide lightbox prev-next (fixed to viewport; not inside panned .modal-content).
     */
    updateLightboxNavButtons() {
        const list = globals.visibleFileList || [];
        const len = list.length;
        const show = this.isOpen && len > 1;
        const idx = this.currentIndex;
        if (this.prevBtn) {
            this.prevBtn.style.display = show ? 'inline-flex' : 'none';
            this.prevBtn.disabled = !show || idx <= 0;
        }
        if (this.nextBtn) {
            this.nextBtn.style.display = show ? 'inline-flex' : 'none';
            this.nextBtn.disabled = !show || idx < 0 || idx >= len - 1;
        }
    }

    /**
     * Ctrl key down — enable drag mode on media elements.
     */
    handleKeyDown(e) {
        if (e.key === 'Control' && !this.isCtrlPressed) {
            this.isCtrlPressed = true;
            this.modalContent.querySelectorAll('video, audio').forEach(el => {
                el.classList.add('dragging-mode');
            });
        }
    }

    /**
     * Ctrl key up.
     */
    handleKeyUp(e) {
        if (e.key === 'Control') {
            this.isCtrlPressed = false;
            this.modalContent.querySelectorAll('video, audio').forEach(el => {
                el.classList.remove('dragging-mode');
            });
        }
    }

    /**
     * Mouse wheel zoom (centered on cursor).
     */
    handleWheel(e) {
        if (!this.isOpen) return;
        if (e.target.closest('.lightbox-nav-btn')) return;
        e.preventDefault();

        const zoomIntensity = 0.15;
        const delta = e.deltaY > 0 ? -1 : 1;
        const ratio = 1 + delta * zoomIntensity;
        const newScale = this.scale * ratio;

        if (newScale < 0.1 || newScale > 10) return;

        // Zoom toward pointer
        const rect = this.modalContent.getBoundingClientRect();
        const offsetX = e.clientX - rect.left - rect.width / 2;
        const offsetY = e.clientY - rect.top - rect.height / 2;

        this.pointX = this.pointX - offsetX * (ratio - 1);
        this.pointY = this.pointY - offsetY * (ratio - 1);
        this.scale = newScale;
        this.applyTransform();
    }

    /**
     * Mouse down — start panning.
     */
    handleMouseDown(e) {
        if (!this.isOpen) return;

        if (e.target.closest('.lightbox-nav-btn')) return;

        // Right click: keep native context menu
        if (e.button === 2) return;

        // Primary button: pan
        if (e.button !== 0) return;

        e.preventDefault();
        this.panning = true;
        this.startX = e.clientX - this.pointX;
        this.startY = e.clientY - this.pointY;
        this.mouseDownTime = Date.now();
        this.mouseDownX = e.clientX;
        this.mouseDownY = e.clientY;
        this.modal.style.cursor = 'grabbing';
    }

    /**
     * Mouse move while panning.
     */
    handleMouseMove(e) {
        if (!this.panning || !this.isOpen) return;
        e.preventDefault();
        const moveX = e.clientX - this.mouseDownX;
        const moveY = e.clientY - this.mouseDownY;
        const distance = Math.sqrt(moveX * moveX + moveY * moveY);
        if (distance > 5) {
            this.pointX = e.clientX - this.startX;
            this.pointY = e.clientY - this.startY;
            this.applyTransform();
        }
    }

    /**
     * Mouse up — end pan; treat as dismiss click on backdrop.
     */
    handleMouseUp(e) {
        if (!this.panning) return;

        const clickDuration = Date.now() - this.mouseDownTime;
        const moveX = e.clientX - this.mouseDownX;
        const moveY = e.clientY - this.mouseDownY;
        const distance = Math.sqrt(moveX * moveX + moveY * moveY);
        const isClick = distance < 5 && clickDuration < 300;

        // Click outside video/audio UI closes the lightbox
        if (isClick) {
            const mediaElement = e.target.closest('video, audio');
            const audioPlayer = e.target.closest('.modal-audio-player');
            const navBtn = e.target.closest('.lightbox-nav-btn');
            if (!mediaElement && !audioPlayer && !navBtn) {
                this.close();
            }
        }

        this.panning = false;
        this.modal.style.cursor = '';
    }

    /**
     * Touch start — pan or pinch setup.
     */
    handleTouchStart(e) {
        if (!this.isOpen) return;
        if (e.touches.length === 1) {
            e.preventDefault();
            this.panning = true;
            const touch = e.touches[0];
            this.startX = touch.clientX - this.pointX;
            this.startY = touch.clientY - this.pointY;
            this.mouseDownTime = Date.now();
            this.mouseDownX = touch.clientX;
            this.mouseDownY = touch.clientY;
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this.initialDistance = Math.sqrt(dx * dx + dy * dy);
            this.initialScale = this.scale;
        }
    }

    /**
     * Touch move — pan or pinch zoom.
     */
    handleTouchMove(e) {
        if (!this.isOpen) return;
        if (this.panning && e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const moveX = touch.clientX - this.mouseDownX;
            const moveY = touch.clientY - this.mouseDownY;
            const distance = Math.sqrt(moveX * moveX + moveY * moveY);
            if (distance > 5) {
                this.pointX = touch.clientX - this.startX;
                this.pointY = touch.clientY - this.startY;
                this.applyTransform();
            }
        }
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            const scaleChange = currentDistance / this.initialDistance;
            const newScale = this.initialScale * scaleChange;
            if (newScale < 0.1 || newScale > 10) return;
            this.scale = newScale;
            this.applyTransform();
        }
    }

    /**
     * Touch end — dismiss on tap outside audio chrome.
     */
    handleTouchEnd(e) {
        if (e.touches.length === 0) {
            const touchDuration = Date.now() - this.mouseDownTime;
            const touch = e.changedTouches[0];
            if (touch) {
                const moveX = touch.clientX - this.mouseDownX;
                const moveY = touch.clientY - this.mouseDownY;
                const distance = Math.sqrt(moveX * moveX + moveY * moveY);
                const isTap = distance < 10 && touchDuration < 300;
                if (isTap) {
                    // Ignore taps on the audio player chrome
                    const audioPlayer = e.target.closest('.modal-audio-player');
                    const navBtn = e.target.closest('.lightbox-nav-btn');
                    if (!audioPlayer && !navBtn) {
                        this.close();
                    }
                }
            }
            this.initialDistance = 0;
            this.panning = false;
        }
    }

    /**
     * Reset pan/zoom.
     */
    resetTransform() {
        this.scale = 1;
        this.pointX = 0;
        this.pointY = 0;
        this.applyTransform();
    }

    /**
     * Apply CSS transform to content.
     */
    applyTransform() {
        const transform = `translate(${this.pointX}px, ${this.pointY}px) scale(${this.scale})`;
        this.modalContent.style.transform = transform;
    }

    /**
     * Ensure file still exists on disk.
     */
    async prepareFileData() {
        const isValid = await this.fileData.validate();
        if (!isValid) {
            const recovered = await handleFileNotFound(this.fileData);
            if (!recovered) {
                showToast("Could not open file: it may have been deleted or moved", "error");
            }
            return false;
        }

        // blobUrl is created in SmartFile; do not recreate here
        return true;
    }

    /**
     * Show lightbox and sync global index.
     */
    show() {
        if (!this.fileData) return;

        this.isOpen = true;
        this.currentIndex = globals.visibleFileList.indexOf(this.fileData);
        globals.currentImageIndex = this.currentIndex;

        this.modal.classList.remove('hidden');
        this.modalLoader.classList.remove('hidden');
        this.resetTransform();
        this.updateLightboxNavButtons();
    }


    /**
     * Open lightbox for the given file.
     */
    async open(fileData) {
        if (!fileData) return;


        try {
            this.fileData = fileData;

            const ready = await this.prepareFileData();
            if (!ready) return;

            const cached = this.getOrCreateCache(fileData);

            this.show();

            this.clearCurrentDisplay();

            if (cached.loaded) {
                this.modalContent.appendChild(cached.dom);
                this.modalLoader.classList.add('hidden');
            } else {
                try {
                    await cached.strategy.load(cached.dom, fileData.blobUrl);
                    cached.loaded = true;
                    this.modalContent.appendChild(cached.dom);
                    this.modalLoader.classList.add('hidden');
                } catch (err) {
                    console.error('Failed to load media:', err);
                    this.modalLoader.classList.add('hidden');
                    showToast(`Load failed: ${err.message}`, 'error');
                    throw err;
                }
            }

            this.updateLightboxNavButtons();

        } catch (err) {
            console.error("Failed to open lightbox:", err);

            if (err.name === 'NotFoundError' || err.message?.includes('not found')) {
                await handleFileNotFound(this.fileData);
            } else {
                showToast("Could not open viewer: " + err.message, "error");
            }
        }
    }

    /**
     * Remove children from the content area (cache kept elsewhere).
     */
    clearCurrentDisplay() {
        while (this.modalContent.firstChild) {
            this.modalContent.removeChild(this.modalContent.firstChild);
        }
    }


    /**
     * Open by index into the visible list.
     */
    openByIndex(index) {
        if (globals.visibleFileList && index >= 0 && index < globals.visibleFileList.length) {
            this.open(globals.visibleFileList[index]);
        }
    }

    /**
     * Close lightbox.
     */
    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.panning = false;
        this.currentIndex = -1;
        this.fileData = null;
        this.isHoveringVideo = false;
        globals.currentImageIndex = -1;
        this.modal.classList.add('hidden');

        // Hide content node; LRU cache retains detached DOM
        this.clearCurrentDisplay();
        this.updateLightboxNavButtons();
    }

    /**
     * Snapshot UI state for hotkeys/helpers.
     */
    getState() {
        return {
            isOpen: this.isOpen,
            currentIndex: this.currentIndex,
            scale: this.scale,
            pointX: this.pointX,
            pointY: this.pointY,
            isHoveringVideo: this.isHoveringVideo
        };
    }

    /**
     * Copy current image to clipboard (images only).
     */
    async copyCurrentImage() {
        if (!this.isOpen || !this.fileData) return;
        await copyImage(this.fileData);
    }
}


// Global lightbox instance
const imageModal = new ImageModal();
window.imageModal = imageModal;

// Legacy no-op (listeners wired in constructor)
function setupModalEvents() {
}

function openModal(fileData) {
    return imageModal.open(fileData);
}

function openModalByIndex(index) {
    return imageModal.openByIndex(index);
}

function closeModal() {
    imageModal.close();
}

function getModalState() {
    return imageModal.getState();
}

async function copyCurrentImageToClipboard() {
    await imageModal.copyCurrentImage();
}

// Copy image helper (PNG on clipboard when possible)
async function copyImage(fileData) {
    if (!fileData) return;
    if (typeof fileData === 'string') return;

    const imageName = fileData.name || 'Image';
    try {
        let targetBlob = null;
        const file = await fileData.handle.getFile();
        if (file.type === 'image/png') {
            targetBlob = file;
        } else {
            targetBlob = await convertToPngBlob(fileData.blobUrl);
        }
        if (!targetBlob) throw new Error("Could not build image data for clipboard");

        const textContent = fileData.blobUrl;
        const htmlContent = `<img src="${fileData.blobUrl}" alt="${imageName}" />`;
        const clipboardData = {
            'image/png': targetBlob,
            'text/plain': new Blob([textContent], { type: 'text/plain' }),
            'text/html': new Blob([htmlContent], { type: 'text/html' })
        };
        const clipboardItem = new ClipboardItem(clipboardData);
        await navigator.clipboard.write([clipboardItem]);
        showToast(`Copied: ${imageName}`, 'success');
    } catch (error) {
        console.error("Copy failed:", error);
        showToast(`Copy failed: ${error.message}`, 'error');
    }
}
