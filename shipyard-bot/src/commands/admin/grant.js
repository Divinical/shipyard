// src/commands/admin/grant.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class GrantCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('grant')
            .setDescription('Grant or revoke badges (Founder only)')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('badge')
                    .setDescription('Grant a badge to a user')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('User to grant badge to')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('badge')
                            .setDescription('Badge code to grant')
                            .setRequired(true)
                            .addChoices(
                                { name: 'First Ship', value: 'first_dock' },
                                { name: 'First Demo', value: 'first_demo' },
                                { name: 'Feedback Helper', value: 'clinic_helper_5' },
                                { name: 'Problem Solver', value: 'problem_solver_5' },
                                { name: '4 Week Streak', value: 'streak_4_weeks' },
                                { name: 'Meet Regular', value: 'meet_regular_4' },
                                { name: 'Season Winner', value: 'season_winner' },
                                { name: 'Early Bird', value: 'early_bird' },
                                { name: 'Mentor', value: 'mentor' },
                                { name: 'Shipped', value: 'shipped' }
                            )))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('revoke')
                    .setDescription('Revoke a badge from a user')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('User to revoke badge from')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('badge')
                            .setDescription('Badge code to revoke')
                            .setRequired(true)));
    }

    async execute(interaction) {
        if (!this.isFounder(interaction.member)) {
            return this.sendError(interaction, 'Only founders can manage badges');
        }

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');
        const badgeCode = interaction.options.getString('badge');

        if (subcommand === 'badge') {
            await this.grantBadge(interaction, targetUser, badgeCode);
        } else if (subcommand === 'revoke') {
            await this.revokeBadge(interaction, targetUser, badgeCode);
        }
    }

    async grantBadge(interaction, targetUser, badgeCode) {
        // Ensure user exists in database first
        await this.db.query(
            `INSERT OR IGNORE INTO users (id, username, joined_at) 
             VALUES (?, ?, ?)`,
            [targetUser.id, targetUser.username, new Date()]
        );

        // Get badge ID
        const badge = await this.db.query(
            'SELECT id, label FROM badges WHERE code = ?',
            [badgeCode]
        );

        if (badge.rows.length === 0) {
            return this.sendError(interaction, 'Invalid badge code');
        }

        // Check if already has badge
        const existing = await this.db.query(
            `SELECT 1 FROM user_badges 
             WHERE user_id = ? AND badge_id = ?`,
            [targetUser.id, badge.rows[0].id]
        );

        if (existing.rows.length > 0) {
            return this.sendError(interaction, 'User already has this badge');
        }

        // Grant badge
        await this.db.query(
            'INSERT INTO user_badges (user_id, badge_id, awarded_at) VALUES (?, ?, ?)',
            [targetUser.id, badge.rows[0].id, new Date()]
        );

        // Notify user
        try {
            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🏆 Badge Granted!')
                .setDescription(`You've been awarded the **${badge.rows[0].label}** badge by a founder!`)
                .setTimestamp();
            await targetUser.send({ embeds: [embed] });
        } catch (error) {
            // User has DMs disabled
        }

        await this.sendSuccess(interaction, `Granted ${badge.rows[0].label} badge to ${targetUser}`);
    }

    async revokeBadge(interaction, targetUser, badgeCode) {
        const result = await this.db.query(
            `DELETE FROM user_badges 
             WHERE user_id = ? AND badge_id = (SELECT id FROM badges WHERE code = ?)`,
            [targetUser.id, badgeCode]
        );

        if (result.rows.length === 0) {
            return this.sendError(interaction, 'User does not have this badge');
        }

        await this.sendSuccess(interaction, `Revoked ${badgeCode} badge from ${targetUser}`);
    }
}