
// src/commands/admin/freeze.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class FreezeCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('freeze')
            .setDescription('Temporarily freeze a user\'s point accrual (Founder only)')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('User to freeze')
                    .setRequired(true))
            .addIntegerOption(option =>
                option
                    .setName('hours')
                    .setDescription('Duration in hours')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(168))
            .addStringOption(option =>
                option
                    .setName('reason')
                    .setDescription('Reason for freeze')
                    .setRequired(true));
    }

    async execute(interaction) {
        if (!this.isFounder(interaction.member)) {
            return this.sendError(interaction, 'Only founders can freeze users');
        }

        const targetUser = interaction.options.getUser('user');
        const hours = interaction.options.getInteger('hours');
        const reason = interaction.options.getString('reason');
        const unfreezeAt = new Date(Date.now() + hours * 60 * 60 * 1000);

        // Add freeze to database
        await this.db.query(
            `INSERT OR REPLACE INTO policies (key, value) 
             VALUES (?, ?)`,
            [`freeze.${targetUser.id}`, JSON.stringify({ until: unfreezeAt, reason })]
        );

        // Log to mod room
        const modChannel = interaction.guild.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
        if (modChannel) {
            const embed = new EmbedBuilder()
                .setColor(0x00FFFF)
                .setTitle('❄️ User Frozen')
                .setDescription(`${interaction.user} froze ${targetUser}`)
                .addFields(
                    { name: 'Duration', value: `${hours} hours`, inline: true },
                    { name: 'Until', value: unfreezeAt.toLocaleString(), inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();
            await modChannel.send({ embeds: [embed] });
        }

        await this.sendSuccess(interaction, `${targetUser} has been frozen for ${hours} hours`);
    }
}