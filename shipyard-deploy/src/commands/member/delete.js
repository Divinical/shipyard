// src/commands/member/delete.js
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class DeleteCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('delete')
            .setDescription('Delete your personal data')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('mydata')
                    .setDescription('Request deletion of all your data'));
    }

    async execute(interaction) {
        // Create confirmation buttons
        const confirmButton = new ButtonBuilder()
            .setCustomId(`delete_confirm_${interaction.user.id}`)
            .setLabel('Yes, delete my data')
            .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
            .setCustomId('delete_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        await interaction.reply({
            content: '⚠️ **Data Deletion Request**\n\n' +
                     'This will permanently delete all your data from ShipYard Bot, including:\n' +
                     '• Your profile and introduction\n' +
                     '• Activity history and messages\n' +
                     '• Gamification progress and badges\n' +
                     '• All other associated data\n\n' +
                     '**This action cannot be undone.**\n\n' +
                     'Are you sure you want to proceed?',
            components: [row],
            ephemeral: true
        });

        // Set a timeout to auto-cancel after 60 seconds
        setTimeout(async () => {
            try {
                await interaction.editReply({
                    content: 'Data deletion request timed out.',
                    components: []
                });
            } catch (error) {
                // Interaction may have been handled already
            }
        }, 60000);
    }
}