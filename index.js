const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_STATE_FILE = path.join(__dirname, 'auth.json');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Windows 10 User-Agent
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============================================================================
// AUTHENTICATION MODULE
// ============================================================================

async function performLogin() {
    console.log('[AUTH] Starting authentication process...');

    if (!process.env.LOGIN_USERNAME || !process.env.LOGIN_PASSWORD) {
        throw new Error('[AUTH] Missing credentials in .env file');
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('[AUTH] Navigating to login page...');
        await page.goto('https://the-internet.herokuapp.com/login');

        console.log('[AUTH] Entering credentials...');
        await page.fill('#username', process.env.LOGIN_USERNAME);
        await page.fill('#password', process.env.LOGIN_PASSWORD);
        await page.click('button[type="submit"]');

        console.log('[AUTH] Waiting for success message...');
        await page.waitForSelector('#flash');
        const flashMessage = await page.textContent('#flash');

        if (!flashMessage.includes('You logged into a secure area!')) {
            throw new Error('[AUTH] Login failed. Got: ' + flashMessage);
        }

        console.log('[AUTH] Login successful, saving auth state...');
        await context.storageState({ path: AUTH_STATE_FILE });
        console.log('[AUTH] Auth state saved to auth.json');

        return true;
    } catch (error) {
        const timestamp = Date.now();
        const errorScreenshot = path.join(__dirname, `login-error-${timestamp}.png`);
        await page.screenshot({ path: errorScreenshot, fullPage: true });
        console.error(`[AUTH] Error screenshot saved: ${errorScreenshot}`);
        throw error;
    } finally {
        await browser.close();
    }
}

// ============================================================================
// SESSION VALIDATION MODULE
// ============================================================================

async function isSessionValid() {
    console.log('[SESSION] Checking if auth.json exists...');

    if (!fs.existsSync(AUTH_STATE_FILE)) {
        console.log('[SESSION] auth.json not found');
        return false;
    }

    console.log('[SESSION] auth.json found, validating session...');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        storageState: AUTH_STATE_FILE,
        userAgent: WINDOWS_UA
    });
    const page = await context.newPage();

    try {
        await page.goto('https://obsidian.md/download', { waitUntil: 'networkidle', timeout: 30000 });

        const currentUrl = page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
            console.log('[SESSION] Session expired - redirected to login');
            return false;
        }

        console.log('[SESSION] Session is valid');
        return true;
    } catch (error) {
        console.log('[SESSION] Session validation failed:', error.message);
        return false;
    } finally {
        await browser.close();
    }
}

// ============================================================================
// DOWNLOAD MODULE
// ============================================================================

async function performDownload() {
    console.log('[DOWNLOAD] Starting download process...');

    if (!fs.existsSync(DOWNLOADS_DIR)) {
        fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
        console.log('[DOWNLOAD] Created downloads directory');
    }

    if (!fs.existsSync(AUTH_STATE_FILE)) {
        throw new Error('[DOWNLOAD] auth.json not found after login');
    }

    const browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        storageState: AUTH_STATE_FILE,
        userAgent: WINDOWS_UA,
        viewport: { width: 1920, height: 1080 },
        acceptDownloads: true
    });

    const page = await context.newPage();

    try {
        console.log('[DOWNLOAD] Navigating to https://obsidian.md/download');
        await page.goto('https://obsidian.md/download', { waitUntil: 'networkidle' });

        const currentUrl = page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
            throw new Error('[DOWNLOAD] Session expired during download');
        }

        console.log('[DOWNLOAD] Session validated, looking for download button...');

        await page.waitForLoadState('networkidle', { timeout: 30000 });

        const downloadLink = page.locator(
            'a[href*=".exe"], ' +
            'a[href*="win"], ' +
            'a[href*="windows"], ' +
            'a:has-text("Download for Windows"), ' +
            'a:has-text("Download Windows"), ' +
            'button:has-text("Download"), ' +
            'a.button:has-text("Download")'
        ).first();

        console.log('[DOWNLOAD] Waiting for download button...');
        await downloadLink.waitFor({ state: 'visible', timeout: 30000 });

        console.log('[DOWNLOAD] Initiating download...');

        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            downloadLink.click()
        ]);

        const suggestedFilename = download.suggestedFilename() || 'obsidian-setup.exe';
        const savePath = path.join(DOWNLOADS_DIR, suggestedFilename);

        console.log(`[DOWNLOAD] Saving to ${savePath}`);
        await download.saveAs(savePath);

        console.log('[DOWNLOAD] Download completed successfully!');
        console.log(`[DOWNLOAD] File saved: ${savePath}`);

        return savePath;
    } catch (error) {
        console.error('[DOWNLOAD] Error:', error.message);
        const screenshotPath = path.join(__dirname, 'error-debug.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.error(`[DOWNLOAD] Screenshot saved to ${screenshotPath}`);
        throw error;
    } finally {
        await browser.close();
    }
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

async function main() {
    console.log('='.repeat(60));
    console.log('OBSIDIAN DOWNLOADER ORCHESTRATOR');
    console.log('='.repeat(60));

    try {
        // Step 1: Check session validity
        const sessionValid = await isSessionValid();

        if (!sessionValid) {
            console.log('\n[ORCHESTRATOR] Session invalid or missing. Starting login...');
            await performLogin();
            console.log('[ORCHESTRATOR] Login completed successfully\n');
        } else {
            console.log('\n[ORCHESTRATOR] Session is valid, skipping login\n');
        }

        // Step 2: Perform download
        console.log('[ORCHESTRATOR] Starting download flow...');
        const downloadedPath = await performDownload();

        console.log('\n' + '='.repeat(60));
        console.log('FLOW COMPLETED SUCCESSFULLY');
        console.log('Downloaded file:', downloadedPath);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('FLOW FAILED');
        console.error('Error:', error.message);
        console.error('='.repeat(60));
        process.exit(1);
    }
}

main();
