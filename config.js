require('dotenv').config();
const path = require('path');

/**
 * Resolve path - handles both absolute and relative paths
 * Relative paths are resolved against project root
 * @param {string} p - Path to resolve
 * @returns {string} - Absolute path
 */
function resolvePath(p) {
    if (!p) return null;
    if (path.isAbsolute(p)) return p;
    // Remove leading ./ if present
    const cleanPath = p.replace(/^\.\//, '');
    return path.join(__dirname, cleanPath);
}

/**
 * Parse integer from env with default value
 * @param {string} key - Environment variable name
 * @param {number} defaultValue - Default value if not set
 * @returns {number} - Parsed integer
 */
function parseIntEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined || value === '') return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean from env with default value
 * @param {string} key - Environment variable name
 * @param {boolean} defaultValue - Default value if not set
 * @returns {boolean} - Parsed boolean
 */
function parseBoolEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined || value === '') return defaultValue;
    return value.toLowerCase() === 'true';
}

/**
 * Application configuration loaded from environment variables
 */
const config = {
    // =========================================================================
    // AUTHENTICATION
    // =========================================================================
    auth: {
        email: process.env.OBSIDIAN_EMAIL,
        password: process.env.OBSIDIAN_PASSWORD,
    },

    // =========================================================================
    // TELEGRAM NOTIFICATIONS
    // =========================================================================
    telegram: {
        userId: process.env.TELEGRAM_USER_ID,
        botToken: process.env.TELEGRAM_BOT_TOKEN,
    },

    // =========================================================================
    // PATHS CONFIGURATION
    // =========================================================================
    paths: {
        authStateFile: resolvePath(process.env.AUTH_STATE_FILE || './auth.json'),
        downloadsDir: resolvePath(process.env.DOWNLOADS_DIR || './downloads'),
        databasePath: resolvePath(process.env.DATABASE_PATH || './database.db'),
        logFile: resolvePath(process.env.LOG_FILE || './app.log'),
    },

    // =========================================================================
    // BROWSER CONFIGURATION
    // =========================================================================
    browser: {
        headless: process.env.DEBUG !== 'true',
        userAgent: process.env.WINDOWS_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: {
            width: 1920,
            height: 1080,
        },
    },

    // =========================================================================
    // LOGGING CONFIGURATION
    // =========================================================================
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        maxFileSize: parseIntEnv('LOG_MAX_SIZE', 10 * 1024 * 1024), // 10MB
        maxFiles: parseIntEnv('LOG_MAX_FILES', 5),
    },

    // =========================================================================
    // SCHEDULER CONFIGURATION
    // =========================================================================
    scheduler: {
        enabled: parseBoolEnv('ENABLE_CRON', true),
        cronSchedule: process.env.CRON_SCHEDULE || '0 */6 * * *',
    },

    // =========================================================================
    // RETRY CONFIGURATION
    // =========================================================================
    retry: {
        maxRetries: parseIntEnv('RETRY_MAX_RETRIES', 3),
        baseDelay: parseIntEnv('RETRY_BASE_DELAY', 1000),
        maxDelay: parseIntEnv('RETRY_MAX_DELAY', 30000),
        exponentialFactor: parseIntEnv('RETRY_EXPONENTIAL_FACTOR', 2),
        jitter: parseBoolEnv('RETRY_JITTER', true),
        timeouts: {
            navigation: parseIntEnv('TIMEOUT_NAVIGATION', 30000),
            selector: parseIntEnv('TIMEOUT_SELECTOR', 10000),
            download: parseIntEnv('TIMEOUT_DOWNLOAD', 60000),
            action: parseIntEnv('TIMEOUT_ACTION', 15000),
            screenshot: parseIntEnv('TIMEOUT_SCREENSHOT', 10000),
            storageState: parseIntEnv('TIMEOUT_STORAGE_STATE', 15000),
        },
    },

    // =========================================================================
    // DATABASE CONFIGURATION
    // =========================================================================
    database: {
        enabled: parseBoolEnv('ENABLE_DOWNLOAD_HISTORY', true),
        skipProtectionHours: parseIntEnv('DOWNLOAD_SKIP_HOURS', 24),
    },
};

/**
 * Validate required configuration
 * @throws {Error} If required configuration is missing
 */
function validateConfig() {
    const errors = [];

    if (!config.auth.email) {
        errors.push('OBSIDIAN_EMAIL is required');
    }

    if (!config.auth.password) {
        errors.push('OBSIDIAN_PASSWORD is required');
    }

    if (errors.length > 0) {
        throw new Error(`Configuration errors:\n  - ${errors.join('\n  - ')}`);
    }
}

module.exports = {
    config,
    validateConfig,
    resolvePath,
};
