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
        } catch (error) {
            bot.logger.error('Error in member join:', error);
        }
    }
};