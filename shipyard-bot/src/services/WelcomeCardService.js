// src/services/WelcomeCardService.js
import { AttachmentBuilder } from 'discord.js';

export class WelcomeCardService {
    constructor(bot) {
        this.bot = bot;
        this.logger = bot.logger;
        this.apiEndpoint = 'https://template-maker-pro.onrender.com/api/generate-image';
    }

    /**
     * Generate and send introduction welcome card using external API
     * @param {Object} channel - Discord channel to send to
     * @param {Object} userData - User data for card generation
     */
    async sendIntroductionCard(channel, userData) {
        try {
            this.logger.info(`Generating introduction card for ${userData.name}`);

            // Call external API to generate card
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'ShipYard-Bot/1.0'
                },
                body: JSON.stringify({ data: userData }),
                timeout: 10000 // 10 second timeout
            });

            if (!response.ok) {
                throw new Error(`API responded with status: ${response.status}`);
            }

            // Convert response to buffer
            const imageBuffer = Buffer.from(await response.arrayBuffer());
            
            if (imageBuffer.length === 0) {
                throw new Error('Received empty image buffer from API');
            }

            // Create Discord attachment
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome.png' });

            // Send welcome message with card
            await channel.send({
                content: `🎉 Welcome ${userData.name}! 🎉`,
                files: [attachment]
            });

            this.logger.success(`Introduction card sent successfully for ${userData.name}`);

        } catch (error) {
            this.logger.error(`Error generating introduction card for ${userData.name}:`, error);
            
            // Fallback: send text-only introduction message
            await this.sendFallbackIntroduction(channel, userData);
        }
    }

    /**
     * Send fallback text introduction message if API fails
     * @param {Object} channel - Discord channel to send to
     * @param {Object} userData - User data for message
     */
    async sendFallbackIntroduction(channel, userData) {
        try {
            await channel.send({
                content: `🎉 Welcome ${userData.name}! 🎉\n\n` +
                        `**Role:** ${userData.role}\n` +
                        `**Timezone:** ${userData.timezone}\n` +
                        `**Skills:** ${userData.skills}\n` +
                        `**Projects:** ${userData.projects}\n\n` +
                        `Great introduction! We're excited to have you in ShipYard! 🚢`
            });
            
            this.logger.info(`Fallback introduction message sent for ${userData.name}`);
        } catch (fallbackError) {
            this.logger.error(`Failed to send fallback introduction message:`, fallbackError);
        }
    }

    /**
     * Generate user data for introduction card from form data
     * @param {Object} user - Discord user object
     * @param {Object} formData - Data from introduction form
     * @returns {Object} User data for card generation
     */
    generateIntroductionData(user, formData) {
        return {
            name: formData.name,
            role: "Member",
            timezone: formData.timezone,
            skills: Array.isArray(formData.skills) ? formData.skills.join(', ') : formData.skills,
            projects: formData.x_profile || "Getting Started",
            profilePicUrl: user.displayAvatarURL({ size: 512, format: 'png' })
        };
    }
}