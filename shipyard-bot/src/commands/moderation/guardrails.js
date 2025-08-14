// src/commands/moderation/guardrails.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class GuardrailsCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('guardrails')
            .setDescription('Manage channel guardrails and templates')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set')
                    .setDescription('Set template for a channel')
                    .addChannelOption(option =>
                        option
                            .setName('channel')
                            .setDescription('Channel to enforce template in')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('template')
                            .setDescription('Template format (use {field} for required fields)')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remove')
                    .setDescription('Remove template from a channel')
                    .addChannelOption(option =>
                        option
                            .setName('channel')
                            .setDescription('Channel to remove template from')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List all active guardrails'));
    }

    async execute(interaction) {
        if (!this.isModerator(interaction.member)) {
            return this.sendError(interaction, 'Only moderators can manage guardrails');
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'set':
                await this.setGuardrail(interaction);
                break;
            case 'remove':
                await this.removeGuardrail(interaction);
                break;
            case 'list':
                await this.listGuardrails(interaction);
                break;
        }
    }

    async setGuardrail(interaction) {
        const channel = interaction.options.getChannel('channel');
        const template = interaction.options.getString('template');

        // Parse template for required fields
        const requiredFields = (template.match(/\{([^}]+)\}/g) || [])
            .map(field => field.replace(/[{}]/g, ''));

        // Store guardrail
        await this.db.query(
            `INSERT OR REPLACE INTO policies (key, value) 
             VALUES (?, ?)`,
            [`guardrail.${channel.id}`, JSON.stringify({
                template,
                fields: requiredFields,
                setBy: interaction.user.id,
                setAt: new Date()
            })]
        );

        // Post template as pinned message
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📋 Channel Template')
            .setDescription('Please follow this format when posting:')
            .addFields({ name: 'Template', value: `\`\`\`${template}\`\`\`` })
            .setFooter({ text: 'Messages not following this template may be removed' });

        const message = await channel.send({ embeds: [embed] });
        await message.pin();

        await this.sendSuccess(
            interaction,
            `Guardrail set for ${channel}\nRequired fields: ${requiredFields.join(', ')}`
        );
    }

    async removeGuardrail(interaction) {
        const channel = interaction.options.getChannel('channel');

        await this.db.query(
            'DELETE FROM policies WHERE key = ?',
            [`guardrail.${channel.id}`]
        );

        await this.sendSuccess(interaction, `Guardrail removed from ${channel}`);
    }

    async listGuardrails(interaction) {
        const guardrails = await this.db.query(
            "SELECT key, value FROM policies WHERE key LIKE 'guardrail.%'"
        );

        if (guardrails.rows.length === 0) {
            return interaction.reply({
                content: 'No guardrails currently active',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📋 Active Guardrails')
            .setTimestamp();

        for (const rail of guardrails.rows) {
            const channelId = rail.key.replace('guardrail.', '');
            const data = rail.value;
            const channel = interaction.guild.channels.cache.get(channelId);
            
            if (channel) {
                embed.addFields({
                    name: `#${channel.name}`,
                    value: `Fields: ${data.fields?.join(', ') || 'None'}\nSet by: <@${data.setBy}>`,
                    inline: true
                });
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}