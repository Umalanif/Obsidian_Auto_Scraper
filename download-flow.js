const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const AUTH_STATE_FILE = path.join(__dirname, 'auth.json');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Windows 10 User-Agent
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function downloadFlow() {
    console.log('[DOWNLOAD FLOW] Starting download process...');

    // Ensure downloads directory exists
    if (!fs.existsSync(DOWNLOADS_DIR)) {
        fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
        console.log('[DOWNLOAD FLOW] Created downloads directory');
    }

    // Check if auth file exists
    if (!fs.existsSync(AUTH_STATE_FILE)) {
        console.error('[DOWNLOAD FLOW] Session expired. Run auth-setup.js first.');
        process.exit(1);
    }

    console.log('[DOWNLOAD FLOW] Loading session from auth.json...');

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
        // Navigate to download page
        console.log('[DOWNLOAD FLOW] Navigating to https://obsidian.md/download');
        await page.goto('https://obsidian.md/download', { waitUntil: 'networkidle' });

        // Check if session is valid (not redirected to login)
        const currentUrl = page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
            console.error('[DOWNLOAD FLOW] Session expired. Run auth-setup.js first.');
            process.exit(1);
        }

        console.log('[DOWNLOAD FLOW] Session validated, looking for download button...');

        // Debug: log page content
        const pageTitle = await page.title();
        console.log(`[DOWNLOAD FLOW] Page title: ${pageTitle}`);
        console.log(`[DOWNLOAD FLOW] Current URL: ${page.url()}`);

        // Wait for page to fully load
        await page.waitForLoadState('networkidle', { timeout: 30000 });

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

        // Wait for download link to be visible
        console.log('[DOWNLOAD FLOW] Waiting for download button to be visible...');
        await downloadLink.waitFor({ state: 'visible', timeout: 30000 });
        
        console.log('[DOWNLOAD FLOW] Initiating download...');
        
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            downloadLink.click()
        ]);

        console.log('[DOWNLOAD FLOW] Download started...');

        // Get suggested filename
        const suggestedFilename = download.suggestedFilename() || 'obsidian-setup.exe';
        const savePath = path.join(DOWNLOADS_DIR, suggestedFilename);

        console.log(`[DOWNLOAD FLOW] Saving to ${savePath}`);

        // Save the download
        await download.saveAs(savePath);
        
        console.log('[DOWNLOAD FLOW] Download completed successfully!');
        console.log(`[DOWNLOAD FLOW] File saved: ${savePath}`);

    } catch (error) {
        console.error('[DOWNLOAD FLOW] Error:', error.message);
        
        // Take screenshot on error
        const screenshotPath = path.join(__dirname, 'error-debug.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.error(`[DOWNLOAD FLOW] Screenshot saved to ${screenshotPath}`);
        
        throw error;
    } finally {
        await browser.close();
    }
}

downloadFlow().catch(err => {
    console.error('[DOWNLOAD FLOW] Fatal error:', err);
    process.exit(1);
});
