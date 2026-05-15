
/**
 * Thumbnail strategies — element creation and rendering per media type.
 */

const ThumbnailStrategies = {
    image: {
        types: FileTypes.image.standard,

        createThumbnailElement: () => {
            const canvas = document.createElement('canvas');
            canvas.className = 'thumbnail-canvas';
            return canvas;
        },

        // Draw scaled JPEG thumbnail
        generateThumbnail: async (element, fileData, targetSize) => {
            const img = new Image();
            img.src = fileData.blobUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            const canvas = element;
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            const ratio = Math.max(targetSize / img.width, targetSize / img.height);
            const centerShift_x = (targetSize - img.width * ratio) / 2;
            const centerShift_y = (targetSize - img.height * ratio) / 2;

            ctx.drawImage(img, 0, 0, img.width, img.height,
                centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);

            return new Promise(resolve => {
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
            });
        },

        getCardBadge: () => null
    },

    gif: {
        types: FileTypes.image.gif,

        createThumbnailElement: () => {
            const img = document.createElement('img');
            img.className = 'thumbnail-img';
            return img;
        },

        generateThumbnail: async (element, fileData) => {
            element.src = fileData.blobUrl;
            return null; // GIF: skip blob cache
        },

        getCardBadge: () => null
    },

    svg: {
        types: FileTypes.image.svg,

        createThumbnailElement: () => {
            const object = document.createElement('object');
            object.className = 'thumbnail-svg';
            object.type = 'image/svg+xml';
            return object;
        },

        generateThumbnail: async (element, fileData) => {
            element.data = fileData.blobUrl;

            return new Promise((resolve, reject) => {
                element.onload = () => resolve(null);
                element.onerror = () => reject(new Error('Failed to load SVG'));
            });
        },

        getCardBadge: () => null
    },

    video: {
        types: FileTypes.video.all,

        createThumbnailElement: () => {
            const canvas = document.createElement('canvas');
            canvas.className = 'thumbnail-canvas';
            return canvas;
        },

        // Sample a frame into canvas
        drawVideoFrame: (canvas, video, targetSize) => {
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            const ratio = Math.max(targetSize / video.videoWidth, targetSize / video.videoHeight);
            const centerShift_x = (targetSize - video.videoWidth * ratio) / 2;
            const centerShift_y = (targetSize - video.videoHeight * ratio) / 2;
            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight,
                centerShift_x, centerShift_y, video.videoWidth * ratio, video.videoHeight * ratio);
        },

        // Fallback tile with play glyph
        drawDefaultThumbnail: (canvas, targetSize) => {
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, targetSize, targetSize);
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(1, '#764ba2');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, targetSize, targetSize);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = `${targetSize * 0.4}px "Font Awesome 6 Free"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('▶', targetSize / 2, targetSize / 2);
        },

        generateThumbnail: async (element, fileData, targetSize) => {
            return new Promise((resolve) => {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;
                video.playsInline = true;

                let captured = false;
                let timeoutId = null;

                const cleanup = () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    video.removeEventListener('loadedmetadata', onLoadedMetadata);
                    video.removeEventListener('seeked', onSeeked);
                    video.removeEventListener('error', onError);
                    video.src = '';
                };

                const finishWithDefault = () => {
                    cleanup();
                    ThumbnailStrategies.video.drawDefaultThumbnail(element, targetSize);
                    element.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
                };

                const onLoadedMetadata = () => {
                    video.currentTime = Math.min(5, video.duration / 2);
                };

                const onSeeked = () => {
                    if (captured) return;
                    captured = true;
                    try {
                        ThumbnailStrategies.video.drawVideoFrame(element, video, targetSize);
                        element.toBlob(blob => {
                            cleanup();
                            resolve(blob);
                        }, 'image/jpeg', 0.85);
                    } catch (err) {
                        finishWithDefault();
                    }
                };

                const onError = () => finishWithDefault();

                video.addEventListener('loadedmetadata', onLoadedMetadata);
                video.addEventListener('seeked', onSeeked);
                video.addEventListener('error', onError);

                timeoutId = setTimeout(() => {
                    if (!captured) finishWithDefault();
                }, 10000);

                video.src = fileData.blobUrl;
            });
        },

        getCardBadge: () => ({
            icon: 'fa-play-circle',
            text: 'VIDEO',
            className: 'badge-video'
        })
    },

    audio: {
        types: FileTypes.audio.all,

        createThumbnailElement: () => {
            const canvas = document.createElement('canvas');
            canvas.className = 'thumbnail-canvas';
            return canvas;
        },

        generateThumbnail: async (element, fileData, targetSize) => {
            try {
                const coverBlob = await extractAudioCover(fileData);
                if (coverBlob) {
                    const img = new Image();
                    img.src = URL.createObjectURL(coverBlob);
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                    });

                    const canvas = element;
                    canvas.width = targetSize;
                    canvas.height = targetSize;
                    const ctx = canvas.getContext('2d');
                    const ratio = Math.max(targetSize / img.width, targetSize / img.height);
                    const centerShift_x = (targetSize - img.width * ratio) / 2;
                    const centerShift_y = (targetSize - img.height * ratio) / 2;

                    ctx.drawImage(img, 0, 0, img.width, img.height,
                        centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);

                    URL.revokeObjectURL(img.src);

                    return new Promise(resolve => {
                        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
                    });
                }
            } catch (err) {
                console.log('No embedded cover art:', err.message);
            }

            const canvas = element;
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');

            const gradient = ctx.createLinearGradient(0, 0, targetSize, targetSize);
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(1, '#764ba2');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, targetSize, targetSize);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = `${targetSize * 0.4}px "Font Awesome 6 Free"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🎵', targetSize / 2, targetSize / 2);

            return new Promise(resolve => {
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
            });
        },

        getCardBadge: () => ({
            icon: 'fa-music',
            text: 'AUDIO',
            className: 'badge-audio'
        })
    }
};

