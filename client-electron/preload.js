/**
 * LANLock Electron Client - Preload Script
 * Exposes safe APIs to renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('lanlock', {
    // Get configuration
    getConfig: () => ipcRenderer.invoke('get-config'),

    // Check if window is focused
    isFocused: () => ipcRenderer.invoke('is-focused'),

    // Listen for focus changes
    onFocusChange: (callback) => {
        ipcRenderer.on('focus-changed', (event, focused) => callback(focused));
    },

    // Register student with server
    registerStudent: (studentId, studentName) => {
        ipcRenderer.send('register-student', { student_id: studentId, student_name: studentName });
    },

    // Request exit - shows exit code dialog (SEB-style)
    requestExit: () => {
        ipcRenderer.send('show-exit-dialog-request');
    },

    // Listen for exit dialog request (from keyboard shortcut)
    onShowExitDialog: (callback) => {
        ipcRenderer.on('show-exit-dialog', () => callback());
    },

    // Listen for exit granted
    onExitGranted: (callback) => {
        ipcRenderer.on('exit-granted', () => callback());
    },

    // Listen for exit denied
    onExitDenied: (callback) => {
        ipcRenderer.on('exit-denied', () => callback());
    },

    // Listen for exit error
    onExitError: (callback) => {
        ipcRenderer.on('exit-error', (event, message) => callback(message));
    },

    // Force quit
    forceQuit: () => ipcRenderer.send('force-quit'),

    // Save config (from setup page)
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
});

// Inject UI components when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    // Block dangerous key combinations
    document.addEventListener('keydown', (e) => {
        if (
            (e.altKey && e.key === 'F4') ||
            (e.altKey && e.key === 'Tab') ||
            (e.ctrlKey && e.key === 'w') ||
            (e.ctrlKey && e.key === 'q') ||
            e.key === 'F11' ||
            e.key === 'F12'
        ) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Disable right-click
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Create exit request dialog
    createExitDialog();
});

function createExitDialog() {
    const dialogHTML = `
        <div id="exitDialog" style="
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.9);
            z-index: 99999;
            align-items: center;
            justify-content: center;
        ">
            <div id="exitDialogContent" style="
                background: #1a1a2e;
                padding: 30px;
                border-radius: 16px;
                text-align: center;
                color: white;
                font-family: system-ui, sans-serif;
                border: 1px solid rgba(255,255,255,0.1);
                max-width: 400px;
            ">
                <!-- Exit Code Form -->
                <div id="exitCodeForm">
                    <div style="font-size: 3rem; margin-bottom: 15px;">🔐</div>
                    <h2 style="margin: 0 0 10px; font-size: 1.3rem;">Exit Code Required</h2>
                    <p style="color: #a0a0b0; margin-bottom: 20px; font-size: 0.9rem;">
                        Enter the exit code provided by your instructor to close the application
                    </p>
                    <input type="password" id="exitCodeInput" placeholder="Enter exit code" style="
                        width: 100%;
                        padding: 14px;
                        border: 1px solid rgba(255,255,255,0.2);
                        border-radius: 8px;
                        background: rgba(255,255,255,0.05);
                        color: white;
                        font-size: 1.2rem;
                        text-align: center;
                        margin-bottom: 10px;
                        box-sizing: border-box;
                        letter-spacing: 4px;
                    ">
                    <div id="exitCodeError" style="
                        color: #ff6b6b;
                        font-size: 0.85rem;
                        margin-bottom: 15px;
                        display: none;
                    ">Invalid exit code. Please try again.</div>
                    <div style="display: flex; gap: 10px;">
                        <button id="exitCancel" style="
                            flex: 1; padding: 12px; border: 1px solid rgba(255,255,255,0.2);
                            border-radius: 8px; background: transparent; color: white;
                            cursor: pointer; font-size: 0.9rem;
                        ">Cancel</button>
                        <button id="exitSubmit" style="
                            flex: 1; padding: 12px; border: none; border-radius: 8px;
                            background: linear-gradient(135deg, #667eea, #764ba2);
                            color: white; cursor: pointer; font-size: 0.9rem;
                        ">Submit</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    const dialog = document.getElementById('exitDialog');
    const codeInput = document.getElementById('exitCodeInput');
    const errorMsg = document.getElementById('exitCodeError');

    function showDialog() {
        dialog.style.display = 'flex';
        codeInput.value = '';
        errorMsg.style.display = 'none';
        codeInput.focus();
    }

    function hideDialog() {
        dialog.style.display = 'none';
        codeInput.value = '';
        errorMsg.style.display = 'none';
    }

    function showError() {
        errorMsg.style.display = 'block';
        codeInput.value = '';
        codeInput.focus();
    }

    // Expose show dialog function
    window.lanlockShowExitDialog = showDialog;

    // Show exit dialog from keyboard shortcut or button
    ipcRenderer.on('show-exit-dialog', showDialog);

    // Cancel button
    document.getElementById('exitCancel').addEventListener('click', hideDialog);

    // Submit button
    document.getElementById('exitSubmit').addEventListener('click', () => {
        const code = codeInput.value.trim();
        if (code) {
            ipcRenderer.send('verify-exit-code', code);
        }
    });

    // Enter key to submit
    codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const code = codeInput.value.trim();
            if (code) {
                ipcRenderer.send('verify-exit-code', code);
            }
        }
        if (e.key === 'Escape') {
            hideDialog();
        }
    });

    // Invalid code response
    ipcRenderer.on('exit-code-invalid', () => {
        showError();
    });
}
