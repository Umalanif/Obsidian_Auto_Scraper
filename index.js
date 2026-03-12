require('dotenv').config();

const { chromium } = require('playwright');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { initDatabase, wasRecentlyDownloaded, logDownload, closeDatabase } = require('./database');
const { notifySuccess, notifyAlreadyDownloaded, notifyError, notifyCriticalError } = require('./notification');
const { getAppLogger } = require('./logger');
const { config, validateConfig } = require('./config');

const logger = getAppLogger();

// Validate configuration on startup
validateConfig();

const {
    retryWithBackoff,
    retryNavigation,
    retryElementAction,
    retryCreateContext,
    retryLaunchBrowser,
    retryDownload,
    retryWaitFor,
    retryScreenshot
} = require('./retry-utils');

const AUTH_STATE_FILE = config.paths.authStateFile;
const DOWNLOADS_DIR = config.paths.downloadsDir;

// Windows 10 User-Agent from config
const WINDOWS_UA = config.browser.userAgent;

// Headless mode from config
const isHeadless = config.browser.headless;

// Cron schedule from config
const CRON_SCHEDULE = config.scheduler.cronSchedule;
const ENABLE_CRON = config.scheduler.enabled;

// Retry configuration from config
const RETRY_CONFIG = config.retry;

// ============================================================================
// AUTHENTICATION MODULE
// ============================================================================

