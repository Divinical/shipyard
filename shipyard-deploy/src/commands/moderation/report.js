// src/commands/moderation/report.js
import { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class ReportCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('report')
            .setDescription('Report system commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('user')
                    .setDescription('Report a user for rule violations')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('User to report')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('reason')
                            .setDescription('Brief reason for report')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('dm')
                    .setDescription('Report unwanted DM')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('User who sent unwanted DM')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('review')
                    .setDescription('Review a report (Mod only)')
                    .addIntegerOption(option =>
                        option
                            .setName('id')
                            .setDescription('Report ID')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List pending reports (Mod only)'));
    }

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'user':
                await this.reportUser(interaction);
                break;
            case 'dm':
                await this.reportDM(interaction);
                break;
            case 'review':
                if (!this.isModerator(interaction.member)) {
                    return this.sendError(interaction, 'Only moderators can review reports');
                }
                await this.reviewReport(interaction);
                break;
            case 'list':
                if (!this.isModerator(interaction.member)) {
                    return this.sendError(interaction, 'Only moderators can list reports');
                }
                await this.listReports(interaction);
                break;
        }
    }

    async reportUser(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        if (targetUser.id === interaction.user.id) {
            return this.sendError(interaction, "You can't report yourself");
        }

        // Create modal for additional details
        const modal = new ModalBuilder()
            .setCustomId(`report_details_${targetUser.id}`)
            .setTitle('Report Details');

        const detailsInput = new TextInputBuilder()
            .setCustomId('details')
            .setLabel('Provide additional details')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1000)
            .setPlaceholder('Include message links, screenshots info, or other evidence');

        const row = new ActionRowBuilder().addComponents(detailsInput);
        modal.addComponents(row);

        // Store initial report data
        await this.db.query(
            `INSERT INTO policies (key, value) 
             VALUES (?, ?)`,
            [`report.pending.${interaction.user.id}`, JSON.stringify({
                target: targetUser.id,
                reason,
                timestamp: new Date()
            })]
        );

        await interaction.showModal(modal);
    }

    async reportDM(interaction) {
        const targetUser = interaction.options.getUser('user');

        // Check DM policy
        const dmPolicy = await this.db.query(
            'SELECT dm_open FROM users WHERE id = ?',
            [interaction.user.id]
        );

        // Create report
        const result = await this.db.query(
            `INSERT INTO reports (reporter_id, target_id, reason, created_at)
             VALUES (?, ?, ?, ?)`,
            [interaction.user.id, targetUser.id, 'Unwanted DM - No Cold DM Policy Violation', new Date()]
        );

        const reportId = result.lastID;

        // Alert mods
        const modChannel = interaction.guild.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
        if (modChannel) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🚫 DM Policy Violation Report')
                .setDescription(`Report #${reportId}`)
                .addFields(
                    { name: 'Reporter', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reported User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Type', value: 'Unwanted DM', inline: true }
                )
                .setFooter({ text: 'Review with /report review' })
                .setTimestamp();

            await modChannel.send({ embeds: [embed] });
        }

        await this.sendSuccess(
            interaction,
            `Report #${reportId} filed. Moderators will review this report.\n` +
            `Please screenshot the DM as evidence if you haven't already.`
        );
    }

    async reviewReport(interaction) {
        const reportId = interaction.options.getInteger('id');

        const report = await this.db.query(
            'SELECT * FROM reports WHERE id = ?',
            [reportId]
        );

        if (report.rows.length === 0) {
            return this.sendError(interaction, 'Report not found');
        }

        const r = report.rows[0];
        const reporter = await this.bot.client.users.fetch(r.reporter_id);
        const target = await this.bot.client.users.fetch(r.target_id);

        const embed = new EmbedBuilder()
            .setColor(r.status === 'pending' ? 0xFFFF00 : 0x00FF00)
            .setTitle(`Report #${reportId}`)
            .addFields(
                { name: 'Reporter', value: reporter.tag, inline: true },
                { name: 'Target', value: target.tag, inline: true },
                { name: 'Status', value: r.status, inline: true },
                { name: 'Reason', value: r.reason },
                { name: 'Created', value: new Date(r.created_at).toLocaleString() }
            );

        if (r.evidence_thread_id) {
            embed.addFields({ 
                name: 'Evidence Thread', 
                value: `<#${r.evidence_thread_id}>` 
            });
        }

        // Get previous reports
        const previousReports = await this.db.query(
            'SELECT COUNT(*) FROM reports WHERE target_id = ? AND id != ?',
            [r.target_id, reportId]
        );

        embed.addFields({ 
            name: 'Previous Reports', 
            value: previousReports.rows[0].count,
            inline: true
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async listReports(interaction) {
        const reports = await this.db.query(
            `SELECT r.*, u1.username as reporter_name, u2.username as target_name
             FROM reports r
             JOIN users u1 ON r.reporter_id = u1.id
             JOIN users u2 ON r.target_id = u2.id
             WHERE r.status = 'pending'
             ORDER BY r.created_at DESC
             LIMIT 10`
        );

        if (reports.rows.length === 0) {
            return interaction.reply({
                content: 'No pending reports',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0xFFFF00)
            .setTitle('📋 Pending Reports')
            .setTimestamp();

        for (const report of reports.rows) {
            embed.addFields({
                name: `#${report.id} - ${new Date(report.created_at).toLocaleDateString()}`,
                value: `Reporter: ${report.reporter_name}\nTarget: ${report.target_name}\nReason: ${report.reason.substring(0, 100)}`,
                inline: false
            });
        }

        embed.setFooter({ text: 'Use /report review <id> to view details' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}