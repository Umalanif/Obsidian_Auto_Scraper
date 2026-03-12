const { initDatabase, getDownloadHistory, getRecentDownloads, closeDatabase, getRecentSessions, getSession } = require('./database');
const { getAppLogger } = require('./logger');

const logger = getAppLogger();

// Initialize database
initDatabase();

logger.info('='.repeat(60), { module: 'DOWNLOAD_HISTORY' });
logger.info('DOWNLOAD HISTORY', { module: 'DOWNLOAD_HISTORY' });
logger.info('='.repeat(60), { module: 'DOWNLOAD_HISTORY' });

// Show recent sessions (audit trail)
const recentSessions = getRecentSessions();

if (recentSessions.length === 0) {
    logger.info('No download sessions in the last 24 hours.', { module: 'DOWNLOAD_HISTORY' });
} else {
    logger.info(`AUDIT TRAIL - Sessions (last 24h): ${recentSessions.length}`, { module: 'DOWNLOAD_HISTORY' });
    logger.info('-'.repeat(60), { module: 'DOWNLOAD_HISTORY' });

    recentSessions.forEach(session => {
        const startTime = new Date(session.session_start);
        const endTime = session.session_end ? new Date(session.session_end) : 'N/A';
        const duration = session.session_end 
            ? Math.round((session.session_end - session.session_start) / 1000) + 's' 
            : 'active';
        const statusIcon = session.status === 'completed' ? '✓' : session.status === 'failed' ? '✗' : '⟳';
        
        logger.info(`${statusIcon} Session #${session.id}`, { module: 'DOWNLOAD_HISTORY' });
        logger.info(`   Start: ${startTime.toLocaleString()}`, { module: 'DOWNLOAD_HISTORY' });
        logger.info(`   End:   ${endTime}`, { module: 'DOWNLOAD_HISTORY' });
        logger.info(`   Duration: ${duration}`, { module: 'DOWNLOAD_HISTORY' });
        logger.info(`   Downloads: ${session.total_downloads}`, { module: 'DOWNLOAD_HISTORY' });
        logger.info(`   Total Size: ${(session.total_bytes / 1024 / 1024).toFixed(2)} MB`, { module: 'DOWNLOAD_HISTORY' });
        logger.info('-'.repeat(60), { module: 'DOWNLOAD_HISTORY' });
    });
}

// Show recent downloads (last 24 hours)
const recent = getRecentDownloads();

if (recent.length === 0) {
    logger.info('No downloads in the last 24 hours.', { module: 'DOWNLOAD_HISTORY' });
} else {
    logger.info(`Recent downloads (last 24 hours): ${recent.length}`, { module: 'DOWNLOAD_HISTORY' });
    logger.info('-'.repeat(60), { module: 'DOWNLOAD_HISTORY' });

    recent.forEach(record => {
        const date = new Date(record.timestamp);
        const statusIcon = record.status === 'success' ? '✓' : '✗';
        logger.info(`${statusIcon} [${date.toLocaleString()}] ${record.filename} (${record.status})`, { module: 'DOWNLOAD_HISTORY' });
    });
}

// Show all-time stats
const allDownloads = getDownloadHistory('');
logger.info('='.repeat(60), { module: 'DOWNLOAD_HISTORY' });
logger.info('STATISTICS', { module: 'DOWNLOAD_HISTORY' });
logger.info('='.repeat(60), { module: 'DOWNLOAD_HISTORY' });

// Get unique filenames
const uniqueFiles = new Set();
const successCount = recent.filter(r => r.status === 'success').length;
const failedCount = recent.filter(r => r.status === 'failed').length;

logger.info(`Total downloads (24h): ${recent.length}`, { module: 'DOWNLOAD_HISTORY' });
logger.info(`Successful: ${successCount}`, { module: 'DOWNLOAD_HISTORY' });
logger.info(`Failed: ${failedCount}`, { module: 'DOWNLOAD_HISTORY' });

closeDatabase();
