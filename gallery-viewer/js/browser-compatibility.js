/**
 * Browser compatibility detection module
 * for detection File System Access API support
 */

/**
 * Detect browser name
 * @returns {string} Browser name
 */
function getBrowserName() {
    const userAgent = navigator.userAgent;
    if (userAgent.indexOf('Firefox') > -1) {
        return 'Firefox';
    } else if (userAgent.indexOf('Edg') > -1) {
        return 'Microsoft Edge';
    } else if (userAgent.indexOf('Chrome') > -1) {
        return 'Chrome';
    } else if (userAgent.indexOf('Safari') > -1) {
        return 'Safari';
    } else if (userAgent.indexOf('Opera') > -1 || userAgent.indexOf('OPR') > -1) {
        return 'Opera';
    }
    return 'Unknown browser';
}

/**
 * Check if supported File System Access API
 * @returns {boolean} Whether to support
 */
function isFileSystemAccessSupported() {
    return typeof window.showDirectoryPicker === 'function';
}

/**
 * Check browser compatibility and display warnings on the interface(if not compatible)
 */
function checkBrowserCompatibility() {
    if (!isFileSystemAccessSupported()) {
        const hint = document.getElementById('hint');
        if (hint) {
            // Add a warning message to the prompt interface
            const warning = document.createElement('div');
            warning.style.cssText = `
                margin-top: 20px;
                padding: 15px 20px;
                background: #fff3cd;
                border: 2px solid #ffc107;
                border-radius: 8px;
                color: #856404;
                max-width: 500px;
                text-align: left;
            `;
            warning.innerHTML = `
                <strong style="display: block; margin-bottom: 8px;">⚠️ Browser incompatibility</strong>
                <p style="margin: 5px 0; font-size: 14px;">The browser you are currently using does not support file system access API。</p>
                <p style="margin: 5px 0; font-size: 14px;">Please use one of the following browsers:</p>
                <ul style="margin: 5px 0; padding-left: 20px; font-size: 14px;">
                    <li>Google Chrome</li>
                    <li>Microsoft Edge</li>
                    <li>Opera</li>
                </ul>
                <p style="margin: 5px 0; font-size: 13px; font-style: italic;">Firefox This feature is not supported yet. </p>
            `;

            const introContent = hint.querySelector('.intro-content');
            if (introContent) {
                introContent.appendChild(warning);
            }
        }
    }
}

/**
 * Show incompatible error dialog box
 */
function showIncompatibilityAlert() {
    const browserName = getBrowserName();
    const message = `Feel sorry,your browser (${browserName}) File system access is not supported API。\n\n` +
        `This app requires full file read and write permissions to work properly.\n\n` +
        `Please use one of the following browsers:\n` +
        `• Google Chrome\n` +
        `• Microsoft Edge\n` +
        `• Opera\n\n` +
        `Firefox This feature is not supported yet.`;

    alert(message);
    console.error('File System Access API Not available');
}
