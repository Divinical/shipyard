// src/services/CronManager.js
import cron from 'node-cron';
import moment from 'moment-timezone';
import { EmbedBuilder, ThreadAutoArchiveDuration } from 'discord.js';

export class CronManager {
    constructor(bot) {
        this.bot = bot;
        this.jobs = new Map();
        this.timezone = process.env.SERVER_TIMEZONE || 'Europe/London';
        this.initializeJobs();
    }

    initializeJobs() {
        // Daily Dock Check - 09:00
        this.scheduleJob('dockCheck', '0 9 * * *', () => this.runDockCheck());
        
        // Activity Monitor - 10:00 daily
        this.scheduleJob('activityMonitor', '0 10 * * *', () => this.runActivityMonitor());
        
        // Weekly Analytics Digest - Sunday 18:00
        this.scheduleJob('weeklyDigest', '0 18 * * 0', () => this.runWeeklyDigest());
        
        // Showcase Thread - Friday 12:00
        this.scheduleJob('showcaseThread', '0 12 * * 5', () => this.createShowcaseThread());
        
        // Thread Starters - Tuesday/Thursday 10:00, Sunday 19:00
        this.scheduleJob('threadStarterTue', '0 10 * * 2', () => this.postThreadStarter());
        this.scheduleJob('threadStarterThu', '0 10 * * 4', () => this.postThreadStarter());
        this.scheduleJob('threadStarterSun', '0 19 * * 0', () => this.postThreadStarter());
        
        // Gamification Jobs
        this.scheduleJob('weeklyGoalCompute', '30 17 * * 0', () => this.computeWeeklyGoals());
        this.scheduleJob('quietNudge', '0 11 * * *', () => this.sendQuietNudges());
        
        // Away status cleanup - daily at 00:00
        this.scheduleJob('awayCleanup', '0 0 * * *', () => this.cleanupAwayStatuses());
        
        this.bot.logger.success(`Initialized ${this.jobs.size} cron jobs`);
    }

    scheduleJob(name, schedule, task) {
        const job = cron.schedule(schedule, async () => {
            try {
                this.bot.logger.info(`Running cron job: ${name}`);
                await task();
                this.bot.logger.success(`Completed cron job: ${name}`);
            } catch (error) {
                this.bot.logger.error(`Error in cron job ${name}:`, error);
            }
        }, {
            timezone: this.timezone
        });
        
        this.jobs.set(name, job);
        job.start();
    }

    async runDockCheck() {
        const channel = this.bot.client.channels.cache.get(process.env.DOCK_CHECK_CHANNEL_ID);
        if (!channel) return;

        const today = moment().tz(this.timezone).format('dddd, MMMM Do');
        const thread = await channel.threads.create({
            name: `⚓ Dock Check - ${today}`,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
            reason: 'Daily Dock Check'
        });

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('⚓ Daily Dock Check')
            .setDescription('What\'s your plan for today? → What did you accomplish?')
            .addFields(
                { name: '🎯 Morning', value: 'Share what you plan to work on today' },
                { name: '✅ Evening', value: 'Update with what you accomplished' }
            )
            .setFooter({ text: 'Reply in this thread to log your dock check!' })
            .setTimestamp();

        await thread.send({ embeds: [embed] });
    }

    async runActivityMonitor() {
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        
        const twentyEightDaysAgo = new Date();
        twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

        // Find inactive users (not away)
        const inactiveUsers = await this.bot.db.query(
            `SELECT u.id, u.username, u.last_activity_at 
             FROM users u 
             WHERE u.away_until IS NULL OR u.away_until < datetime('now')
             AND u.last_activity_at < ?
             AND u.deleted_at IS NULL`,
            [fourteenDaysAgo]
        );

        const modChannel = this.bot.client.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
        
        for (const user of (inactiveUsers || [])) {
            const daysSinceActivity = Math.floor((Date.now() - new Date(user.last_activity_at)) / (1000 * 60 * 60 * 24));
            
            if (daysSinceActivity >= 28) {
                // Create removal queue entry
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('⚠️ Inactive User - Removal Queue')
                    .setDescription(`<@${user.id}> has been inactive for ${daysSinceActivity} days`)
                    .addFields(
                        { name: 'Username', value: user.username, inline: true },
                        { name: 'Last Activity', value: new Date(user.last_activity_at).toLocaleDateString(), inline: true }
                    )
                    .setFooter({ text: 'Requires founder approval for removal' });
                
                await modChannel.send({ embeds: [embed] });
                
            } else if (daysSinceActivity >= 14) {
                // Send friendly DM
                try {
                    const member = await this.bot.client.users.fetch(user.id);
                    await member.send(
                        `Hey ${user.username}! 👋\n\n` +
                        `We noticed you haven't been active in ShipYard for a while. ` +
                        `We miss having you around! Is everything okay?\n\n` +
                        `If you need to take a break, you can use \`/away set\` to let us know. ` +
                        `Otherwise, we'd love to see you back in the community!\n\n` +
                        `Keep shipping! 🚀`
                    );
                } catch (error) {
                    this.bot.logger.error(`Could not DM user ${user.id}:`, error);
                }
            }
        }
    }

