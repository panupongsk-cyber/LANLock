/**
 * LANLock Server Configuration
 * Centralized configuration with environment variable support
 */

const path = require('path');

module.exports = {
    // Server settings
    PORT: process.env.PORT || 2222,
    HOST: process.env.HOST || '0.0.0.0',

    // Paths
    DATA_DIR: path.join(__dirname, 'data'),
    DB_PATH: path.join(__dirname, 'data', 'exam.db'),
    TEMP_DIR: path.join(__dirname, 'temp'),

    // Compiler settings (MinGW-w64 portable path)
    GCC_PATH: process.env.GCC_PATH || 'gcc',
    GPP_PATH: process.env.GPP_PATH || 'g++',
    COMPILE_TIMEOUT: parseInt(process.env.COMPILE_TIMEOUT) || 2000,
    EXECUTION_TIMEOUT: parseInt(process.env.EXECUTION_TIMEOUT) || 2000,

    // Heartbeat settings
    HEARTBEAT_INTERVAL: 5000,  // Client sends heartbeat every 5s
    HEARTBEAT_TIMEOUT: 10000,  // Mark offline if no heartbeat in 10s

    // Exam settings
    AUTO_SAVE_INTERVAL: 30000, // Auto-save answers every 30s
};
