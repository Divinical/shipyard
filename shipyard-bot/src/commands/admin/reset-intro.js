// src/commands/admin/reset-intro.js
import { SlashCommandBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class ResetIntroCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('reset-intro')
            .setDescription('Reset a user\'s introduction so they can redo it (Founder only)')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('User whose intro to reset')
                    .setRequired(true));
    }

    async execute(interaction) {
        if (!this.isFounder(interaction.member)) {
            return this.sendError(interaction, 'Only founders can reset user introductions');
        }

        const targetUser = interaction.options.getUser('user');
        
        try {
            // Get user's current intro post ID
            const userResult = await this.db.query(
                'SELECT intro_post_id FROM users WHERE id = ?',
                [targetUser.id]
            );

            if (userResult.rows.length === 0) {
                return this.sendError(interaction, 'User not found in database');
            }

            const introPostId = userResult.rows[0].intro_post_id;

            if (!introPostId) {
                return this.sendError(interaction, 'User has no introduction to reset');
            }

            // Delete the Discord message from intro channel
            const introChannel = interaction.guild.channels.cache.get(process.env.INTRO_CHANNEL_ID);
            if (introChannel) {
                try {
                    const introMessage = await introChannel.messages.fetch(introPostId);
                    await introMessage.delete();
                    this.logger.info(`Deleted intro message ${introPostId} for user ${targetUser.id}`);
                } catch (error) {
                    this.logger.warn(`Could not delete intro message ${introPostId}:`, error);
                    // Continue anyway - message might already be deleted
                }
            }

            // Clear intro_post_id in database
            await this.db.query(
                'UPDATE users SET intro_post_id = NULL WHERE id = ?',
                [targetUser.id]
            );

            await this.sendSuccess(interaction, `Reset introduction for <@${targetUser.id}>. They can now use /introduce again.`);

        } catch (error) {
            this.logger.error(`Error resetting introduction for user ${targetUser.id}:`, error);
            await this.sendError(interaction, 'An error occurred while resetting the introduction');
        }
    }
}