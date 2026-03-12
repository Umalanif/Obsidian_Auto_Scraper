const Database = require('better-sqlite3');
const path = require('path');
const { createLogger } = require('./logger');

const logger = createLogger('DATABASE');

const DB_PATH = process.env.DATABASE_PATH ? 
    (path.isAbsolute(process.env.DATABASE_PATH) ? process.env.DATABASE_PATH : path.join(__dirname, process.env.DATABASE_PATH.replace(/^\.\//, ''))) :
    path.join(__dirname, 'database.db');

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
            timestamp_text TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('success', 'failed'))
        )
    `);

    // Add new columns for audit trail (migration for existing databases)
    // Check if columns exist before adding (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
    try {
        db.exec(`ALTER TABLE downloads ADD COLUMN session_start INTEGER`);
    } catch (e) {
        // Column already exists, ignore
    }

    try {
        db.exec(`ALTER TABLE downloads ADD COLUMN file_size INTEGER DEFAULT 0`);
    } catch (e) {
        // Column already exists, ignore
    }

    // Add timestamp_text column for human-readable timestamps (migration)
    try {
        db.exec(`ALTER TABLE downloads ADD COLUMN timestamp_text TEXT`);
        // Backfill existing records with formatted timestamp
        db.exec(`
            UPDATE downloads 
            SET timestamp_text = datetime(timestamp / 1000, 'unixepoch', 'localtime')
            WHERE timestamp_text IS NULL
        `);
    } catch (e) {
        // Column already exists, ignore
    }

    // Create sessions table for audit trail
    db.exec(`
        CREATE TABLE IF NOT EXISTS download_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_start INTEGER NOT NULL,
            session_start_text TEXT,
            session_end INTEGER,
            session_end_text TEXT,
            total_downloads INTEGER DEFAULT 0,
            total_bytes INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'failed'))
        )
    `);

    // Add timestamp_text columns for human-readable timestamps (migration)
    try {
        db.exec(`ALTER TABLE download_sessions ADD COLUMN session_start_text TEXT`);
        db.exec(`ALTER TABLE download_sessions ADD COLUMN session_end_text TEXT`);
        // Backfill existing records with formatted timestamps
        db.exec(`
            UPDATE download_sessions 
            SET session_start_text = datetime(session_start / 1000, 'unixepoch', 'localtime'),
                session_end_text = datetime(session_end / 1000, 'unixepoch', 'localtime')
            WHERE session_start_text IS NULL AND session_start IS NOT NULL
        `);
    } catch (e) {
        // Columns already exist, ignore
    }

    // Create index for faster lookups
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_downloads_filename_timestamp
        ON downloads(filename, timestamp)
    `);

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_start_end
        ON download_sessions(session_start, session_end)
    `);

    logger.info('Initialized successfully');
    return db;
}

/**
 * Check if a file was successfully downloaded in the last 24 hours (configurable via env)
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if file was downloaded successfully in last 24 hours
 */
function wasRecentlyDownloaded(filename) {
    const database = initDatabase();

    const skipHours = process.env.DOWNLOAD_SKIP_HOURS ? parseInt(process.env.DOWNLOAD_SKIP_HOURS, 10) : 24;
    const skipMs = (isNaN(skipHours) ? 24 : skipHours) * 60 * 60 * 1000;
    const thresholdAgo = Date.now() - skipMs;

    const stmt = database.prepare(`
        SELECT COUNT(*) as count
        FROM downloads
        WHERE filename = ?
        AND status = 'success'
        AND timestamp > ?
    `);

    const result = stmt.get(filename, thresholdAgo);

    return result.count > 0;
}

/**
 * Log a download attempt to the database
 * @param {string} filename - The filename that was downloaded
 * @param {string} status - 'success' or 'failed'
 * @param {number} sessionId - Optional session ID to associate with
 * @param {number} fileSize - Optional file size in bytes
 */
function logDownload(filename, status, sessionId = null, fileSize = 0) {
    const database = initDatabase();

    const now = Date.now();
    const timestampText = new Date(now).toISOString().replace('T', ' ').substring(0, 19);

    const stmt = database.prepare(`
        INSERT INTO downloads (filename, timestamp, timestamp_text, status, session_start, file_size)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(filename, now, timestampText, status, sessionId, fileSize);

    logger.info(`Logged download: ${filename} - ${status} (${fileSize} bytes)`, { module: 'DATABASE' });

    // Update session stats if sessionId provided
    if (sessionId && status === 'success') {
        updateSessionStats(sessionId, fileSize);
    }
}

/**
 * Start a new download session for audit trail
 * @returns {number} - Session ID
 */
function startSession() {
    const database = initDatabase();

    const now = Date.now();
    const timestampText = new Date(now).toISOString().replace('T', ' ').substring(0, 19);

    const stmt = database.prepare(`
        INSERT INTO download_sessions (session_start, session_start_text, status)
        VALUES (?, ?, 'active')
    `);

    const result = stmt.run(now, timestampText);
    logger.info(`Started audit session: ${result.lastInsertRowid}`, { module: 'DATABASE' });
    return result.lastInsertRowid;
}

/**
 * End a download session
 * @param {number} sessionId - Session ID to end
 * @param {string} status - 'completed' or 'failed'
 */
function endSession(sessionId, status = 'completed') {
    const database = initDatabase();

    const now = Date.now();
    const timestampText = new Date(now).toISOString().replace('T', ' ').substring(0, 19);

    const stmt = database.prepare(`
        UPDATE download_sessions
        SET session_end = ?, session_end_text = ?, status = ?
        WHERE id = ?
    `);

    stmt.run(now, timestampText, status, sessionId);
    logger.info(`Ended audit session: ${sessionId} - ${status}`, { module: 'DATABASE' });
}

/**
 * Update session statistics after a successful download
 * @param {number} sessionId - Session ID to update
 * @param {number} fileSize - File size in bytes to add
 */
function updateSessionStats(sessionId, fileSize) {
    const database = initDatabase();

    const stmt = database.prepare(`
        UPDATE download_sessions
        SET total_downloads = total_downloads + 1,
            total_bytes = total_bytes + ?
        WHERE id = ?
    `);

    stmt.run(fileSize, sessionId);
}

/**
 * Get session audit trail
 * @param {number} sessionId - Session ID to retrieve
 * @returns {Object|null} - Session record
 */
function getSession(sessionId) {
    const database = initDatabase();

    const stmt = database.prepare(`
        SELECT * FROM download_sessions
        WHERE id = ?
    `);

    return stmt.get(sessionId);
}

/**
 * Get all recent sessions (last 24 hours)
 * @returns {Array} - Array of session records
 */
function getRecentSessions() {
    const database = initDatabase();

    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    const stmt = database.prepare(`
        SELECT * FROM download_sessions
        WHERE session_start > ?
        ORDER BY session_start DESC
    `);

    return stmt.all(twentyFourHoursAgo);
}

/**
 * Get download history for a specific file
 * @param {string} filename - The filename to look up
 * @returns {Array} - Array of download records
 */
function getDownloadHistory(filename) {
    const database = initDatabase();

    const stmt = database.prepare(`
        SELECT id, filename, timestamp, timestamp_text, status
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
        SELECT id, filename, timestamp, timestamp_text, status
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
        logger.info('Connection closed');
    }
}

module.exports = {
    initDatabase,
    wasRecentlyDownloaded,
    logDownload,
    getDownloadHistory,
    getRecentDownloads,
    closeDatabase,
    startSession,
    endSession,
    getSession,
    getRecentSessions
};
