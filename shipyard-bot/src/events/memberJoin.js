// src/events/memberJoin.js
import { Events } from 'discord.js';

export default {
    name: Events.GuildMemberAdd,
    async execute(member, bot) {
        try {
            bot.logger.info(`New member joined: ${member.user.tag}`);
            
            // Check for raid
            if (bot.services?.moderation) {
                const isRaid = await bot.services.moderation.checkForRaid(member);
                if (isRaid) {
                    bot.logger.warn('Raid detected, server locked');
                    return;
                }
                
                // Apply quarantine
                await bot.services.moderation.applyQuarantine(member);
            }
            
            // Process onboarding
            if (bot.services?.onboarding) {
                await bot.services.onboarding.processNewMember(member);
            } else {
                // Fallback: basic user creation
                await bot.db.query(
                    `INSERT OR REPLACE INTO users (id, username, joined_at) 
                     VALUES (?, ?, ?)`,
                    [member.id, member.user.username, new Date()]
                );
            }
            
            // Send welcome message to Welcome channel with intro button
            await sendWelcomeToChannel(member, bot);
        } catch (error) {
            bot.logger.error('Error in member join:', error);
        }
    }
};

/**
 * Send welcome message to Welcome channel with introduction button
 * @param {Object} member - Discord guild member
 * @param {Object} bot - Bot instance
 */
async function sendWelcomeToChannel(member, bot) {
    try {
        const { ChannelManager } = await import('../utils/ChannelManager.js');
        const channelManager = new ChannelManager(bot);
        
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
        
        // Create welcome embed
        const welcomeEmbed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle(`🎉 Welcome to ShipYard, ${member.user.username}! ⚓`)
            .setDescription('We\'re excited to have you join our community of founders and builders!')
            .addFields(
                {
                    name: '🚨 Important First Step',
                    value: 'You currently have **limited access** to channels. To unlock the full community and get your **Member** role, you need to introduce yourself first.'
                },
                {
                    name: '✨ What happens after your introduction:',
                    value: '• You\'ll automatically get the **Member** role\n• Access to all community channels unlocks\n• You can participate in weekly goals, feedback, and help requests\n• Connect with other founders and builders!'
                },
                {
                    name: '🚀 Ready to get started?',
                    value: 'Click the button below to start your introduction!'
                }
            )
            .setFooter({ text: 'Welcome aboard! We can\'t wait to learn about your founder journey.' })
            .setTimestamp();

        // Create introduction button
        const introButton = new ButtonBuilder()
            .setCustomId(`start_intro_${member.id}`)
            .setLabel('Start Your Introduction')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👋');

        const row = new ActionRowBuilder().addComponents(introButton);

        // Get welcome channel directly
        const welcomeChannel = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
        
        if (welcomeChannel) {
            // Post message directly to welcome channel
            await welcomeChannel.send({ embeds: [welcomeEmbed], components: [row] });
            bot.logger.info(`Sent welcome message for ${member.user.tag} to welcome channel`);
        } else {
            bot.logger.warn(`Welcome channel not found for ${member.user.tag} - check WELCOME_CHANNEL_ID env variable`);
        }

    } catch (error) {
        bot.logger.error(`Failed to send welcome message for ${member.user.tag}:`, error);
    }
}