require('dotenv').config();

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { initDatabase, wasRecentlyDownloaded, logDownload, closeDatabase, startSession, endSession } = require('./database');
const { notifySuccess, notifyAlreadyDownloaded, notifyError } = require('./notification');
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

// Retry configuration from config
const RETRY_CONFIG = config.retry;

async function downloadFlow() {
    logger.info('Starting download process...', { module: 'DOWNLOAD_FLOW' });

    // Initialize database
    initDatabase();

    // Start audit session
    const sessionId = startSession();

    // Ensure downloads directory exists
    if (!fs.existsSync(DOWNLOADS_DIR)) {
        fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
        logger.info('Created downloads directory', { module: 'DOWNLOAD_FLOW' });
    }

    // Check if auth file exists
    if (!fs.existsSync(AUTH_STATE_FILE)) {
        logger.error('Session expired. Run npm start first to authenticate.', { module: 'DOWNLOAD_FLOW' });
        endSession(sessionId, 'failed');
        closeDatabase();
        process.exit(1);
    }

    logger.info('Loading session from auth.json...', { module: 'DOWNLOAD_FLOW' });

    let browser;
    let context;
    let page;

    try {
        browser = await retryLaunchBrowser({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }, RETRY_CONFIG);

        context = await retryCreateContext(browser, {
            storageState: AUTH_STATE_FILE,
            userAgent: WINDOWS_UA,
            viewport: { width: 1920, height: 1080 },
            acceptDownloads: true
        }, RETRY_CONFIG);

        page = await context.newPage();

        // Navigate to download page
        logger.info('Navigating to https://obsidian.md/download', { module: 'DOWNLOAD_FLOW' });
        await retryNavigation(page, 'https://obsidian.md/download', RETRY_CONFIG);

        // Check if session is valid (not redirected to login)
        const currentUrl = page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
            logger.warn('Session expired. Run npm start first to re-authenticate.', { module: 'DOWNLOAD_FLOW' });
            process.exit(1);
        }

        logger.info('Session validated, looking for download button...', { module: 'DOWNLOAD_FLOW' });

        // Debug: log page content
        const pageTitle = await page.title();
        logger.info(`Page title: ${pageTitle}`, { module: 'DOWNLOAD_FLOW', url: page.url() });
        logger.info(`Current URL: ${page.url()}`, { module: 'DOWNLOAD_FLOW' });

        // Wait for page to fully load with HARD TIMEOUT
        await retryWaitFor(page.locator('body'), { state: 'attached' }, { ...RETRY_CONFIG, timeout: RETRY_CONFIG.timeouts.selector });

        // Look for Windows download button - Obsidian typically has direct .exe links
        // Try multiple selector strategies
        const downloadLink = page.locator(
            'a[href*=".exe"], ' +
            'a[href*="win"], ' +
            'a[href*="windows"], ' +
            'a:has-text("Download for Windows"), ' +
            'a:has-text("Download Windows"), ' +
            'button:has-text("Download"), ' +
            'a.button:has-text("Download")'
        ).first();

        // Wait for download link to be visible with HARD TIMEOUT
        logger.info('Waiting for download button to be visible...', { module: 'DOWNLOAD_FLOW' });
        await retryWaitFor(downloadLink, { state: 'visible' }, { ...RETRY_CONFIG, timeout: RETRY_CONFIG.timeouts.selector });

        // Get the expected filename before clicking
        const href = await downloadLink.getAttribute('href');
        const expectedFilename = href ? path.basename(href) : 'obsidian-setup.exe';

        // Check if file was recently downloaded (24-hour protection)
        if (wasRecentlyDownloaded(expectedFilename)) {
            const filePath = path.join(DOWNLOADS_DIR, expectedFilename);
            const fileExists = fs.existsSync(filePath);

            if (fileExists) {
                logger.warn(`SKIP: ${expectedFilename} was already downloaded successfully in the last 24 hours`, { module: 'DOWNLOAD_FLOW' });
                await notifyAlreadyDownloaded(expectedFilename);
                endSession(sessionId, 'completed');
                await browser.close();
                closeDatabase();
                return;
            } else {
                logger.warn(`DB record exists but file missing: ${expectedFilename}. Proceeding with download...`, { module: 'DOWNLOAD_FLOW' });
            }
        }

        logger.info('Initiating download...', { module: 'DOWNLOAD_FLOW' });

        // Perform download with retry
        const download = await retryDownload(page, downloadLink, RETRY_CONFIG);

        logger.info('Download started...', { module: 'DOWNLOAD_FLOW' });

        // Get suggested filename
        const suggestedFilename = download.suggestedFilename() || 'obsidian-setup.exe';
        const savePath = path.join(DOWNLOADS_DIR, suggestedFilename);

        logger.info(`Saving to ${savePath}`, { module: 'DOWNLOAD_FLOW' });

        // Save the download with retry
        await retryWithBackoff(
            async () => await download.saveAs(savePath),
            { ...RETRY_CONFIG, operationName: 'Save download' }
        );

        logger.info('Download completed successfully!', { module: 'DOWNLOAD_FLOW' });
        logger.info(`File saved: ${savePath}`, { module: 'DOWNLOAD_FLOW' });

        // Get file size
        let fileSize = 0;
        try {
            const stats = fs.statSync(savePath);
            fileSize = stats.size;
            logger.info(`File size: ${fileSize} bytes`, { module: 'DOWNLOAD_FLOW' });
        } catch (e) {
            logger.warn(`Could not get file size: ${e.message}`, { module: 'DOWNLOAD_FLOW' });
        }

        // Log successful download with session and file size
        logDownload(suggestedFilename, 'success', sessionId, fileSize);

        // End session as completed
        endSession(sessionId, 'completed');

        // Send Telegram notification
        await notifySuccess(suggestedFilename);

    } catch (error) {
        logger.error(`Error: ${error.message}`, { module: 'DOWNLOAD_FLOW' });

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
                logDownload(failedFilename, 'failed', sessionId, 0);
            } else {
                logDownload('unknown', 'failed', sessionId, 0);
            }
        } catch (e) {
            logDownload('unknown', 'failed', sessionId, 0);
        }

        // End session as failed
        endSession(sessionId, 'failed');

        // Send Telegram notification
        await notifyError(error.message);

        // Take screenshot with retry
        if (page) {
            try {
                const screenshotPath = path.join(__dirname, 'error-debug.png');
                await retryScreenshot(page, { path: screenshotPath, fullPage: true }, RETRY_CONFIG);
                logger.error(`Screenshot saved to ${screenshotPath}`, { module: 'DOWNLOAD_FLOW' });
            } catch (screenshotError) {
                logger.error('Failed to take error screenshot', { module: 'DOWNLOAD_FLOW', error: screenshotError.message });
            }
        }

        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
        // Session already ended in success/error paths
        closeDatabase();
    }
}

downloadFlow().catch(err => {
    logger.error(`Fatal error: ${err.message}`, { module: 'DOWNLOAD_FLOW' });
    process.exit(1);
});
