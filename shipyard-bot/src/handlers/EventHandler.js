// src/handlers/EventHandler.js
import { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class EventHandler {
    constructor(bot) {
        this.bot = bot;
        this.setupEvents();
    }

    async loadEvents() {
        this.bot.logger.info('Events loaded and listening');
    }

    setupEvents() {
        // Bot ready event
        this.bot.client.once(Events.ClientReady, () => this.onReady());
        
        // Guild member events
        this.bot.client.on(Events.GuildMemberAdd, (member) => this.onMemberJoin(member));
        this.bot.client.on(Events.GuildMemberRemove, (member) => this.onMemberLeave(member));
        
        // Message events
        this.bot.client.on(Events.MessageCreate, (message) => this.onMessageCreate(message));
        this.bot.client.on(Events.MessageDelete, (message) => this.onMessageDelete(message));
        
        // Interaction events
        this.bot.client.on(Events.InteractionCreate, (interaction) => this.onInteraction(interaction));
        
        // Reaction events
        this.bot.client.on(Events.MessageReactionAdd, (reaction, user) => this.onReactionAdd(reaction, user));
    }

    async onReady() {
        this.bot.logger.success(`Bot logged in as ${this.bot.client.user.tag}`);
        this.bot.client.user.setActivity('ShipYard Community', { type: 'WATCHING' });
        
        // Start cron jobs
        if (this.bot.cronManager) {
            this.bot.logger.info('Cron jobs started');
        }
    }

    async onMemberJoin(member) {
        try {
            // Anti-raid check
            const recentJoins = await this.checkRecentJoins(member.guild);
            if (recentJoins > parseInt(process.env.MAX_JOIN_RATE_PER_MIN || 8)) {
                await this.triggerRaidShield(member.guild);
                return;
            }

            // Add Quarantine role for first 10 minutes
            const quarantineRole = member.guild.roles.cache.find(r => r.name === 'Quarantine');
            if (quarantineRole) {
                await member.roles.add(quarantineRole);
                setTimeout(async () => {
                    try {
                        await member.roles.remove(quarantineRole);
                        const memberRole = member.guild.roles.cache.find(r => r.name === 'Member');
                        if (memberRole) {
                            await member.roles.add(memberRole);
                        }
                    } catch (error) {
                        this.bot.logger.error('Error removing quarantine role:', error);
                    }
                }, 10 * 60 * 1000); // 10 minutes
            }

            // Create user record
            await this.bot.db.query(
                `INSERT INTO users (id, username, joined_at) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (id) DO UPDATE 
                 SET username = $2, joined_at = $3`,
                [member.id, member.user.username, new Date()]
            );

            // Send onboarding DM
            await this.sendOnboardingDM(member);
            
        } catch (error) {
            this.bot.logger.error('Error in member join:', error);
        }
    }

    async onMemberLeave(member) {
        try {
            // Log member departure
            await this.bot.db.query(
                'UPDATE users SET deleted_at = $1 WHERE id = $2',
                [new Date(), member.id]
            );

            // Notify mods
            const modChannel = this.bot.client.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
            if (modChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('Member Left')
                    .setDescription(`${member.user.tag} has left the server`)
                    .setTimestamp();
                await modChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            this.bot.logger.error('Error in member leave:', error);
        }
    }

    async onMessageCreate(message) {
        if (message.author.bot) return;

        try {
            // Update last activity
            await this.bot.db.query(
                'UPDATE users SET last_activity_at = $1 WHERE id = $2',
                [new Date(), message.author.id]
            );

            // Log message for tracking
            const messageType = this.getMessageType(message.channel.id);
            await this.bot.db.query(
                `INSERT INTO messages (user_id, channel_id, message_id, type, created_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [message.author.id, message.channel.id, message.id, messageType, new Date()]
            );

            // Check for dock check participation
            if (message.channel.isThread() && message.channel.name.includes('Dock Check')) {
                await this.logDockCheckAction(message.author.id);
            }

            // Channel guardrails
            await this.enforceChannelGuardrails(message);
            
        } catch (error) {
            this.bot.logger.error('Error in message create:', error);
        }
    }

    async onInteraction(interaction) {
        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                const command = this.bot.commands.get(interaction.commandName);
                if (!command) return;

                try {
                    await command.execute(interaction);
                } catch (error) {
                    this.bot.logger.error(`Error executing command ${interaction.commandName}:`, error);
                    await interaction.reply({
                        content: 'There was an error executing this command!',
                        ephemeral: true
                    });
                }
            }

            // Handle button interactions
            else if (interaction.isButton()) {
                await this.handleButtonInteraction(interaction);
            }

            // Handle modal submissions
            else if (interaction.isModalSubmit()) {
                await this.handleModalSubmit(interaction);
            }

            // Handle select menu interactions
            else if (interaction.isSelectMenu()) {
                await this.handleSelectMenu(interaction);
            }
        } catch (error) {
            this.bot.logger.error('Error in interaction:', error);
        }
    }

    async handleButtonInteraction(interaction) {
        const [action, ...params] = interaction.customId.split('_');

        switch (action) {
            case 'rsvp':
                await this.handleRSVP(interaction, params[0], params[1]);
                break;
            case 'solved':
                await this.markAsSolved(interaction, params[0]);
                break;
            case 'helpful':
                await this.markAsHelpful(interaction, params[0]);
                break;
            case 'consent':
                await this.handleConsent(interaction, params[0], params[1]);
                break;
            default:
                break;
        }
    }

    async handleModalSubmit(interaction) {
        if (interaction.customId === 'onboarding_modal') {
            await this.processOnboarding(interaction);
        } else if (interaction.customId === 'clinic_modal') {
            await this.processClinicRequest(interaction);
        }
    }

    async processOnboarding(interaction) {
        const name = interaction.fields.getTextInputValue('name');
        const timezone = interaction.fields.getTextInputValue('timezone');
        const oneliner = interaction.fields.getTextInputValue('oneliner');
        const project = interaction.fields.getTextInputValue('project');
        const skills = interaction.fields.getTextInputValue('skills').split(',').map(s => s.trim());

        // Create intro card embed
        const introEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`👋 Welcome ${name}!`)
            .setDescription(oneliner)
            .addFields(
                { name: '🌍 Timezone', value: timezone, inline: true },
                { name: '🔨 Skills', value: skills.join(', '), inline: false }
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        if (project) {
            introEmbed.addFields({ name: '🚀 Projects', value: project });
        }

        // Post to introductions channel
        const introChannel = interaction.guild.channels.cache.get(process.env.INTRO_CHANNEL_ID);
        const introMessage = await introChannel.send({ embeds: [introEmbed] });

        // Update user record
        await this.bot.db.query(
            `UPDATE users 
             SET timezone = $1, skills = $2, intro_post_id = $3, offer = $4, need = $5
             WHERE id = $6`,
            [timezone, skills, introMessage.id, '', '', interaction.user.id]
        );

        // Add Member role
        const memberRole = interaction.guild.roles.cache.find(r => r.name === 'Member');
        if (memberRole) {
            await interaction.member.roles.add(memberRole);
        }

        await interaction.reply({
            content: '✅ Welcome to ShipYard! Your introduction has been posted.',
            ephemeral: true
        });
    }

    async handleRSVP(interaction, meetId, response) {
        await this.bot.db.query(
            `INSERT INTO meet_rsvps (meet_id, user_id, status, updated_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (meet_id, user_id) 
             DO UPDATE SET status = $3, updated_at = $4`,
            [meetId, interaction.user.id, response, new Date()]
        );

        await interaction.reply({
            content: `RSVP recorded: ${response === 'yes' ? '✅ Attending' : response === 'no' ? '❌ Not attending' : '🤷 Maybe'}`,
            ephemeral: true
        });
    }

    async markAsSolved(interaction, requestId) {
        const result = await this.bot.db.query(
            'SELECT author_id FROM help_requests WHERE id = $1',
            [requestId]
        );

        if (result.rows[0]?.author_id !== interaction.user.id && !this.isModerator(interaction.member)) {
            return interaction.reply({
                content: 'Only the request author or moderators can mark this as solved.',
                ephemeral: true
            });
        }

        await this.bot.db.query(
            'UPDATE help_requests SET status = $1, solved_at = $2 WHERE id = $3',
            ['solved', new Date(), requestId]
        );

        // Update the message
        await interaction.message.edit({
            embeds: [
                EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x00FF00)
                    .addFields({ name: 'Status', value: '✅ Solved' })
            ]
        });

        await interaction.reply({
            content: 'Help request marked as solved!',
            ephemeral: true
        });
    }

    async markAsHelpful(interaction, clinicId) {
        await this.bot.db.query(
            'UPDATE clinics SET helpful_count = helpful_count + 1 WHERE id = $1',
            [clinicId]
        );

        // Log action for gamification
        await this.logAction(interaction.user.id, 'clinic_helpful', interaction.message.id);

        await interaction.reply({
            content: 'Thanks for marking this feedback as helpful!',
            ephemeral: true
        });
    }

    async logAction(userId, type, refId, points = 1) {
        // Get current season
        const seasonResult = await this.bot.db.query(
            "SELECT id FROM seasons WHERE status = 'active' LIMIT 1"
        );
        const seasonId = seasonResult.rows[0]?.id;

        // Log the action
        await this.bot.db.query(
            `INSERT INTO actions_log (user_id, type, ref_message_id, points, season_id, week_key)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, type, refId, points, seasonId, this.getCurrentWeekKey()]
        );

        // Update season score
        if (seasonId) {
            await this.bot.db.query(
                `INSERT INTO scores (user_id, season_id, points)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, season_id)
                 DO UPDATE SET points = scores.points + $3, updated_at = NOW()`,
                [userId, seasonId, points]
            );
        }
    }

    async logDockCheckAction(userId) {
        // Check if user already logged dock check today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const existing = await this.bot.db.query(
            `SELECT id FROM actions_log 
             WHERE user_id = $1 AND type = 'dock' 
             AND created_at >= $2`,
            [userId, today]
        );

        if (existing.rows.length === 0) {
            await this.logAction(userId, 'dock', null, 1);
        }
    }

    async enforceChannelGuardrails(message) {
        const guardedChannels = [
            process.env.JOBS_COLLABS_CHANNEL_ID,
            process.env.CLINIC_CHANNEL_ID
        ];

        if (!guardedChannels.includes(message.channel.id)) return;

        // Check if message follows template
        const hasRequiredFormat = this.checkMessageFormat(message);
        
        if (!hasRequiredFormat) {
            const warning = await message.reply(
                '⚠️ Your message doesn\'t follow the required format for this channel. ' +
                'Please check the pinned message for the template. ' +
                'This message will be deleted in 60 seconds.'
            );

            setTimeout(async () => {
                try {
                    await message.delete();
                    await warning.delete();
                } catch (error) {
                    this.bot.logger.error('Error deleting message:', error);
                }
            }, 60000);
        }
    }

    checkMessageFormat(message) {
        // Simple format check - can be enhanced
        const content = message.content.toLowerCase();
        
        if (message.channel.id === process.env.JOBS_COLLABS_CHANNEL_ID) {
            return content.includes('[role]') || content.includes('[project]');
        } else if (message.channel.id === process.env.CLINIC_CHANNEL_ID) {
            return content.includes('goal:') || content.includes('draft:');
        }
        
        return true;
    }

    async sendOnboardingDM(member) {
        try {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Welcome to ShipYard! 🚢')
                .setDescription(
                    'We\'re excited to have you join our community of builders!\n\n' +
                    'To get started, please complete your introduction using the `/start` command in any channel.\n\n' +
                    '**What you\'ll need:**\n' +
                    '• Your name\n' +
                    '• Your timezone\n' +
                    '• A brief introduction\n' +
                    '• Your skills and interests\n' +
                    '• Current projects (optional)\n\n' +
                    'Once complete, you\'ll get access to all community features!'
                )
                .setFooter({ text: 'Use /start to begin!' });

            await member.send({ embeds: [embed] });
        } catch (error) {
            this.bot.logger.error(`Could not DM new member ${member.id}:`, error);
        }
    }

    async checkRecentJoins(guild) {
        const oneMinuteAgo = new Date(Date.now() - 60000);
        const result = await this.bot.db.query(
            'SELECT COUNT(*) FROM users WHERE joined_at > $1',
            [oneMinuteAgo]
        );
        return parseInt(result.rows[0].count);
    }

    async triggerRaidShield(guild) {
        // Lock server
        const everyoneRole = guild.roles.everyone;
        await everyoneRole.setPermissions(everyoneRole.permissions.remove('SEND_MESSAGES'));

        // Notify founders
        const modChannel = guild.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
        if (modChannel) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🛡️ RAID SHIELD ACTIVATED')
                .setDescription('Suspicious join activity detected. Server has been locked.')
                .addFields(
                    { name: 'Action Required', value: 'Review recent joins and unlock server when safe.' }
                )
                .setTimestamp();

            const unlockButton = new ButtonBuilder()
                .setCustomId('unlock_server')
                .setLabel('Unlock Server')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(unlockButton);
            
            await modChannel.send({ 
                content: '<@&Founder>',
                embeds: [embed],
                components: [row]
            });
        }
    }

    getMessageType(channelId) {
        const channelTypes = {
            [process.env.BUILD_LOG_CHANNEL_ID]: 'build_log',
            [process.env.CLINIC_CHANNEL_ID]: 'clinic_feedback',
            [process.env.HELP_CHANNEL_ID]: 'help_request',
            [process.env.SHOWCASE_CHANNEL_ID]: 'showcase',
            [process.env.DOCK_CHECK_CHANNEL_ID]: 'dock_check'
        };
        return channelTypes[channelId] || 'other';
    }

    getCurrentWeekKey() {
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
        monday.setHours(0, 0, 0, 0);
        return monday;
    }

    isModerator(member) {
        return member.roles.cache.some(role => 
            role.name === 'Mod' || role.name === 'Founder'
        );
    }

    async onReactionAdd(reaction, user) {
        if (user.bot) return;

        // Handle helpful reaction on clinic posts
        if (reaction.emoji.name === '✅' && 
            reaction.message.channel.id === process.env.CLINIC_CHANNEL_ID) {
            
            const clinicResult = await this.bot.db.query(
                'SELECT id, author_id FROM clinics WHERE message_id = $1',
                [reaction.message.id]
            );

            if (clinicResult.rows.length > 0 && 
                clinicResult.rows[0].author_id === user.id) {
                
                // Author marked as helpful - log action for the helper
                const helper = reaction.message.author;
                await this.logAction(helper.id, 'clinic_helpful', reaction.message.id);
            }
        }
    }

    async onMessageDelete(message) {
        // Log message deletion for audit purposes
        if (message.author?.bot) return;

        const modChannel = this.bot.client.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
        if (modChannel && !message.channel.id === modChannel.id) {
            const embed = new EmbedBuilder()
                .setColor(0xFFFF00)
                .setTitle('Message Deleted')
                .setDescription(`Message by ${message.author?.tag || 'Unknown'} deleted in <#${message.channel.id}>`)
                .addFields(
                    { name: 'Content', value: message.content?.substring(0, 1000) || 'No content' }
                )
                .setTimestamp();
            
            await modChannel.send({ embeds: [embed] });
        }
    }
}