// src/commands/admin/policy.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class PolicyCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('policy')
            .setDescription('Manage bot policies (Founder only)')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set')
                    .setDescription('Set a policy value')
                    .addStringOption(option =>
                        option
                            .setName('key')
                            .setDescription('Policy key')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('value')
                            .setDescription('Policy value')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('show')
                    .setDescription('Show all policies'));
    }

    async execute(interaction) {
        if (!this.isFounder(interaction.member)) {
            return this.sendError(interaction, 'Only founders can manage policies');
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            await this.setPolicy(interaction);
        } else if (subcommand === 'show') {
            await this.showPolicies(interaction);
        }
    }

    async setPolicy(interaction) {
        const key = interaction.options.getString('key');
        const value = interaction.options.getString('value');

        // Parse value (try JSON first, then use as string)
        let parsedValue;
        try {
            parsedValue = JSON.parse(value);
        } catch {
            parsedValue = value;
        }

        await this.bot.policyManager.set(key, parsedValue);

        await this.sendSuccess(
            interaction,
            `Policy updated:\n**${key}** = ${JSON.stringify(parsedValue)}`
        );

        // Log to mod room
        const modChannel = interaction.guild.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
        if (modChannel) {
            const embed = new EmbedBuilder()
                .setColor(0xFFFF00)
                .setTitle('⚙️ Policy Updated')
                .setDescription(`${interaction.user} updated a policy`)
                .addFields(
                    { name: 'Key', value: key, inline: true },
                    { name: 'Value', value: JSON.stringify(parsedValue), inline: true }
                )
                .setTimestamp();
            
            await modChannel.send({ embeds: [embed] });
        }
    }

    async showPolicies(interaction) {
        const policies = this.bot.policyManager.getAll();
        
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('⚙️ Current Policies')
            .setDescription('All active bot policies')
            .setTimestamp();

        // Group policies by category
        const categories = {
            gamification: [],
            season: [],
            points: [],
            clinic: [],
            other: []
        };

        for (const [key, value] of Object.entries(policies)) {
            const category = key.split('.')[0];
            const target = categories[category] || categories.other;
            target.push(`**${key}**: ${JSON.stringify(value)}`);
        }

        for (const [category, items] of Object.entries(categories)) {
            if (items.length > 0) {
                embed.addFields({
                    name: category.charAt(0).toUpperCase() + category.slice(1),
                    value: items.join('\n').substring(0, 1024)
                });
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}