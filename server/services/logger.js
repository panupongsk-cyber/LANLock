/**
 * LANLock Logging Service
 * Handles writing exam events to log files
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

const LOGS_DIR = path.join(config.DATA_DIR, 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

let currentLogFile = null;

/**
 * Start a new log session
 * @param {string} sessionName 
 */
function startSession(sessionName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = (sessionName || 'exam').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    currentLogFile = path.join(LOGS_DIR, `log_${safeName}_${timestamp}.txt`);

    log(`[System] New Session Started: ${sessionName || 'Exam'}`);
    log(`[System] Timestamp: ${new Date().toLocaleString()}`);
}

/**
 * Write a message to the log
 * @param {string} message 
 */
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = `[${timestamp}] ${message}\n`;

    // Print to console
    console.log(formattedMessage.trim());

    // Write to file if session is active
    if (currentLogFile) {
        fs.appendFileSync(currentLogFile, formattedMessage);
    } else {
        // Log to a general daily file if no session is active
        const dailyLog = path.join(LOGS_DIR, `system_${new Date().toISOString().split('T')[0]}.txt`);
        fs.appendFileSync(dailyLog, formattedMessage);
    }
}

/**
 * List available log files
 */
function listLogs() {
    if (!fs.existsSync(LOGS_DIR)) return [];

    return fs.readdirSync(LOGS_DIR)
        .filter(file => file.endsWith('.txt'))
        .map(file => {
            const stats = fs.statSync(path.join(LOGS_DIR, file));
            return {
                name: file,
                size: stats.size,
                mtime: stats.mtime
            };
        })
        .sort((a, b) => b.mtime - a.mtime);
}

/**
 * Read a log file
 * @param {string} filename 
 */
// Read a log file...
function readLog(filename) {
    const filePath = path.join(LOGS_DIR, filename);
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
}

function warn(message) {
    log(`[WARN] ${message}`);
}

function error(message) {
    log(`[ERROR] ${message}`);
}

module.exports = {
    startSession,
    log,
    warn,
    error,
    listLogs,
    readLog
};
