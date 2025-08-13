// src/commands/member/help.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class HelpCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('help')
            .setDescription('Request help from the community')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('need')
                    .setDescription('Create a help request')
                    .addStringOption(option =>
                        option
                            .setName('category')
                            .setDescription('Type of help needed')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Code/Technical', value: 'technical' },
                                { name: 'Design/UI/UX', value: 'design' },
                                { name: 'Marketing/Growth', value: 'marketing' },
                                { name: 'Product/Strategy', value: 'product' },
                                { name: 'Other', value: 'other' }
                            ))
                    .addStringOption(option =>
                        option
                            .setName('summary')
                            .setDescription('Brief description of what you need help with')
                            .setRequired(true)
                            .setMaxLength(200))
                    .addStringOption(option =>
                        option
                            .setName('tags')
                            .setDescription('Related skills/technologies (comma separated)')
                            .setRequired(false))
                    .addStringOption(option =>
                        option
                            .setName('urgency')
                            .setDescription('How urgent is this?')
                            .setRequired(false)
                            .addChoices(
                                { name: 'Low - Whenever someone has time', value: 'low' },
                                { name: 'Normal - Within a few days', value: 'normal' },
                                { name: 'High - Need help ASAP', value: 'high' }
                            )));
    }

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'need') {
            await this.createHelpRequest(interaction);
        }
    }

    async createHelpRequest(interaction) {
        const category = interaction.options.getString('category');
        const summary = interaction.options.getString('summary');
        const tags = interaction.options.getString('tags')?.split(',').map(t => t.trim()) || [];
        const urgency = interaction.options.getString('urgency') || 'normal';

        // Create help request in database
        const result = await this.db.query(
            `INSERT INTO help_requests (author_id, category, tags, summary, urgency, status)
             VALUES ($1, $2, $3, $4, $5, 'open')
             RETURNING id`,
            [interaction.user.id, category, tags, summary, urgency]
        );

        const requestId = result.rows[0].id;

        // Create embed
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
            .setFooter({ text: `Request ID: ${requestId}` })
            .setTimestamp();

        if (tags.length > 0) {
            embed.addFields({ name: 'Tags', value: tags.join(', '), inline: true });
        }

        // Add "Mark as Solved" button
        const solvedButton = new ButtonBuilder()
            .setCustomId(`solved_${requestId}`)
            .setLabel('Mark as Solved')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const row = new ActionRowBuilder().addComponents(solvedButton);

        // Post to help channel
        const helpChannel = interaction.guild.channels.cache.get(process.env.HELP_CHANNEL_ID);
        const message = await helpChannel.send({ 
            embeds: [embed],
            components: [row]
        });

        // Update database with message ID
        await this.db.query(
            'UPDATE help_requests SET message_id = $1 WHERE id = $2',
            [message.id, requestId]
        );

        // Ping relevant roles based on tags
        const rolesToPing = this.getRelevantRoles(tags, category);
        if (rolesToPing.length > 0) {
            await helpChannel.send({
                content: `📢 ${rolesToPing.map(r => `<@&${r}>`).join(' ')}`,
                allowedMentions: { roles: rolesToPing }
            });
        }

        await this.sendSuccess(interaction, 'Your help request has been posted!');
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
