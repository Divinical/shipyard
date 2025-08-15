// src/commands/onboarding/start.js
import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class StartCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('introduce')
            .setDescription('Introduce yourself - your intro will be posted in the introductions channel');
    }

    async execute(interaction) {
        // Check if user already has intro
        const user = await this.db.query(
            'SELECT intro_post_id FROM users WHERE id = ?',
            [interaction.user.id]
        );

        if (user.rows.length > 0 && user.rows[0].intro_post_id) {
            return this.sendError(interaction, 'You have already completed onboarding!');
        }

        // Create onboarding modal
        const modal = new ModalBuilder()
            .setCustomId('onboarding_modal')
            .setTitle('Welcome to ShipYard!');

        // Add input fields
        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('What should we call you?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
            .setPlaceholder('Your name or nickname');

        const timezoneInput = new TextInputBuilder()
            .setCustomId('timezone')
            .setLabel('What timezone are you in?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Europe/London, America/New_York, Asia/Tokyo, etc.');

        const oneLinerInput = new TextInputBuilder()
            .setCustomId('oneliner')
            .setLabel('About yourself (one sentence)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(200)
            .setPlaceholder('I am a student learning to code, I build mobile apps, etc.');

        const projectInput = new TextInputBuilder()
            .setCustomId('project')
            .setLabel('Your projects (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder('https://myapp.com, https://github.com/myusername/myproject');

        const skillsInput = new TextInputBuilder()
            .setCustomId('skills')
            .setLabel('Your skills (separate with commas)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder('Python, Web Design, React, Marketing, Writing, etc.');

        // Create action rows
        const rows = [
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(timezoneInput),
            new ActionRowBuilder().addComponents(oneLinerInput),
            new ActionRowBuilder().addComponents(projectInput),
            new ActionRowBuilder().addComponents(skillsInput)
        ];

        modal.addComponents(...rows);
        await interaction.showModal(modal);
    }
}