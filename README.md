# Obsidian Downloader

Automated authentication and download system for Obsidian.md distribution using Playwright.

## Prerequisites

- Node.js (v16 or higher)
- npm

## Installation

1. **Install dependencies:**

```bash
npm install
```

2. **Install Playwright browsers:**

```bash
npx playwright install
```

3. **Configure environment variables:**

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your Obsidian account credentials.

## Usage

### Run Full Flow (Recommended)

Run the complete authentication and download flow with a single command:

```bash
npm start
```

This will:
1. Check if your session is still valid
2. Automatically log in if session expired
3. Download the latest Obsidian installer
4. Track download history (24-hour protection against duplicates)

### Run Automatic Scheduler (Background Mode)

Start the scheduler for automatic periodic downloads:

```bash
npm run scheduler
```

Or run with explicit scheduler flag:

```bash
node index.js --scheduler
```

The scheduler will:
- Run the download flow immediately on startup
- Execute automatically based on the cron schedule (default: every 6 hours)
- Keep running in the background until you press `Ctrl+C`
- Send Telegram notifications on success/error

### Download Only

Run download flow with existing session:

```bash
npm run download
```

### View Download History

Check the download history database:

```bash
npm run history
```

### Cleanup

Remove legacy files after refactoring:

```bash
npm run cleanup
```

## Project Structure

- `index.js` - **Main entry point**. Orchestrates auth + download flow
- `download-flow.js` - Download automation (use when session already exists)
- `database.js` - SQLite database for download tracking
- `notification.js` - Telegram notification service
- `download-history.js` - View download history from database
- `cleanup.js` - Remove legacy/refactored files
- `auth.json` - Saved authentication session (auto-generated)
- `.env` - Environment variables (credentials)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OBSIDIAN_EMAIL` | Your Obsidian account email |
| `OBSIDIAN_PASSWORD` | Your Obsidian account password |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (optional, for notifications) |
| `TELEGRAM_USER_ID` | Your Telegram user ID (optional, for notifications) |
| `ENABLE_CRON` | Enable automatic scheduler: `true` (default) or `false` |
| `CRON_SCHEDULE` | Cron expression for scheduler (default: `0 */6 * * *` = every 6 hours) |
| `DEBUG` | Set to `true` to run browser in visible mode for debugging |
| `LOG_LEVEL` | Log level: `error`, `warn`, `info`, `debug` (default: `info`) |

### Cron Schedule Examples

| Expression | Description |
|------------|-------------|
| `0 */6 * * *` | Every 6 hours (default) |
| `0 */4 * * *` | Every 4 hours |
| `0 9 * * *` | Every day at 9:00 AM |
| `0 0 * * 1` | Every Monday at midnight |
| `0 9 * * 1-5` | Monday-Friday at 9:00 AM |
| `0 9,18 * * *` | Every day at 9:00 AM and 6:00 PM |

## Telegram Notifications

Get notified when downloads complete or errors occur.

### Setup Instructions

1. **Create a bot:**
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Send `/newbot` and follow the instructions
   - Copy the bot token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

2. **Get your user ID:**
   - Message [@userinfobot](https://t.me/userinfobot) on Telegram
   - It will reply with your user ID (looks like: `123456789`)

3. **Configure environment:**
   - Add credentials to your `.env` file:
   ```bash
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_USER_ID=123456789
   ```

4. **Start your bot:**
   - Send `/start` to your new bot to activate it

Notifications are sent for:
- ✅ Successful downloads
- ℹ️ Already downloaded files (24h protection)
- ❌ Authentication or download errors

## Deployment

This guide describes how to deploy and run the script on a clean system (Windows).

### Step 1: Install Node.js

1. Download Node.js LTS (v16 or higher) from [nodejs.org](https://nodejs.org/)
2. Run the installer and follow the installation wizard
3. Verify installation:

```bash
node --version
npm --version
```

### Step 2: Clone or Download the Project

Copy the project files to your target machine:

```bash
# If using Git
git clone <repository-url>
cd playwright-script

