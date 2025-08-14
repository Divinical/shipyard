// src/commands/admin/health.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';
import os from 'os';

export default class HealthCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('health')
            .setDescription('Check bot health and status (Founder only)');
    }

    async execute(interaction) {
        if (!this.isFounder(interaction.member)) {
            return this.sendError(interaction, 'Only founders can check bot health');
        }

        await interaction.deferReply({ ephemeral: true });

        // Gather health metrics
        const health = await this.gatherHealthMetrics();

        const embed = new EmbedBuilder()
            .setColor(health.status === 'healthy' ? 0x00FF00 : 0xFFFF00)
            .setTitle('🏥 Bot Health Check')
            .setDescription(`Status: **${health.status.toUpperCase()}**`)
            .addFields(
                { name: '⏱️ Uptime', value: health.uptime, inline: true },
                { name: '💾 Memory', value: health.memory, inline: true },
                { name: '⚡ CPU', value: health.cpu, inline: true },
                { name: '🗄️ Database', value: health.database, inline: true },
                { name: '👥 Users', value: health.users.toString(), inline: true },
                { name: '📊 Commands', value: health.commands.toString(), inline: true },
                { name: '⏰ Cron Jobs', value: health.cronJobs, inline: true },
                { name: '📅 Last Weekly Digest', value: health.lastDigest || 'Never', inline: true },
                { name: '🔄 Last Activity Check', value: health.lastActivityCheck || 'Never', inline: true }
            )
            .setFooter({ text: `Node.js ${process.version}` })
            .setTimestamp();

        // Add any warnings
        if (health.warnings.length > 0) {
            embed.addFields({
                name: '⚠️ Warnings',
                value: health.warnings.join('\n')
            });
        }

        await interaction.editReply({ embeds: [embed] });
    }

    async gatherHealthMetrics() {
        const health = {
            status: 'healthy',
            uptime: this.formatUptime(process.uptime()),
            memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
            cpu: `${Math.round(os.loadavg()[0] * 100)}%`,
            database: 'Connected',
            users: 0,
            commands: this.bot.commands.size,
            cronJobs: `${this.bot.cronManager?.jobs?.size || 0} active`,
            warnings: []
        };

        // Check database
        try {
            await this.db.query('SELECT 1');
            const userCount = await this.db.query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL');
            health.users = parseInt(userCount.rows[0].count);
        } catch (error) {
            health.database = 'Error';
            health.status = 'degraded';
            health.warnings.push('Database connection issue');
        }

        // Check last cron runs
        try {
            const lastDigest = await this.db.query(
                'SELECT created_at FROM analytics_snapshots ORDER BY created_at DESC LIMIT 1'
            );
            if (lastDigest.rows.length > 0) {
                health.lastDigest = new Date(lastDigest.rows[0].created_at).toLocaleDateString();
            }

            const lastActivity = await this.db.query(
                `SELECT value FROM policies WHERE key = 'last_activity_check'`
            );
            if (lastActivity.rows.length > 0) {
                health.lastActivityCheck = new Date(JSON.parse(lastActivity.rows[0].value)).toLocaleDateString();
            }
        } catch (error) {
            // Non-critical
        }

        // Check memory usage
        const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        if (memUsage > 500) {
            health.warnings.push('High memory usage');
            health.status = 'degraded';
        }

        return health;
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }
}