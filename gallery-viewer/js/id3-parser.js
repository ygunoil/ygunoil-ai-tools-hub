/**
 * ID3 tag parser for MP3 metadata (title, artist, album, etc.).
 */

/**
 * Read ID3v2 tags from an MP3 file.
 * @param {SmartFile} fileData
 * @returns {Promise<Object|null>} Parsed tag fields or null
 */
async function extractID3Tags(fileData) {
    try {
        const file = await fileData.handle.getFile();
        const maxSize = Math.min(file.size, 5 * 1024 * 1024);
        const arrayBuffer = await file.slice(0, maxSize).arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        if (!(uint8Array[0] === 0x49 && uint8Array[1] === 0x44 && uint8Array[2] === 0x33)) {
            console.log('No ID3v2 header found');
            return null;
        }

        const version = uint8Array[3];
        const revision = uint8Array[4];
        const flags = uint8Array[5];

        console.log(`ID3v2.${version}.${revision} tag`);

        const tagSize = ((uint8Array[6] & 0x7f) << 21) |
            ((uint8Array[7] & 0x7f) << 14) |
            ((uint8Array[8] & 0x7f) << 7) |
            (uint8Array[9] & 0x7f);

        const tags = {};
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
            const frameDataOffset = offset + 10;

            const textFrames = {
                'TIT2': 'title',
                'TPE1': 'artist',
                'TALB': 'album',
                'TYER': 'year',
                'TCON': 'genre',
                'TPE2': 'albumArtist',
                'TCOM': 'composer',
                'TRCK': 'track',
                'TPOS': 'disc',
                'COMM': 'comment'
            };

            if (textFrames[frameId]) {
                const text = decodeTextFrame(uint8Array, frameDataOffset, frameSize);
                if (text) {
                    tags[textFrames[frameId]] = text;
                }
            }

            offset += 10 + frameSize;
        }

        return tags;
    } catch (err) {
        console.error('Failed to parse ID3 tags:', err);
        return null;
    }
}

/**
 * Decode a text frame payload.
 */
function decodeTextFrame(data, offset, size) {
    if (size <= 1) return '';

    const encoding = data[offset];
    let text = '';
    let pos = offset + 1;
    const end = offset + size;

    try {
        switch (encoding) {
            case 0:
                for (let i = pos; i < end && data[i] !== 0; i++) {
                    text += String.fromCharCode(data[i]);
                }
                break;

            case 1:
                if (pos + 1 < end) {
                    const bom = (data[pos] << 8) | data[pos + 1];
                    const littleEndian = bom === 0xFFFE;
                    pos += 2;

                    const chars = [];
                    for (let i = pos; i < end - 1; i += 2) {
                        if (data[i] === 0 && data[i + 1] === 0) break;
                        const charCode = littleEndian
                            ? (data[i + 1] << 8) | data[i]
                            : (data[i] << 8) | data[i + 1];
                        chars.push(charCode);
                    }
                    text = String.fromCharCode(...chars);
                }
                break;

            case 2:
                for (let i = pos; i < end - 1; i += 2) {
                    if (data[i] === 0 && data[i + 1] === 0) break;
                    const charCode = (data[i] << 8) | data[i + 1];
                    text += String.fromCharCode(charCode);
                }
                break;

            case 3: {
                const bytes = [];
                for (let i = pos; i < end && data[i] !== 0; i++) {
                    bytes.push(data[i]);
                }
                text = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
                break;
            }

            default:
                console.warn('Unknown text encoding byte:', encoding);
        }
    } catch (err) {
        console.error('Text frame decode failed:', err);
    }

    return text.trim();
}

/**
 * Optional display map (unused by current UI; kept for debugging/tools).
 */
function formatID3Tags(tags) {
    if (!tags) return null;

    const formatted = {};

    if (tags.title) formatted['Title'] = tags.title;
    if (tags.artist) formatted['Artist'] = tags.artist;
    if (tags.album) formatted['Album'] = tags.album;
    if (tags.albumArtist) formatted['Album artist'] = tags.albumArtist;
    if (tags.year) formatted['Year'] = tags.year;
    if (tags.genre) formatted['Genre'] = tags.genre;
    if (tags.track) formatted['Track'] = tags.track;
    if (tags.disc) formatted['Disc'] = tags.disc;
    if (tags.composer) formatted['Composer'] = tags.composer;
    if (tags.comment) formatted['Comment'] = tags.comment;

    return Object.keys(formatted).length > 0 ? formatted : null;
}
