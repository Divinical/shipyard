// src/events/reactionAdd.js
import { Events } from 'discord.js';

export default {
    name: Events.MessageReactionAdd,
    async execute(reaction, user, bot) {
        if (user.bot) return;
        
        try {
            // Handle helpful reaction on clinic posts
            if (reaction.emoji.name === '✅' && 
                reaction.message.channel.id === process.env.CLINIC_CHANNEL_ID) {
                
                const clinicResult = await bot.db.query(
                    'SELECT id, author_id FROM clinics WHERE message_id = ?',
                    [reaction.message.id]
                );
                
                if (clinicResult.rows.length > 0 && 
                    clinicResult.rows[0].author_id === user.id) {
                    
                    // Author marked as helpful - log action for the helper
                    if (bot.services?.gamification && reaction.message.author) {
                        await bot.services.gamification.logAction(
                            reaction.message.author.id, 
                            'clinic_helpful', 
                            reaction.message.id
                        );
                    }
                }
            }
        } catch (error) {
            bot.logger.error('Error in reaction add:', error);
        }
    }
};