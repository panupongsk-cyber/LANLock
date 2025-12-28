/**
 * LANLock Electron Client - Main Process
 * Cross-platform kiosk mode exam client
 */

const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { io } = require('socket.io-client');
const { exec } = require('child_process');
const { dialog } = require('electron');

let mainWindow = null;
let config = null;
let socket = null;
let studentId = null;
let dockWasDisabled = false;
let examIsActive = false;
let currentExitCode = '1234';

// Disable Ubuntu dock for kiosk mode
function disableDock() {
    if (process.platform !== 'linux') return;

    console.log('[Kiosk] Disabling dock...');

    // Try to disable Ubuntu dock
    exec('gnome-extensions disable ubuntu-dock@ubuntu.com 2>/dev/null || true', (err) => {
        if (!err) {
            dockWasDisabled = true;
            console.log('[Kiosk] Dock disabled');
        }
    });

    // Also try dash-to-dock settings
    exec('gsettings set org.gnome.shell.extensions.dash-to-dock autohide true 2>/dev/null || true');
    exec('gsettings set org.gnome.shell.extensions.dash-to-dock dock-fixed false 2>/dev/null || true');

    // Disable screen lock and screensaver
    exec('gsettings set org.gnome.desktop.screensaver lock-enabled false 2>/dev/null || true');
    exec('gsettings set org.gnome.desktop.session idle-delay 0 2>/dev/null || true');
}

// Re-enable Ubuntu dock when exiting
function enableDock() {
    if (process.platform !== 'linux' || !dockWasDisabled) return;

    console.log('[Kiosk] Re-enabling dock...');

    exec('gnome-extensions enable ubuntu-dock@ubuntu.com 2>/dev/null || true', () => {
        console.log('[Kiosk] Dock re-enabled');
    });
}

// Load configuration
function loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    try {
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } else {
            config = {
                server_ip: '127.0.0.1',
                server_port: 2222,
                student_id: '',
                student_name: ''
            };
        }
    } catch (err) {
        console.error('Failed to load config:', err);
        config = { server_ip: '127.0.0.1', server_port: 2222 };
    }
    return config;
}

// Initialize Socket.io connection
function initSocket() {
    const serverUrl = `http://${config.server_ip}:${config.server_port}`;

    socket = io(serverUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
        console.log('Socket connected to server');

        // Register with server to join student room (required to receive exit:granted)
        if (studentId) {
            socket.emit('student:connect', {
                student_id: studentId,
                name: config.student_name || studentId
            });
        }

        // Check for multiple monitors after short delay (ensure connection stable)
        setTimeout(() => {
            checkMultipleMonitors();
        }, 500);
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
    });

    // Listen for exam state changes to track if exam is active
    socket.on('exam:state', (state) => {
        console.log('[Socket] Exam state update:', state.state);
        examIsActive = (state.state === 'active');
        if (state.exit_code) {
            currentExitCode = state.exit_code;
        }
    });

    // Handle exit approval from server
    socket.on('exit:granted', (data) => {
        console.log('Exit granted by instructor');
        if (mainWindow) {
            mainWindow.webContents.send('exit-granted');
        }
        // Small delay to show message, then quit
        setTimeout(() => {
            app.isQuiting = true;
            enableDock();
            app.quit();
        }, 1500);
    });

    // Handle exit denied from server
    socket.on('exit:denied', (data) => {
        console.log('Exit denied by instructor');
        if (mainWindow) {
            mainWindow.webContents.send('exit-denied');
        }
    });
}

// Check for multiple monitors and report to server
function checkMultipleMonitors() {
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    const displayCount = displays.length;

    if (displayCount > 1) {
        console.log(`[Warning] Multiple displays detected: ${displayCount}`);

        const displayInfo = displays.map(d => ({
            id: d.id,
            width: d.bounds.width,
            height: d.bounds.height,
            isPrimary: d.bounds.x === 0 && d.bounds.y === 0
        }));

        // Get machine name as temporary ID until student logs in
        const os = require('os');
        const hostname = os.hostname();

        if (socket && socket.connected) {
            socket.emit('violation:multi_monitor', {
                student_id: studentId || `unknown_${hostname}`,
                display_count: displayCount,
                displays: displayInfo
            });
        }
    } else {
        console.log('[Info] Single display detected');
    }
}

