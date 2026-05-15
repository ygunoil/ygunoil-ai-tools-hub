/**
 * File type configuration
 * Single place for supported media extensions
 */

const FileTypes = {
    // Images
    image: {
        // Raster / common still image formats
        standard: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'jfif'],
        // Animated GIF
        gif: ['gif'],
        // SVG vector
        svg: ['svg'],
        /** All image extensions */
        get all() {
            return [...this.standard, ...this.gif, ...this.svg];
        }
    },

    // Video
    video: {
        // Widely supported in browsers
        common: ['mp4', 'webm', 'ogg', 'mov'],
        // Additional / legacy containers
        extended: ['mkv', 'flv', 'avi'],
        get all() {
            return [...this.common, ...this.extended];
        }
    },

    // Audio
    audio: {
        common: ['mp3', 'wav', 'ogg', 'flac', 'm4a'],
        get all() {
            return [...this.common];
        }
    },

    /** Union of all media extensions we handle */
    get allMedia() {
        return [...this.image.all, ...this.video.all, ...this.audio.all];
    },

    /**
     * Map an extension to a coarse media kind
     * @param {string} extension - Lowercase extension (no dot)
     * @returns {string} 'image' | 'video' | 'audio' | 'unknown'
     */
    getType(extension) {
        if (this.image.all.includes(extension)) return 'image';
        if (this.video.all.includes(extension)) return 'video';
        if (this.audio.all.includes(extension)) return 'audio';
        return 'unknown';
    },

    /**
     * Finer-grained category inside image/video/audio groupings
     * @param {string} extension - Lowercase extension (no dot)
     * @returns {string} 'standard' | 'gif' | 'svg' | 'common' | 'extended' | 'unknown'
     */
    getDetailedType(extension) {
        if (this.image.standard.includes(extension)) return 'standard';
        if (this.image.gif.includes(extension)) return 'gif';
        if (this.image.svg.includes(extension)) return 'svg';
        if (this.video.common.includes(extension)) return 'common';
        if (this.video.extended.includes(extension)) return 'extended';
        if (this.audio.common.includes(extension)) return 'common';
        return 'unknown';
    },

    /**
     * @param {string} extension - Lowercase extension (no dot)
     * @returns {boolean}
     */
    isSupported(extension) {
        return this.allMedia.includes(extension);
    }
};
