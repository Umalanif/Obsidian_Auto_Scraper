const { chromium } = require('playwright');
const path = require('path');
require('dotenv').config();

const AUTH_STATE_FILE = path.join(__dirname, 'auth.json');

async function setupAuth() {
    console.log('[AUTH SETUP] Starting authentication flow...');
    
    const browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
        // Navigate to Obsidian login page
        console.log('[AUTH SETUP] Navigating to https://obsidian.md/account');
        await page.goto('https://obsidian.md/account', { waitUntil: 'networkidle' });

        // Check if already logged in (look for unique logged-in state elements)
        const isLoggedIn = await page.$('text="Log out"');
        if (isLoggedIn) {
            console.log('[AUTH SETUP] Already logged in, saving session...');
        } else {
            // Fill login form
            console.log('[AUTH SETUP] Filling login form...');
            
            // Debug: log page content for selector analysis
            const pageTitle = await page.title();
            console.log(`[AUTH SETUP] Page title: ${pageTitle}`);
            console.log(`[AUTH SETUP] Current URL: ${page.url()}`);
            
            // Use more flexible selectors for Obsidian login form
            const emailInput = page.locator('input[name="email"], input[type="email"], input[placeholder*="email" i], input[placeholder*="Email"]');
            const passwordInput = page.locator('input[name="password"], input[type="password"], input[placeholder*="password" i]');
            
            // Try multiple submit button selectors
            const submitButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), input[type="submit"], .login-button');

            // Wait for inputs to be visible
            await emailInput.first().waitFor({ state: 'visible', timeout: 10000 });
            await passwordInput.first().waitFor({ state: 'visible', timeout: 10000 });
            
            await emailInput.first().fill(process.env.OBSIDIAN_EMAIL);
            await passwordInput.first().fill(process.env.OBSIDIAN_PASSWORD);
            
            console.log('[AUTH SETUP] Submitting credentials...');
            await submitButton.first().waitFor({ state: 'visible', timeout: 10000 });
            await submitButton.first().click();

            // Wait for successful login using unique elements that indicate logged-in state
            console.log('[AUTH SETUP] Waiting for successful authentication...');
            await page.waitForSelector('text="Log out"', { timeout: 30000 });
            console.log('[AUTH SETUP] Authentication successful!');
        }

        // Save storage state
        console.log(`[AUTH SETUP] Saving session to ${AUTH_STATE_FILE}`);
        await context.storageState({ path: AUTH_STATE_FILE });
        
        console.log('[AUTH SETUP] Session saved successfully!');
        console.log('[AUTH SETUP] You can now run download-flow.js');

    } catch (error) {
        console.error('[AUTH SETUP] Error:', error.message);
        
        // Take screenshot on error
        const screenshotPath = path.join(__dirname, 'error-debug.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.error(`[AUTH SETUP] Screenshot saved to ${screenshotPath}`);
        
        throw error;
    } finally {
        await browser.close();
    }
}

setupAuth().catch(err => {
    console.error('[AUTH SETUP] Fatal error:', err);
    process.exit(1);
});
