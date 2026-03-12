# ENV Configuration Guide

## Overview

All configuration settings have been moved to `.env` file. The code now reads from environment variables, making it portable across different computers without code changes.

## Quick Start

1. Copy `.env.example` to `.env`
2. Fill in your credentials in `.env`
3. Adjust paths and settings as needed
4. Run `npm start`

## Configuration Categories

### 1. Authentication (Required)

```env
OBSIDIAN_EMAIL=your-email@example.com
OBSIDIAN_PASSWORD=your-password
```

### 2. Telegram Notifications (Optional)

```env
TELEGRAM_USER_ID=7865462329
TELEGRAM_BOT_TOKEN=8600722199:AAHPjlz5uvD_-sm8zbhGyboYy_cgkA59U9Y
```

### 3. Paths Configuration

All paths are relative to project root. Change these when moving to a different computer:

```env
# Auth state file (default: ./auth.json)
AUTH_STATE_FILE=./auth.json

# Downloads directory (default: ./downloads)
DOWNLOADS_DIR=./downloads

# Database file (default: ./database.db)
DATABASE_PATH=./database.db

# Log file (default: ./app.log)
LOG_FILE=./app.log
```

**Example for different computer:**
```env
AUTH_STATE_FILE=C:\Users\YourName\AppData\Obsidian\auth.json
DOWNLOADS_DIR=D:\Downloads\Obsidian
DATABASE_PATH=C:\Users\YourName\AppData\Obsidian\database.db
LOG_FILE=C:\Users\YourName\AppData\Obsidian\app.log
```

### 4. Browser Configuration

```env
# Debug mode - shows browser window (default: false)
DEBUG=false

# Custom User-Agent (optional)
WINDOWS_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
```

### 5. Scheduler Configuration

```env
# Enable/disable automatic scheduler (default: true)
ENABLE_CRON=true

# Cron schedule (default: every 6 hours)
CRON_SCHEDULE=0 */6 * * *
```

**Common schedules:**
- `0 9 * * *` - Every day at 9 AM
- `0 */4 * * *` - Every 4 hours
- `0 0 * * 1` - Every Monday at midnight
- `0 0 * * *` - Every day at midnight

### 6. Logging Configuration

```env
# Log level: error, warn, info, debug (default: info)
LOG_LEVEL=info

# Max log file size in bytes (default: 10MB)
LOG_MAX_SIZE=10485760

# Number of rotated log files (default: 5)
LOG_MAX_FILES=5
```

### 7. Retry Configuration (Advanced)

```env
# Maximum retry attempts (default: 3)
RETRY_MAX_RETRIES=3

# Base delay between retries in ms (default: 1000)
RETRY_BASE_DELAY=1000

# Maximum delay between retries in ms (default: 30000)
RETRY_MAX_DELAY=30000

# Exponential backoff factor (default: 2)
RETRY_EXPONENTIAL_FACTOR=2

# Add random jitter (default: true)
RETRY_JITTER=true
```

### 8. Timeout Configuration (Advanced)

```env
# Navigation timeout in ms (default: 30000)
TIMEOUT_NAVIGATION=30000

# Selector wait timeout in ms (default: 10000)
TIMEOUT_SELECTOR=10000

# Download timeout in ms (default: 60000)
TIMEOUT_DOWNLOAD=60000

# Action timeout (click/fill) in ms (default: 15000)
TIMEOUT_ACTION=15000

# Screenshot timeout in ms (default: 10000)
TIMEOUT_SCREENSHOT=10000

# Storage state timeout in ms (default: 15000)
TIMEOUT_STORAGE_STATE=15000
```

### 9. Database Configuration

```env
# Enable download history (default: true)
ENABLE_DOWNLOAD_HISTORY=true

# Hours for skip protection (default: 24)
DOWNLOAD_SKIP_HOURS=24
```

## Migration Guide

### Moving to Another Computer

1. **Copy your project folder** to the new computer
2. **Edit `.env`** file and update paths:
   ```env
   DOWNLOADS_DIR=C:\Users\YourName\Downloads
   DATABASE_PATH=C:\Users\YourName\AppData\Obsidian\database.db
   ```
3. **Run `npm install`** to install dependencies
4. **Run `npm start`** to authenticate and download

### No Code Changes Required

All configuration is now in `.env`. You never need to modify JavaScript files for:
- Different file paths
- Different schedules
- Different timeout values
- Different log levels

## Files Modified

- `config.js` - Central configuration loader (NEW)
- `logger.js` - Now reads `LOG_FILE`, `LOG_MAX_SIZE`, `LOG_MAX_FILES` from env
- `database.js` - Now reads `DATABASE_PATH`, `DOWNLOAD_SKIP_HOURS` from env
- `retry-utils.js` - Now reads all retry/timeout settings from env
- `index.js` - Now uses centralized config for all settings
- `download-flow.js` - Now uses centralized config for all settings
- `.env` - Your personal configuration (gitignored)
- `.env.example` - Template with all options documented

## Benefits

✅ **Portable** - Move to any computer, just edit `.env`
✅ **Secure** - Credentials in `.env` (gitignored), not in code
✅ **Flexible** - Change behavior without touching code
✅ **Maintainable** - Single source of truth for configuration
✅ **Documented** - `.env.example` shows all options with defaults
