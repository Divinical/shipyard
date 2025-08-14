// src/commands/onboarding/start.js
import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class StartCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('start')
            .setDescription('Start the onboarding process');
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
            .setLabel('Your Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const timezoneInput = new TextInputBuilder()
            .setCustomId('timezone')
            .setLabel('Timezone (e.g., America/New_York)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Europe/London');

        const oneLinerInput = new TextInputBuilder()
            .setCustomId('oneliner')
            .setLabel('One-liner about yourself')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(200);

        const projectInput = new TextInputBuilder()
            .setCustomId('project')
            .setLabel('Current Project URLs (comma separated)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        const skillsInput = new TextInputBuilder()
            .setCustomId('skills')
            .setLabel('Your Skills (comma separated)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder('React, Node.js, Design, Marketing...');

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