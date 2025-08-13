// src/commands/member/clinic.js
import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class ClinicCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('clinic')
            .setDescription('Feedback clinic commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('new')
                    .setDescription('Request feedback on your work'));
    }

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'new') {
            await this.showClinicModal(interaction);
        }
    }

    async showClinicModal(interaction) {
        // Check if user has given enough helpful feedback (2 in last 14 days)
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        
        const helpfulCount = await this.db.query(
            `SELECT COUNT(*) FROM actions_log 
             WHERE user_id = $1 AND type = 'clinic_helpful' 
             AND created_at >= $2`,
            [interaction.user.id, twoWeeksAgo]
        );

        const requiredHelpful = await this.bot.policyManager.get('clinic.helpful_required', 2);
        const userHelpful = parseInt(helpfulCount.rows[0].count);

        if (userHelpful < requiredHelpful) {
            return this.sendError(
                interaction,
                `You need to provide ${requiredHelpful} helpful feedback responses in the last 14 days before requesting feedback.\n` +
                `You've given ${userHelpful}/${requiredHelpful} helpful feedbacks.`
            );
        }

        // Create modal
        const modal = new ModalBuilder()
            .setCustomId('clinic_modal')
            .setTitle('Request Feedback');

        const goalInput = new TextInputBuilder()
            .setCustomId('goal')
            .setLabel('What are you trying to achieve?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);

        const draftInput = new TextInputBuilder()
            .setCustomId('draft')
            .setLabel('Current draft/version')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000)
            .setPlaceholder('Share your current work, code, design, or writing...');

        const questionsInput = new TextInputBuilder()
            .setCustomId('questions')
            .setLabel('Specific questions (one per line)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500)
            .setPlaceholder('What specific feedback do you need?');

        const askInput = new TextInputBuilder()
            .setCustomId('ask')
            .setLabel('What would be most helpful?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(200);

        const rows = [
            new ActionRowBuilder().addComponents(goalInput),
            new ActionRowBuilder().addComponents(draftInput),
            new ActionRowBuilder().addComponents(questionsInput),
            new ActionRowBuilder().addComponents(askInput)
        ];

        modal.addComponents(...rows);
        await interaction.showModal(modal);
    }
}