# Or extract the project archive
cd playwright-script
```

### Step 3: Install Dependencies

Install all npm packages:

```bash
npm install
```

### Step 4: Install Playwright Browsers

Install Chromium browser required for automation:

```bash
npx playwright install
```

> **Note:** This downloads ~300MB of browser binaries. Ensure stable internet connection.

### Step 5: Configure Environment Variables

1. Copy the example environment file:

```bash
copy .env.example .env
```

2. Edit `.env` and fill in required values:

```bash
# Required - Obsidian account credentials
OBSIDIAN_EMAIL=your-email@example.com
OBSIDIAN_PASSWORD=your-password

# Optional - Telegram notifications
TELEGRAM_BOT_TOKEN=
TELEGRAM_USER_ID=

# Optional - Set to true for visible browser (debugging)
DEBUG=false
```

### Step 6: Run the Script

**Single download (recommended for first run):**

```bash
npm start
```

This will:
- Authenticate with Obsidian
- Save session to `auth.json`
- Download the installer
- Track download in database

**Start automatic scheduler:**

```bash
npm run scheduler
```

Runs every 6 hours (configurable via `CRON_SCHEDULE` in `.env`).

### Step 7: Verify Installation

Check that the following files/directories exist after first run:

| Path | Description |
|------|-------------|
| `auth.json` | Saved authentication session |
| `downloads/` | Downloaded installers |
| `database.db` | Download history tracking |
| `app.log` | Application logs |

### Automated Deployment (Optional)

For headless server deployment, configure the script to run on system startup:

**Windows Task Scheduler:**

1. Open Task Scheduler
2. Create a new task with these settings:
   - **Trigger:** At log on / At startup
   - **Action:** Start a program
   - **Program:** `wscript.exe`
   - **Arguments:** `"C:\path\to\run-silent.vbs"`

Create `run-silent.vbs` in project folder:

```vbs
Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDir = "C:\path\to\playwright-script"
objShell.Run "npm run scheduler", 0, False
```

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | v16.x | v18.x LTS |
| RAM | 512 MB | 1 GB |
| Disk Space | 500 MB | 1 GB |
| OS | Windows 10 | Windows 10/11 |

### Troubleshooting Clean Install

**Playwright install fails:**
```bash
# Install system dependencies
npx playwright install-deps

# Or install browsers manually
npx playwright install chromium
```

**Permission errors:**
```bash
# Run as Administrator or fix folder permissions
icacls . /grant Users:F /T
```

**Missing .env variables:**
```bash
# Reset to defaults
copy .env.example .env
```

## Troubleshooting

### Session Expired / Authentication Failed

If you see "Authentication failed" or the session keeps logging out:

1. **Delete the old session:**
   ```bash
   del auth.json
   ```

2. **Re-run the script:**
   ```bash
   npm start
   ```
   The script will automatically perform a fresh login and save a new session.

3. **Check credentials:**
   - Ensure your `.env` file has the correct email and password
   - Verify your Obsidian account is active

### Download Fails

If the download fails but authentication succeeds:

1. Check the `downloads` folder exists and is writable
2. Ensure you have sufficient disk space
3. Check your internet connection
4. Run `npm start` to retry (the database prevents duplicate downloads)

### Telegram Notifications Not Working

If you're not receiving notifications:

1. **Verify credentials:**
   - Check `TELEGRAM_BOT_TOKEN` and `TELEGRAM_USER_ID` in `.env` are correct
   - Ensure there are no extra spaces or quotes

2. **Activate the bot:**
   - Send `/start` to your bot in Telegram

3. **Check bot permissions:**
   - Make sure the bot can message you (not blocked)

4. **Optional feature:**
   - Notifications are optional - the script works without them
   - Simply leave `TELEGRAM_*` variables empty to disable
