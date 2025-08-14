# ShipYard Bot

A Discord bot for managing community activities, onboarding, moderation, and gamification.

## Setup

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation

1. Clone the repository and navigate to the bot directory:
```bash
cd shipyard-bot
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.template .env
```
Edit `.env` with your Discord bot token and channel IDs.

### Database

The bot uses SQLite by default for easy setup and deployment. The database file (`shipyard.db`) will be created automatically when the bot starts.

**Database URL format:**
```
DATABASE_URL=sqlite://./shipyard.db
```

### Running the Bot

1. Deploy slash commands (first time setup):
```bash
npm run deploy-commands
```

2. Start the bot:
```bash
npm start
```

## Available Scripts

- `npm start` - Start the bot
- `npm run deploy-commands` - Deploy slash commands to Discord
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed database with initial data
- `npm run backup` - Create database backup
- `npm run health-check` - Check bot health status

## Features

- **Onboarding**: Automated welcome process for new members
- **Moderation**: Anti-spam, raid protection, and member monitoring
- **Gamification**: Points, badges, and seasonal competitions
- **Help System**: Clinic scheduling and help request management
- **Analytics**: Member activity tracking and reporting

## Configuration

Key configuration options in `.env`:

### Discord Settings
- `DISCORD_BOT_TOKEN` - Your bot token
- `CLIENT_ID` - Your application client ID
- `DISCORD_GUILD_ID` - Your Discord server ID

### Database
- `DATABASE_URL` - SQLite database path (default: `sqlite://./shipyard.db`)

### Feature Flags
- `ENABLE_RAID_SHIELD` - Anti-raid protection
- `ENABLE_GAMIFICATION` - Points and badges system
- `ENABLE_CHANNEL_GUARDRAILS` - Channel-specific rules

See `.env.template` for all available configuration options.