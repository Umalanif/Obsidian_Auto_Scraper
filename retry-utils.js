/**
 * Retry Utilities with Exponential Backoff
 * Provides retry mechanisms for network requests and Playwright actions
 */

const { chromium } = require('playwright');
const { createLogger } = require('./logger');

const logger = createLogger('RETRY');

/**
 * Parse integer from env with default value
 */
function parseIntEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined || value === '') return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean from env with default value
 */
function parseBoolEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined || value === '') return defaultValue;
    return value.toLowerCase() === 'true';
}

/**
 * Default retry configuration with HARD TIMEOUT LIMITS
 * Can be overridden with environment variables
 */
const DEFAULT_CONFIG = {
    maxRetries: parseIntEnv('RETRY_MAX_RETRIES', 3),
    baseDelay: parseIntEnv('RETRY_BASE_DELAY', 1000),
    maxDelay: parseIntEnv('RETRY_MAX_DELAY', 30000),
    exponentialFactor: parseIntEnv('RETRY_EXPONENTIAL_FACTOR', 2),
    jitter: parseBoolEnv('RETRY_JITTER', true),

    // HARD TIMEOUT LIMITS - prevents infinite hanging
    timeouts: {
        navigation: parseIntEnv('TIMEOUT_NAVIGATION', 30000),
        selector: parseIntEnv('TIMEOUT_SELECTOR', 10000),
        download: parseIntEnv('TIMEOUT_DOWNLOAD', 60000),
        action: parseIntEnv('TIMEOUT_ACTION', 15000),
        screenshot: parseIntEnv('TIMEOUT_SCREENSHOT', 10000),
        storageState: parseIntEnv('TIMEOUT_STORAGE_STATE', 15000),
    }
};

/**
 * Calculate delay with exponential backoff and optional jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {object} config - Retry configuration
 * @returns {number} - Delay in milliseconds
 */
function calculateDelay(attempt, config) {
    const { baseDelay, exponentialFactor, maxDelay, jitter } = config;
    
    // Exponential backoff: baseDelay * (exponentialFactor ^ attempt)
    const exponentialDelay = baseDelay * Math.pow(exponentialFactor, attempt);
    
    // Cap at maxDelay
    const cappedDelay = Math.min(exponentialDelay, maxDelay);
    
    // Add jitter (±25% randomness) to prevent thundering herd
    if (jitter) {
        const jitterRange = cappedDelay * 0.25;
        const jitterValue = (Math.random() * 2 - 1) * jitterRange;
        return Math.max(0, cappedDelay + jitterValue);
    }
    
    return cappedDelay;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 30000)
 * @param {boolean} options.exponentialFactor - Exponential factor (default: 2)
 * @param {boolean} options.jitter - Add jitter to delays (default: true)
 * @param {Function} options.onRetry - Callback called on each retry (attempt, error, delay)
 * @param {Function} options.shouldRetry - Custom predicate to determine if should retry (error) => boolean
 * @param {string} options.operationName - Name of operation for logging
 * @returns {Promise<any>} - Result of the function
 * @throws {Error} - Last error if all retries exhausted
 */
async function retryWithBackoff(fn, options = {}) {
    const config = {
        ...DEFAULT_CONFIG,
        ...options,
    };

    const { 
        maxRetries, 
        onRetry, 
        shouldRetry, 
        operationName = 'Operation' 
    } = config;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const delay = calculateDelay(attempt - 1, config);
                logger.info(`Retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms delay`, { operationName, attempt, delay: Math.round(delay) });

                if (onRetry) {
                    onRetry(attempt, lastError, delay);
                }

                await sleep(delay);
            }

            return await fn();
        } catch (error) {
            lastError = error;

            // Check if we should retry using custom predicate or default logic
            const canRetry = shouldRetry
                ? shouldRetry(error)
                : isRetryableError(error);

            if (!canRetry || attempt >= maxRetries) {
                logger.error(`Failed after ${attempt + 1} attempt(s): ${error.message}`, { operationName, attempts: attempt + 1, error: error.message });
                throw error;
            }

            logger.warn(`Attempt ${attempt + 1} failed: ${error.message}`, { operationName, attempt: attempt + 1, error: error.message });
        }
    }

    // Should never reach here, but just in case
    throw lastError;
}

