// src/services/MeetService.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import moment from 'moment-timezone';

export class MeetService {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
        this.logger = bot.logger;
    }

    async createMeet(title, startTime, duration, createdBy) {
        const result = await this.db.query(
            `INSERT INTO meets (title, start_at, duration_mins, status)
             VALUES (?, ?, ?, 'scheduled')`,
            [title, startTime, duration]
        );
        
        const meetId = result.lastID;

        this.logger.info(`Meet ${meetId} created by ${createdBy}`);
        
        return meetId;
    }

    async sendRSVP(meetId, channel) {
        const meet = await this.db.query(
            'SELECT * FROM meets WHERE id = ?',
            [meetId]
        );

        if (!meet) return null;

        const meetData = meet;
        const timezone = process.env.SERVER_TIMEZONE || 'Europe/London';
        const meetTime = moment(meetData.start_at).tz(timezone);

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📅 ${meetData.title}`)
            .setDescription('React to RSVP for this meeting!')
            .addFields(
                { name: '📆 Date', value: meetTime.format('dddd, MMMM Do'), inline: true },
                { name: '⏰ Time', value: meetTime.format('HH:mm') + ' ' + timezone, inline: true },
                { name: '⏱️ Duration', value: `${meetData.duration_mins} minutes`, inline: true }
            )
            .setFooter({ text: `Meeting ID: ${meetId}` })
            .setTimestamp();

        const yesButton = new ButtonBuilder()
            .setCustomId(`rsvp_${meetId}_yes`)
            .setLabel('Yes')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const noButton = new ButtonBuilder()
            .setCustomId(`rsvp_${meetId}_no`)
            .setLabel('No')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌');

        const maybeButton = new ButtonBuilder()
            .setCustomId(`rsvp_${meetId}_maybe`)
            .setLabel('Maybe')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🤷');

        const row = new ActionRowBuilder().addComponents(yesButton, noButton, maybeButton);

        const message = await channel.send({ 
            content: '@everyone',
            embeds: [embed],
            components: [row]
        });

        // Update meet with RSVP message ID
        await this.db.query(
            'UPDATE meets SET rsvp_message_id = ? WHERE id = ?',
            [message.id, meetId]
        );

        return message.id;
    }

    async recordRSVP(meetId, userId, status) {
        await this.db.query(
            `INSERT OR REPLACE INTO meet_rsvps (meet_id, user_id, status, updated_at)
             VALUES (?, ?, ?, ?)`,
            [meetId, userId, status, new Date()]
        );
    }

    async recordAttendance(meetId, attendees) {
        for (const userId of attendees) {
            await this.db.query(
                `INSERT OR REPLACE INTO meet_attendance (meet_id, user_id, attended)
                 VALUES (?, ?, 1)`,
                [meetId, userId]
            );

            // Log action for gamification
            if (this.bot.services?.gamification) {
                await this.bot.services.gamification.logAction(userId, 'meet_attend', null);
            }
        }
    }

    async getUpcomingMeets() {
        const meets = await this.db.query(
            `SELECT * FROM meets 
             WHERE start_at > datetime('now') AND status = 'scheduled'
             ORDER BY start_at
             LIMIT 5`
        );

        return meets;
    }

    async sendReminders(meetId, timeframe) {
        const nonResponders = await this.db.query(
            `SELECT u.id FROM users u
             WHERE u.away_until IS NULL OR u.away_until < datetime('now')
             AND u.id NOT IN (
                SELECT user_id FROM meet_rsvps 
                WHERE meet_id = ? AND status IN ('yes', 'no')
             )`,
            [meetId]
        );

        const meet = await this.db.query(
            'SELECT title, start_at FROM meets WHERE id = ?',
            [meetId]
        );

        let sent = 0;
        for (const user of (nonResponders || [])) {
            try {
                const member = await this.bot.client.users.fetch(user.id);
                await member.send(
                    `⏰ Reminder: "${meet.title}" is in ${timeframe}!\n` +
                    `Please RSVP if you haven't already.`
                );
                sent++;
            } catch (error) {
                // Can't DM user
            }
        }

        this.logger.info(`Sent ${sent} reminders for meet ${meetId}`);
    }
}