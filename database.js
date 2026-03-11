const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');

let db = null;

/**
 * Initialize database connection and create tables if needed
 */
function initDatabase() {
    if (db) {
        return db;
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Create downloads table if not exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('success', 'failed'))
        )
    `);

    // Create index for faster lookups
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_downloads_filename_timestamp 
        ON downloads(filename, timestamp)
    `);

    console.log('[DATABASE] Initialized successfully');
    return db;
}

/**
 * Check if a file was successfully downloaded in the last 24 hours
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if file was downloaded successfully in last 24 hours
 */
function wasRecentlyDownloaded(filename) {
    const database = initDatabase();
    
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    const stmt = database.prepare(`
        SELECT COUNT(*) as count 
        FROM downloads 
        WHERE filename = ? 
        AND status = 'success' 
        AND timestamp > ?
    `);
    
    const result = stmt.get(filename, twentyFourHoursAgo);
    
    return result.count > 0;
}

/**
 * Log a download attempt to the database
 * @param {string} filename - The filename that was downloaded
 * @param {string} status - 'success' or 'failed'
 */
function logDownload(filename, status) {
    const database = initDatabase();
    
    const stmt = database.prepare(`
        INSERT INTO downloads (filename, timestamp, status)
        VALUES (?, ?, ?)
    `);
    
    stmt.run(filename, Date.now(), status);
    
    console.log(`[DATABASE] Logged download: ${filename} - ${status}`);
}

/**
 * Get download history for a specific file
 * @param {string} filename - The filename to look up
 * @returns {Array} - Array of download records
 */
function getDownloadHistory(filename) {
    const database = initDatabase();
    
    const stmt = database.prepare(`
        SELECT id, filename, timestamp, status
        FROM downloads
        WHERE filename = ?
        ORDER BY timestamp DESC
    `);
    
    return stmt.all(filename);
}

/**
 * Get all recent downloads (last 24 hours)
 * @returns {Array} - Array of recent download records
 */
function getRecentDownloads() {
    const database = initDatabase();
    
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    const stmt = database.prepare(`
        SELECT id, filename, timestamp, status
        FROM downloads
        WHERE timestamp > ?
        ORDER BY timestamp DESC
    `);
    
    return stmt.all(twentyFourHoursAgo);
}

/**
 * Close database connection
 */
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        console.log('[DATABASE] Connection closed');
    }
}

module.exports = {
    initDatabase,
    wasRecentlyDownloaded,
    logDownload,
    getDownloadHistory,
    getRecentDownloads,
    closeDatabase
};
