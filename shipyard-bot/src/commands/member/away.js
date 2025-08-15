// src/commands/member/away.js
import { SlashCommandBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class AwayCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('away')
            .setDescription('Tell everyone you will be gone for a while')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set')
                    .setDescription('Set yourself as away - you will not get daily reminders')
                    .addIntegerOption(option =>
                        option
                            .setName('days')
                            .setDescription('How many days will you be away?')
                            .setRequired(true)
                            .setMinValue(1)
                            .setMaxValue(365))
                    .addStringOption(option =>
                        option
                            .setName('reason')
                            .setDescription('Why are you going away? (vacation, busy with work, etc.)')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('back')
                    .setDescription('Tell everyone you are back from being away'));
    }

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (subcommand === 'set') {
            const days = interaction.options.getInteger('days');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            const awayUntil = new Date();
            awayUntil.setDate(awayUntil.getDate() + days);

            await this.db.query(
                'UPDATE users SET away_until = ? WHERE id = ?',
                [awayUntil, userId]
            );

            // Add Away role
            const member = interaction.member;
            const awayRole = interaction.guild.roles.cache.find(r => r.name === 'Away');
            if (awayRole) {
                await member.roles.add(awayRole);
            }

            await this.sendSuccess(
                interaction,
                `Away status set until ${awayUntil.toLocaleDateString()}. Reason: ${reason}`
            );

        } else if (subcommand === 'back') {
            await this.db.query(
                'UPDATE users SET away_until = NULL WHERE id = ?',
                [userId]
            );

            // Remove Away role
            const member = interaction.member;
            const awayRole = interaction.guild.roles.cache.find(r => r.name === 'Away');
            if (awayRole) {
                await member.roles.remove(awayRole);
            }

            await this.sendSuccess(interaction, 'Away status cleared!');
        }
    }
}