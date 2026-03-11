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

Run the complete authentication and download process with a single command:

```bash
npm start
```

This will:
1. Check if your session is still valid
2. Automatically log in if session expired
3. Download the latest Obsidian installer
4. Track download history (24-hour protection against duplicates)

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