// Create the main window
function createWindow() {
    loadConfig();

    // Check if this is a restart after setup (indicated by --configured arg)
    const isConfigured = process.argv.includes('--configured');

    // If not configured (fresh start), always require setup/registration
    // If configured (after restart), use the saved config
    let needsSetup = false;
    if (!isConfigured) {
        // Fresh start - require new registration
        console.log('[Setup] Fresh start - requiring registration');
        needsSetup = true;
    } else if (!config.student_id) {
        // Restart but no student_id - still need setup
        console.log('[Setup] No student_id - requiring registration');
        needsSetup = true;
    } else {
        console.log('[Setup] Configured with student:', config.student_id);
        needsSetup = false;
    }

    // Get primary display for multi-monitor support
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.bounds;

    mainWindow = new BrowserWindow({
        // Position on primary display
        x: x,
        y: y,
        width: needsSetup ? 500 : width,
        height: needsSetup ? 600 : height,

        // Kiosk mode only if not in setup
        fullscreen: !needsSetup,
        simpleFullscreen: !needsSetup, // For macOS/Linux - covers dock
        kiosk: !needsSetup,
        alwaysOnTop: !needsSetup,
        autoHideMenuBar: true,

        // Window frame only for setup
        frame: needsSetup,
        titleBarStyle: needsSetup ? 'default' : 'hidden',

        // Allow resize only in setup
        resizable: needsSetup,
        minimizable: needsSetup,
        maximizable: false,
        closable: true, // Always closable, but close event is handled

        // Skip taskbar only in kiosk
        skipTaskbar: !needsSetup,
        center: needsSetup,

        // Web preferences
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            devTools: false,
        },

        // Appearance
        backgroundColor: '#0f0f1a',
        show: needsSetup, // Show immediately in setup, delay in kiosk
    });

    // Disable context menu
    mainWindow.webContents.on('context-menu', (e) => {
        e.preventDefault();
    });

    // Prevent navigation to external URLs
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(`http://${config.server_ip}`)) {
            event.preventDefault();
        }
    });

    // Prevent new windows
    mainWindow.webContents.setWindowOpenHandler(() => {
        return { action: 'deny' };
    });

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();

        // Set highest alwaysOnTop level to cover dock/taskbar on Linux
        if (!needsSetup) {
            mainWindow.setAlwaysOnTop(true, 'screen-saver');
            mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

            // Disable dock on Linux for true fullscreen kiosk
            disableDock();

            // Periodic focus check - enforce focus every 500ms during exam
            setInterval(() => {
                if (mainWindow && examIsActive && !mainWindow.isFocused()) {
                    console.log('[Kiosk] Refocusing window...');
                    mainWindow.focus();
                    mainWindow.moveTop();
                    mainWindow.setAlwaysOnTop(true, 'screen-saver');
                }
            }, 500);
        }
    });

    // Handle window blur (focus lost) - aggressively refocus
    mainWindow.on('blur', () => {
        mainWindow.webContents.send('focus-changed', false);
        // Report to server
        if (socket && socket.connected && studentId) {
            socket.emit('focus:lost', { student_id: studentId });
        }

        // Aggressively refocus in kiosk mode
        if (!needsSetup && examIsActive) {
            // Immediate refocus
            mainWindow.focus();
            mainWindow.moveTop();

            // Multiple attempts to refocus
            setTimeout(() => {
                if (mainWindow && !mainWindow.isFocused()) {
                    mainWindow.focus();
                    mainWindow.moveTop();
                    mainWindow.setAlwaysOnTop(true, 'screen-saver');
                }
            }, 50);
            setTimeout(() => {
                if (mainWindow && !mainWindow.isFocused()) {
                    mainWindow.focus();
                    mainWindow.moveTop();
                }
            }, 200);
        }
    });

    // Handle window focus
    mainWindow.on('focus', () => {
        mainWindow.webContents.send('focus-changed', true);
        if (socket && socket.connected && studentId) {
            socket.emit('focus:regained', { student_id: studentId });
        }
    });

    // Handle close request - allow before exam, require exit code during exam
    mainWindow.on('close', async (e) => {
        // In setup mode or not running an exam - allow close
        if (needsSetup || app.isQuiting) {
            return; // Allow close
        }

        // Not in active exam (waiting/lobby/ended) - allow close
        if (!examIsActive) {
            enableDock();
            return; // Allow close
        }

        // During active exam - require exit code
        e.preventDefault();

        const result = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: ['Cancel', 'Enter Exit Code'],
            defaultId: 0,
            title: 'Exit During Exam',
            message: 'Exam is in progress. Enter exit code from instructor to close.',
        });

        if (result.response === 1) {
            // Ask for exit code
            const inputResult = await dialog.showInputBox ?
                await dialog.showInputBox({ title: 'Exit Code', label: 'Enter exit code:' }) :
                prompt('Enter exit code:'); // Fallback

            // Use IPC to get input from renderer since dialog.showInputBox doesn't exist
            mainWindow.webContents.send('request-exit-code');
        }
    });

    // Load setup page or exam URL
    if (needsSetup) {
        mainWindow.loadFile(path.join(__dirname, 'renderer', 'setup.html'));
    } else {
        const serverUrl = `http://${config.server_ip}:${config.server_port}/exam/`;
        mainWindow.loadURL(serverUrl).catch(err => {
            console.error('Failed to load URL:', err);
            mainWindow.loadFile(path.join(__dirname, 'renderer', 'error.html'));
        });

        // Initialize socket connection only when not in setup
        initSocket();
    }
}

