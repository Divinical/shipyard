// src/commands/gamification/badges.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class BadgesCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('badges')
            .setDescription('View your earned badges');
    }

    async execute(interaction) {
        const userId = interaction.user.id;

        // Get user's badges
        const badges = await this.db.query(
            `SELECT b.code, b.label, b.description, ub.awarded_at
             FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = ?
             ORDER BY ub.awarded_at DESC`,
            [userId]
        );

        if (badges.rows.length === 0) {
            return interaction.reply({
                content: 'You haven\'t earned any badges yet! Keep participating to earn your first badge.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🏆 Your Badges')
            .setDescription(`You've earned ${badges.rows.length} badge${badges.rows.length > 1 ? 's' : ''}!`)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        // Add each badge
        for (const badge of badges.rows) {
            const icon = this.getBadgeIcon(badge.code);
            const date = new Date(badge.awarded_at).toLocaleDateString();
            embed.addFields({
                name: `${icon} ${badge.label}`,
                value: `${badge.description || 'No description'}\n*Earned: ${date}*`,
                inline: true
            });
        }

        // Add progress toward next badges
        const nextBadges = await this.getNextBadgeProgress(userId);
        if (nextBadges.length > 0) {
            embed.addFields({
                name: '📊 Next Badges',
                value: nextBadges.join('\n'),
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    getBadgeIcon(code) {
        const icons = {
            'first_dock': '⚓',
            'first_demo': '🎬',
            'clinic_helper_5': '💡',
            'problem_solver_5': '✅',
            'streak_4_weeks': '🔥',
            'meet_regular_4': '👥'
        };
        return icons[code] || '🏅';
    }

    async getNextBadgeProgress(userId) {
        const progress = [];

        // Get user's action counts
        const counts = await this.db.query(
            `SELECT type, COUNT(*) as count
             FROM actions_log
             WHERE user_id = ?
             GROUP BY type`,
            [userId]
        );

        const actionCounts = {};
        counts.rows.forEach(row => {
            actionCounts[row.type] = parseInt(row.count);
        });

        // Check progress toward unearned badges
        const earnedBadges = await this.db.query(
            `SELECT b.code FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = ?`,
            [userId]
        );

        const earned = new Set(earnedBadges.rows.map(b => b.code));

        if (!earned.has('clinic_helper_5')) {
            const current = actionCounts.clinic_helpful || 0;
            progress.push(`💡 Clinic Helper: ${current}/5 helpful feedbacks`);
        }

        if (!earned.has('problem_solver_5')) {
            const current = actionCounts.help_solved || 0;
            progress.push(`✅ Problem Solver: ${current}/5 help requests solved`);
        }

        if (!earned.has('meet_regular_4')) {
            const current = actionCounts.meet_attend || 0;
            progress.push(`👥 Meet Regular: ${current}/4 meetings attended`);
        }

        return progress.slice(0, 3); // Show max 3 upcoming badges
    }
}