// src/events/messageCreate.js
import { Events } from 'discord.js';

export default {
    name: Events.MessageCreate,
    async execute(message, bot) {
        if (message.author.bot) return;
        
        try {
            // Update last activity
            await bot.db.query(
                'UPDATE users SET last_activity_at = ? WHERE id = ?',
                [new Date(), message.author.id]
            );
            
            // Check for spam
            if (bot.services?.moderation) {
                const isSpam = await bot.services.moderation.checkMessageForSpam(message);
                if (isSpam) return;
            }
            
            // Log message for tracking
            const messageType = getMessageType(message.channel.id);
            await bot.db.query(
                `INSERT INTO messages (user_id, channel_id, message_id, type, created_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [message.author.id, message.channel.id, message.id, messageType, new Date()]
            );
            
            // Check for dock check participation
            if (message.channel.isThread() && message.channel.name.includes('Dock Check')) {
                await logDockCheckAction(bot, message.author.id);
            }
            
            // Enforce channel guardrails
            const guardrail = await bot.policyManager?.get(`guardrail.${message.channel.id}`);
            if (guardrail) {
                await enforceGuardrail(bot, message, guardrail);
            }
            
        } catch (error) {
            bot.logger.error('Error in message create:', error);
        }
    }
};

function getMessageType(channelId) {
    const channelTypes = {
        [process.env.BUILD_LOG_CHANNEL_ID]: 'build_log',
        [process.env.CLINIC_CHANNEL_ID]: 'clinic_feedback',
        [process.env.HELP_CHANNEL_ID]: 'help_request',
        [process.env.SHOWCASE_CHANNEL_ID]: 'showcase',
        [process.env.DOCK_CHECK_CHANNEL_ID]: 'dock_check'
    };
    return channelTypes[channelId] || 'other';
}

async function logDockCheckAction(bot, userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existing = await bot.db.query(
        `SELECT id FROM actions_log 
         WHERE user_id = ? AND type = 'dock' 
         AND created_at >= ?`,
        [userId, today]
    );
    
    if (existing.rows.length === 0 && bot.services?.gamification) {
        await bot.services.gamification.logAction(userId, 'dock', null);
    }
}

async function enforceGuardrail(bot, message, guardrail) {
    const requiredFields = guardrail.fields || [];
    const content = message.content.toLowerCase();
    
    const missingFields = requiredFields.filter(field => 
        !content.includes(field.toLowerCase())
    );
    
    if (missingFields.length > 0) {
        const warning = await message.reply(
            `⚠️ Your message is missing required fields: ${missingFields.join(', ')}\n` +
            `Please check the pinned message for the template. This message will be deleted in 60 seconds.`
        );
        
        setTimeout(async () => {
            try {
                await message.delete();
                await warning.delete();
            } catch (error) {
                // Messages may already be deleted
            }
        }, 60000);
    }
}