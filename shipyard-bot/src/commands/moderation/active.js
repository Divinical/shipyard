// src/commands/moderation/active.js
import { SlashCommandBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class ActiveCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('active')
            .setDescription('Check if a user meets Active Member criteria')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('The user to check')
                    .setRequired(true));
    }

    async execute(interaction) {
        if (!this.isModerator(interaction.member)) {
            return this.sendError(interaction, 'Only moderators can use this command');
        }

        const targetUser = interaction.options.getUser('user');
        
        // Check each criterion
        const checks = await this.checkActiveMemberStatus(targetUser.id);
        
        const statusEmoji = checks.isActive ? '✅' : '❌';
        const statusText = checks.isActive ? 'Active Member' : 'Not Active';

        let response = `**${targetUser.username}** - ${statusEmoji} ${statusText}\n\n`;
        response += `📝 Intro Card: ${checks.hasIntro ? '✅' : '❌'}\n`;
        response += `👥 Weekly Meet (first 30 days): ${checks.hasAttendedMeet ? '✅' : '❌'}\n`;
        response += `💬 6+ messages/week OR 1 demo/month: ${checks.hasActivity ? '✅' : '❌'}\n`;

        if (!checks.isActive) {
            response += '\n**Missing:**\n';
            if (!checks.hasIntro) response += '• Introduction card\n';
            if (!checks.hasAttendedMeet) response += '• Weekly Meet attendance\n';
            if (!checks.hasActivity) response += '• Weekly activity requirement\n';
        }

        await interaction.reply({ content: response, ephemeral: true });
    }

    async checkActiveMemberStatus(userId) {
        // Check intro
        const userQuery = await this.db.query(
            'SELECT intro_post_id, joined_at FROM users WHERE id = $1',
            [userId]
        );
        const hasIntro = userQuery.rows[0]?.intro_post_id != null;

        // Check meet attendance in first 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const meetQuery = await this.db.query(
            `SELECT COUNT(*) FROM meet_attendance ma
             JOIN meets m ON ma.meet_id = m.id
             WHERE ma.user_id = $1 AND ma.attended = true
             AND m.start_at >= $2`,
            [userId, thirtyDaysAgo]
        );
        const hasAttendedMeet = parseInt(meetQuery.rows[0].count) > 0;

        // Check weekly messages or monthly demo
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);

        const messageQuery = await this.db.query(
            'SELECT COUNT(*) FROM messages WHERE user_id = $1 AND created_at >= $2',
            [userId, weekAgo]
        );
        const weeklyMessages = parseInt(messageQuery.rows[0].count);

        const demoQuery = await this.db.query(
            'SELECT COUNT(*) FROM demos WHERE author_id = $1 AND created_at >= $2',
            [userId, monthAgo]
        );
        const monthlyDemos = parseInt(demoQuery.rows[0].count);

        const hasActivity = weeklyMessages >= 6 || monthlyDemos >= 1;

        return {
            isActive: hasIntro && hasAttendedMeet && hasActivity,
            hasIntro,
            hasAttendedMeet,
            hasActivity,
            weeklyMessages,
            monthlyDemos
        };
    }
}