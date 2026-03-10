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

### Full Download Flow

Run the complete authentication and download process:

```bash
npm run download
```

### Authentication Setup

Set up authentication and save session:

```bash
npm run auth
```

### Check Session Status

Verify if the current session is valid:

```bash
npm run check-session
```

### Run Main Script

Execute the main index script:

```bash
npm start
```

### Run Tests

Test login functionality:

```bash
npm test
```

## Project Structure

- `auth-setup.js` - Authentication setup and session management
- `download-flow.js` - Main download automation flow
- `login.js` - Login helper functions
- `check-session.js` - Session validation utility
- `index.js` - Main entry point
- `.env` - Environment variables (credentials)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OBSIDIAN_EMAIL` | Your Obsidian account email |
| `OBSIDIAN_PASSWORD` | Your Obsidian account password |
