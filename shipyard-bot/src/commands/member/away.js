// src/commands/member/away.js
import { SlashCommandBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class AwayCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('away')
            .setDescription('Manage your away status')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set')
                    .setDescription('Set your away status')
                    .addIntegerOption(option =>
                        option
                            .setName('days')
                            .setDescription('Number of days you will be away')
                            .setRequired(true)
                            .setMinValue(1)
                            .setMaxValue(365))
                    .addStringOption(option =>
                        option
                            .setName('reason')
                            .setDescription('Reason for being away (optional)')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('clear')
                    .setDescription('Clear your away status'));
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
                'UPDATE users SET away_until = $1 WHERE id = $2',
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

        } else if (subcommand === 'clear') {
            await this.db.query(
                'UPDATE users SET away_until = NULL WHERE id = $1',
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