/**
 * Determine if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} - True if error is retryable
 */
function isRetryableError(error) {
    if (!error) return false;

    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';

    // Network-related errors
    const retryableMessages = [
        'timeout',
        'network',
        'econnrefused',
        'econnreset',
        'enetunreach',
        'ephemeral',
        'socket hang up',
        'connection reset',
        'connection refused',
        'temporary failure',
        'abort',
        'fetch failed',
        'ssl',
        'certificate',
        'dns',
        'server unavailable',
        '503',
        '502',
        '504',
        '429',  // Rate limited - should retry with backoff
    ];

    const retryableCodes = [
        'econnrefused',
        'econnreset',
        'enetunreach',
        'eai_again',  // DNS lookup temporary failure
        'etimedout',
        'esockettimedout',
    ];

    // Check message and code for retryable patterns
    return retryableMessages.some(msg => message.includes(msg)) ||
           retryableCodes.some(c => code.includes(c));
}

/**
 * Retry Playwright navigation with backoff and HARD TIMEOUT
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} url - URL to navigate to
 * @param {object} options - Navigation options with retry config
 * @returns {Promise<import('playwright').Response>}
 */
async function retryNavigation(page, url, options = {}) {
    const { maxRetries = 3, timeout } = options;
    const navTimeout = timeout ?? DEFAULT_CONFIG.timeouts.navigation;

    return retryWithBackoff(
        async () => {
            return await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: navTimeout,
            });
        },
        {
            maxRetries,
            operationName: `Navigation to ${url}`,
        }
    );
}

/**
 * Retry Playwright element interaction with backoff and HARD TIMEOUT
 * @param {import('playwright').Locator} locator - Playwright locator
 * @param {string} action - Action to perform ('click', 'fill', 'waitFor')
 * @param {any} value - Value for fill actions
 * @param {object} options - Retry options
 * @returns {Promise<any>}
 */
async function retryElementAction(locator, action, value = null, options = {}) {
    const selectorTimeout = options.timeout ?? DEFAULT_CONFIG.timeouts.selector;
    const actionTimeout = options.actionTimeout ?? DEFAULT_CONFIG.timeouts.action;

    return retryWithBackoff(
        async () => {
            await locator.first().waitFor({ state: 'visible', timeout: selectorTimeout });

            switch (action) {
                case 'click':
                    return await locator.first().click({ timeout: actionTimeout });
                case 'fill':
                    return await locator.first().fill(value, { timeout: actionTimeout });
                case 'waitFor':
                    return await locator.first().waitFor({ state: 'visible', timeout: selectorTimeout });
                default:
                    throw new Error(`Unknown action: ${action}`);
            }
        },
        {
            maxRetries: options.maxRetries || 3,
            operationName: `Element ${action}`,
        }
    );
}

/**
 * Retry browser context creation with backoff
 * Useful for handling temporary browser initialization failures
 * @param {import('playwright').Browser} browser - Playwright browser instance
 * @param {object} contextOptions - Browser context options
 * @param {object} retryOptions - Retry configuration
 * @returns {Promise<import('playwright').BrowserContext>}
 */
async function retryCreateContext(browser, contextOptions = {}, retryOptions = {}) {
    return retryWithBackoff(
        async () => {
            return await browser.newContext(contextOptions);
        },
        {
            maxRetries: retryOptions.maxRetries || 3,
            operationName: 'Browser context creation',
        }
    );
}

/**
 * Retry browser launch with backoff
 * @param {object} launchOptions - Browser launch options
 * @param {object} retryOptions - Retry configuration
 * @returns {Promise<import('playwright').Browser>}
 */
