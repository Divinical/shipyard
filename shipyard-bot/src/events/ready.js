// src/events/ready.js
import { Events } from 'discord.js';

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client, bot) {
        bot.logger.success(`Bot logged in as ${client.user.tag}`);
        bot.logger.info(`Serving ${client.guilds.cache.size} guild(s)`);
        
        // Set bot activity
        client.user.setActivity('ShipYard Community', { type: 'WATCHING' });
        
        // Initialize services
        if (bot.cronManager) {
            bot.logger.info('Cron jobs initialized');
        }
        
        // Log startup metrics
        const userCount = await bot.db.query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL');
        bot.logger.info(`Tracking ${userCount.rows[0].count} users`);
    }
};