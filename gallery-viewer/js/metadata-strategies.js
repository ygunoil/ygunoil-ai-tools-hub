
/**
 * Metadata extraction strategies
 * Per-media-type helpers to read dimensions, duration, tags, etc.
 */

const MetadataStrategies = {
    // Still / animated images (not SVG-only branch)
    image: {
        types: [...FileTypes.image.standard, ...FileTypes.image.gif],

        async getDimensions(fileData) {
            return new Promise(resolve => {
                const img = new Image();
                img.src = fileData.blobUrl;
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => resolve({ width: 0, height: 0 });
            });
        },

        async getMetadata(fileData) {
            const metadata = {};

            const dim = await this.getDimensions(fileData);
            metadata.dimensions = dim;

            try {
                let fileObj = fileData.handle ? await fileData.handle.getFile() : fileData.file;
                if (window.extractExif) {
                    metadata.exif = await window.extractExif(fileObj);
                }
            } catch (e) {
                console.error("Failed to read EXIF", e);
            }

            return metadata;
        }
    },

    video: {
        types: FileTypes.video.all,

        async getDimensions(fileData) {
            return new Promise(resolve => {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;

                const cleanup = () => {
                    video.removeAttribute('src');
                    video.load(); // reset element
                };

                video.addEventListener('loadedmetadata', () => {
                    const metadata = {
                        width: video.videoWidth,
                        height: video.videoHeight,
                        duration: video.duration
                    };

                    // Rough bitrate: size / duration
                    if (fileData.size && video.duration) {
                        metadata.estimatedBitrate = Math.round((fileData.size * 8) / video.duration / 1000); // kbps
                    }

                    resolve(metadata);
                    cleanup();
                }, { once: true });

                video.addEventListener('error', () => {
                    resolve({ width: 0, height: 0, duration: 0 });
                    cleanup();
                }, { once: true });

                video.src = fileData.blobUrl;
            });
        },

        async getMetadata(fileData) {
            const metadata = {};
            const dim = await this.getDimensions(fileData);
            metadata.dimensions = dim;
            return metadata;
        }
    },

    audio: {
        types: FileTypes.audio.all,

        async getDimensions(fileData) {
            return new Promise(resolve => {
                const audio = new Audio();
                audio.preload = 'metadata';

                const cleanup = () => {
                    audio.removeAttribute('src');
                    audio.load(); // reset element
                };

                audio.addEventListener('loadedmetadata', () => {
                    resolve({ duration: audio.duration });
                    cleanup();
                }, { once: true });

                audio.addEventListener('error', () => {
                    resolve({ duration: 0 });
                    cleanup();
                }, { once: true });

                audio.src = fileData.blobUrl;
            });
        },

        async getMetadata(fileData) {
            const metadata = {};

            const dim = await this.getDimensions(fileData);
            metadata.dimensions = dim;

            if (fileData.type === 'mp3') {
                try {
                    const id3Tags = await extractID3Tags(fileData);
                    if (id3Tags) {
                        metadata.id3 = id3Tags;
                        console.log('ID3 tags:', id3Tags);
                    }
                } catch (err) {
                    console.error('Failed to read ID3 tags:', err);
                }
            }

            return metadata;
        }
    },

    svg: {
        types: FileTypes.image.svg,

        async getDimensions(fileData) {
            return new Promise(resolve => {
                const img = new Image();
                img.src = fileData.blobUrl;
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => resolve({ width: 0, height: 0 });
            });
        },

        async getMetadata(fileData) {
            const metadata = {};
            const dim = await this.getDimensions(fileData);
            metadata.dimensions = dim;
            return metadata;
        }
    }
};

/**
 * Pick a strategy object for a file extension / type string
 */
function getMetadataStrategy(fileType) {
    for (const [strategyName, strategy] of Object.entries(MetadataStrategies)) {
        if (strategy.types.includes(fileType)) {
            return strategy;
        }
    }
    return MetadataStrategies.image;
}

/**
 * Format duration in seconds for display
 */
function formatDuration(seconds) {
    if (!seconds || seconds === 0) return 'Unknown';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } else {
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}