    async runWeeklyDigest() {
        const channel = this.bot.client.channels.cache.get(process.env.ANNOUNCEMENTS_CHANNEL_ID);
        if (!channel) return;

        const weekStart = moment().tz(this.timezone).startOf('week');
        const weekEnd = moment().tz(this.timezone).endOf('week');

        // Gather analytics
        const newMembers = await this.bot.db.query(
            'SELECT COUNT(*) as count FROM users WHERE joined_at >= ? AND joined_at <= ?',
            [weekStart.toDate(), weekEnd.toDate()]
        );

        const activeMembers = await this.bot.db.query(
            'SELECT COUNT(DISTINCT user_id) as count FROM messages WHERE created_at >= ? AND created_at <= ?',
            [weekStart.toDate(), weekEnd.toDate()]
        );

        const totalMembers = await this.bot.db.query(
            'SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL'
        );

        const clinicsGiven = await this.bot.db.query(
            'SELECT COUNT(*) as count FROM clinics WHERE created_at >= ? AND created_at <= ?',
            [weekStart.toDate(), weekEnd.toDate()]
        );

        const helpSolved = await this.bot.db.query(
            'SELECT COUNT(*) as count FROM help_requests WHERE solved_at >= ? AND solved_at <= ?',
            [weekStart.toDate(), weekEnd.toDate()]
        );

        const demosPosted = await this.bot.db.query(
            'SELECT COUNT(*) as count FROM demos WHERE created_at >= ? AND created_at <= ?',
            [weekStart.toDate(), weekEnd.toDate()]
        );

        // Get top contributors
        const topHelpers = await this.bot.db.query(
            `SELECT receiver_id, COUNT(*) as kudos_count 
             FROM kudos 
             WHERE created_at >= ? AND created_at <= ? 
             GROUP BY receiver_id 
             ORDER BY kudos_count DESC 
             LIMIT 3`,
            [weekStart.toDate(), weekEnd.toDate()]
        );

        const activePercent = ((parseInt(activeMembers.count) / parseInt(totalMembers.count)) * 100).toFixed(1);

        // Create digest embed
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('📊 Weekly Community Digest')
            .setDescription(`Week of ${weekStart.format('MMM D')} - ${weekEnd.format('MMM D, YYYY')}`)
            .addFields(
                { name: '👥 New Members', value: newMembers.count.toString(), inline: true },
                { name: '📈 Active %', value: `${activePercent}%`, inline: true },
                { name: '💡 Feedback Given', value: clinicsGiven.count.toString(), inline: true },
                { name: '✅ Problems Solved', value: helpSolved.count.toString(), inline: true },
                { name: '🎬 Demos Posted', value: demosPosted.count.toString(), inline: true }
            )
            .setTimestamp();

        if (topHelpers && topHelpers.length > 0) {
            const helpers = await Promise.all(
                topHelpers.map(async (h, i) => {
                    const user = await this.bot.client.users.fetch(h.receiver_id);
                    return `${i + 1}. ${user.username} (${h.kudos_count} kudos)`;
                })
            );
            embed.addFields({ name: '🏆 Top Helpers', value: helpers.join('\n') });
        }

        // Save snapshot to database
        await this.bot.db.query(
            `INSERT INTO analytics_snapshots 
             (week_start, active_percent, new_members, clinics_given, help_requests_solved, demos_posted)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                weekStart.toDate(),
                activePercent,
                newMembers.count,
                clinicsGiven.count,
                helpSolved.count,
                demosPosted.count
            ]
        );

        await channel.send({ embeds: [embed] });
    }

    async createShowcaseThread() {
        const channel = this.bot.client.channels.cache.get(process.env.SHOWCASE_CHANNEL_ID);
        if (!channel) return;

        const friday = moment().tz(this.timezone).format('MMMM Do');
        const thread = await channel.threads.create({
            name: `🎬 Showcase Friday - ${friday}`,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: 'Weekly Showcase Thread'
        });

        const embed = new EmbedBuilder()
            .setColor(0xFF00FF)
            .setTitle('🎬 Showcase Friday!')
            .setDescription('Share what you\'ve been building this week!')
            .addFields(
                { name: '📝 How to share', value: 'Reply to this thread with:\n• Screenshots/videos of your project\n• A brief description\n• Any feedback you\'re looking for' },
                { name: '🎤 Live Demo', value: 'Want to present at the Weekly Meet? Use `/demo queue` to join!' }
            )
            .setFooter({ text: 'Let\'s celebrate our progress! 🚀' })
            .setTimestamp();

        await thread.send({ embeds: [embed] });
    }

    async computeWeeklyGoals() {
        // Update weekly streaks
        const weekStart = moment().tz(this.timezone).startOf('week');
        const weekEnd = moment().tz(this.timezone).endOf('week');

        // Get all users who met their weekly goal
        const achievers = await this.bot.db.query(
            `SELECT user_id, COUNT(DISTINCT type) as action_types, COUNT(*) as total_actions
             FROM actions_log
             WHERE created_at >= ? AND created_at <= ?
             GROUP BY user_id
             HAVING COUNT(*) >= 2`,
            [weekStart.toDate(), weekEnd.toDate()]
        );

        // Update streaks for achievers
        for (const achiever of (achievers || [])) {
            await this.bot.db.query(
                `INSERT OR REPLACE INTO streaks (user_id, weekly_current, weekly_best, last_week_achieved, updated_at)
                 VALUES (?, 
                         COALESCE((SELECT weekly_current FROM streaks WHERE user_id = ?), 0) + 1,
                         MAX(COALESCE((SELECT weekly_best FROM streaks WHERE user_id = ?), 0), 
                             COALESCE((SELECT weekly_current FROM streaks WHERE user_id = ?), 0) + 1),
                         ?, datetime('now'))`,
                [achiever.user_id, achiever.user_id, achiever.user_id, achiever.user_id, weekEnd.toDate()]
            );
        }

        // Reset streaks for non-achievers
        await this.bot.db.query(
            `UPDATE streaks 
             SET weekly_current = 0, updated_at = datetime('now')
             WHERE user_id NOT IN (
                 SELECT user_id FROM actions_log 
                 WHERE created_at >= ? AND created_at <= ?
                 GROUP BY user_id HAVING COUNT(*) >= 2
             )`,
            [weekStart.toDate(), weekEnd.toDate()]
        );
    }

    async sendQuietNudges() {
        const nudgeDays = parseInt(process.env.DEFAULT_QUIET_DAYS_BEFORE_NUDGE) || 10;
        const nudgeDate = new Date();
        nudgeDate.setDate(nudgeDate.getDate() - nudgeDays);

        const quietUsers = await this.bot.db.query(
            `SELECT DISTINCT u.id, u.username 
             FROM users u
             WHERE u.last_activity_at < ?
             AND (u.away_until IS NULL OR u.away_until < datetime('now'))
             AND u.deleted_at IS NULL
             AND NOT EXISTS (
                 SELECT 1 FROM messages m 
                 WHERE m.user_id = u.id AND m.created_at > ?
             )`,
            [nudgeDate]
        );

        for (const user of (quietUsers || [])) {
            try {
                const member = await this.bot.client.users.fetch(user.id);
                await member.send(
                    `Hey ${user.username}! 👋\n\n` +
                    `Just checking in - we haven't seen you post in a while. ` +
                    `How's your project going? Any updates to share?\n\n` +
                    `Even a quick dock check helps keep the momentum! ⚓`
                );
            } catch (error) {
                this.bot.logger.error(`Could not nudge user ${user.id}:`, error);
            }
        }
    }

    async cleanupAwayStatuses() {
        // Get users whose away status will be cleared first
        const clearedUsers = await this.bot.db.query(
            `SELECT id FROM users 
             WHERE away_until < datetime('now') AND away_until IS NOT NULL`
        );
        
        // Clear expired away statuses
        await this.bot.db.query(
            `UPDATE users 
             SET away_until = NULL 
             WHERE away_until < datetime('now') AND away_until IS NOT NULL`
        );

        // Remove Away role from cleared users
        const guild = this.bot.client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
        const awayRole = guild.roles.cache.find(r => r.name === 'Away');
        
        if (awayRole) {
            for (const user of (clearedUsers || [])) {
                try {
                    const member = await guild.members.fetch(user.id);
                    await member.roles.remove(awayRole);
                } catch (error) {
                    this.bot.logger.error(`Could not remove Away role from ${user.id}:`, error);
                }
            }
        }
    }

    async postThreadStarter() {
        const prompts = [
            "What's the biggest challenge you're facing with your project right now?",
            "What tool or resource has been a game-changer for your building process?",
            "Share a win from this week - no matter how small!",
            "What's one thing you learned this week that surprised you?",
            "If you could automate one part of your workflow, what would it be?",
            "What's your most controversial development opinion?",
            "Show us your workspace! Where does the magic happen?",
            "What's the feature you're most proud of in your current project?",
            "What's your biggest time-waster, and how are you tackling it?",
            "Share a mistake you made recently and what you learned from it."
        ];

        const channel = this.bot.client.channels.cache.get(process.env.BUILD_LOG_CHANNEL_ID);
        if (!channel) return;

        const prompt = prompts[Math.floor(Math.random() * prompts.length)];
        
        const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle('💭 Discussion Starter')
            .setDescription(prompt)
            .setFooter({ text: 'Share your thoughts below!' })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    }

    stopAll() {
        for (const [name, job] of this.jobs) {
            job.stop();
            this.bot.logger.info(`Stopped cron job: ${name}`);
        }
    }
}