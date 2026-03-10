require('dotenv').config({ path: __dirname + '/.env' });
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Username:', process.env.LOGIN_USERNAME);
    console.log('Password:', process.env.LOGIN_PASSWORD);
    
    if (!process.env.LOGIN_USERNAME || !process.env.LOGIN_PASSWORD) {
      throw new Error('Missing credentials in .env file');
    }

    // Navigation
    console.log('Navigating to login page...');
    await page.goto('https://the-internet.herokuapp.com/login');

    // Authorization
    console.log('Entering credentials...');
    await page.fill('#username', process.env.LOGIN_USERNAME);
    await page.fill('#password', process.env.LOGIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Verification
    console.log('Waiting for success message...');
    await page.waitForSelector('#flash');
    const flashMessage = await page.textContent('#flash');
    
    if (!flashMessage.includes('You logged into a secure area!')) {
      throw new Error('Success message not found or invalid. Got: ' + flashMessage);
    }

    // Screenshot
    const timestamp = Date.now();
    const screenshotName = `login-success-${timestamp}.png`;
    const screenshotPath = path.join(__dirname, screenshotName);
    
    console.log('Taking success screenshot...');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotName}`);

    // Save authentication state
    console.log('Saving auth state...');
    await context.storageState({ path: path.join(__dirname, 'auth.json') });
    console.log('Auth state saved to auth.json');

    // Completion
    console.log('Login successful! Test passed.');
    
  } catch (error) {
    // Error handling
    const timestamp = Date.now();
    const errorScreenshotName = `login-error-${timestamp}.png`;
    const errorScreenshotPath = path.join(__dirname, errorScreenshotName);
    
    console.error('Test failed:', error.message);
    console.log('Taking error screenshot...');
    await page.screenshot({ path: errorScreenshotPath, fullPage: true });
    console.log(`Error screenshot saved: ${errorScreenshotName}`);
    
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
