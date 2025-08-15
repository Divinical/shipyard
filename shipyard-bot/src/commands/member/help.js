// src/commands/member/help.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';
import { ChannelManager } from '../../utils/ChannelManager.js';

export default class HelpCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.channelManager = new ChannelManager(bot);
        this.data = new SlashCommandBuilder()
            .setName('help')
            .setDescription('Ask for help - your request will be posted in the help channel')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('request')
                    .setDescription('Ask for help - someone will help you solve your problem')
                    .addStringOption(option =>
                        option
                            .setName('category')
                            .setDescription('What kind of help do you need?')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Programming/Code - Help fixing bugs or writing code', value: 'technical' },
                                { name: 'Design/UI/UX - Help making things look good', value: 'design' },
                                { name: 'Marketing/Growth - Help getting users or customers', value: 'marketing' },
                                { name: 'Product/Strategy - Help planning your project', value: 'product' },
                                { name: 'Other - Different kind of help', value: 'other' }
                            ))
                    .addStringOption(option =>
                        option
                            .setName('summary')
                            .setDescription('Explain your problem in a few sentences')
                            .setRequired(true)
                            .setMaxLength(200))
                    .addStringOption(option =>
                        option
                            .setName('tags')
                            .setDescription('Technologies you are using (example: React, Python, Figma)')
                            .setRequired(false))
                    .addStringOption(option =>
                        option
                            .setName('urgency')
                            .setDescription('How quickly do you need help?')
                            .setRequired(false)
                            .addChoices(
                                { name: 'Low - I can wait, no rush', value: 'low' },
                                { name: 'Normal - Help within a few days would be great', value: 'normal' },
                                { name: 'High - I need help right now please!', value: 'high' }
                            )));
    }

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'request') {
            await this.createHelpRequest(interaction);
        }
    }

    async createHelpRequest(interaction) {
        const category = interaction.options.getString('category');
        const summary = interaction.options.getString('summary');
        const tags = interaction.options.getString('tags')?.split(',').map(t => t.trim()) || [];
        const urgency = interaction.options.getString('urgency') || 'normal';

        // Create embed first
        const urgencyColors = {
            low: 0x00FF00,
            normal: 0xFFFF00,
            high: 0xFF0000
        };

        const embed = new EmbedBuilder()
            .setColor(urgencyColors[urgency])
            .setTitle('🆘 Help Request')
            .setAuthor({ 
                name: interaction.user.username,
                iconURL: interaction.user.displayAvatarURL()
            })
            .addFields(
                { name: 'Category', value: category, inline: true },
                { name: 'Urgency', value: urgency.toUpperCase(), inline: true },
                { name: 'Summary', value: summary },
                { name: 'Status', value: '🔴 Open', inline: true }
            )
            .setTimestamp();

        if (tags.length > 0) {
            embed.addFields({ name: 'Tags', value: tags.join(', '), inline: true });
        }

        // Create temporary request ID for button
        const tempRequestId = `temp_${Date.now()}`;
        embed.setFooter({ text: `Request ID: ${tempRequestId}` });

        const solvedButton = new ButtonBuilder()
            .setCustomId(`solved_${tempRequestId}`)
            .setLabel('Mark as Solved')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const row = new ActionRowBuilder().addComponents(solvedButton);

        // Post message using ChannelManager
        const { message, channel: helpChannel, usedFallback, error } = await this.channelManager.postMessage(
            'HELP',
            interaction,
            { embeds: [embed], components: [row] }
        );

        if (!message) {
            return await this.sendError(interaction, `Unable to post help request: ${error}`);
        }

        // Now create help request in database with message_id
        const result = await this.db.query(
            `INSERT INTO help_requests (author_id, category, tags, summary, urgency, status, message_id)
             VALUES (?, ?, ?, ?, ?, 'open', ?)`,
            [interaction.user.id, category, JSON.stringify(tags), summary, urgency, message.id]
        );

        const requestId = result.lastID;

        // Update the embed with real request ID and button
        const updatedEmbed = new EmbedBuilder()
            .setColor(urgencyColors[urgency])
            .setTitle('🆘 Help Request')
            .setAuthor({ 
                name: interaction.user.username,
                iconURL: interaction.user.displayAvatarURL()
            })
            .addFields(
                { name: 'Category', value: category, inline: true },
                { name: 'Urgency', value: urgency.toUpperCase(), inline: true },
                { name: 'Summary', value: summary },
                { name: 'Status', value: '🔴 Open', inline: true }
            )
            .setFooter({ text: `Request ID: ${requestId}` })
            .setTimestamp();

        if (tags.length > 0) {
            updatedEmbed.addFields({ name: 'Tags', value: tags.join(', '), inline: true });
        }

        const updatedSolvedButton = new ButtonBuilder()
            .setCustomId(`solved_${requestId}`)
            .setLabel('Mark as Solved')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const updatedRow = new ActionRowBuilder().addComponents(updatedSolvedButton);

        // Update the message with correct request ID
        await message.edit({ 
            embeds: [updatedEmbed],
            components: [updatedRow]
        });

        // Ping relevant roles based on tags
        const rolesToPing = this.getRelevantRoles(tags, category);
        if (rolesToPing.length > 0) {
            try {
                await helpChannel.send({
                    content: `📢 ${rolesToPing.map(r => `<@&${r}>`).join(' ')}`,
                    allowedMentions: { roles: rolesToPing }
                });
            } catch (error) {
                this.bot.logger.warn('Failed to ping roles for help request:', error);
            }
        }

        await this.sendSuccess(
            interaction, 
            this.channelManager.getSuccessMessage('HELP', usedFallback, helpChannel, 'posted')
        );
    }

    getRelevantRoles(tags, category) {
        const roles = [];
        const guild = this.bot.client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
        
        // Map tags to role names
        const tagRoleMap = {
            'react': 'React Dev',
            'node': 'Backend Dev',
            'design': 'Designer',
            'marketing': 'Marketer',
            'python': 'Python Dev',
            'javascript': 'JS Dev'
        };

        for (const tag of tags) {
            const roleName = tagRoleMap[tag.toLowerCase()];
            if (roleName) {
                const role = guild.roles.cache.find(r => r.name === roleName);
                if (role) roles.push(role.id);
            }
        }

        return roles;
    }
}