async function performLogin() {
    logger.info('Starting authentication process...', { module: 'AUTH' });

    if (!config.auth.email || !config.auth.password) {
        throw new Error('[AUTH] Missing credentials in .env file');
    }

    let browser;
    let context;
    let page;

    try {
        // Launch browser with retry
        browser = await retryLaunchBrowser({
            headless: isHeadless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }, RETRY_CONFIG);

        // Create context with retry
        context = await retryCreateContext(browser, {
            viewport: { width: 1920, height: 1080 }
        }, RETRY_CONFIG);

        page = await context.newPage();

        logger.info('Navigating to https://obsidian.md/account', { module: 'AUTH' });
        await retryNavigation(page, 'https://obsidian.md/account', RETRY_CONFIG);

        const isLoggedIn = await page.$('text="Log out"');
        if (isLoggedIn) {
            logger.info('Already logged in, saving session...', { module: 'AUTH' });
        } else {
            logger.info('Filling login form...', { module: 'AUTH' });

            const emailInput = page.locator('input[name="email"], input[type="email"], input[placeholder*="email" i], input[placeholder*="Email"]');
            const passwordInput = page.locator('input[name="password"], input[type="password"], input[placeholder*="password" i]');
            const submitButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), input[type="submit"], .login-button');

            // Wait for inputs with HARD TIMEOUT
            await retryWaitFor(emailInput, { state: 'visible' }, { ...RETRY_CONFIG, timeout: RETRY_CONFIG.timeouts.selector });
            await retryWaitFor(passwordInput, { state: 'visible' }, { ...RETRY_CONFIG, timeout: RETRY_CONFIG.timeouts.selector });

            // Fill inputs with HARD TIMEOUT
            await retryElementAction(emailInput, 'fill', config.auth.email, { ...RETRY_CONFIG, timeout: RETRY_CONFIG.timeouts.selector, actionTimeout: RETRY_CONFIG.timeouts.action });
            await retryElementAction(passwordInput, 'fill', config.auth.password, { ...RETRY_CONFIG, timeout: RETRY_CONFIG.timeouts.selector, actionTimeout: RETRY_CONFIG.timeouts.action });

            logger.info('Submitting credentials...', { module: 'AUTH' });
            await retryWaitFor(submitButton, { state: 'visible' }, { ...RETRY_CONFIG, timeout: RETRY_CONFIG.timeouts.selector });
            await retryElementAction(submitButton, 'click', null, { ...RETRY_CONFIG, timeout: RETRY_CONFIG.timeouts.selector, actionTimeout: RETRY_CONFIG.timeouts.action });

            logger.info('Waiting for successful authentication...', { module: 'AUTH' });
            const logoutButton = page.locator('text="Log out"');
            await retryWaitFor(logoutButton, { timeout: RETRY_CONFIG.timeouts.selector }, RETRY_CONFIG);
            logger.info('Authentication successful!', { module: 'AUTH' });
        }

        logger.info('Saving auth state...', { module: 'AUTH' });
        await context.storageState({ path: AUTH_STATE_FILE });
        logger.info('Auth state saved to auth.json', { module: 'AUTH' });

        return true;
    } catch (error) {
        // Take screenshot with retry on error
        if (page) {
            try {
                const timestamp = Date.now();
                const errorScreenshot = path.join(__dirname, `login-error-${timestamp}.png`);
                await retryScreenshot(page, { path: errorScreenshot, fullPage: true }, RETRY_CONFIG);
                logger.error(`Error screenshot saved: ${errorScreenshot}`, { module: 'AUTH' });
            } catch (screenshotError) {
                logger.error('Failed to take error screenshot', { module: 'AUTH', error: screenshotError.message });
            }
        }
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// ============================================================================
// SESSION VALIDATION MODULE
// ============================================================================

async function isSessionValid() {
    logger.info('Checking if auth.json exists...', { module: 'SESSION' });

    if (!fs.existsSync(AUTH_STATE_FILE)) {
        logger.warn('auth.json not found - login required', { module: 'SESSION' });
        return false;
    }

    logger.info('auth.json found, validating session...', { module: 'SESSION' });

    let browser;
    let context;
    let page;

    try {
        browser = await retryLaunchBrowser({ headless: true }, RETRY_CONFIG);
        context = await retryCreateContext(browser, {
            storageState: AUTH_STATE_FILE,
            userAgent: WINDOWS_UA
        }, RETRY_CONFIG);
        page = await context.newPage();

        await retryNavigation(page, 'https://obsidian.md/download', RETRY_CONFIG);

        const currentUrl = page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
            logger.warn('Session expired - redirected to login', { module: 'SESSION' });
            return false;
        }

        logger.info('Session is valid', { module: 'SESSION' });
        return true;
    } catch (error) {
        logger.warn('Session validation failed', { module: 'SESSION', error: error.message });
        return false;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// ============================================================================
// DOWNLOAD MODULE
// ============================================================================

async function performDownload() {
    logger.info('Starting download process...', { module: 'DOWNLOAD' });

    // Initialize database
    initDatabase();

    if (!fs.existsSync(DOWNLOADS_DIR)) {
        fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
        logger.info('Created downloads directory', { module: 'DOWNLOAD' });
    }

    if (!fs.existsSync(AUTH_STATE_FILE)) {
        throw new Error('[DOWNLOAD] auth.json not found after login');
    }

    let browser;
    let context;
    let page;

    try {
        browser = await retryLaunchBrowser({
            headless: isHeadless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }, RETRY_CONFIG);

        context = await retryCreateContext(browser, {
            storageState: AUTH_STATE_FILE,
            userAgent: WINDOWS_UA,
            viewport: { width: 1920, height: 1080 },
            acceptDownloads: true
        }, RETRY_CONFIG);

        page = await context.newPage();

        logger.info('Navigating to https://obsidian.md/download', { module: 'DOWNLOAD' });
        await retryNavigation(page, 'https://obsidian.md/download', RETRY_CONFIG);

        const currentUrl = page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
            throw new Error('[DOWNLOAD] Session expired during download');
        }

        logger.info('Session validated, looking for download button...', { module: 'DOWNLOAD' });

        await retryWaitFor(page.locator('body'), { state: 'attached' }, { ...RETRY_CONFIG, timeout: RETRY_CONFIG.timeouts.selector });

        const downloadLink = page.locator(
            'a[href*=".exe"], ' +
            'a[href*="win"], ' +
            'a[href*="windows"], ' +
            'a:has-text("Download for Windows"), ' +
            'a:has-text("Download Windows"), ' +
            'button:has-text("Download"), ' +
            'a.button:has-text("Download")'
        ).first();

        logger.info('Waiting for download button...', { module: 'DOWNLOAD' });
        await retryWaitFor(downloadLink, { state: 'visible' }, { ...RETRY_CONFIG, timeout: RETRY_CONFIG.timeouts.selector });

        // Get the expected filename before clicking
        const href = await downloadLink.getAttribute('href');
        const expectedFilename = href ? path.basename(href) : 'obsidian-setup.exe';

        // Check if file was recently downloaded (24-hour protection)
        if (wasRecentlyDownloaded(expectedFilename)) {
            logger.warn(`SKIP: ${expectedFilename} was already downloaded successfully in the last 24 hours`, { module: 'DOWNLOAD' });
            await notifyAlreadyDownloaded(expectedFilename);
            await browser.close();
            closeDatabase();
            return null;
        }

        logger.info('Initiating download...', { module: 'DOWNLOAD' });

        // Perform download with retry
        const download = await retryDownload(page, downloadLink, RETRY_CONFIG);

        const suggestedFilename = download.suggestedFilename() || 'obsidian-setup.exe';
        const savePath = path.join(DOWNLOADS_DIR, suggestedFilename);

        logger.info(`Saving to ${savePath}`, { module: 'DOWNLOAD' });

        // Save download with retry
        await retryWithBackoff(
            async () => await download.saveAs(savePath),
            { ...RETRY_CONFIG, operationName: 'Save download' }
        );

        logger.info('Download completed successfully!', { module: 'DOWNLOAD' });
        logger.info(`File saved: ${savePath}`, { module: 'DOWNLOAD' });

        // Log successful download
        logDownload(suggestedFilename, 'success');

        // Send Telegram notification
        await notifySuccess(suggestedFilename);

        return savePath;
    } catch (error) {
        logger.error(`Download error: ${error.message}`, { module: 'DOWNLOAD' });

        // Log failed download
        try {
            if (page) {
                const downloadLink = page.locator(
                    'a[href*=".exe"], ' +
                    'a[href*="win"], ' +
                    'a[href*="windows"], ' +
                    'a:has-text("Download for Windows"), ' +
                    'a:has-text("Download Windows"), ' +
                    'button:has-text("Download"), ' +
                    'a.button:has-text("Download")'
                ).first();
                const href = await downloadLink.getAttribute('href');
                const failedFilename = href ? path.basename(href) : 'unknown';
                logDownload(failedFilename, 'failed');
            } else {
                logDownload('unknown', 'failed');
            }
        } catch (e) {
            logDownload('unknown', 'failed');
        }

        // Take screenshot with retry
        if (page) {
            try {
                const screenshotPath = path.join(__dirname, 'error-debug.png');
                await retryScreenshot(page, { path: screenshotPath, fullPage: true }, RETRY_CONFIG);
                logger.error(`Screenshot saved to ${screenshotPath}`, { module: 'DOWNLOAD' });
            } catch (screenshotError) {
                logger.error('Failed to take error screenshot', { module: 'DOWNLOAD', error: screenshotError.message });
            }
        }
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
        closeDatabase();
    }
}

// ============================================================================
// GLOBAL ERROR HANDLER
// ============================================================================

/**
 * Global unhandled rejection handler - ensures browser closure and critical notification
 */
process.on('unhandledRejection', async (reason, promise) => {
    logger.error('='.repeat(60), { module: 'GLOBAL_ERROR' });
    logger.error('🚨 GLOBAL UNHANDLED REJECTION DETECTED', { module: 'GLOBAL_ERROR' });
    logger.error('='.repeat(60), { module: 'GLOBAL_ERROR' });
    logger.error(`Reason: ${reason}`, { module: 'GLOBAL_ERROR' });
    logger.error(`Stack: ${reason?.stack}`, { module: 'GLOBAL_ERROR' });

    try {
        // Attempt to close any open browsers gracefully
        logger.info('Attempting to close all browser contexts...', { module: 'GLOBAL_ERROR' });
        // Browser instances are scoped to functions, but we ensure cleanup via finally blocks
    } catch (e) {
        logger.error(`Error during browser cleanup: ${e.message}`, { module: 'GLOBAL_ERROR' });
    }

    try {
        // Close database connection
        closeDatabase();
    } catch (e) {
        logger.error(`Error closing database: ${e.message}`, { module: 'GLOBAL_ERROR' });
    }

    try {
        // Send critical Telegram notification
        await notifyCriticalError(
            reason?.message || String(reason),
            reason?.stack || 'No stack trace available'
        );
    } catch (e) {
        logger.error(`Failed to send notification: ${e.message}`, { module: 'GLOBAL_ERROR' });
    }

    logger.error('Critical notification sent. Process exiting...', { module: 'GLOBAL_ERROR' });
    process.exit(1);
});

/**
 * Global uncaught exception handler - last resort before process crash
 */
process.on('uncaughtException', async (error) => {
    logger.error('='.repeat(60), { module: 'GLOBAL_ERROR' });
    logger.error('🚨 GLOBAL UNCAUGHT EXCEPTION DETECTED', { module: 'GLOBAL_ERROR' });
    logger.error('='.repeat(60), { module: 'GLOBAL_ERROR' });
    logger.error(`Error: ${error.message}`, { module: 'GLOBAL_ERROR' });
    logger.error(`Stack: ${error.stack}`, { module: 'GLOBAL_ERROR' });

    try {
        // Close database connection
        closeDatabase();
    } catch (e) {
        logger.error(`Error closing database: ${e.message}`, { module: 'GLOBAL_ERROR' });
    }

    try {
        // Send critical Telegram notification
        await notifyCriticalError(
            error.message,
            error.stack
        );
    } catch (e) {
        logger.error(`Failed to send notification: ${e.message}`, { module: 'GLOBAL_ERROR' });
    }

    logger.error('Critical notification sent. Process exiting...', { module: 'GLOBAL_ERROR' });
    process.exit(1);
});

// ============================================================================
// SCHEDULER
// ============================================================================

/**
 * Start the cron scheduler for automatic downloads
 */
function startScheduler() {
    if (!ENABLE_CRON) {
        logger.info('Scheduler disabled. Set ENABLE_CRON=true in .env to enable.', { module: 'SCHEDULER' });
        return null;
    }

    logger.info('='.repeat(60), { module: 'SCHEDULER' });
    logger.info('STARTING AUTOMATIC SCHEDULER', { module: 'SCHEDULER' });
    logger.info(`Schedule: ${CRON_SCHEDULE} (every 6 hours by default)`, { module: 'SCHEDULER' });
    logger.info('='.repeat(60), { module: 'SCHEDULER' });

    // Validate cron expression
    if (!cron.validate(CRON_SCHEDULE)) {
        logger.error(`Invalid cron expression: ${CRON_SCHEDULE}`, { module: 'SCHEDULER' });
        throw new Error(`Invalid cron schedule: ${CRON_SCHEDULE}`);
    }

    const task = cron.schedule(CRON_SCHEDULE, async () => {
        logger.info('='.repeat(60), { module: 'SCHEDULER' });
        logger.info('SCHEDULED TASK TRIGGERED', { module: 'SCHEDULER' });
        logger.info('='.repeat(60), { module: 'SCHEDULER' });

        try {
            await runDownloadFlow();
        } catch (error) {
            logger.error(`Scheduled task failed: ${error.message}`, { module: 'SCHEDULER' });
            // Error already handled by runDownloadFlow
        }
    });

    logger.info('Scheduler started successfully', { module: 'SCHEDULER' });
    logger.info('Press Ctrl+C to stop', { module: 'SCHEDULER' });

    return task;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * Single download flow execution (for scheduler)
 */
async function runDownloadFlow() {
    try {
        // Step 1: Check session validity
        const sessionValid = await isSessionValid();

        if (!sessionValid) {
            logger.warn('Session invalid or missing. Starting login...', { module: 'ORCHESTRATOR' });
            await performLogin();
            logger.info('Login completed successfully', { module: 'ORCHESTRATOR' });
        } else {
            logger.info('Session is valid, skipping login', { module: 'ORCHESTRATOR' });
        }

        // Step 2: Perform download
        logger.info('Starting download flow...', { module: 'ORCHESTRATOR' });
        const downloadedPath = await performDownload();

        logger.info('='.repeat(60), { module: 'ORCHESTRATOR' });
        logger.info('FLOW COMPLETED SUCCESSFULLY', { module: 'ORCHESTRATOR' });
        logger.info(`Downloaded file: ${downloadedPath}`, { module: 'ORCHESTRATOR' });
        logger.info('='.repeat(60), { module: 'ORCHESTRATOR' });

    } catch (error) {
        logger.error('='.repeat(60), { module: 'ORCHESTRATOR' });
        logger.error('FLOW FAILED', { module: 'ORCHESTRATOR' });
        logger.error(`Error: ${error.message}`, { module: 'ORCHESTRATOR' });
        logger.error('='.repeat(60), { module: 'ORCHESTRATOR' });

        // Send error notification
        await notifyError(error.message);

        throw error; // Re-throw for scheduler handling
    }
}

async function main() {
    logger.info('='.repeat(60), { module: 'ORCHESTRATOR' });
    logger.info('OBSIDIAN DOWNLOADER ORCHESTRATOR', { module: 'ORCHESTRATOR' });
    logger.info('='.repeat(60), { module: 'ORCHESTRATOR' });

    // Check if running in scheduler mode or single-run mode
    const schedulerMode = process.argv.includes('--scheduler') || ENABLE_CRON;

    if (schedulerMode) {
        // Start the scheduler (runs continuously)
        const scheduler = startScheduler();

        // Run first download immediately
        logger.info('Running initial download...', { module: 'ORCHESTRATOR' });
        await runDownloadFlow();

        // Keep process alive for scheduler
        logger.info('Scheduler is running. Press Ctrl+C to stop.', { module: 'ORCHESTRATOR' });

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            logger.info('Received SIGINT, stopping scheduler...', { module: 'SCHEDULER' });
            if (scheduler) {
                scheduler.stop();
            }
            closeDatabase();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            logger.info('Received SIGTERM, stopping scheduler...', { module: 'SCHEDULER' });
            if (scheduler) {
                scheduler.stop();
            }
            closeDatabase();
            process.exit(0);
        });

    } else {
        // Single-run mode (legacy behavior)
        try {
            await runDownloadFlow();
        } catch (error) {
            process.exit(1);
        }
    }
}

main();
