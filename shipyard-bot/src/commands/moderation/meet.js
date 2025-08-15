// src/commands/moderation/meet.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';
import { ChannelManager } from '../../utils/ChannelManager.js';
import moment from 'moment-timezone';

export default class MeetCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.channelManager = new ChannelManager(bot);
        this.data = new SlashCommandBuilder()
            .setName('meet')
            .setDescription('Manage weekly meetings')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('create')
                    .setDescription('Create a meeting - announcement will be posted in announcements channel')
                    .addStringOption(option =>
                        option
                            .setName('title')
                            .setDescription('Meeting title')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('datetime')
                            .setDescription('Date and time (YYYY-MM-DD HH:MM format, e.g., "2024-03-20 15:00")')
                            .setRequired(true))
                    .addIntegerOption(option =>
                        option
                            .setName('duration')
                            .setDescription('Duration in minutes')
                            .setRequired(false)
                            .setMinValue(15)
                            .setMaxValue(180)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('close')
                    .setDescription('Close RSVPs for a meeting')
                    .addIntegerOption(option =>
                        option
                            .setName('meet_id')
                            .setDescription('Meeting ID')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('attendance')
                    .setDescription('Take attendance for a meeting')
                    .addIntegerOption(option =>
                        option
                            .setName('meet_id')
                            .setDescription('Meeting ID')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List upcoming meetings'));
    }

    async execute(interaction) {
        if (!this.isModerator(interaction.member)) {
            return this.sendError(interaction, 'Only moderators can manage meetings');
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create':
                await this.createMeet(interaction);
                break;
            case 'close':
                await this.closeMeet(interaction);
                break;
            case 'attendance':
                await this.takeAttendance(interaction);
                break;
            case 'list':
                await this.listMeets(interaction);
                break;
        }
    }

    async createMeet(interaction) {
        const title = interaction.options.getString('title');
        const datetime = interaction.options.getString('datetime');
        const duration = interaction.options.getInteger('duration') || 60;

        // Parse datetime
        const timezone = process.env.SERVER_TIMEZONE || 'Europe/London';
        const meetTime = moment.tz(datetime, 'YYYY-MM-DD HH:mm', timezone);

        if (!meetTime.isValid()) {
            return this.sendError(interaction, 'Invalid date format. Use YYYY-MM-DD HH:MM (e.g., "2024-12-25 14:30")');
        }

        this.bot.logger.info(`Parsed meet time: ${datetime} -> ${meetTime.format()} (${meetTime.toISOString()})`);

        // Create meet in database
        const result = await this.db.query(
            `INSERT INTO meets (title, start_at, duration_mins, status)
             VALUES (?, ?, ?, 'scheduled')`,
            [title, meetTime.toDate(), duration]
        );

        const meetId = result.lastID;

        // Create RSVP embed
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📅 ${title}`)
            .setDescription('React to RSVP for this meeting!')
            .addFields(
                { name: '📆 Date', value: meetTime.format('dddd, MMMM Do'), inline: true },
                { name: '⏰ Time', value: meetTime.format('HH:mm') + ' ' + timezone, inline: true },
                { name: '⏱️ Duration', value: `${duration} minutes`, inline: true },
                { name: 'Voice Channel', value: '<#' + process.env.WEEKLY_MEET_VOICE_ID + '>', inline: false }
            )
            .setFooter({ text: `Meeting ID: ${meetId}` })
            .setTimestamp();

        // Create RSVP buttons
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

        // Post to announcements using ChannelManager
        const { message, channel: announcementsChannel, usedFallback, error } = await this.channelManager.postMessage(
            'ANNOUNCEMENTS',
            interaction,
            { content: '@everyone', embeds: [embed], components: [row] }
        );

        if (!message) {
            return await this.sendError(interaction, `Unable to post meeting announcement: ${error}`);
        }

        // Update meet with RSVP message ID
        await this.db.query(
            'UPDATE meets SET rsvp_message_id = ? WHERE id = ?',
            [message.id, meetId]
        );

        // Schedule reminders
        this.scheduleReminders(meetId, meetTime);

        const successMessage = usedFallback 
            ? 'Meeting created! RSVP posted in this channel.'
            : `Meeting created! RSVP posted in <#${announcementsChannel.id}>.`;
        
        await this.sendSuccess(interaction, successMessage);
    }

    async closeMeet(interaction) {
        const meetId = interaction.options.getInteger('meet_id');

        // Update status
        await this.db.query(
            "UPDATE meets SET status = 'closed' WHERE id = ?",
            [meetId]
        );

        // Get RSVP stats
        const rsvps = await this.db.query(
            `SELECT status, COUNT(*) as count
             FROM meet_rsvps
             WHERE meet_id = ?
             GROUP BY status`,
            [meetId]
        );

        const stats = {
            yes: 0,
            no: 0,
            maybe: 0
        };

        rsvps.rows.forEach(row => {
            stats[row.status] = parseInt(row.count);
        });

        await this.sendSuccess(
            interaction,
            `RSVPs closed for meeting ${meetId}\n` +
            `✅ Yes: ${stats.yes} | ❌ No: ${stats.no} | 🤷 Maybe: ${stats.maybe}`
        );
    }

    async takeAttendance(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const meetId = interaction.options.getInteger('meet_id');

        // Get all RSVPs
        const rsvps = await this.db.query(
            `SELECT u.id, u.username, r.status
             FROM meet_rsvps r
             JOIN users u ON r.user_id = u.id
             WHERE r.meet_id = ? AND r.status IN ('yes', 'maybe')
             ORDER BY u.username`,
            [meetId]
        );

        if (rsvps.rows.length === 0) {
            return interaction.editReply('No RSVPs found for this meeting');
        }

        // Create attendance select menu
        const options = rsvps.rows.map(user => ({
            label: user.username,
            value: user.id,
            default: false
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`attendance_${meetId}`)
            .setPlaceholder('Select attendees')
            .setMinValues(0)
            .setMaxValues(options.length)
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Create save button
        const saveButton = new ButtonBuilder()
            .setCustomId(`save_attendance_${meetId}`)
            .setLabel('Save Attendance')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💾');

        const buttonRow = new ActionRowBuilder().addComponents(saveButton);

        await interaction.editReply({
            content: `Select attendees for meeting ${meetId}:`,
            components: [row, buttonRow]
        });
    }

    async listMeets(interaction) {
        // Get all meetings (recent and upcoming)
        const meets = await this.db.query(
            `SELECT id, title, start_at, duration_mins, status
             FROM meets
             ORDER BY start_at DESC
             LIMIT 10`
        );

        if (meets.rows.length === 0) {
            return interaction.reply('No meetings found');
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📅 Recent & Upcoming Meetings')
            .setTimestamp();

        const now = new Date();
        for (const meet of meets.rows) {
            const meetTime = moment(meet.start_at);
            const isPast = meetTime.toDate() < now;
            const statusIcon = isPast ? '⏳' : '🕒';
            
            embed.addFields({
                name: `${statusIcon} ${meet.title} (ID: ${meet.id})`,
                value: `📆 ${meetTime.format('MMM DD, YYYY HH:mm')} | ⏱️ ${meet.duration_mins}min | Status: ${meet.status}`
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    scheduleReminders(meetId, meetTime) {
        // Schedule 24h reminder
        const dayBefore = meetTime.clone().subtract(24, 'hours');
        if (dayBefore.isAfter(moment())) {
            setTimeout(() => this.sendReminder(meetId, '24 hours'), dayBefore.diff(moment()));
        }

        // Schedule 1h reminder
        const hourBefore = meetTime.clone().subtract(1, 'hour');
        if (hourBefore.isAfter(moment())) {
            setTimeout(() => this.sendReminder(meetId, '1 hour'), hourBefore.diff(moment()));
        }
    }

    async sendReminder(meetId, timeframe) {
        // Get users who haven't responded or said maybe
        const nonResponders = await this.db.query(
            `SELECT u.id FROM users u
             WHERE u.away_until IS NULL OR u.away_until < datetime('now')
             AND u.id NOT IN (
                SELECT user_id FROM meet_rsvps 
                WHERE meet_id = ? AND status = 'yes'
             )`,
            [meetId]
        );

        const meet = await this.db.query(
            'SELECT title, start_at FROM meets WHERE id = ?',
            [meetId]
        );

        for (const user of nonResponders.rows) {
            try {
                const member = await this.bot.client.users.fetch(user.id);
                await member.send(
                    `⏰ Reminder: "${meet.rows[0].title}" is in ${timeframe}!\n` +
                    `Please RSVP if you haven't already.`
                );
            } catch (error) {
                this.bot.logger.error(`Could not send reminder to ${user.id}:`, error);
            }
        }
    }
}