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
            'SELECT thread_id FROM users WHERE id = ?',
            [interaction.user.id]
        );

        if (user.rows.length > 0 && user.rows[0].thread_id) {
            return this.sendError(interaction, 'You have already completed your introduction!');
        }

        // Create onboarding modal (part 1)
        const modal = new ModalBuilder()
            .setCustomId('onboarding_modal')
            .setTitle('Welcome to ShipYard! (Step 1/2)');

        // Add input fields
        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('What should we call you?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50)
            .setPlaceholder('Your name or nickname');

        const locationInput = new TextInputBuilder()
            .setCustomId('location')
            .setLabel('Where are you from?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
            .setPlaceholder('Country / City (e.g., Spain / Barcelona)');

        const ageInput = new TextInputBuilder()
            .setCustomId('age')
            .setLabel('How old are you?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(3)
            .setPlaceholder('25');

        const personalLineInput = new TextInputBuilder()
            .setCustomId('personal_line')
            .setLabel('Tell us about yourself (one sentence)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(200)
            .setPlaceholder('I\'m passionate about building tech solutions for small businesses');

        const xHandleInput = new TextInputBuilder()
            .setCustomId('x_handle')
            .setLabel('Your X/Twitter handle')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50)
            .setPlaceholder('@yourusername or yourusername');

        // Create first set of action rows (Discord modal limit is 5)
        const rows = [
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(locationInput),
            new ActionRowBuilder().addComponents(ageInput),
            new ActionRowBuilder().addComponents(personalLineInput),
            new ActionRowBuilder().addComponents(xHandleInput)
        ];

        modal.addComponents(...rows);
        await interaction.showModal(modal);
    }
}