require('dotenv').config({ path: __dirname + '/.env' });
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const authPath = path.join(__dirname, 'auth.json');
  
  if (!fs.existsSync(authPath)) {
    console.error('auth.json not found. Run login.js first.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: authPath });
  const page = await context.newPage();

  try {
    console.log('Navigating to secure area...');
    await page.goto('https://the-internet.herokuapp.com/secure');
    await page.waitForLoadState('networkidle');
    
    console.log('Checking session validity...');
    const url = page.url();
    
    if (url.includes('/secure')) {
      console.log('Session is valid! User is authenticated on secure page.');
    } else {
      console.log('Session invalid. Redirected to:', url);
    }

    const flashElement = await page.$('#flash');
    if (flashElement) {
      const flashMessage = await flashElement.textContent();
      console.log('Flash message:', flashMessage.trim());
    }

    const timestamp = Date.now();
    const screenshotName = `secure-area-${timestamp}.png`;
    const screenshotPath = path.join(__dirname, screenshotName);
    
    console.log('Taking screenshot...');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotName}`);

    console.log('Check complete!');
    
  } catch (error) {
    console.error('Session check failed:', error.message);
    
    const timestamp = Date.now();
    const errorScreenshotName = `session-error-${timestamp}.png`;
    const errorScreenshotPath = path.join(__dirname, errorScreenshotName);
    
    await page.screenshot({ path: errorScreenshotPath, fullPage: true });
    console.log(`Error screenshot saved: ${errorScreenshotName}`);
    
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
