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
            // Get user's current intro thread ID
            const userResult = await this.db.query(
                'SELECT thread_id, name FROM users WHERE id = ?',
                [targetUser.id]
            );

            if (userResult.rows.length === 0) {
                return this.sendError(interaction, 'User not found in database');
            }

            const threadId = userResult.rows[0].thread_id;
            const userName = userResult.rows[0].name;

            if (!threadId) {
                return this.sendError(interaction, 'User has no introduction to reset');
            }

            // Delete the forum thread from intro channel
            const introChannel = interaction.guild.channels.cache.get(process.env.INTRO_CHANNEL_ID);
            if (introChannel) {
                try {
                    const thread = await introChannel.threads.fetch(threadId);
                    if (thread) {
                        await thread.delete();
                        this.logger.info(`Deleted intro thread ${threadId} for user ${targetUser.id}`);
                    }
                } catch (error) {
                    this.logger.warn(`Could not delete intro thread ${threadId}:`, error);
                    // Continue anyway - thread might already be deleted
                }
            }

            // Clear introduction data in database
            await this.db.query(
                `UPDATE users SET 
                 thread_id = NULL, name = NULL, location = NULL, age = NULL, 
                 personal_line = NULL, x_handle = NULL, projects = NULL
                 WHERE id = ?`,
                [targetUser.id]
            );

            // Clean up any temporary intro data
            await this.db.query(
                'DELETE FROM temp_intros WHERE user_id = ?',
                [targetUser.id]
            );

            await this.sendSuccess(interaction, `Reset introduction for <@${targetUser.id}>. They can now use /introduce again.`);

        } catch (error) {
            this.logger.error(`Error resetting introduction for user ${targetUser.id}:`, error);
            await this.sendError(interaction, 'An error occurred while resetting the introduction');
        }
    }
}