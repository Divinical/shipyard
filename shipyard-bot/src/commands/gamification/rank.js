// src/commands/gamification/rank.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class RankCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('rank')
            .setDescription('View your weekly progress and stats');
    }

    async execute(interaction) {
        const userId = interaction.user.id;
        
        // Get current week data
        const weekStart = this.getWeekStart();
        const weekEnd = this.getWeekEnd();

        // Get user's actions this week
        const actionsQuery = await this.db.query(
            `SELECT type, COUNT(*) as count, SUM(points) as total_points
             FROM actions_log
             WHERE user_id = ? AND created_at >= ? AND created_at <= ?
             GROUP BY type`,
            [userId, weekStart, weekEnd]
        );

        // Get user's streak
        const streakQuery = await this.db.query(
            'SELECT weekly_current, weekly_best FROM streaks WHERE user_id = ?',
            [userId]
        );

        // Get current season points
        const seasonQuery = await this.db.query(
            `SELECT s.points FROM scores s
             JOIN seasons se ON s.season_id = se.id
             WHERE s.user_id = ? AND se.status = 'active'`,
            [userId]
        );

        // Calculate weekly progress
        const actions = actionsQuery.rows;
        const totalActions = actions.reduce((sum, a) => sum + parseInt(a.count), 0);
        const weeklyPoints = Math.min(actions.reduce((sum, a) => sum + parseInt(a.total_points), 0), 3);
        const weeklyGoalMet = totalActions >= 2;

        const currentStreak = streakQuery.rows[0]?.weekly_current || 0;
        const bestStreak = streakQuery.rows[0]?.weekly_best || 0;
        const seasonPoints = seasonQuery.rows[0]?.points || 0;

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(weeklyGoalMet ? 0x00FF00 : 0xFFFF00)
            .setTitle('📊 Your Weekly Progress')
            .setDescription(`Week of ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`)
            .addFields(
                { name: 'Weekly Goal', value: `${totalActions}/2 actions ${weeklyGoalMet ? '✅' : '⏳'}`, inline: true },
                { name: 'Weekly Points', value: `${weeklyPoints}/3`, inline: true },
                { name: 'Current Streak', value: `${currentStreak} weeks`, inline: true },
                { name: 'Best Streak', value: `${bestStreak} weeks`, inline: true },
                { name: 'Season Points', value: `${seasonPoints}`, inline: true }
            )
            .setFooter({ text: 'Keep building! 🚀' })
            .setTimestamp();

        // Add breakdown if there are actions
        if (actions.length > 0) {
            const breakdown = actions.map(a => 
                `• ${this.formatActionType(a.type)}: ${a.count}`
            ).join('\n');
            embed.addFields({ name: 'This Week\'s Actions', value: breakdown });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    getWeekStart() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        return new Date(now.setDate(diff));
    }

    getWeekEnd() {
        const start = this.getWeekStart();
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return end;
    }

    formatActionType(type) {
        const types = {
            'dock': '⚓ Dock Check',
            'meet_attend': '👥 Meet Attendance',
            'demo_posted': '🎬 Demo Posted',
            'demo_presented': '🎤 Demo Presented',
            'clinic_helpful': '💡 Helpful Feedback',
            'help_solved': '✅ Help Solved'
        };
        return types[type] || type;
    }
}