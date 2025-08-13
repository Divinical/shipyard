// src/commands/member/kudos.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class KudosCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('kudos')
            .setDescription('Give kudos to a helpful member')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('The user to give kudos to')
                    .setRequired(true))
            .addStringOption(option =>
                option
                    .setName('reason')
                    .setDescription('Why are you giving kudos?')
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

        // Save kudos
        await this.db.query(
            'INSERT INTO kudos (giver_id, receiver_id, reason, created_at) VALUES ($1, $2, $3, $4)',
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
            'SELECT COUNT(*) FROM kudos WHERE receiver_id = $1 AND created_at >= $2',
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