// src/commands/member/kudos.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class KudosCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('thanks')
            .setDescription('Thank someone who helped you - give them points!')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('Who do you want to thank?')
                    .setRequired(true))
            .addStringOption(option =>
                option
                    .setName('reason')
                    .setDescription('Why are you thanking them? What did they help you with?')
                    .setRequired(true)
                    .setMaxLength(200));
    }

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        // Can't give kudos to yourself
        if (targetUser.id === interaction.user.id) {
            return this.sendError(interaction, "You can't give kudos to yourself!");
        }

        // Can't give kudos to bots
        if (targetUser.bot) {
            return this.sendError(interaction, "You can't give kudos to bots!");
        }

        // Ensure both users exist in database
        await this.db.query(
            `INSERT OR IGNORE INTO users (id, username, joined_at) 
             VALUES (?, ?, ?)`,
            [interaction.user.id, interaction.user.username, new Date()]
        );
        
        await this.db.query(
            `INSERT OR IGNORE INTO users (id, username, joined_at) 
             VALUES (?, ?, ?)`,
            [targetUser.id, targetUser.username, new Date()]
        );

        // Save kudos
        await this.db.query(
            'INSERT INTO kudos (from_user_id, to_user_id, reason, created_at) VALUES (?, ?, ?, ?)',
            [interaction.user.id, targetUser.id, reason, new Date()]
        );

        // Create public kudos message
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('⭐ Kudos Given!')
            .setDescription(`${interaction.user} gave kudos to ${targetUser}`)
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Update kudos count for weekly digest
        await this.updateKudosStats(targetUser.id);
    }

    async updateKudosStats(userId) {
        // This week's kudos count
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const kudosCount = await this.db.query(
            'SELECT COUNT(*) FROM kudos WHERE to_user_id = ? AND created_at >= ?',
            [userId, weekStart]
        );

        // Could trigger achievements or notifications here
        if (parseInt(kudosCount.rows[0].count) === 5) {
            // First 5 kudos this week achievement
            try {
                const user = await this.bot.client.users.fetch(userId);
                await user.send('🎉 You\'ve received 5 kudos this week! Keep up the great work!');
            } catch (error) {
                this.logger.error(`Could not notify user ${userId}:`, error);
            }
        }
    }
}