// Block keyboard shortcuts
function registerShortcuts() {
    const blockedShortcuts = [
        'Alt+Tab',
        'Alt+F4',
        'Alt+Escape',
        'CommandOrControl+W',
        'CommandOrControl+Q',
        'CommandOrControl+Shift+I',
        'F11',
        'F12',
    ];

    blockedShortcuts.forEach(shortcut => {
        try {
            globalShortcut.register(shortcut, () => { });
        } catch (err) { }
    });

    // Register exit request shortcut
    globalShortcut.register('CommandOrControl+Shift+Alt+X', () => {
        if (mainWindow) {
            mainWindow.webContents.send('show-exit-dialog');
        }
    });
}

// App lifecycle
app.whenReady().then(() => {
    createWindow();
    registerShortcuts();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (socket) {
        socket.disconnect();
    }

    // Re-enable dock on Linux when exiting
    enableDock();
});

// IPC handlers
ipcMain.handle('get-config', () => {
    return config;
});

ipcMain.handle('is-focused', () => {
    return mainWindow?.isFocused() ?? false;
});

// Save config from setup page and restart app
ipcMain.handle('save-config', async (event, newConfig) => {
    try {
        // Update config
        config = { ...config, ...newConfig };

        // Save to file
        const configPath = path.join(__dirname, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));

        console.log('Config saved:', config);

        // Store student ID
        studentId = config.student_id;

        // Restart the app to switch to kiosk mode with --configured flag
        app.relaunch({ args: process.argv.slice(1).concat(['--configured']) });
        app.exit(0);

        return { success: true };
    } catch (err) {
        console.error('Failed to save config:', err);
        return { success: false, error: err.message };
    }
});

// Register student with server
ipcMain.on('register-student', (event, data) => {
    studentId = data.student_id;

    // Detect multiple monitors
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    const displayCount = displays.length;
    const displayInfo = displays.map(d => ({
        id: d.id,
        width: d.bounds.width,
        height: d.bounds.height,
        isPrimary: d.bounds.x === 0 && d.bounds.y === 0
    }));

    if (socket && socket.connected) {
        socket.emit('student:connect', {
            student_id: data.student_id,
            name: data.student_name || data.student_id,
            display_count: displayCount,
            displays: displayInfo
        });

        // If multiple monitors, report as violation
        if (displayCount > 1) {
            console.log(`[Warning] Multiple displays detected: ${displayCount}`);
            socket.emit('violation:multi_monitor', {
                student_id: data.student_id,
                display_count: displayCount,
                displays: displayInfo
            });
        }
    }
});

// Request exit from server
ipcMain.on('request-exit', (event, data) => {
    if (socket && socket.connected && studentId) {
        socket.emit('exit:request', {
            student_id: studentId,
            student_name: data.student_name || studentId,
            reason: data.reason || 'Student requested to exit'
        });
        console.log('Exit request sent to server');
    } else {
        // Not connected, show error
        if (mainWindow) {
            mainWindow.webContents.send('exit-error', 'Not connected to server');
        }
    }
});

// Force quit (from server command)
ipcMain.on('force-quit', () => {
    app.isQuiting = true;
    enableDock();
    app.quit();
});

// Show exit dialog request (from renderer button click)
ipcMain.on('show-exit-dialog-request', () => {
    if (mainWindow) {
        mainWindow.webContents.send('show-exit-dialog');
    }
});

// Verify exit code from renderer
ipcMain.on('verify-exit-code', (event, code) => {
    if (code === currentExitCode) {
        console.log('Exit code verified, quitting...');
        app.isQuiting = true;
        enableDock();
        app.quit();
    } else {
        console.log('Invalid exit code');
        mainWindow.webContents.send('exit-code-invalid');
    }
});

// Get current exit code requirement status
ipcMain.handle('get-exit-status', () => {
    return {
        examIsActive,
        requiresCode: examIsActive
    };
});
