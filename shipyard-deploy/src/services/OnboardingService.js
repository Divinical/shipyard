// src/services/OnboardingService.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class OnboardingService {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
        this.logger = bot.logger;
    }

    async processNewMember(member) {
        try {
            // Create user record
            await this.db.query(
                `INSERT OR REPLACE INTO users (id, username, joined_at) 
                 VALUES (?, ?, ?)`,
                [member.id, member.user.username, new Date()]
            );

            // Send welcome DM
            await this.sendWelcomeDM(member);

            // Apply quarantine
            await this.applyQuarantine(member);

            this.logger.info(`Processed new member: ${member.user.tag}`);
        } catch (error) {
            this.logger.error('Error processing new member:', error);
        }
    }

    async sendWelcomeDM(member) {
        try {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Welcome to ShipYard! 🚢')
                .setDescription(
                    'We\'re excited to have you join our community of builders!\n\n' +
                    '**Getting Started:**\n' +
                    '1. Use `/start` in any channel to complete your introduction\n' +
                    '2. Check out #resources for helpful links\n' +
                    '3. Join our Weekly Meet to connect with other builders\n\n' +
                    '**Community Guidelines:**\n' +
                    '• Be helpful and supportive\n' +
                    '• Share your progress and learnings\n' +
                    '• Ask questions - we\'re here to help!\n'
                )
                .setFooter({ text: 'Ready? Use /start to introduce yourself!' })
                .setTimestamp();

            await member.send({ embeds: [embed] });
        } catch (error) {
            this.logger.error(`Could not DM new member ${member.id}:`, error);
        }
    }

    async applyQuarantine(member) {
        const quarantineRole = member.guild.roles.cache.find(r => r.name === 'Quarantine');
        if (!quarantineRole) {
            this.logger.warn('Quarantine role not found');
            return;
        }

        await member.roles.add(quarantineRole);

        // Schedule removal
        const duration = parseInt(process.env.QUARANTINE_DURATION_MINUTES || 10);
        setTimeout(async () => {
            try {
                await member.roles.remove(quarantineRole);
                const memberRole = member.guild.roles.cache.find(r => r.name === 'Member');
                if (memberRole) {
                    await member.roles.add(memberRole);
                }
            } catch (error) {
                // Member may have left
            }
        }, duration * 60 * 1000);
    }

    async completeOnboarding(userId, introData) {
        // Update user record
        await this.db.query(
            `UPDATE users 
             SET timezone = ?, skills = ?, x_profile = ?, offer = ?, need = ?
             WHERE id = ?`,
            [
                introData.timezone,
                this.db.formatArray(introData.skills),
                introData.xProfile,
                introData.offer,
                introData.need,
                userId
            ]
        );

        this.logger.info(`Onboarding completed for user ${userId}`);
    }
}