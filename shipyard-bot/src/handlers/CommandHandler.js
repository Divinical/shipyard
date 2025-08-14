// src/handlers/CommandHandler.js
import { Collection } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class CommandHandler {
    constructor(bot) {
        this.bot = bot;
        this.commands = bot.commands;
    }

    async loadCommands() {
        const commandsPath = join(__dirname, '../commands');
        const commandCategories = readdirSync(commandsPath);

        for (const category of commandCategories) {
            const categoryPath = join(commandsPath, category);
            const commandFiles = readdirSync(categoryPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = join(categoryPath, file);
                const { default: Command } = await import(`file://${filePath}`);
                const command = new Command(this.bot);
                
                this.commands.set(command.data.name, command);
                this.bot.logger.info(`Loaded command: ${command.data.name}`);
            }
        }
    }
}