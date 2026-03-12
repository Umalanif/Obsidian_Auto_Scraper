const https = require('https');
const { retryWithBackoff, retryHttpsRequest } = require('./retry-utils');
const { createLogger } = require('./logger');

const logger = createLogger('TELEGRAM');

// Retry configuration for notifications (shorter delays for better UX)
const NOTIFICATION_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 500,
    maxDelay: 10000,
    exponentialFactor: 2,
    jitter: true,
};

/**
 * Send a message to Telegram
 * @param {string} message - The message to send
 * @returns {Promise<boolean>} - Success status
 */
async function sendTelegramMessage(message) {
    const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!TELEGRAM_USER_ID || !TELEGRAM_BOT_TOKEN) {
        logger.warn('Telegram credentials not configured. Skipping notification.');
        return false;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const postData = JSON.stringify({
        chat_id: TELEGRAM_USER_ID,
        text: message,
        parse_mode: 'HTML'
    });

    try {
        const response = await retryHttpsRequest(
            {
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                operationName: 'Telegram notification'
            },
            postData,
            NOTIFICATION_RETRY_CONFIG
        );

        logger.info('Message sent successfully');
        return true;
    } catch (error) {
        logger.error(`Failed to send message after retries: ${error.message}`);
        return false;
    }
}

/**
 * Send success notification
 * @param {string} filename - Downloaded filename
 * @returns {Promise<boolean>}
 */
async function notifySuccess(filename) {
    const message = `✅ Файл <b>${escapeHtml(filename)}</b> успешно скачан и сохранен.`;
    logger.info('Sending success notification...');
    return sendTelegramMessage(message);
}

/**
 * Send already downloaded notification
 * @param {string} filename - Filename that was already downloaded
 * @returns {Promise<boolean>}
 */
async function notifyAlreadyDownloaded(filename) {
    const message = `ℹ️ Файл <b>${escapeHtml(filename)}</b> was already downloaded successfully in the last 24 hours`;
    logger.info('Sending already downloaded notification...');
    return sendTelegramMessage(message);
}

/**
 * Send error notification
 * @param {string} errorText - Error message
 * @returns {Promise<boolean>}
 */
async function notifyError(errorText) {
    const message = `❌ Ошибка при автоматизации: <b>${escapeHtml(errorText)}</b>`;
    logger.info('Sending error notification...');
    return sendTelegramMessage(message);
}

/**
 * Send critical error notification (global handler)
 * @param {string} errorText - Error message
 * @param {string} stack - Error stack trace
 * @returns {Promise<boolean>}
 */
async function notifyCriticalError(errorText, stack) {
    const message = `🚨 <b>CRITICAL ERROR</b>\n\n` +
        `❌ <b>Error:</b> ${escapeHtml(errorText)}\n\n` +
        `📋 <b>Stack trace:</b>\n<code>${escapeHtml(stack || 'No stack trace')}</code>\n\n` +
        `⚠️ Browser forced to close. Process terminating.`;
    logger.info('Sending CRITICAL error notification...');
    return sendTelegramMessage(message);
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string}
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

module.exports = {
    sendTelegramMessage,
    notifySuccess,
    notifyAlreadyDownloaded,
    notifyError,
    notifyCriticalError
};
