// src/services/GamificationService.js
import { EmbedBuilder } from 'discord.js';
import moment from 'moment-timezone';

export class GamificationService {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
        this.logger = bot.logger;
    }

    async logAction(userId, actionType, refId = null, refUserId = null) {
        try {
            // Get current season
            const season = await this.getCurrentSeason();
            if (!season) return;

            // Check if gamification is enabled
            const enabled = await this.bot.policyManager.get('gamification.enabled', true);
            if (!enabled) return;

            // Calculate points for this action
            const points = await this.calculatePoints(actionType);
            
            // Check weekly cap
            const weekKey = this.getCurrentWeekKey();
            const weeklyPoints = await this.getWeeklyPoints(userId, weekKey);
            const maxWeekly = await this.bot.policyManager.get('points.max_per_week', 3);
            
            let finalPoints = points;
            if (weeklyPoints + points > maxWeekly) {
                finalPoints = Math.max(0, maxWeekly - weeklyPoints);
            }

            // Log the action
            await this.db.query(
                `INSERT INTO actions_log (user_id, type, ref_message_id, ref_user_id, points, season_id, week_key, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, actionType, refId, refUserId, finalPoints, season.id, weekKey, new Date()]
            );

            // Update season score
            if (finalPoints > 0) {
                await this.db.query(
                    `INSERT OR REPLACE INTO scores (user_id, season_id, points, updated_at)
                     VALUES (?, ?, COALESCE((SELECT points FROM scores WHERE user_id = ? AND season_id = ?), 0) + ?, datetime('now'))`,
                    [userId, season.id, userId, season.id, finalPoints]
                );
            }

            // Check for badge achievements
            await this.checkBadgeProgress(userId, actionType);

            // Check for role progression
            await this.checkRoleProgression(userId);

            return finalPoints;
        } catch (error) {
            this.logger.error('Error logging action:', error);
        }
    }

    async calculatePoints(actionType) {
        const basePoints = await this.bot.policyManager.get('points.per_action', 1);
        
        switch (actionType) {
            case 'meet_attend':
                const meetBonus = await this.bot.policyManager.get('points.meet_attendance_bonus', 1);
                return basePoints + meetBonus;
            case 'demo_presented':
                const demoBonus = await this.bot.policyManager.get('points.demo_presented_bonus', 1);
                return basePoints + demoBonus;
            default:
                return basePoints;
        }
    }

    async getCurrentSeason() {
        const result = await this.db.query(
            "SELECT * FROM seasons WHERE status = 'active' LIMIT 1"
        );
        
        if (result.rows.length === 0) {
            // Create new season if none exists
            return await this.startNewSeason();
        }
        
        return result.rows[0];
    }

    async startNewSeason() {
        const lengthWeeks = await this.bot.policyManager.get('season.length_weeks', 6);
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + (lengthWeeks * 7));

        const result = await this.db.query(
            `INSERT INTO seasons (start_date, end_date, status)
             VALUES (?, ?, 'active')`,
            [startDate, endDate]
        );
        
        const newSeason = await this.db.query(
            'SELECT * FROM seasons WHERE id = ?',
            [result.lastID]
        );

        // Announce new season
        await this.announceNewSeason(newSeason);
        
        return newSeason;
    }

    async endCurrentSeason() {
        // Get current season
        const season = await this.getCurrentSeason();
        if (!season) return;

        // Update season status
        await this.db.query(
            "UPDATE seasons SET status = 'closed' WHERE id = ?",
            [season.id]
        );

        // Get season winners
        const winners = await this.db.query(
            `SELECT u.username, s.points
             FROM scores s
             JOIN users u ON s.user_id = u.id
             WHERE s.season_id = ?
             ORDER BY s.points DESC
             LIMIT 10`,
            [season.id]
        );

        // Announce season end
        await this.announceSeasonEnd(season, winners || []);

        // Start new season
        await this.startNewSeason();
    }

    async getWeeklyPoints(userId, weekKey) {
        const result = await this.db.query(
            `SELECT SUM(points) as total
             FROM actions_log
             WHERE user_id = ? AND week_key = ?`,
            [userId, weekKey]
        );
        
        return parseInt(result?.total || 0);
    }

    async checkWeeklyGoal(userId) {
        const weekKey = this.getCurrentWeekKey();
        const requiredActions = await this.bot.policyManager.get('weekly_goal.required_actions', 2);
        
        const actions = await this.db.query(
            `SELECT COUNT(DISTINCT type) as unique_types, COUNT(*) as total
             FROM actions_log
             WHERE user_id = ? AND week_key = ?`,
            [userId, weekKey]
        );
        
        return parseInt(actions?.total || 0) >= requiredActions;
    }

    async updateWeeklyStreak(userId, achieved) {
        const now = new Date();
        
        if (achieved) {
            await this.db.query(
                `INSERT OR REPLACE INTO streaks (user_id, weekly_current, weekly_best, last_week_achieved, updated_at)
                 VALUES (?, 
                         COALESCE((SELECT weekly_current FROM streaks WHERE user_id = ?), 0) + 1,
                         MAX(COALESCE((SELECT weekly_best FROM streaks WHERE user_id = ?), 0), 
                             COALESCE((SELECT weekly_current FROM streaks WHERE user_id = ?), 0) + 1),
                         ?, ?)`,
                [userId, userId, userId, userId, this.getCurrentWeekKey(), now]
            );
        } else {
            await this.db.query(
                `UPDATE streaks 
                 SET weekly_current = 0, updated_at = ?
                 WHERE user_id = ?`,
                [now, userId]
            );
        }
    }

    async checkBadgeProgress(userId, actionType) {
        const badges = [];
        
        // Get user's action counts
        const counts = await this.db.query(
            `SELECT type, COUNT(*) as count
             FROM actions_log
             WHERE user_id = ?
             GROUP BY type`,
            [userId]
        );
        
        const actionCounts = {};
        (counts || []).forEach(row => {
            actionCounts[row.type] = parseInt(row.count);
        });

        // Check each badge criteria
        if (actionType === 'dock' && actionCounts.dock === 1) {
            badges.push('first_dock');
        }
        
        if (actionType === 'demo_posted' && actionCounts.demo_posted === 1) {
            badges.push('first_demo');
        }
        
        if (actionCounts.clinic_helpful >= 5) {
            badges.push('clinic_helper_5');
        }
        
        if (actionCounts.help_solved >= 5) {
            badges.push('problem_solver_5');
        }
        
        if (actionCounts.meet_attend >= 4) {
            badges.push('meet_regular_4');
        }

        // Check streak badge
        const streakResult = await this.db.query(
            'SELECT weekly_current FROM streaks WHERE user_id = ?',
            [userId]
        );
        
        if (streakResult?.weekly_current >= 4) {
            badges.push('streak_4_weeks');
        }

        // Award new badges
        for (const badgeCode of badges) {
            await this.awardBadge(userId, badgeCode);
        }
    }

    async awardBadge(userId, badgeCode) {
        // Check if user already has this badge
        const existing = await this.db.query(
            `SELECT 1 FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = ? AND b.code = ?`,
            [userId, badgeCode]
        );
        
        if (existing) return;

        // Get badge ID
        const badge = await this.db.query(
            'SELECT id, label FROM badges WHERE code = ?',
            [badgeCode]
        );
        
        if (!badge) return;

        // Award badge
        const season = await this.getCurrentSeason();
        await this.db.query(
            'INSERT INTO user_badges (user_id, badge_id, season_id, awarded_at) VALUES (?, ?, ?, ?)',
            [userId, badge.id, season?.id, new Date()]
        );

        // Notify user
        try {
            const user = await this.bot.client.users.fetch(userId);
            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🏆 Badge Earned!')
                .setDescription(`Congratulations! You've earned the **${badge.label}** badge!`)
                .setThumbnail('https://emojipedia-us.s3.amazonaws.com/thumbs/240/twitter/322/trophy_1f3c6.png')
                .setTimestamp();
            
            await user.send({ embeds: [embed] });
        } catch (error) {
            this.logger.error(`Could not notify user ${userId} about badge:`, error);
        }
    }

    async checkRoleProgression(userId) {
        const member = await this.bot.client.guilds.cache.get(process.env.DISCORD_GUILD_ID)
            .members.fetch(userId);
        
        if (!member) return;

        // Get user's lifetime stats
        const stats = await this.db.query(
            `SELECT 
                COUNT(DISTINCT CASE WHEN type = 'demo_presented' THEN ref_message_id END) as live_demos,
                COUNT(DISTINCT CASE WHEN type = 'clinic_helpful' THEN ref_message_id END) as helpful_clinics,
                COUNT(DISTINCT week_key) as active_weeks
             FROM actions_log
             WHERE user_id = ?`,
            [userId]
        );

        const { live_demos, helpful_clinics, active_weeks } = stats || { live_demos: 0, helpful_clinics: 0, active_weeks: 0 };

        // Check recent activity for Crew role
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        
        const recentActivity = await this.db.query(
            `SELECT 
                COUNT(DISTINCT week_key) as recent_weeks,
                COUNT(DISTINCT CASE WHEN type = 'clinic_helpful' THEN ref_message_id END) as recent_clinics
             FROM actions_log
             WHERE user_id = ? AND created_at >= ?`,
            [userId, twoWeeksAgo]
        );

        const { recent_weeks, recent_clinics } = recentActivity || { recent_weeks: 0, recent_clinics: 0 };

        // Define role objects
        const crewRole = member.guild.roles.cache.find(r => r.name === 'Crew');
        const builderRole = member.guild.roles.cache.find(r => r.name === 'Builder');
        const seniorBuilderRole = member.guild.roles.cache.find(r => r.name === 'Senior Builder');

        // Check Crew criteria
        if (crewRole && !member.roles.cache.has(crewRole.id)) {
            if (active_weeks >= 2 || recent_clinics >= 2) {
                await member.roles.add(crewRole);
                await this.announceRolePromotion(member, 'Crew');
            }
        }

        // Check Builder criteria
        if (builderRole && !member.roles.cache.has(builderRole.id)) {
            if (live_demos >= 1 && helpful_clinics >= 3) {
                await member.roles.add(builderRole);
                await this.announceRolePromotion(member, 'Builder');
            }
        }

        // Check Senior Builder criteria
        if (seniorBuilderRole && !member.roles.cache.has(seniorBuilderRole.id)) {
            if (live_demos >= 3 && helpful_clinics >= 10) {
                await member.roles.add(seniorBuilderRole);
                await this.announceRolePromotion(member, 'Senior Builder');
            }
        }
    }

    async announceRolePromotion(member, roleName) {
        const channel = member.guild.channels.cache.get(process.env.ANNOUNCEMENTS_CHANNEL_ID);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎉 Role Promotion!')
            .setDescription(`${member} has been promoted to **${roleName}**!`)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    }

    async announceNewSeason(season) {
        const channel = this.bot.client.channels.cache.get(process.env.ANNOUNCEMENTS_CHANNEL_ID);
        if (!channel) return;

        const endDate = moment(season.end_date).format('MMMM Do, YYYY');
        
        const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle('🎮 New Season Started!')
            .setDescription(
                `Season ${season.id} has begun!\n\n` +
                `**Duration:** 6 weeks (ends ${endDate})\n` +
                `**Weekly Goal:** 2 useful actions\n` +
                `**Max Points/Week:** 3\n\n` +
                `Good luck, builders! 🚀`
            )
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    }

    async announceSeasonEnd(season, winners) {
        const channel = this.bot.client.channels.cache.get(process.env.ANNOUNCEMENTS_CHANNEL_ID);
        if (!channel) return;

        let leaderboard = '';
        winners.forEach((winner, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            leaderboard += `${medal} **${winner.username}** - ${winner.points} points\n`;
        });

        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`🏆 Season ${season.id} Complete!`)
            .setDescription('Congratulations to all participants!')
            .addFields(
                { name: 'Top Builders', value: leaderboard || 'No participants' }
            )
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    }

    getCurrentWeekKey() {
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
        monday.setHours(0, 0, 0, 0);
        return monday;
    }

    async getUserStats(userId) {
        const season = await this.getCurrentSeason();
        const weekKey = this.getCurrentWeekKey();

        // Get current week stats
        const weekStats = await this.db.query(
            `SELECT type, COUNT(*) as count, SUM(points) as points
             FROM actions_log
             WHERE user_id = ? AND week_key = ?
             GROUP BY type`,
            [userId, weekKey]
        );

        // Get season points
        const seasonPoints = await this.db.query(
            'SELECT points FROM scores WHERE user_id = ? AND season_id = ?',
            [userId, season?.id]
        );

        // Get streaks
        const streaks = await this.db.query(
            'SELECT weekly_current, weekly_best FROM streaks WHERE user_id = ?',
            [userId]
        );

        // Get badges
        const badges = await this.db.query(
            `SELECT b.code, b.label, ub.awarded_at
             FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = ?
             ORDER BY ub.awarded_at DESC`,
            [userId]
        );

        return {
            weekStats: weekStats || [],
            seasonPoints: seasonPoints?.points || 0,
            currentStreak: streaks?.weekly_current || 0,
            bestStreak: streaks?.weekly_best || 0,
            badges: badges || []
        };
    }
}