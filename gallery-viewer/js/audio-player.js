/**
 * Custom audio player for the lightbox: cover art, metadata, progress, and volume.
 */

class AudioPlayer {
    constructor() {
        this.container = null;
        this.audio = null;
        this.visualizerInterval = null;
    }

    /**
     * Create player DOM structure
     * @returns {HTMLElement} player container element
     */
    createDOM() {
        const container = document.createElement('div');
        container.className = 'modal-media modal-audio-player';

        container.innerHTML = `
            <div class="audio-player-wrapper">
                <div class="audio-cover-container">
                    <div class="audio-cover">
                        <img class="cover-image" src="" alt="cover">
                        <div class="cover-placeholder">
                            <i class="fas fa-music"></i>
                        </div>
                    </div>
                    <div class="audio-visualizer">
                        <div class="visualizer-bar"></div>
                        <div class="visualizer-bar"></div>
                        <div class="visualizer-bar"></div>
                        <div class="visualizer-bar"></div>
                        <div class="visualizer-bar"></div>
                    </div>
                </div>
                
                <div class="audio-info">
                    <h2 class="audio-title">Loading...</h2>
                    <p class="audio-artist">Unknown artist</p>
                    <p class="audio-album">Unknown album</p>
                </div>
                
                <div class="audio-controls">
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill"></div>
                            <div class="progress-handle"></div>
                        </div>
                        <div class="time-display">
                            <span class="current-time">0:00</span>
                            <span class="total-time">0:00</span>
                        </div>
                    </div>
                    
                    <div class="control-buttons">
                        <button class="control-btn prev-btn" title="Previous song">
                            <i class="fas fa-step-backward"></i>
                        </button>
                        <button class="control-btn play-btn" title="play">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="control-btn next-btn" title="Next song">
                            <i class="fas fa-step-forward"></i>
                        </button>
                        <div class="volume-control">
                            <button class="control-btn volume-btn" title="volume">
                                <i class="fas fa-volume-up"></i>
                            </button>
                            <input type="range" class="volume-slider" min="0" max="100" value="100">
                        </div>
                    </div>
                </div>
                
                <audio class="audio-element"></audio>
            </div>
        `;

        this.container = container;
        return container;
    }

