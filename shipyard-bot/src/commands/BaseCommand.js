// src/commands/BaseCommand.js
import { PermissionFlagsBits } from 'discord.js';

export class BaseCommand {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
        this.logger = bot.logger;
    }

    // Check if user has required role
    hasRole(member, roleName) {
        return member.roles.cache.some(role => role.name === roleName);
    }

    // Check if user is a founder
    isFounder(member) {
        return this.hasRole(member, 'Founder');
    }

    // Check if user is a moderator
    isModerator(member) {
        return this.hasRole(member, 'Mod') || this.isFounder(member);
    }

    // Send ephemeral error message
    async sendError(interaction, message) {
        await interaction.reply({
            content: `❌ ${message}`,
            ephemeral: true
        });
    }

    // Send ephemeral success message
    async sendSuccess(interaction, message) {
        await interaction.reply({
            content: `✅ ${message}`,
            ephemeral: true
        });
    }
}