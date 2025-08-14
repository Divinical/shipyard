// src/services/AnalyticsService.js
import { EmbedBuilder } from 'discord.js';
import moment from 'moment-timezone';

export class AnalyticsService {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
        this.logger = bot.logger;
    }

    async generateWeeklyDigest() {
        const weekStart = moment().tz(process.env.SERVER_TIMEZONE || 'Europe/London').startOf('week');
        const weekEnd = moment().tz(process.env.SERVER_TIMEZONE || 'Europe/London').endOf('week');

        const stats = await this.gatherWeeklyStats(weekStart.toDate(), weekEnd.toDate());
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('📊 Weekly Community Digest')
            .setDescription(`Week of ${weekStart.format('MMM D')} - ${weekEnd.format('MMM D, YYYY')}`)
            .addFields(
                { name: '👥 New Members', value: stats.newMembers.toString(), inline: true },
                { name: '📈 Active %', value: `${stats.activePercent}%`, inline: true },
                { name: '💬 Messages', value: stats.messageCount.toString(), inline: true },
                { name: '💡 Feedback Given', value: stats.clinicsGiven.toString(), inline: true },
                { name: '✅ Problems Solved', value: stats.helpSolved.toString(), inline: true },
                { name: '🎬 Demos Posted', value: stats.demosPosted.toString(), inline: true }
            )
            .setTimestamp();

        if (stats.topHelpers.length > 0) {
            const helpers = stats.topHelpers
                .map((h, i) => `${i + 1}. **${h.username}** (${h.kudos_count} kudos)`)
                .join('\n');
            embed.addFields({ name: '🏆 Top Helpers', value: helpers });
        }

        if (stats.streakLeaders.length > 0) {
            const leaders = stats.streakLeaders
                .map((l, i) => `${i + 1}. **${l.username}** (${l.weekly_current} weeks)`)
                .join('\n');
            embed.addFields({ name: '🔥 Streak Leaders', value: leaders });
        }

        // Save snapshot
        await this.saveSnapshot(stats, weekStart.toDate());

        return embed;
    }

    async gatherWeeklyStats(weekStart, weekEnd) {
        const stats = {
            newMembers: 0,
            activePercent: 0,
            messageCount: 0,
            clinicsGiven: 0,
            helpSolved: 0,
            demosPosted: 0,
            topHelpers: [],
            streakLeaders: []
        };

        // New members
        const newMembers = await this.db.query(
            'SELECT COUNT(*) FROM users WHERE joined_at >= ? AND joined_at <= ?',
            [weekStart, weekEnd]
        );
        stats.newMembers = parseInt(newMembers.rows[0].count);

        // Active members
        const activeMembers = await this.db.query(
            'SELECT COUNT(DISTINCT user_id) FROM messages WHERE created_at >= ? AND created_at <= ?',
            [weekStart, weekEnd]
        );
        const totalMembers = await this.db.query(
            'SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'
        );
        stats.activePercent = ((parseInt(activeMembers.rows[0].count) / parseInt(totalMembers.rows[0].count)) * 100).toFixed(1);

        // Message count
        const messages = await this.db.query(
            'SELECT COUNT(*) FROM messages WHERE created_at >= ? AND created_at <= ?',
            [weekStart, weekEnd]
        );
        stats.messageCount = parseInt(messages.rows[0].count);

        // Clinics given
        const clinics = await this.db.query(
            'SELECT COUNT(*) FROM clinics WHERE created_at >= ? AND created_at <= ?',
            [weekStart, weekEnd]
        );
        stats.clinicsGiven = parseInt(clinics.rows[0].count);

        // Help requests solved
        const helpSolved = await this.db.query(
            'SELECT COUNT(*) FROM help_requests WHERE solved_at >= ? AND solved_at <= ?',
            [weekStart, weekEnd]
        );
        stats.helpSolved = parseInt(helpSolved.rows[0].count);

        // Demos posted
        const demos = await this.db.query(
            'SELECT COUNT(*) FROM demos WHERE created_at >= ? AND created_at <= ?',
            [weekStart, weekEnd]
        );
        stats.demosPosted = parseInt(demos.rows[0].count);

        // Top helpers
        const topHelpers = await this.db.query(
            `SELECT u.username, COUNT(k.id) as kudos_count 
             FROM kudos k
             JOIN users u ON k.receiver_id = u.id
             WHERE k.created_at >= ? AND k.created_at <= ? 
             GROUP BY u.username
             ORDER BY kudos_count DESC 
             LIMIT 3`,
            [weekStart, weekEnd]
        );
        stats.topHelpers = topHelpers.rows;

        // Streak leaders
        const streakLeaders = await this.db.query(
            `SELECT u.username, s.weekly_current 
             FROM streaks s
             JOIN users u ON s.user_id = u.id
             WHERE s.weekly_current > 0
             ORDER BY s.weekly_current DESC
             LIMIT 3`
        );
        stats.streakLeaders = streakLeaders.rows;

        return stats;
    }

    async saveSnapshot(stats, weekStart) {
        await this.db.query(
            `INSERT INTO analytics_snapshots 
             (week_start, active_percent, new_members, active_weeks_count, clinics_given, help_requests_solved, demos_posted, meet_attendance_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                weekStart,
                stats.activePercent,
                stats.newMembers,
                0, // Will be calculated separately
                stats.clinicsGiven,
                stats.helpSolved,
                stats.demosPosted,
                0  // Will be calculated separately
            ]
        );
    }

    async getUserAnalytics(userId) {
        const analytics = {
            totalMessages: 0,
            weeklyMessages: 0,
            clinicsGiven: 0,
            helpsSolved: 0,
            kudosReceived: 0,
            kudosGiven: 0,
            meetingsAttended: 0,
            currentStreak: 0
        };

        // Total messages
        const totalMessages = await this.db.query(
            'SELECT COUNT(*) FROM messages WHERE user_id = ?',
            [userId]
        );
        analytics.totalMessages = parseInt(totalMessages.rows[0].count);

        // Weekly messages
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weeklyMessages = await this.db.query(
            'SELECT COUNT(*) FROM messages WHERE user_id = ? AND created_at >= ?',
            [userId, weekAgo]
        );
        analytics.weeklyMessages = parseInt(weeklyMessages.rows[0].count);

        // Other stats...
        // (Similar queries for other metrics)

        return analytics;
    }
}