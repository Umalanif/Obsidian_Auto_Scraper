const { initDatabase, getDownloadHistory, getRecentDownloads, closeDatabase } = require('./database');

// Initialize database
initDatabase();

console.log('='.repeat(60));
console.log('DOWNLOAD HISTORY');
console.log('='.repeat(60));

// Show recent downloads (last 24 hours)
const recent = getRecentDownloads();

if (recent.length === 0) {
    console.log('\nNo downloads in the last 24 hours.');
} else {
    console.log(`\nRecent downloads (last 24 hours): ${recent.length}`);
    console.log('-'.repeat(60));
    
    recent.forEach(record => {
        const date = new Date(record.timestamp);
        const statusIcon = record.status === 'success' ? '✓' : '✗';
        console.log(`${statusIcon} [${date.toLocaleString()}] ${record.filename} (${record.status})`);
    });
}

// Show all-time stats
const allDownloads = getDownloadHistory('');
console.log('\n' + '='.repeat(60));
console.log('STATISTICS');
console.log('='.repeat(60));

// Get unique filenames
const uniqueFiles = new Set();
const successCount = recent.filter(r => r.status === 'success').length;
const failedCount = recent.filter(r => r.status === 'failed').length;

console.log(`Total downloads (24h): ${recent.length}`);
console.log(`Successful: ${successCount}`);
console.log(`Failed: ${failedCount}`);

closeDatabase();
