// src/commands/admin/promote.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class PromoteCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('promote')
            .setDescription('Manually promote/demote user roles (Founder only)')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('role')
                    .setDescription('Promote user to a role')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('User to promote')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('role')
                            .setDescription('Role to grant')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Crew', value: 'Crew' },
                                { name: 'Builder', value: 'Builder' },
                                { name: 'Senior Builder', value: 'Senior Builder' },
                                { name: 'Moderator', value: 'Mod' }
                            )))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('demote')
                    .setDescription('Remove a role from user')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('User to demote')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('role')
                            .setDescription('Role to remove')
                            .setRequired(true)));
    }

    async execute(interaction) {
        if (!this.isFounder(interaction.member)) {
            return this.sendError(interaction, 'Only founders can promote/demote users');
        }

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');
        const roleName = interaction.options.getString('role');

        const member = await interaction.guild.members.fetch(targetUser.id);
        const role = interaction.guild.roles.cache.find(r => r.name === roleName);

        if (!role) {
            return this.sendError(interaction, `Role "${roleName}" not found`);
        }

        if (subcommand === 'role') {
            await this.promoteUser(interaction, member, role);
        } else if (subcommand === 'demote') {
            await this.demoteUser(interaction, member, role);
        }
    }

    async promoteUser(interaction, member, role) {
        if (member.roles.cache.has(role.id)) {
            return this.sendError(interaction, 'User already has this role');
        }

        await member.roles.add(role);

        // Log to database
        await this.db.query(
            `INSERT INTO reports (reporter_id, target_id, reason, created_at)
             VALUES (?, ?, ?, ?)`,
            [interaction.user.id, member.id, `Promoted to ${role.name}`, new Date()]
        );

        // Announce if it's a progression role
        if (['Crew', 'Builder', 'Senior Builder'].includes(role.name)) {
            const channel = interaction.guild.channels.cache.get(process.env.ANNOUNCEMENTS_CHANNEL_ID);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🎉 Role Promotion!')
                    .setDescription(`${member} has been promoted to **${role.name}** by ${interaction.user}!`)
                    .setThumbnail(member.user.displayAvatarURL())
                    .setTimestamp();
                await channel.send({ embeds: [embed] });
            }
        }

        await this.sendSuccess(interaction, `Promoted ${member} to ${role.name}`);
    }

    async demoteUser(interaction, member, role) {
        if (!member.roles.cache.has(role.id)) {
            return this.sendError(interaction, 'User does not have this role');
        }

        await member.roles.remove(role);

        // Log to database
        await this.db.query(
            `INSERT INTO reports (reporter_id, target_id, reason, created_at)
             VALUES (?, ?, ?, ?)`,
            [interaction.user.id, member.id, `Demoted from ${role.name}`, new Date()]
        );

        await this.sendSuccess(interaction, `Removed ${role.name} from ${member}`);
    }
}