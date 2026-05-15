
const EXIF_MAP = {
    'Make': 'Camera make', 'Model': 'Model', 'LensModel': 'Lens', 'Software': 'Software',
    'ExposureTime': 'Exposure time', 'FNumber': 'Aperture (f-number)', 'ISOSpeedRatings': 'ISO',
    'FocalLength': 'Focal length', 'FocalLengthIn35mmFilm': '35mm equivalent focal length',
    'ExposureBias': 'Exposure compensation', 'MeteringMode': 'Metering mode', 'Flash': 'Flash',
    'WhiteBalance': 'White balance', 'DateTimeOriginal': 'Date taken',
    'PixelXDimension': 'Width', 'PixelYDimension': 'Height',
    'ResolutionUnit': 'Resolution unit', 'Orientation': 'Orientation', 'ColorSpace': 'Color space',
    'GPSLatitude': 'Latitude', 'GPSLongitude': 'Longitude', 'GPSAltitude': 'Altitude'
};

const EXIF_GROUPS = {
    'GPS location': ['GPSLatitude', 'GPSLongitude', 'GPSAltitude'],
    'Device': ['Make', 'Model', 'LensModel', 'Software'],
    'Capture settings': ['DateTimeOriginal', 'ExposureTime', 'FNumber', 'ISOSpeedRatings', 'FocalLength', 'FocalLengthIn35mmFilm', 'ExposureBias', 'MeteringMode', 'Flash', 'WhiteBalance'],
    'Image': ['PixelXDimension', 'PixelYDimension', 'ColorSpace', 'Orientation'],
};

function showImageProperties() {
    const menu = UI.contextMenu;

    const fileData = menu.fileData;
    if (!fileData) {
        console.warn("No file data available");
        return;
    }

    UI.contextMenu.classList.remove('show');
    const modal = document.getElementById('propertiesModal');
    if (!modal) return;

    const bodyContent = document.getElementById('propsBodyContent');
    bodyContent.innerHTML = '<div class="loader">Reading file metadata...</div>';

    modal.classList.remove('hidden');

    const fileExt = fileData.name.split('.').pop().toLowerCase();
    const strategy = getMetadataStrategy(fileExt);

    (async () => {
        let metadata = null;

        try {
            metadata = await strategy.getMetadata(fileData);
        } catch (e) {
            console.error("Failed to read metadata", e);
        }

        renderProperties(fileData, metadata, fileExt);
    })();
}