/**
 * Read embedded APIC cover from MP3 ID3 header.
 */
async function extractAudioCover(fileData) {
    try {
        const file = await fileData.handle.getFile();
        const maxSize = Math.min(file.size, 5 * 1024 * 1024);
        const arrayBuffer = await file.slice(0, maxSize).arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        if (!(uint8Array[0] === 0x49 && uint8Array[1] === 0x44 && uint8Array[2] === 0x33)) {
            return null;
        }
        const version = uint8Array[3];
        const flags = uint8Array[5];

        const tagSize = ((uint8Array[6] & 0x7f) << 21) |
            ((uint8Array[7] & 0x7f) << 14) |
            ((uint8Array[8] & 0x7f) << 7) |
            (uint8Array[9] & 0x7f);


        let offset = 10;
        const tagEnd = 10 + tagSize;

        while (offset < tagEnd - 10) {
            const frameId = String.fromCharCode(
                uint8Array[offset],
                uint8Array[offset + 1],
                uint8Array[offset + 2],
                uint8Array[offset + 3]
            );

            if (frameId === '\0\0\0\0') break;

            let frameSize;
            if (version === 4) {
                frameSize = ((uint8Array[offset + 4] & 0x7f) << 21) |
                    ((uint8Array[offset + 5] & 0x7f) << 14) |
                    ((uint8Array[offset + 6] & 0x7f) << 7) |
                    (uint8Array[offset + 7] & 0x7f);
            } else {
                frameSize = (uint8Array[offset + 4] << 24) |
                    (uint8Array[offset + 5] << 16) |
                    (uint8Array[offset + 6] << 8) |
                    uint8Array[offset + 7];
            }

            const frameFlags = (uint8Array[offset + 8] << 8) | uint8Array[offset + 9];

            // APIC (attached picture)
            if (frameId === 'APIC') {
                const frameDataOffset = offset + 10;
                let pos = frameDataOffset;

                const textEncoding = uint8Array[pos];
                pos++;

                let mimeType = '';
                while (pos < frameDataOffset + frameSize && uint8Array[pos] !== 0) {
                    mimeType += String.fromCharCode(uint8Array[pos]);
                    pos++;
                }
                pos++;

                const pictureType = uint8Array[pos];
                pos++;

                while (pos < frameDataOffset + frameSize && uint8Array[pos] !== 0) {
                    pos++;
                }
                pos++;

                const imageDataStart = pos;
                const imageDataEnd = frameDataOffset + frameSize;
                const imageData = uint8Array.slice(imageDataStart, imageDataEnd);

                const blob = new Blob([imageData], { type: mimeType || 'image/jpeg' });
                return blob;
            }

            offset += 10 + frameSize;
        }


        return null;
    } catch (err) {
        return null;
    }
}

/**
 * Resolve strategy from file extension.
 */
function getThumbnailStrategy(fileType) {
    for (const [strategyName, strategy] of Object.entries(ThumbnailStrategies)) {
        if (strategy.types.includes(fileType)) {
            return { name: strategyName, ...strategy };
        }
    }
    return { name: 'image', ...ThumbnailStrategies.image };
}
