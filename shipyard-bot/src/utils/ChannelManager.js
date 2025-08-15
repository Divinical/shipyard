// src/utils/ChannelManager.js
export class ChannelManager {
    constructor(bot) {
        this.bot = bot;
        this.channelTypes = {
            HELP: 'HELP_CHANNEL_ID',
            CLINIC: 'CLINIC_CHANNEL_ID', 
            INTRO: 'INTRO_CHANNEL_ID',
            ANNOUNCEMENTS: 'ANNOUNCEMENTS_CHANNEL_ID',
            MOD_ROOM: 'MOD_ROOM_CHANNEL_ID',
            BUILD_LOG: 'BUILD_LOG_CHANNEL_ID',
            SHOWCASE: 'SHOWCASE_CHANNEL_ID',
            DOCK_CHECK: 'DOCK_CHECK_CHANNEL_ID',
            JOBS_COLLABS: 'JOBS_COLLABS_CHANNEL_ID'
        };
    }

    /**
     * Get a channel with fallback options
     * @param {string} channelType - Type from this.channelTypes
     * @param {Object} interaction - Discord interaction object
     * @param {boolean} allowCurrentChannel - Whether to fall back to current channel
     * @returns {Object} { channel, usedFallback, errorMessage }
     */
    async getChannel(channelType, interaction, allowCurrentChannel = true) {
        const envVar = this.channelTypes[channelType];
        if (!envVar) {
            return { 
                channel: null, 
                usedFallback: false, 
                errorMessage: `Unknown channel type: ${channelType}` 
            };
        }

        // Try primary channel
        let channel = interaction.guild.channels.cache.get(process.env[envVar]);
        if (channel) {
            return { channel, usedFallback: false, errorMessage: null };
        }

        this.bot.logger.warn(`Primary channel not found for ${channelType} (${envVar})`);

        // Try fallback to current channel if allowed
        if (allowCurrentChannel) {
            channel = interaction.channel;
            this.bot.logger.info(`Using current channel as fallback for ${channelType}: ${channel.name}`);
            return { channel, usedFallback: true, errorMessage: null };
        }

        return { 
            channel: null, 
            usedFallback: false, 
            errorMessage: `${channelType} channel not found and fallback not allowed` 
        };
    }

    /**
     * Post a message with automatic fallback handling
     * @param {string} channelType - Type from this.channelTypes
     * @param {Object} interaction - Discord interaction object
     * @param {Object} messageOptions - Discord message options (embeds, components, etc.)
     * @param {boolean} allowCurrentChannel - Whether to fall back to current channel
     * @returns {Object} { message, channel, usedFallback, error }
     */
    async postMessage(channelType, interaction, messageOptions, allowCurrentChannel = true) {
        const { channel, usedFallback, errorMessage } = await this.getChannel(
            channelType, 
            interaction, 
            allowCurrentChannel
        );

        if (!channel) {
            return { 
                message: null, 
                channel: null, 
                usedFallback: false, 
                error: errorMessage 
            };
        }

        try {
            const message = await channel.send(messageOptions);
            return { message, channel, usedFallback, error: null };
        } catch (error) {
            this.bot.logger.error(`Failed to send message to ${channelType}:`, error);
            
            // If we haven't tried current channel yet, try it as fallback
            if (!usedFallback && allowCurrentChannel && channel !== interaction.channel) {
                try {
                    const fallbackChannel = interaction.channel;
                    const fallbackMessage = await fallbackChannel.send(messageOptions);
                    this.bot.logger.info(`Posted to current channel as fallback for ${channelType}: ${fallbackChannel.name}`);
                    return { 
                        message: fallbackMessage, 
                        channel: fallbackChannel, 
                        usedFallback: true, 
                        error: null 
                    };
                } catch (fallbackError) {
                    this.bot.logger.error(`Failed to send to fallback channel:`, fallbackError);
                    return { 
                        message: null, 
                        channel: null, 
                        usedFallback: true, 
                        error: fallbackError.message 
                    };
                }
            }

            return { 
                message: null, 
                channel, 
                usedFallback, 
                error: error.message 
            };
        }
    }

    /**
     * Generate appropriate success message based on channel used
     * @param {string} channelType - Type from this.channelTypes
     * @param {boolean} usedFallback - Whether fallback channel was used
     * @param {Object} channel - Discord channel object
     * @param {string} action - Action performed (e.g., "posted", "created")
     * @returns {string} Success message
     */
    getSuccessMessage(channelType, usedFallback, channel, action = 'posted') {
        if (usedFallback) {
            return `Your ${channelType.toLowerCase()} request has been ${action} in this channel!`;
        } else {
            return `Your ${channelType.toLowerCase()} request has been ${action} in <#${channel.id}>!`;
        }
    }
}