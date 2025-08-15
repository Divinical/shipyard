// src/commands/admin/setup-badges.js - TEMPORARY COMMAND
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class SetupBadgesCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('setup-badges')
            .setDescription('TEMP: Populate badges table (Founder only)');
    }

    async execute(interaction) {
        if (!this.isFounder(interaction.member)) {
            return this.sendError(interaction, 'Only founders can run setup');
        }

        try {
            await interaction.deferReply({ ephemeral: true });

            // Check if badges already exist
            const existing = await this.db.query('SELECT COUNT(*) as count FROM badges');
            if (existing.rows[0].count > 0) {
                return interaction.editReply('❌ Badges already exist! Setup not needed.');
            }

            // Insert all badges
            const badges = [
                { code: 'first_dock', label: 'First Ship', description: 'Posted your first Dock Check' },
                { code: 'first_demo', label: 'First Demo', description: 'Posted your first demo' },
                { code: 'clinic_helper_5', label: 'Feedback Helper', description: 'Gave 5 helpful feedback responses' },
                { code: 'problem_solver_5', label: 'Problem Solver', description: 'Solved 5 help requests' },
                { code: 'streak_4_weeks', label: '4 Week Streak', description: 'Maintained a 4-week activity streak' },
                { code: 'meet_regular_4', label: 'Meet Regular', description: 'Attended 4 weekly meetings' },
                { code: 'season_winner', label: 'Season Winner', description: 'Won a season' },
                { code: 'early_bird', label: 'Early Bird', description: 'One of the first 100 members' },
                { code: 'mentor', label: 'Mentor', description: 'Helped 10+ members' },
                { code: 'shipped', label: 'Shipped', description: 'Launched a project' }
            ];

            let inserted = 0;
            for (const badge of badges) {
                await this.db.query(
                    `INSERT OR REPLACE INTO badges (code, label, description, seasonal)
                     VALUES (?, ?, ?, ?)`,
                    [badge.code, badge.label, badge.description, 0]
                );
                inserted++;
            }

            // Also insert default policies if they don't exist
            const policies = {
                'gamification.enabled': true,
                'season.length_weeks': 6,
                'weekly_goal.required_actions': 2,
                'points.per_action': 1,
                'points.max_per_week': 3,
                'points.meet_attendance_bonus': 1,
                'points.demo_presented_bonus': 1
            };

            for (const [key, value] of Object.entries(policies)) {
                await this.db.query(
                    `INSERT OR IGNORE INTO policies (key, value)
                     VALUES (?, ?)`,
                    [key, JSON.stringify(value)]
                );
            }

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Setup Complete!')
                .setDescription(`Successfully inserted ${inserted} badges into database.`)
                .addFields(
                    { name: 'Next Steps', value: '1. Test /grant badge command\n2. Delete this setup command\n3. Restart bot' }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Setup failed:', error);
            await interaction.editReply('❌ Setup failed: ' + error.message);
        }
    }
}