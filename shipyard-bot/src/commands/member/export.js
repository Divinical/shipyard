// src/commands/member/export.js
import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class ExportCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('export')
            .setDescription('Export your personal data')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('mydata')
                    .setDescription('Export all your data from the bot'));
    }

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const userId = interaction.user.id;

        try {
            // Gather all user data
            const userData = await this.gatherUserData(userId);
            
            // Convert to JSON
            const jsonData = JSON.stringify(userData, null, 2);
            
            // Create attachment
            const buffer = Buffer.from(jsonData, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { 
                name: `shipyard_data_${userId}_${Date.now()}.json` 
            });

            await interaction.editReply({
                content: 'Here is your exported data. This file contains all information we have stored about you.',
                files: [attachment]
            });
        } catch (error) {
            this.logger.error('Error exporting user data:', error);
            await interaction.editReply('An error occurred while exporting your data. Please try again later.');
        }
    }

    async gatherUserData(userId) {
        const data = {
            exportDate: new Date().toISOString(),
            userId: userId,
            profile: {},
            messages: [],
            meetings: [],
            clinics: [],
            helpRequests: [],
            demos: [],
            kudos: { given: [], received: [] },
            gamification: {},
            actions: []
        };

        // User profile
        const profile = await this.db.query(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );
        data.profile = profile.rows[0] || {};

        // Messages
        const messages = await this.db.query(
            'SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
            [userId]
        );
        data.messages = messages.rows;

        // Meeting RSVPs and attendance
        const rsvps = await this.db.query(
            `SELECT m.*, r.status as rsvp_status, a.attended
             FROM meets m
             LEFT JOIN meet_rsvps r ON m.id = r.meet_id AND r.user_id = ?
             LEFT JOIN meet_attendance a ON m.id = a.meet_id AND a.user_id = ?
             WHERE r.user_id = ? OR a.user_id = ?`,
            [userId, userId, userId, userId]
        );
        data.meetings = rsvps.rows;

        // Clinics
        const clinics = await this.db.query(
            'SELECT * FROM clinics WHERE author_id = ?',
            [userId]
        );
        data.clinics = clinics.rows;

        // Help requests
        const helpRequests = await this.db.query(
            'SELECT * FROM help_requests WHERE author_id = ? OR solved_by = ?',
            [userId, userId]
        );
        data.helpRequests = helpRequests.rows;

        // Demos
        const demos = await this.db.query(
            'SELECT * FROM demos WHERE author_id = ?',
            [userId]
        );
        data.demos = demos.rows;

        // Kudos
        const kudosGiven = await this.db.query(
            'SELECT * FROM kudos WHERE giver_id = ?',
            [userId]
        );
        data.kudos.given = kudosGiven.rows;

        const kudosReceived = await this.db.query(
            'SELECT * FROM kudos WHERE receiver_id = ?',
            [userId]
        );
        data.kudos.received = kudosReceived.rows;

        // Gamification data
        const scores = await this.db.query(
            'SELECT * FROM scores WHERE user_id = ?',
            [userId]
        );
        const streaks = await this.db.query(
            'SELECT * FROM streaks WHERE user_id = ?',
            [userId]
        );
        const badges = await this.db.query(
            `SELECT b.*, ub.awarded_at FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = ?`,
            [userId]
        );
        const actions = await this.db.query(
            'SELECT * FROM actions_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 500',
            [userId]
        );

        data.gamification = {
            scores: scores.rows,
            streaks: streaks.rows[0] || {},
            badges: badges.rows,
            recentActions: actions.rows
        };

        return data;
    }
}