function renderProperties(fileData, metadata, fileExt) {
    const container = document.getElementById('propsBodyContent');
    container.innerHTML = '';

    const dim = metadata?.dimensions || {};
    const exifTags = metadata?.exif;

    // 1. Basic info (always)
    const basicSection = document.createElement('div');
    basicSection.className = 'props-section';

    let dimensionText = '';
    if (dim.width && dim.height) {
        dimensionText = `${dim.width} x ${dim.height}`;
    } else if (dim.width === 0) {
        dimensionText = 'Unknown';
    }

    let durationRow = '';
    if (dim.duration !== undefined) {
        durationRow = `<tr><td><i class="fas fa-play-circle"></i> Duration</td><td>${formatDuration(dim.duration)}</td></tr>`;
    }

    basicSection.innerHTML = `
        <h4>Basic info</h4>
        <table class="props-table">
            <tr>
                <td><i class="fas fa-file"></i> File name</td>
                <td class="editable-filename" style="cursor: pointer; color: #3498db;" title="Click to edit">${fileData.name}</td>
            </tr>
            <tr><td><i class="fas fa-folder-open"></i> Path</td><td class="file-path-display" style="word-break: break-all;">${fileData.path}</td></tr>
            ${dimensionText ? `<tr><td><i class="fas fa-expand"></i> Dimensions</td><td>${dimensionText}</td></tr>` : ''}
            ${durationRow}
            <tr><td><i class="fas fa-database"></i> Size</td><td>${formatBytes(fileData.size)}</td></tr>
            <tr><td><i class="fas fa-clock"></i> Modified</td><td>${new Date(fileData.lastModified).toLocaleString()}</td></tr>
        </table>
    `;
    container.appendChild(basicSection);

    // Filename inline edit
    const filenameCell = basicSection.querySelector('.editable-filename');
    filenameCell.addEventListener('click', () => {
        enablePropertiesRename(filenameCell, fileData);
    });

    // 2. Video/audio technical details
    if (dim.estimatedBitrate || dim.videoTrack || dim.audioTrack) {
        const techSection = document.createElement('div');
        techSection.className = 'props-section';
        let techRows = '';

        if (dim.estimatedBitrate) {
            techRows += `<tr><td><i class="fas fa-tachometer-alt"></i> Estimated bitrate</td><td>${dim.estimatedBitrate} kbps</td></tr>`;
        }

        if (dim.videoTrack) {
            if (dim.videoTrack.label) {
                techRows += `<tr><td><i class="fas fa-video"></i> Video track</td><td>${dim.videoTrack.label}</td></tr>`;
            }
        }

        if (dim.audioTrack) {
            if (dim.audioTrack.label) {
                techRows += `<tr><td><i class="fas fa-volume-up"></i> Audio track</td><td>${dim.audioTrack.label}</td></tr>`;
            }
        }

        if (techRows) {
            techSection.innerHTML = `
                <h4>Technical details</h4>
                <table class="props-table">
                    ${techRows}
                </table>
            `;
            container.appendChild(techSection);
        }
    }

    // 2.5 ID3 / audio tags
    if (metadata?.id3) {
        const id3Section = document.createElement('div');
        id3Section.className = 'props-section';

        const id3Tags = metadata.id3;
        let id3Rows = '';

        // Show common ID3 fields first
        const id3Fields = [
            { key: 'title', label: 'Title', icon: 'fa-music' },
            { key: 'artist', label: 'Artist', icon: 'fa-user' },
            { key: 'album', label: 'Album', icon: 'fa-compact-disc' },
            { key: 'albumArtist', label: 'Album artist', icon: 'fa-users' },
            { key: 'year', label: 'Year', icon: 'fa-calendar' },
            { key: 'genre', label: 'Genre', icon: 'fa-guitar' },
            { key: 'track', label: 'Track', icon: 'fa-list-ol' },
            { key: 'disc', label: 'Disc', icon: 'fa-record-vinyl' },
            { key: 'composer', label: 'Composer', icon: 'fa-pen-fancy' },
            { key: 'comment', label: 'Comment', icon: 'fa-comment' }
        ];

        id3Fields.forEach(field => {
            if (id3Tags[field.key]) {
                id3Rows += `<tr><td><i class="fas ${field.icon}"></i> ${field.label}</td><td>${id3Tags[field.key]}</td></tr>`;
            }
        });

        if (id3Rows) {
            id3Section.innerHTML = `
                <h4><i class="fas fa-tags"></i> Audio tags</h4>
                <table class="props-table">
                    ${id3Rows}
                </table>
            `;
            container.appendChild(id3Section);
        }
    }

    // Compute GPS (photos)
    let gpsHTML = null;
    let latDec = NaN, lonDec = NaN;
    if (exifTags && exifTags.GPSLatitude && exifTags.GPSLongitude) {
        const lat = exifTags.GPSLatitude;
        const lon = exifTags.GPSLongitude;
        const latRef = exifTags.GPSLatitudeRef || "N";
        const lonRef = exifTags.GPSLongitudeRef || "E";
        latDec = convertDMSToDD(lat, latRef);
        lonDec = convertDMSToDD(lon, lonRef);

        if (!isNaN(latDec) && !isNaN(lonDec)) {
            // China map providers expect GCJ-02 / BD-09
            const [gcjLon, gcjLat] = wgs84ToGcj02(lonDec, latDec);
            const [bdLon, bdLat] = gcj02ToBd09(gcjLon, gcjLat);

            gpsHTML = `
                <div class="map-actions">
                    <div class="map-buttons">
                        <a href="https://www.google.com/maps?q=${latDec},${lonDec}" target="_blank" class="map-btn google" title="Google Maps (WGS84)">
                            <i class="fab fa-google"></i> Google
                        </a>
                        <a href="https://uri.amap.com/marker?position=${gcjLon},${gcjLat}&name=Location" target="_blank" class="map-btn gaode" title="Amap (GCJ-02)">
                            <i class="fas fa-map-marked-alt"></i> Amap
                        </a>
                        <a href="http://api.map.baidu.com/marker?location=${bdLat},${bdLon}&output=html" target="_blank" class="map-btn baidu" title="Baidu Maps (BD-09)">
                            <i class="fas fa-paw"></i> Baidu
                        </a>
                    </div>
                    <span class="gps-coords-text">WGS84: ${latDec.toFixed(6)}, ${lonDec.toFixed(6)}</span>
                </div>
            `;
        }
    }

    // 2. Map links when GPS is present
    if (gpsHTML) {
        const mapSection = document.createElement('div');
        mapSection.className = 'props-section';
        mapSection.innerHTML = `<h4>Location</h4>${gpsHTML}`;
        container.appendChild(mapSection);
    }

    // 3. EXIF (photos, when present)
    if (exifTags && Object.keys(exifTags).length > 0) {
        const exifSection = document.createElement('div');
        exifSection.className = 'props-section';
        exifSection.innerHTML = `<h4>EXIF</h4>`;

        const gridContainer = document.createElement('div');
        gridContainer.id = 'propExifContent';

        // Grouped keys
        const groupsFragment = document.createDocumentFragment();
        const usedKeys = new Set();
        const ignoreKeys = ['MakerNote', 'UserComment', 'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSVersionID', 'thumbnail', 'ExifIFDPointer', 'GPSInfoIFDPointer', 'InteroperabilityIFDPointer', 'undefined'];

        // Preset groups from EXIF_GROUPS
        for (const [groupName, keys] of Object.entries(EXIF_GROUPS)) {
            let groupItems = [];
            keys.forEach(key => {
                if (exifTags[key] !== undefined) {
                    usedKeys.add(key);
                    let val = exifTags[key];

                    // Format values
                    if (key === 'ExposureTime' && val < 1 && val > 0) val = `1/${Math.round(1 / val)}`;
                    if (key === 'FocalLength' || key === 'FocalLengthIn35mmFilm') val += ' mm';

                    // GPS display
                    if (key === 'GPSLatitude') val = FormatDMS(val) + (exifTags.GPSLatitudeRef ? ' ' + exifTags.GPSLatitudeRef : '');
                    if (key === 'GPSLongitude') val = FormatDMS(val) + (exifTags.GPSLongitudeRef ? ' ' + exifTags.GPSLongitudeRef : '');
                    if (key === 'GPSAltitude') val = val + ' m';

                    groupItems.push({ k: EXIF_MAP[key] || key, v: val });
                }
            });

            if (groupItems.length > 0) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'exif-group';
                groupDiv.innerHTML = `<h5 class="exif-group-title">${groupName}</h5>`;
                const subGrid = document.createElement('div');
                subGrid.className = 'exif-sub-grid';
                groupItems.forEach(item => {
                    subGrid.innerHTML += `
                        <div class="exif-item">
                            <span class="exif-label">${item.k}</span>
                            <div class="exif-value">${item.v}</div>
                        </div>`;
                });
                groupDiv.appendChild(subGrid);
                groupsFragment.appendChild(groupDiv);
            }
        }

        // Remaining EXIF keys
        const otherItems = [];
        for (let key in exifTags) {
            if (usedKeys.has(key) || ignoreKeys.includes(key)) continue;
            const val = exifTags[key];
            if (typeof val === 'object' || typeof val === 'function') continue;
            otherItems.push({ k: EXIF_MAP[key] || key, v: val });
        }

        if (otherItems.length > 0) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'exif-group';
            groupDiv.innerHTML = `<h5 class="exif-group-title">Other tags</h5>`;
            const subGrid = document.createElement('div');
            subGrid.className = 'exif-sub-grid';
            otherItems.forEach(item => {
                subGrid.innerHTML += `
                     <div class="exif-item">
                         <span class="exif-label">${item.k}</span>
                         <div class="exif-value">${item.v}</div>
                     </div>`;
            });
            groupDiv.appendChild(subGrid);
            groupsFragment.appendChild(groupDiv);
        }

        if (groupsFragment.childElementCount > 0) {
            gridContainer.appendChild(groupsFragment);
            exifSection.appendChild(gridContainer);
            container.appendChild(exifSection);
        }
    }
}

