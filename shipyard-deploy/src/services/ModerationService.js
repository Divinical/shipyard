// src/services/ModerationService.js
import { EmbedBuilder, ThreadAutoArchiveDuration } from 'discord.js';

export class ModerationService {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
        this.logger = bot.logger;
        this.raidProtection = {
            joinTimes: [],
            locked: false
        };
    }

    async checkForRaid(member) {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        // Clean old join times
        this.raidProtection.joinTimes = this.raidProtection.joinTimes.filter(
            time => time > oneMinuteAgo
        );
        
        // Add new join
        this.raidProtection.joinTimes.push(now);
        
        // Check threshold
        const maxJoinsPerMin = parseInt(process.env.MAX_JOIN_RATE_PER_MIN || 8);
        
        if (this.raidProtection.joinTimes.length > maxJoinsPerMin && !this.raidProtection.locked) {
            await this.lockServer(member.guild);
            return true;
        }
        
        return false;
    }

    async lockServer(guild) {
        this.raidProtection.locked = true;
        
        try {
            // Disable @everyone permissions
            const everyoneRole = guild.roles.everyone;
            const currentPerms = everyoneRole.permissions.toArray();
            
            // Store original permissions
            await this.db.query(
                'INSERT OR REPLACE INTO policies (key, value) VALUES (?, ?)',
                ['raid.original_permissions', JSON.stringify(currentPerms)]
            );
            
            // Remove send messages permission
            await everyoneRole.setPermissions(
                everyoneRole.permissions.remove(['SendMessages', 'AddReactions', 'CreatePublicThreads'])
            );
            
            // Alert founders
            await this.alertFounders(guild, 'RAID DETECTED', 
                `Server has been locked due to suspicious join activity.\n` +
                `${this.raidProtection.joinTimes.length} joins in the last minute.`
            );
            
            this.logger.warn(`Raid protection activated for guild ${guild.id}`);
        } catch (error) {
            this.logger.error('Error locking server:', error);
        }
    }

    async unlockServer(guild) {
        try {
            // Restore original permissions
            const result = await this.db.query(
                'SELECT value FROM policies WHERE key = ?',
                ['raid.original_permissions']
            );
            
            if (result) {
                const originalPerms = result.value;
                const everyoneRole = guild.roles.everyone;
                await everyoneRole.setPermissions(originalPerms);
            }
            
            this.raidProtection.locked = false;
            this.raidProtection.joinTimes = [];
            
            await this.alertFounders(guild, 'Server Unlocked', 
                'Raid protection has been deactivated and normal permissions restored.');
            
            this.logger.info(`Raid protection deactivated for guild ${guild.id}`);
        } catch (error) {
            this.logger.error('Error unlocking server:', error);
        }
    }

    async applyQuarantine(member) {
        const quarantineRole = member.guild.roles.cache.find(r => r.name === 'Quarantine');
        if (!quarantineRole) {
            this.logger.warn('Quarantine role not found');
            return;
        }
        
        await member.roles.add(quarantineRole);
        
        // Schedule removal after 10 minutes
        const quarantineDuration = parseInt(process.env.QUARANTINE_DURATION_MINUTES || 10);
        
        setTimeout(async () => {
            try {
                await member.roles.remove(quarantineRole);
                
                // Add Member role
                const memberRole = member.guild.roles.cache.find(r => r.name === 'Member');
                if (memberRole && !member.roles.cache.has(memberRole.id)) {
                    await member.roles.add(memberRole);
                }
            } catch (error) {
                // Member may have left
                this.logger.debug(`Could not remove quarantine from ${member.id}:`, error);
            }
        }, quarantineDuration * 60 * 1000);
    }

    async checkMessageForSpam(message) {
        // Basic spam detection
        const spamIndicators = {
            mentions: message.mentions.users.size + message.mentions.roles.size,
            links: (message.content.match(/https?:\/\//g) || []).length,
            capsRatio: this.getCapsRatio(message.content),
            repeatChars: this.hasRepeatChars(message.content),
            discordInvites: (message.content.match(/discord\.(gg|com\/invite)/gi) || []).length
        };
        
        // Check for obvious spam
        if (spamIndicators.discordInvites > 0 && !this.isModerator(message.member)) {
            await this.handleSpam(message, 'Discord invite links');
            return true;
        }
        
        if (spamIndicators.mentions > 5) {
            await this.handleSpam(message, 'Excessive mentions');
            return true;
        }
        
        if (spamIndicators.links > 3 && message.member.joinedTimestamp > Date.now() - 86400000) {
            await this.handleSpam(message, 'Multiple links from new member');
            return true;
        }
        
        if (spamIndicators.capsRatio > 0.7 && message.content.length > 20) {
            await this.handleSpam(message, 'Excessive caps');
            return true;
        }
        
        return false;
    }

    getCapsRatio(text) {
        const letters = text.replace(/[^a-zA-Z]/g, '');
        if (letters.length === 0) return 0;
        const caps = letters.replace(/[^A-Z]/g, '');
        return caps.length / letters.length;
    }

    hasRepeatChars(text) {
        return /(.)\1{4,}/.test(text);
    }

    async handleSpam(message, reason) {
        try {
            await message.delete();
            
            // Warn user
            const warning = await message.channel.send(
                `⚠️ ${message.author}, your message was removed: ${reason}`
            );
            
            setTimeout(() => warning.delete().catch(() => {}), 5000);
            
            // Log to mod room
            await this.logModAction('Spam Detected', {
                user: message.author.tag,
                channel: message.channel.name,
                reason: reason,
                content: message.content.substring(0, 500)
            });
            
            // Track warnings
            await this.trackWarning(message.author.id, 'spam', reason);
            
        } catch (error) {
            this.logger.error('Error handling spam:', error);
        }
    }

    async trackWarning(userId, type, reason) {
        // Store warning in database
        await this.db.query(
            `INSERT INTO reports (reporter_id, target_id, reason, created_at)
             VALUES ('SYSTEM', ?, ?, ?)`,
            [userId, `Auto-warning: ${type} - ${reason}`, new Date()]
        );
        
        // Check warning count
        const warningCount = await this.db.query(
            `SELECT COUNT(*) as count FROM reports 
             WHERE target_id = ? AND reporter_id = 'SYSTEM'
             AND created_at > datetime('now', '-7 days')`,
            [userId]
        );
        
        const count = parseInt(warningCount.count);
        
        // Escalate if too many warnings
        if (count >= 3) {
            await this.escalateToFounders(userId, 'Multiple auto-warnings in 7 days');
        }
    }

    async createReport(reporterId, targetId, reason, evidence = null) {
        // Create report in database
        const result = await this.db.query(
            `INSERT INTO reports (reporter_id, target_id, reason, created_at)
             VALUES (?, ?, ?, ?)`,
            [reporterId, targetId, reason, new Date()]
        );
        
        const reportId = result.lastID;
        
        // Create evidence thread in mod room
        const modChannel = this.bot.client.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
        if (!modChannel) return reportId;
        
        const thread = await modChannel.threads.create({
            name: `Report #${reportId} - ${new Date().toLocaleDateString()}`,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: `Report against user ${targetId}`
        });
        
        // Update report with thread ID
        await this.db.query(
            'UPDATE reports SET evidence_thread_id = ? WHERE id = ?',
            [thread.id, reportId]
        );
        
        // Post initial report info
        const targetUser = await this.bot.client.users.fetch(targetId);
        const reporterUser = await this.bot.client.users.fetch(reporterId);
        
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`Report #${reportId}`)
            .addFields(
                { name: 'Reporter', value: reporterUser.tag, inline: true },
                { name: 'Target', value: targetUser.tag, inline: true },
                { name: 'Reason', value: reason }
            )
            .setTimestamp();
        
        await thread.send({ embeds: [embed] });
        
        // Add evidence if provided
        if (evidence) {
            await thread.send({
                content: '**Evidence:**',
                files: evidence
            });
        }
        
        // Get message history
        await this.gatherEvidence(thread, targetId);
        
        return reportId;
    }

    async gatherEvidence(thread, targetId) {
        // Gather last 50 messages from target across key channels
        const channels = [
            process.env.BUILD_LOG_CHANNEL_ID,
            process.env.CLINIC_CHANNEL_ID,
            process.env.HELP_CHANNEL_ID,
            process.env.SHOWCASE_CHANNEL_ID
        ];
        
        let allMessages = [];
        
        for (const channelId of channels) {
            const channel = this.bot.client.channels.cache.get(channelId);
            if (!channel) continue;
            
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const userMessages = messages
                    .filter(m => m.author.id === targetId)
                    .first(10);
                
                allMessages = allMessages.concat(Array.from(userMessages.values()));
            } catch (error) {
                this.logger.error(`Error fetching messages from ${channelId}:`, error);
            }
        }
        
        // Sort by timestamp
        allMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
        
        // Create evidence summary
        if (allMessages.length > 0) {
            let evidence = '**Recent Message History:**\n\n';
            
            for (const msg of allMessages.slice(0, 20)) {
                const timestamp = new Date(msg.createdTimestamp).toLocaleString();
                evidence += `[${timestamp}] #${msg.channel.name}: ${msg.content.substring(0, 200)}\n`;
                
                if (evidence.length > 1800) {
                    await thread.send(evidence);
                    evidence = '';
                }
            }
            
            if (evidence) {
                await thread.send(evidence);
            }
        }
        
        // Get user info
        const userInfo = await this.db.query(
            'SELECT * FROM users WHERE id = ?',
            [targetId]
        );
        
        if (userInfo) {
            const user = userInfo;
            const joinDate = new Date(user.joined_at).toLocaleDateString();
            const lastActivity = new Date(user.last_activity_at).toLocaleDateString();
            
            await thread.send(
                `**User Info:**\n` +
                `Joined: ${joinDate}\n` +
                `Last Activity: ${lastActivity}\n` +
                `Timezone: ${user.timezone || 'Not set'}\n` +
                `Skills: ${user.skills?.join(', ') || 'None'}`
            );
        }
        
        // Get previous reports
        const previousReports = await this.db.query(
            'SELECT * FROM reports WHERE target_id = ? AND id != ? ORDER BY created_at DESC LIMIT 5',
            [targetId, thread.name.match(/\d+/)[0]]
        );
        
        if (previousReports && previousReports.length > 0) {
            let reportHistory = '**Previous Reports:**\n';
            for (const report of previousReports) {
                reportHistory += `• ${new Date(report.created_at).toLocaleDateString()}: ${report.reason}\n`;
            }
            await thread.send(reportHistory);
        }
    }

    async enforceChannelTemplate(message, template) {
        // Check if message follows template
        const requiredFields = template.fields || [];
        const content = message.content.toLowerCase();
        
        const missingFields = requiredFields.filter(field => 
            !content.includes(field.toLowerCase())
        );
        
        if (missingFields.length > 0) {
            // Send warning
            const warning = await message.reply(
                `⚠️ Your message is missing required fields: ${missingFields.join(', ')}\n` +
                `Please check the pinned message for the template. This message will be deleted in 60 seconds.`
            );
            
            // Delete after delay
            setTimeout(async () => {
                try {
                    await message.delete();
                    await warning.delete();
                } catch (error) {
                    // Messages may already be deleted
                }
            }, 60000);
            
            return false;
        }
        
        return true;
    }

    async checkNoColdDM(senderId, recipientId) {
        // Check if recipient has opted into DMs
        const recipient = await this.db.query(
            'SELECT dm_open FROM users WHERE id = ?',
            [recipientId]
        );
        
        if (!recipient || !recipient.dm_open) {
            // Check if they have prior interaction
            const interaction = await this.db.query(
                `SELECT 1 FROM messages m1
                 JOIN messages m2 ON m1.channel_id = m2.channel_id
                 WHERE m1.user_id = ? AND m2.user_id = ?
                 AND m1.created_at > datetime('now', '-30 days')
                 LIMIT 1`,
                [senderId, recipientId]
            );
            
            if (!interaction) {
                return false; // No cold DM allowed
            }
        }
        
        return true; // DM allowed
    }

    async alertFounders(guild, title, description) {
        const modChannel = guild.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
        if (!modChannel) return;
        
        const founderRole = guild.roles.cache.find(r => r.name === 'Founder');
        
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`🚨 ${title}`)
            .setDescription(description)
            .setTimestamp();
        
        await modChannel.send({
            content: founderRole ? `<@&${founderRole.id}>` : '@Founders',
            embeds: [embed]
        });
    }

    async escalateToFounders(userId, reason) {
        const guild = this.bot.client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
        const user = await this.bot.client.users.fetch(userId);
        
        await this.alertFounders(guild, 'User Escalation Required', 
            `User ${user.tag} (${userId}) requires founder attention.\n` +
            `Reason: ${reason}`
        );
    }

    async logModAction(action, details) {
        const modChannel = this.bot.client.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
        if (!modChannel) return;
        
        const embed = new EmbedBuilder()
            .setColor(0xFFFF00)
            .setTitle(`🔨 ${action}`)
            .setTimestamp();
        
        for (const [key, value] of Object.entries(details)) {
            embed.addFields({ 
                name: key.charAt(0).toUpperCase() + key.slice(1), 
                value: String(value).substring(0, 1024),
                inline: true 
            });
        }
        
        await modChannel.send({ embeds: [embed] });
    }

    isModerator(member) {
        if (!member) return false;
        return member.roles.cache.some(role => 
            role.name === 'Mod' || role.name === 'Founder'
        );
    }
}

