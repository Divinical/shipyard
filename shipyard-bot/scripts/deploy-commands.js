// scripts/deploy-commands.js
import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));

async function deployCommands() {
    const commands = [];
    const commandsPath = join(__dirname, '../src/commands');
    
    console.log(chalk.blue('Loading commands...'));
    
    // Load all command categories
    const categories = readdirSync(commandsPath).filter(item => !item.endsWith('.js'));
    
    for (const category of categories) {
        const categoryPath = join(commandsPath, category);
        const commandFiles = readdirSync(categoryPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = join(categoryPath, file);
            try {
                const { default: Command } = await import(`file://${filePath}`);
                const command = new Command({});
                
                if (command.data) {
                    commands.push(command.data.toJSON());
                    console.log(chalk.green(`✓ Loaded ${command.data.name}`));
                } else {
                    console.log(chalk.yellow(`⚠ Skipping ${file} - no data property`));
                }
            } catch (error) {
                console.error(chalk.red(`✗ Failed to load ${file}:`), error.message);
            }
        }
    }
    
    console.log(chalk.blue(`\nDeploying ${commands.length} commands...`));
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    
    try {
        const data = await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.DISCORD_GUILD_ID
            ),
            { body: commands }
        );
        
        console.log(chalk.green(`✓ Successfully deployed ${data.length} commands`));
    } catch (error) {
        console.error(chalk.red('Failed to deploy commands:'), error);
        process.exit(1);
    }
}

deployCommands();