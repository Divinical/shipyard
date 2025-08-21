// src/commands/member/goals.js
import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';

export default class GoalsCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('goals')
            .setDescription('Set and share your weekly goals with the community')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set')
                    .setDescription('Set your weekly goals (professional and personal)'));
    }

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set') {
            await this.showGoalsModal(interaction);
        }
    }

    async showGoalsModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('goals_modal')
            .setTitle('Weekly Goals (Max 7 Total, Comma Separated)');

        const professionalInput = new TextInputBuilder()
            .setCustomId('professional_goals')
            .setLabel('🏢 Professional Goals')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500)
            .setPlaceholder('Ship feature X, Write 3 blog posts, Learn React hooks...');

        const personalInput = new TextInputBuilder()
            .setCustomId('personal_goals')
            .setLabel('🏠 Personal Goals')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500)
            .setPlaceholder('Exercise 4x, Read 100 pages, Call family 2x, Cook 3 meals...');

        const rows = [
            new ActionRowBuilder().addComponents(professionalInput),
            new ActionRowBuilder().addComponents(personalInput)
        ];

        modal.addComponents(...rows);
        await interaction.showModal(modal);
    }
}