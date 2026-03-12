const fs = require('fs');
const path = require('path');

const LOG_FILE = process.env.LOG_FILE ? 
    (path.isAbsolute(process.env.LOG_FILE) ? process.env.LOG_FILE : path.join(__dirname, process.env.LOG_FILE.replace(/^\.\//, ''))) :
    path.join(__dirname, 'app.log');
const MAX_LOG_SIZE = process.env.LOG_MAX_SIZE ? parseInt(process.env.LOG_MAX_SIZE, 10) : 10 * 1024 * 1024;
const MAX_LOG_FILES = process.env.LOG_MAX_FILES ? parseInt(process.env.LOG_MAX_FILES, 10) : 5;

/**
 * Log levels with numeric priorities
 */
const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

/**
 * Current log level (can be overridden with LOG_LEVEL env var)
 */
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

/**
 * Format timestamp for logs
 */
function formatTimestamp() {
    return new Date().toISOString();
}

/**
 * Format log message
 */
function formatMessage(level, module, message) {
    const timestamp = formatTimestamp();
    const moduleTag = module ? `[${module}]` : '';
    return `${timestamp} [${level.toUpperCase()}] ${moduleTag} ${message}`;
}

/**
 * Rotate log file if it exceeds max size
 */
function rotateLog() {
    try {
        if (!fs.existsSync(LOG_FILE)) {
            return;
        }

        const stats = fs.statSync(LOG_FILE);
        if (stats.size < MAX_LOG_SIZE) {
            return;
        }

        // Rotate existing log files
        for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
            const oldFile = `${LOG_FILE}.${i}`;
            const newFile = `${LOG_FILE}.${i + 1}`;
            if (fs.existsSync(oldFile)) {
                if (i + 1 > MAX_LOG_FILES) {
                    fs.unlinkSync(oldFile);
                } else {
                    fs.renameSync(oldFile, newFile);
                }
            }
        }

        // Move current log to .1
        fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    } catch (error) {
        // Silent fail for log rotation
    }
}

/**
 * Write log to file
 */
function writeToFile(formattedMessage) {
    try {
        rotateLog();
        fs.appendFileSync(LOG_FILE, formattedMessage + '\n');
    } catch (error) {
        // Silent fail for file writing - don't crash the app
    }
}

/**
 * Logger class
 */
class Logger {
    constructor(module = null) {
        this.module = module;
    }

    /**
     * Log error message (CRITICAL failures)
     * Examples: browser crash, network failure, unhandled exception
     */
    error(message, meta = {}) {
        if (CURRENT_LEVEL < LEVELS.error) return;
        this._log('error', message, meta);
    }

    /**
     * Log warning message (Non-critical issues)
     * Examples: file already exists, session expired, retry attempt
     */
    warn(message, meta = {}) {
        if (CURRENT_LEVEL < LEVELS.warn) return;
        this._log('warn', message, meta);
    }

    /**
     * Log info message (Normal workflow)
     * Examples: navigation started, download completed, auth saved
     */
    info(message, meta = {}) {
        if (CURRENT_LEVEL < LEVELS.info) return;
        this._log('info', message, meta);
    }

    /**
     * Log debug message (Detailed technical info)
     * Examples: retry delays, selector details, timing info
     */
    debug(message, meta = {}) {
        if (CURRENT_LEVEL < LEVELS.debug) return;
        this._log('debug', message, meta);
    }

    /**
     * Internal log method
     */
    _log(level, message, meta) {
        const formattedMessage = formatMessage(level, this.module, message);

        // Add metadata if provided
        let fullMessage = formattedMessage;
        if (Object.keys(meta).length > 0) {
            try {
                fullMessage += ' ' + JSON.stringify(meta);
            } catch (e) {
                // Ignore JSON stringify errors
            }
        }

        // Always write to file
        writeToFile(fullMessage);

        // Also output to console for development
        const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[consoleMethod](fullMessage);
    }
}

/**
 * Create a logger instance for a specific module
 */
function createLogger(module) {
    return new Logger(module);
}

/**
 * Get the main application logger
 */
function getAppLogger() {
    return new Logger('APP');
}

/**
 * Clear old log files
 */
function clearLogs() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            fs.unlinkSync(LOG_FILE);
        }
        for (let i = 1; i <= MAX_LOG_FILES; i++) {
            const oldFile = `${LOG_FILE}.${i}`;
            if (fs.existsSync(oldFile)) {
                fs.unlinkSync(oldFile);
            }
        }
    } catch (error) {
        // Silent fail
    }
}

module.exports = {
    createLogger,
    getAppLogger,
    clearLogs,
    LEVELS,
    LOG_FILE
};
