// src/commands/member/clinic.js
import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class ClinicCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('feedback')
            .setDescription('Ask for feedback - your request will be posted in the feedback channel')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('request')
                    .setDescription('Ask for feedback on your project, design, or idea'));
    }

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'request') {
            await this.showFeedbackModal(interaction);
        }
    }

    async showFeedbackModal(interaction) {
        // Check if user has given enough helpful feedback (2 in last 14 days)
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        
        const helpfulCount = await this.db.query(
            `SELECT COUNT(*) FROM actions_log 
             WHERE user_id = ? AND type = 'clinic_helpful' 
             AND created_at >= ?`,
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
            .setTitle('Ask for Feedback');

        const goalInput = new TextInputBuilder()
            .setCustomId('goal')
            .setLabel('Your goal/project')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);

        const draftInput = new TextInputBuilder()
            .setCustomId('draft')
            .setLabel('What you have so far')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000)
            .setPlaceholder('Paste your code, share a link to your design, describe what you built...');

        const questionsInput = new TextInputBuilder()
            .setCustomId('questions')
            .setLabel('What feedback do you need?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500)
            .setPlaceholder('Does this look good?\nHow can I make it better?\nAm I doing this right?');

        const askInput = new TextInputBuilder()
            .setCustomId('ask')
            .setLabel('How can people help you?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(200)
            .setPlaceholder('Quick comments, detailed review, voice chat, etc.');

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