    /**
     * Load audio files and initialize the player
     * @param {HTMLElement} dom - player container
     * @param {string} blobUrl - audio file URL
     * @param {SmartFile} fileData - file data object
     */
    async load(dom, blobUrl, fileData) {
        this.container = dom;

        // get DOM element reference
        this.audio = dom.querySelector('.audio-element');
        const coverImage = dom.querySelector('.cover-image');
        const coverPlaceholder = dom.querySelector('.cover-placeholder');
        const titleEl = dom.querySelector('.audio-title');
        const artistEl = dom.querySelector('.audio-artist');
        const albumEl = dom.querySelector('.audio-album');
        const playBtn = dom.querySelector('.play-btn');
        const prevBtn = dom.querySelector('.prev-btn');
        const nextBtn = dom.querySelector('.next-btn');
        const progressFill = dom.querySelector('.progress-fill');
        const progressHandle = dom.querySelector('.progress-handle');
        const progressBar = dom.querySelector('.progress-bar');
        const currentTimeEl = dom.querySelector('.current-time');
        const totalTimeEl = dom.querySelector('.total-time');
        const volumeSlider = dom.querySelector('.volume-slider');
        const volumeBtn = dom.querySelector('.volume-btn');
        const visualizerBars = dom.querySelectorAll('.visualizer-bar');

        // Set audio source
        this.audio.src = blobUrl;

        // Load song information
        await this.loadSongInfo(fileData, titleEl, artistEl, albumEl, coverImage, coverPlaceholder);

        // Bind playback controls
        this.bindPlayControls(playBtn, visualizerBars);

        // Bind navigation control
        this.bindNavigationControls(prevBtn, nextBtn);

        // Bind progress control
        this.bindProgressControls(progressBar, progressFill, progressHandle, currentTimeEl, totalTimeEl);

        // Bind volume control
        this.bindVolumeControls(volumeSlider, volumeBtn);

        // Keep clicks from closing the modal
        dom.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    /**
     * Load song information (title, artist, album, cover)
     */
    async loadSongInfo(fileData, titleEl, artistEl, albumEl, coverImage, coverPlaceholder) {
        // Get filename as default title
        const fileName = fileData?.name || 'Unknown song';
        titleEl.textContent = fileName.replace(/\.[^/.]+$/, ''); // Remove extension

        // Try reading ID3 tags (MP3)
        if (fileData && fileData.type === 'mp3') {
            try {
                const id3Tags = await extractID3Tags(fileData);
                if (id3Tags) {
                    if (id3Tags.title) titleEl.textContent = id3Tags.title;
                    if (id3Tags.artist) artistEl.textContent = id3Tags.artist;
                    if (id3Tags.album) albumEl.textContent = id3Tags.album;
                }
            } catch (err) {
                console.error('extract ID3 fail:', err);
            }

            // Try to extract the cover
            try {
                const coverBlob = await extractAudioCover(fileData);
                if (coverBlob) {
                    const coverUrl = URL.createObjectURL(coverBlob);
                    coverImage.src = coverUrl;
                    coverImage.style.display = 'block';
                    coverPlaceholder.style.display = 'none';
                }
            } catch (err) {
                console.error('Failed to extract cover:', err);
            }
        }
    }

    /**
     * Bind play/pause control
     */
    bindPlayControls(playBtn, visualizerBars) {
        playBtn.addEventListener('click', () => {
            if (this.audio.paused) {
                this.audio.play();
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                this.startVisualizer(visualizerBars);
            } else {
                this.audio.pause();
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
                this.stopVisualizer(visualizerBars);
            }
        });
    }

    /**
     * Bind previous/next song control
     */
    bindNavigationControls(prevBtn, nextBtn) {
        prevBtn.addEventListener('click', () => {
            if (window.imageModal) {
                const currentIndex = window.imageModal.currentIndex;
                if (currentIndex > 0) {
                    window.imageModal.openByIndex(currentIndex - 1);
                }
            }
        });

        nextBtn.addEventListener('click', () => {
            if (window.imageModal) {
                const currentIndex = window.imageModal.currentIndex;
                const totalFiles = globals.visibleFileList?.length || 0;
                if (currentIndex < totalFiles - 1) {
                    window.imageModal.openByIndex(currentIndex + 1);
                }
            }
        });
    }

    /**
     * Bind progress bar control
     */
    bindProgressControls(progressBar, progressFill, progressHandle, currentTimeEl, totalTimeEl) {
        // update progress
        this.audio.addEventListener('timeupdate', () => {
            const progress = (this.audio.currentTime / this.audio.duration) * 100;
            progressFill.style.width = progress + '%';
            progressHandle.style.left = progress + '%';
            currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
        });

        // Load metadata
        this.audio.addEventListener('loadedmetadata', () => {
            totalTimeEl.textContent = this.formatTime(this.audio.duration);
        });

        // Click on the progress bar to jump
        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            this.audio.currentTime = percent * this.audio.duration;
        });

        // Drag progress bar
        let isDragging = false;

        progressHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const rect = progressBar.getBoundingClientRect();
                let percent = (e.clientX - rect.left) / rect.width;
                percent = Math.max(0, Math.min(1, percent));
                this.audio.currentTime = percent * this.audio.duration;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    /**
     * Bind volume control
     */
    bindVolumeControls(volumeSlider, volumeBtn) {
        volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = e.target.value / 100;
            this.updateVolumeIcon(volumeBtn, e.target.value);
        });

        volumeBtn.addEventListener('click', () => {
            if (this.audio.volume > 0) {
                this.audio.dataset.prevVolume = this.audio.volume;
                this.audio.volume = 0;
                volumeSlider.value = 0;
                this.updateVolumeIcon(volumeBtn, 0);
            } else {
                const prevVolume = this.audio.dataset.prevVolume || 1;
                this.audio.volume = prevVolume;
                volumeSlider.value = prevVolume * 100;
                this.updateVolumeIcon(volumeBtn, prevVolume * 100);
            }
        });
    }

    /**
     * Update volume icon
     */
    updateVolumeIcon(volumeBtn, volume) {
        const icon = volumeBtn.querySelector('i');
        if (volume == 0) {
            icon.className = 'fas fa-volume-mute';
        } else if (volume < 50) {
            icon.className = 'fas fa-volume-down';
        } else {
            icon.className = 'fas fa-volume-up';
        }
    }

    /**
     * Start visualization
     */
    startVisualizer(visualizerBars) {
        this.visualizerInterval = setInterval(() => {
            visualizerBars.forEach(bar => {
                const height = Math.random() * 100;
                bar.style.height = height + '%';
            });
        }, 100);
    }

    /**
     * Stop visualization
     */
    stopVisualizer(visualizerBars) {
        clearInterval(this.visualizerInterval);
        visualizerBars.forEach(bar => {
            bar.style.height = '20%';
        });
    }

    /**
     * Format time (Second -> MM:SS)
     */
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.stopVisualizer([]);
        if (this.audio) {
            this.audio.pause();
            this.audio.src = '';
        }
    }
}

// Export singleton instance
const audioPlayerInstance = new AudioPlayer();
