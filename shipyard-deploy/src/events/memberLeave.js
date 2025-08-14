// src/events/memberLeave.js
import { Events, EmbedBuilder } from 'discord.js';

export default {
    name: Events.GuildMemberRemove,
    async execute(member, bot) {
        try {
            bot.logger.info(`Member left: ${member.user.tag}`);
            
            // Mark user as deleted
            await bot.db.query(
                'UPDATE users SET deleted_at = ? WHERE id = ?',
                [new Date(), member.id]
            );
            
            // Notify moderators
            const modChannel = member.guild.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
            if (modChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('Member Left')
                    .setDescription(`${member.user.tag} has left the server`)
                    .addFields(
                        { name: 'User ID', value: member.id, inline: true },
                        { name: 'Joined', value: member.joinedAt?.toLocaleDateString() || 'Unknown', inline: true }
                    )
                    .setTimestamp();
                
                await modChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            bot.logger.error('Error in member leave:', error);
        }
    }
};