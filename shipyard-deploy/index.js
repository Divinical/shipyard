// index.js - ShipYard Bot Main Entry Point
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { Database } from './src/database/index.js';
import { CommandHandler } from './src/handlers/CommandHandler.js';
import { EventHandler } from './src/handlers/EventHandler.js';
import { CronManager } from './src/services/CronManager.js';
import { Logger } from './src/utils/Logger.js';
import { PolicyManager } from './src/services/PolicyManager.js';
import { GamificationService } from './src/services/GamificationService.js';
import { ModerationService } from './src/services/ModerationService.js';
import { OnboardingService } from './src/services/OnboardingService.js';
import { MeetService } from './src/services/MeetService.js';
import { AnalyticsService } from './src/services/AnalyticsService.js';

config();

class ShipYardBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.GuildMessageReactions
            ],
            partials: ['MESSAGE', 'CHANNEL', 'REACTION', 'USER']
        });

        this.logger = new Logger();
        this.commands = new Collection();
        this.db = null;
        this.policyManager = null;
        this.cronManager = null;
        this.services = {};
    }

    async initialize() {
        try {
            // Initialize database
            this.logger.info('Connecting to database...');
            this.db = new Database();
            await this.db.connect();
            await this.db.runMigrations();
            
            // Initialize policy manager
            this.policyManager = new PolicyManager(this.db);
            await this.policyManager.loadPolicies();
            
            // Initialize services
            this.logger.info('Initializing services...');
            this.services = {
                gamification: new GamificationService(this),
                moderation: new ModerationService(this),
                onboarding: new OnboardingService(this),
                meet: new MeetService(this),
                analytics: new AnalyticsService(this)
            };
            
            // Initialize handlers
            this.commandHandler = new CommandHandler(this);
            this.eventHandler = new EventHandler(this);
            
            // Load commands and events
            await this.commandHandler.loadCommands();
            await this.eventHandler.loadEvents();
            
            // Register slash commands
            await this.registerSlashCommands();
            
            // Initialize cron manager
            this.cronManager = new CronManager(this);
            
            // Login to Discord
            await this.client.login(process.env.DISCORD_BOT_TOKEN);
            
            this.logger.success('ShipYard Bot initialized successfully!');
        } catch (error) {
            this.logger.error('Failed to initialize bot:', error);
            process.exit(1);
        }
    }

    async registerSlashCommands() {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
        
        try {
            const commandData = Array.from(this.commands.values()).map(cmd => cmd.data.toJSON());
            
            await rest.put(
                Routes.applicationGuildCommands(
                    process.env.CLIENT_ID,
                    process.env.DISCORD_GUILD_ID
                ),
                { body: commandData }
            );
            
            this.logger.success(`Registered ${commandData.length} slash commands`);
        } catch (error) {
            this.logger.error('Failed to register slash commands:', error);
        }
    }

    async shutdown() {
        this.logger.info('Shutting down ShipYard Bot...');
        
        if (this.cronManager) {
            await this.cronManager.stopAll();
        }
        
        if (this.db) {
            await this.db.disconnect();
        }
        
        this.client.destroy();
        this.logger.info('Shutdown complete');
    }
}

// Initialize and start the bot
const bot = new ShipYardBot();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    await bot.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await bot.shutdown();
    process.exit(0);
});

// Start the bot
bot.initialize().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});