async function retryLaunchBrowser(launchOptions = {}, retryOptions = {}) {
    return retryWithBackoff(
        async () => {
            return await chromium.launch(launchOptions);
        },
        {
            maxRetries: retryOptions.maxRetries || 3,
            operationName: 'Browser launch',
        }
    );
}

/**
 * Retry HTTPS request with backoff (for Telegram API, etc.)
 * @param {object} requestOptions - HTTPS request options
 * @param {string} postData - POST data
 * @param {object} retryOptions - Retry configuration
 * @returns {Promise<object>} - Parsed response
 */
async function retryHttpsRequest(requestOptions, postData, retryOptions = {}) {
    const https = require('https');

    return retryWithBackoff(
        async () => {
            return new Promise((resolve, reject) => {
                const req = https.request(requestOptions.url, {
                    method: requestOptions.method || 'POST',
                    headers: requestOptions.headers || {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data);
                            if (!response.ok) {
                                reject(new Error(`API error: ${response.description || 'Unknown error'}`));
                            } else {
                                resolve(response);
                            }
                        } catch (e) {
                            reject(new Error(`Failed to parse response: ${e.message}`));
                        }
                    });
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                if (postData) {
                    req.write(postData);
                }
                req.end();
            });
        },
        {
            maxRetries: retryOptions.maxRetries || 3,
            operationName: requestOptions.operationName || 'HTTPS request',
        }
    );
}

/**
 * Retry download action with backoff and HARD TIMEOUT
 * @param {import('playwright').Page} page - Playwright page
 * @param {import('playwright').Locator} downloadLinkLocator - Locator for download link
 * @param {object} retryOptions - Retry configuration
 * @returns {Promise<import('playwright').Download>}
 */
async function retryDownload(page, downloadLinkLocator, retryOptions = {}) {
    const downloadTimeout = retryOptions.timeout ?? DEFAULT_CONFIG.timeouts.download;

    return retryWithBackoff(
        async () => {
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: downloadTimeout }),
                downloadLinkLocator.first().click()
            ]);
            return download;
        },
        {
            maxRetries: retryOptions.maxRetries || 3,
            operationName: 'File download',
        }
    );
}

/**
 * Retry locator waitFor with backoff and HARD TIMEOUT
 * @param {import('playwright').Locator} locator - Playwright locator
 * @param {object} waitForOptions - Wait options
 * @param {object} retryOptions - Retry configuration
 * @returns {Promise<void>}
 */
async function retryWaitFor(locator, waitForOptions = {}, retryOptions = {}) {
    const selectorTimeout = waitForOptions.timeout ?? DEFAULT_CONFIG.timeouts.selector;

    return retryWithBackoff(
        async () => {
            await locator.first().waitFor({ ...waitForOptions, timeout: selectorTimeout });
        },
        {
            maxRetries: retryOptions.maxRetries || 3,
            operationName: 'Wait for element',
        }
    );
}

/**
 * Retry page screenshot with backoff and HARD TIMEOUT
 * @param {import('playwright').Page} page - Playwright page
 * @param {object} screenshotOptions - Screenshot options
 * @param {object} retryOptions - Retry configuration
 * @returns {Promise<Buffer>}
 */
async function retryScreenshot(page, screenshotOptions = {}, retryOptions = {}) {
    return retryWithBackoff(
        async () => {
            return await page.screenshot({
                ...screenshotOptions,
                timeout: DEFAULT_CONFIG.timeouts.screenshot
            });
        },
        {
            maxRetries: retryOptions.maxRetries || 3,
            operationName: 'Screenshot',
        }
    );
}

module.exports = {
    // Core retry function
    retryWithBackoff,
    isRetryableError,
    calculateDelay,
    sleep,
    
    // Playwright-specific retry helpers
    retryNavigation,
    retryElementAction,
    retryCreateContext,
    retryLaunchBrowser,
    retryDownload,
    retryWaitFor,
    retryScreenshot,
    
    // Network retry helpers
    retryHttpsRequest,
    
    // Default config
    DEFAULT_CONFIG,
};
