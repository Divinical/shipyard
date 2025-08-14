// src/commands/gamification/season.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class SeasonCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('season')
            .setDescription('View current season information');
    }

    async execute(interaction) {
        // Get current season
        const season = await this.db.query(
            "SELECT * FROM seasons WHERE status = 'active' LIMIT 1"
        );

        if (season.rows.length === 0) {
            return interaction.reply({
                content: 'No active season currently. A new season will start soon!',
                ephemeral: true
            });
        }

        const currentSeason = season.rows[0];
        const userId = interaction.user.id;

        // Get user's season stats
        const userScore = await this.db.query(
            'SELECT points FROM scores WHERE user_id = ? AND season_id = ?',
            [userId, currentSeason.id]
        );

        // Get top 5 players
        const leaderboard = await this.db.query(
            `SELECT u.username, s.points
             FROM scores s
             JOIN users u ON s.user_id = u.id
             WHERE s.season_id = ?
             ORDER BY s.points DESC
             LIMIT 5`,
            [currentSeason.id]
        );

        // Calculate days remaining
        const endDate = new Date(currentSeason.end_date);
        const now = new Date();
        const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

        const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle(`📅 Season ${currentSeason.id}`)
            .setDescription(`**${daysRemaining} days remaining**`)
            .addFields(
                { 
                    name: 'Season Period', 
                    value: `${new Date(currentSeason.start_date).toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
                    inline: false
                },
                { 
                    name: 'Your Points', 
                    value: `${userScore.rows[0]?.points || 0} points`,
                    inline: true
                },
                {
                    name: 'Weekly Cap',
                    value: '3 points/week',
                    inline: true
                }
            )
            .setTimestamp();

        // Add leaderboard if public
        const publicLeaderboard = await this.bot.policyManager.get('leaderboard.public', false);
        if (publicLeaderboard && leaderboard.rows.length > 0) {
            let board = '';
            leaderboard.rows.forEach((player, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                board += `${medal} **${player.username}** - ${player.points} pts\n`;
            });
            embed.addFields({ name: '🏆 Top Players', value: board });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}