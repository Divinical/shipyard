// src/commands/moderation/monitor.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';
import { ChannelManager } from '../../utils/ChannelManager.js';

export default class MonitorCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.channelManager = new ChannelManager(bot);
        this.data = new SlashCommandBuilder()
            .setName('monitor')
            .setDescription('Activity monitoring commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('run')
                    .setDescription('Manually run activity monitor'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('status')
                    .setDescription('Check monitoring status'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('exempt')
                    .setDescription('Exempt a user from monitoring')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('User to exempt')
                            .setRequired(true))
                    .addIntegerOption(option =>
                        option
                            .setName('days')
                            .setDescription('Days to exempt for')
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(90)));
    }

    async execute(interaction) {
        if (!this.isModerator(interaction.member)) {
            return this.sendError(interaction, 'Only moderators can use monitor commands');
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'run':
                await this.runMonitor(interaction);
                break;
            case 'status':
                await this.showStatus(interaction);
                break;
            case 'exempt':
                await this.exemptUser(interaction);
                break;
        }
    }

    async runMonitor(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        
        const twentyEightDaysAgo = new Date();
        twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

        // Find inactive users
        const inactiveUsers = await this.db.query(
            `SELECT u.id, u.username, u.last_activity_at, u.joined_at
             FROM users u 
             WHERE (u.away_until IS NULL OR u.away_until < datetime('now'))
             AND u.last_activity_at < ?
             AND u.deleted_at IS NULL
             AND NOT EXISTS (
                SELECT 1 FROM policies 
                WHERE key = 'monitor.exempt.' || u.id
                AND json_extract(value, '$.until') > datetime('now')
             )
             ORDER BY u.last_activity_at`,
            [fourteenDaysAgo]
        );

        const stats = {
            total: inactiveUsers.rows.length,
            warning: 0,
            removal: 0,
            nudged: 0
        };

        for (const user of inactiveUsers.rows) {
            const daysSinceActivity = Math.floor(
                (Date.now() - new Date(user.last_activity_at)) / (1000 * 60 * 60 * 24)
            );
            
            if (daysSinceActivity >= 28) {
                stats.removal++;
            } else if (daysSinceActivity >= 14) {
                stats.warning++;
                // Send nudge
                try {
                    const member = await this.bot.client.users.fetch(user.id);
                    await member.send(
                        `Hey ${user.username}! 👋\n\n` +
                        `We noticed you haven't been active in ShipYard for ${daysSinceActivity} days. ` +
                        `We miss having you around!\n\n` +
                        `If you need to take a break, use \`/away set\` to let us know.`
                    );
                    stats.nudged++;
                } catch (error) {
                    // Can't DM user
                }
            }
        }

        // Update last monitor run
        await this.db.query(
            `INSERT OR REPLACE INTO policies (key, value) 
             VALUES ('last_activity_check', ?)`,
            [JSON.stringify(new Date())]
        );

        const embed = new EmbedBuilder()
            .setColor(stats.removal > 0 ? 0xFF0000 : 0xFFFF00)
            .setTitle('📊 Activity Monitor Results')
            .addFields(
                { name: 'Total Inactive', value: stats.total.toString(), inline: true },
                { name: '⚠️ Warning (14-27 days)', value: stats.warning.toString(), inline: true },
                { name: '🔴 Removal Queue (28+ days)', value: stats.removal.toString(), inline: true },
                { name: '📨 Nudges Sent', value: stats.nudged.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Create removal queue in mod room if needed
        if (stats.removal > 0) {
            const removalList = inactiveUsers.rows
                .filter(u => Math.floor((Date.now() - new Date(u.last_activity_at)) / (1000 * 60 * 60 * 24)) >= 28)
                .map(u => `• <@${u.id}> - Last active: ${new Date(u.last_activity_at).toLocaleDateString()}`)
                .join('\n');

            await this.channelManager.postMessage(
                'MOD_ROOM',
                interaction,
                {
                    content: '<@&Founder>',
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('⚠️ Removal Queue - Founder Approval Required')
                        .setDescription(removalList)
                        .setFooter({ text: 'These users have been inactive for 28+ days' })
                        .setTimestamp()]
                },
                false // Don't fallback for mod notifications
            );
        }
    }

    async showStatus(interaction) {
        // Get monitoring stats
        const lastRun = await this.db.query(
            "SELECT value FROM policies WHERE key = 'last_activity_check'"
        );

        const exemptUsers = await this.db.query(
            "SELECT key, value FROM policies WHERE key LIKE 'monitor.exempt.%'"
        );

        const activeUsers = await this.db.query(
            'SELECT COUNT(*) FROM users WHERE last_activity_at > datetime(\'now\', \'-7 days\') AND deleted_at IS NULL'
        );

        const inactiveUsers = await this.db.query(
            'SELECT COUNT(*) FROM users WHERE last_activity_at < datetime(\'now\', \'-14 days\') AND deleted_at IS NULL'
        );

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 Activity Monitor Status')
            .addFields(
                { 
                    name: 'Last Run', 
                    value: lastRun.rows[0] ? 
                        new Date(JSON.parse(lastRun.rows[0].value)).toLocaleString() : 
                        'Never',
                    inline: true
                },
                { name: 'Active Users (7d)', value: activeUsers.rows[0].count, inline: true },
                { name: 'Inactive Users (14d+)', value: inactiveUsers.rows[0].count, inline: true },
                { name: 'Exempted Users', value: exemptUsers.rows.length.toString(), inline: true }
            )
            .setTimestamp();

        if (exemptUsers.rows.length > 0) {
            const exemptList = [];
            for (const exempt of exemptUsers.rows) {
                const userId = exempt.key.replace('monitor.exempt.', '');
                const until = new Date(exempt.value.until);
                if (until > new Date()) {
                    exemptList.push(`<@${userId}> until ${until.toLocaleDateString()}`);
                }
            }
            if (exemptList.length > 0) {
                embed.addFields({ 
                    name: 'Exempted Users', 
                    value: exemptList.slice(0, 10).join('\n') 
                });
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async exemptUser(interaction) {
        const targetUser = interaction.options.getUser('user');
        const days = interaction.options.getInteger('days') || 30;
        
        const until = new Date();
        until.setDate(until.getDate() + days);

        await this.db.query(
            `INSERT OR REPLACE INTO policies (key, value) 
             VALUES (?, ?)`,
            [`monitor.exempt.${targetUser.id}`, JSON.stringify({ until, by: interaction.user.id })]
        );

        await this.sendSuccess(
            interaction,
            `${targetUser} exempted from activity monitoring until ${until.toLocaleDateString()}`
        );
    }
}