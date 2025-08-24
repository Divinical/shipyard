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

        // Schedule quarantine removal only (no automatic member role assignment)
        const duration = parseInt(process.env.QUARANTINE_DURATION_MINUTES || 10);
        setTimeout(async () => {
            try {
                await member.roles.remove(quarantineRole);
                // Member role will only be assigned after completing introduction
                this.logger.info(`Quarantine removed for ${member.user.tag} - must complete introduction for member access`);
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

    /**
     * Check if user has completed introduction
     * @param {string} userId - User ID to check
     * @returns {Promise<boolean>} True if intro is complete
     */
    async hasCompletedIntro(userId) {
        try {
            const result = await this.db.query(
                'SELECT thread_id FROM users WHERE id = ? AND thread_id IS NOT NULL',
                [userId]
            );
            return result.rows.length > 0;
        } catch (error) {
            this.logger.error('Error checking intro completion:', error);
            return false;
        }
    }

    /**
     * Verify member role assignment is appropriate
     * @param {Object} member - Discord guild member
     * @returns {Promise<void>}
     */
    async verifyMemberRole(member) {
        try {
            const hasIntro = await this.hasCompletedIntro(member.id);
            const hasMemberRole = member.roles.cache.some(r => r.name === 'Member');
            
            if (hasMemberRole && !hasIntro) {
                // User has member role but no intro - remove it
                const memberRole = member.guild.roles.cache.find(r => r.name === 'Member');
                if (memberRole) {
                    await member.roles.remove(memberRole);
                    this.logger.warn(`Removed member role from ${member.user.tag} - no completed introduction`);
                }
            }
        } catch (error) {
            this.logger.error('Error verifying member role:', error);
        }
    }

    /**
     * Set member nickname to match their introduction name
     * @param {Object} member - Discord guild member
     * @param {string} introName - Name from introduction
     * @param {string} discordUsername - Original Discord username
     * @returns {Promise<void>}
     */
    async setMemberNickname(member, introName, discordUsername) {
        try {
            // Check if bot has permission to manage nicknames
            if (!member.guild.members.me.permissions.has('ManageNicknames')) {
                this.logger.warn(`Cannot set nickname for ${member.user.tag} - bot lacks MANAGE_NICKNAMES permission`);
                return;
            }

            // Check role hierarchy - bot must have higher role than target member
            if (member.roles.highest.position >= member.guild.members.me.roles.highest.position) {
                this.logger.warn(`Cannot set nickname for ${member.user.tag} - role hierarchy prevents it`);
                return;
            }

            // Check if member is guild owner
            if (member.id === member.guild.ownerId) {
                this.logger.warn(`Cannot set nickname for ${member.user.tag} - user is guild owner`);
                return;
            }

            // Choose nickname format - show Discord username if significantly different
            const normalizedIntroName = introName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normalizedDiscordName = discordUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            let nickname;
            if (normalizedIntroName === normalizedDiscordName || normalizedIntroName.includes(normalizedDiscordName) || normalizedDiscordName.includes(normalizedIntroName)) {
                // Names are similar, use intro name only
                nickname = introName.length > 32 ? introName.substring(0, 32) : introName;
            } else {
                // Names are different, show both
                const combined = `${introName} (@${discordUsername})`;
                nickname = combined.length > 32 ? introName.substring(0, 32) : combined;
            }

            await member.setNickname(nickname, 'Set nickname after introduction completion');
            this.logger.info(`Set nickname for ${member.user.tag} to "${nickname}"`);
            
        } catch (error) {
            // Log but don't fail the introduction process
            this.logger.warn(`Failed to set nickname for ${member.user.tag}:`, error.message);
        }
    }
}