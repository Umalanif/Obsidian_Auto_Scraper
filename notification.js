const https = require('https');

/**
 * Send a message to Telegram
 * @param {string} message - The message to send
 * @returns {Promise<boolean>} - Success status
 */
async function sendTelegramMessage(message) {
    const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!TELEGRAM_USER_ID || !TELEGRAM_BOT_TOKEN) {
        console.warn('[TELEGRAM] Credentials not configured. Skipping notification.');
        return false;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const postData = JSON.stringify({
        chat_id: TELEGRAM_USER_ID,
        text: message,
        parse_mode: 'HTML'
    });

    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                const response = JSON.parse(data);
                if (response.ok) {
                    console.log('[TELEGRAM] Message sent successfully');
                    resolve(true);
                } else {
                    console.error('[TELEGRAM] API error:', response.description);
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            console.error('[TELEGRAM] Request error:', e.message);
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Send success notification
 * @param {string} filename - Downloaded filename
 * @returns {Promise<boolean>}
 */
async function notifySuccess(filename) {
    const message = `✅ Файл <b>${escapeHtml(filename)}</b> успешно скачан и сохранен.`;
    console.log(`[TELEGRAM] Sending success notification...`);
    return sendTelegramMessage(message);
}

/**
 * Send already downloaded notification
 * @param {string} filename - Filename that was already downloaded
 * @returns {Promise<boolean>}
 */
async function notifyAlreadyDownloaded(filename) {
    const message = `ℹ️ Файл <b>${escapeHtml(filename)}</b> was already downloaded successfully in the last 24 hours`;
    console.log(`[TELEGRAM] Sending already downloaded notification...`);
    return sendTelegramMessage(message);
}

/**
 * Send error notification
 * @param {string} errorText - Error message
 * @returns {Promise<boolean>}
 */
async function notifyError(errorText) {
    const message = `❌ Ошибка при автоматизации: <b>${escapeHtml(errorText)}</b>`;
    console.log(`[TELEGRAM] Sending error notification...`);
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
    notifyError
};