function FormatDMS(dms) {
    if (!dms) return '';
    return `${dms[0]}° ${dms[1]}' ${dms[2]}"`
}

function convertDMSToDD(dms, ref) {
    let dd = dms[0] + dms[1] / 60 + dms[2] / 3600;
    if (ref === "S" || ref === "W") dd = dd * -1;
    return dd;
}

// ----------------------------------------------------
// Coordinate conversion (GCJ-02 / BD-09 for regional map links)
// ----------------------------------------------------
function wgs84ToGcj02(lon, lat) {
    if (outOfChina(lon, lat)) return [lon, lat];
    let dLat = transformLat(lon - 105.0, lat - 35.0);
    let dLon = transformLon(lon - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - 0.00669342162296594323 * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((6378245.0 * (1 - 0.00669342162296594323)) / (magic * sqrtMagic) * Math.PI);
    dLon = (dLon * 180.0) / (6378245.0 / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lon + dLon, lat + dLat];
}

function gcj02ToBd09(lon, lat) {
    const x_pi = 3.14159265358979324 * 3000.0 / 180.0;
    const z = Math.sqrt(lon * lon + lat * lat) + 0.00002 * Math.sin(lat * x_pi);
    const theta = Math.atan2(lat, lon) + 0.000003 * Math.cos(lon * x_pi);
    const bdLon = z * Math.cos(theta) + 0.0065;
    const bdLat = z * Math.sin(theta) + 0.006;
    return [bdLon, bdLat];
}

function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLon(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}

function outOfChina(lon, lat) {
    return !(lon > 73.66 && lon < 135.05 && lat > 3.86 && lat < 53.55);
}

function enablePropertiesRename(cell, fileData) {
    const oldName = fileData.name;
    const originalText = cell.textContent;

    const input = document.createElement('textarea');
    input.value = oldName;
    input.className = 'renaming-input';
    input.rows = 1;
    input.style.width = '100%';
    input.style.minWidth = '200px';

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();

    // Select basename for rename (no extension)
    const dotIndex = oldName.lastIndexOf('.');
    if (dotIndex > 0) {
        input.setSelectionRange(0, dotIndex);
    } else {
        input.select();
    }

    // Grow textarea with content
    const autoResize = () => {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
    };
    input.addEventListener('input', autoResize);
    autoResize();

    const commit = async () => {
        const newName = input.value.trim().replace(/\n/g, '');
        if (!newName || newName === oldName) {
            cleanup();
            return;
        }
        if (/[<>:"/\\|?*]/.test(newName)) {
            showToast("File name contains invalid characters", "error");
            input.focus();
            return;
        }
        try {
            await renameFileWithHistory(fileData, newName);

            if (fileData.dom) {
                const cardNameEl = fileData.dom.querySelector('.file-name');
                if (cardNameEl) cardNameEl.textContent = newName;
            }

            cell.textContent = newName;

            const pathCell = document.querySelector('.file-path-display');
            if (pathCell) {
                pathCell.textContent = fileData.path;
            }

            showToast("Renamed (Ctrl+Z to undo)");
        } catch (e) {
            showToast("Rename failed: " + e.message, "error");
            cell.textContent = originalText;
        }
    };

    const cleanup = () => {
        cell.textContent = fileData.name;
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cleanup();
        }
        e.stopPropagation();
    });
    input.addEventListener('blur', commit);
}
