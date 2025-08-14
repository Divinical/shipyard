// src/handlers/InteractionHandler.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class InteractionHandler {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
        this.logger = bot.logger;
    }

    async handleButton(interaction) {
        const [action, ...params] = interaction.customId.split('_');
        
        const handlers = {
            'rsvp': () => this.handleRSVP(interaction, params),
            'solved': () => this.handleSolved(interaction, params),
            'helpful': () => this.handleHelpful(interaction, params),
            'consent': () => this.handleConsent(interaction, params),
            'delete': () => this.handleDelete(interaction, params),
            'unlock': () => this.handleUnlock(interaction, params),
            'save': () => this.handleSave(interaction, params)
        };

        const handler = handlers[action];
        if (handler) {
            try {
                await handler();
            } catch (error) {
                this.logger.error(`Error handling button ${action}:`, error);
                await interaction.reply({
                    content: 'An error occurred processing your request.',
                    ephemeral: true
                });
            }
        } else {
            this.logger.warn(`Unknown button action: ${action}`);
        }
    }

    async handleModal(interaction) {
        const [type, ...params] = interaction.customId.split('_');
        
        const handlers = {
            'onboarding': () => this.processOnboarding(interaction),
            'clinic': () => this.processClinic(interaction),
            'report': () => this.processReport(interaction, params)
        };

        const handler = handlers[type];
        if (handler) {
            try {
                await handler();
            } catch (error) {
                this.logger.error(`Error handling modal ${type}:`, error);
                await interaction.reply({
                    content: 'An error occurred processing your submission.',
                    ephemeral: true
                });
            }
        }
    }

    async handleSelectMenu(interaction) {
        const [type, ...params] = interaction.customId.split('_');
        
        if (type === 'attendance') {
            await this.handleAttendanceSelect(interaction, params);
        }
    }

    // Button Handlers
    async handleRSVP(interaction, params) {
        const [meetId, response] = params;
        
        if (this.bot.services?.meet) {
            await this.bot.services.meet.recordRSVP(meetId, interaction.user.id, response);
        }

        const responseText = {
            'yes': '✅ Attending',
            'no': '❌ Not attending',
            'maybe': '🤷 Maybe'
        };

        await interaction.reply({
            content: `RSVP recorded: ${responseText[response]}`,
            ephemeral: true
        });

        // Update RSVP count on message
        await this.updateRSVPCount(interaction.message, meetId);
    }

    async handleSolved(interaction, params) {
        const [requestId] = params;
        
        const request = await this.db.query(
            'SELECT author_id FROM help_requests WHERE id = ?',
            [requestId]
        );

        if (request.rows.length === 0) {
            return interaction.reply({
                content: 'Help request not found.',
                ephemeral: true
            });
        }

        const isAuthor = request.rows[0].author_id === interaction.user.id;
        const isMod = this.isModerator(interaction.member);

        if (!isAuthor && !isMod) {
            return interaction.reply({
                content: 'Only the request author or moderators can mark this as solved.',
                ephemeral: true
            });
        }

        await this.db.query(
            'UPDATE help_requests SET status = ?, solved_at = ?, solved_by = ? WHERE id = ?',
            ['solved', new Date(), interaction.user.id, requestId]
        );

        // Log action for gamification
        if (this.bot.services?.gamification) {
            await this.bot.services.gamification.logAction(
                interaction.user.id, 
                'help_solved', 
                interaction.message.id
            );
        }

        // Update the message
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0x00FF00)
            .spliceFields(-1, 1, { name: 'Status', value: '✅ Solved', inline: true });

        await interaction.message.edit({ embeds: [updatedEmbed] });
        
        await interaction.reply({
            content: 'Help request marked as solved!',
            ephemeral: true
        });
    }

    async handleHelpful(interaction, params) {
        const [clinicId] = params;
        
        await this.db.query(
            'UPDATE clinics SET helpful_count = helpful_count + 1 WHERE id = ?',
            [clinicId]
        );

        // Find the helper (person who provided the feedback)
        const clinic = await this.db.query(
            'SELECT author_id FROM clinics WHERE id = ?',
            [clinicId]
        );

        if (clinic.rows[0]?.author_id === interaction.user.id) {
            // Author is marking someone's feedback as helpful
            // We need to find who gave the feedback (this is complex without tracking individual responses)
            // For now, we'll skip the gamification part
        }

        await interaction.reply({
            content: 'Thanks for marking this feedback as helpful!',
            ephemeral: true
        });
    }

    async handleConsent(interaction, params) {
        const [response, sessionId] = params;
        
        await this.db.query(
            'INSERT INTO consents (session_id, user_id, consent, timestamp) VALUES (?, ?, ?, ?)',
            [sessionId, interaction.user.id, response === 'yes' ? 1 : 0, new Date()]
        );

        await interaction.reply({
            content: response === 'yes' ? '✅ Consent recorded' : '❌ Consent declined',
            ephemeral: true
        });
    }

    async handleDelete(interaction, params) {
        const [action, userId] = params;
        
        if (action === 'confirm') {
            if (interaction.user.id !== userId) {
                return interaction.reply({
                    content: 'You can only delete your own data.',
                    ephemeral: true
                });
            }

            // Delete user data
            await this.db.query(
                `UPDATE users 
                 SET username = 'DELETED', 
                     timezone = NULL, 
                     x_profile = NULL, 
                     skills = NULL, 
                     offer = NULL, 
                     need = NULL,
                     deleted_at = datetime('now')
                 WHERE id = ?`,
                [userId]
            );

            await interaction.update({
                content: '✅ Your data has been deleted. Anonymized activity records have been retained for community statistics.',
                components: []
            });
        } else if (action === 'cancel') {
            await interaction.update({
                content: 'Data deletion cancelled.',
                components: []
            });
        }
    }

    async handleUnlock(interaction, params) {
        if (params[0] === 'server') {
            if (!this.isFounder(interaction.member)) {
                return interaction.reply({
                    content: 'Only founders can unlock the server.',
                    ephemeral: true
                });
            }

            if (this.bot.services?.moderation) {
                await this.bot.services.moderation.unlockServer(interaction.guild);
            }

            await interaction.reply({
                content: '✅ Server unlocked',
                ephemeral: true
            });
        }
    }

    async handleSave(interaction, params) {
        if (params[0] === 'attendance') {
            const meetId = params[1];
            
            // Get stored attendance selection
            const stored = await this.db.query(
                'SELECT value FROM policies WHERE key = ?',
                [`attendance.temp.${meetId}`]
            );

            if (stored.rows.length === 0) {
                return interaction.reply({
                    content: 'No attendance data found. Please select attendees first.',
                    ephemeral: true
                });
            }

            const attendees = JSON.parse(stored.rows[0].value);
            
            // Record attendance
            if (this.bot.services?.meet) {
                await this.bot.services.meet.recordAttendance(meetId, attendees);
            }

            // Clean up temp data
            await this.db.query(
                'DELETE FROM policies WHERE key = ?',
                [`attendance.temp.${meetId}`]
            );

            await interaction.reply({
                content: `✅ Attendance recorded for ${attendees.length} members`,
                ephemeral: true
            });
        }
    }

    // Modal Handlers
    async processOnboarding(interaction) {
        const data = {
            name: interaction.fields.getTextInputValue('name'),
            timezone: interaction.fields.getTextInputValue('timezone'),
            oneliner: interaction.fields.getTextInputValue('oneliner'),
            project: interaction.fields.getTextInputValue('project'),
            skills: interaction.fields.getTextInputValue('skills').split(',').map(s => s.trim())
        };

        // Validate timezone
        if (!this.isValidTimezone(data.timezone)) {
            return interaction.reply({
                content: '❌ Invalid timezone. Please use a valid IANA timezone (e.g., Europe/London)',
                ephemeral: true
            });
        }

        // Create intro embed
        const introEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`👋 Welcome ${data.name}!`)
            .setDescription(data.oneliner)
            .addFields(
                { name: '🌍 Timezone', value: data.timezone, inline: true },
                { name: '🔨 Skills', value: data.skills.join(', '), inline: false }
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        if (data.project) {
            introEmbed.addFields({ name: '🚀 Projects', value: data.project });
        }

        // Post to introductions
        const introChannel = interaction.guild.channels.cache.get(process.env.INTRO_CHANNEL_ID);
        if (!introChannel) {
            return interaction.reply({
                content: '❌ Introduction channel not found. Please contact a moderator.',
                ephemeral: true
            });
        }

        const introMessage = await introChannel.send({ embeds: [introEmbed] });

        // Update user record
        await this.db.query(
            `UPDATE users 
             SET timezone = ?, skills = ?, intro_post_id = ?
             WHERE id = ?`,
            [data.timezone, this.db.formatArray(data.skills), introMessage.id, interaction.user.id]
        );

        // Complete onboarding
        if (this.bot.services?.onboarding) {
            await this.bot.services.onboarding.completeOnboarding(interaction.user.id, data);
        }

        // Add Member role
        const memberRole = interaction.guild.roles.cache.find(r => r.name === 'Member');
        if (memberRole) {
            await interaction.member.roles.add(memberRole);
        }

        // Remove New Member role if exists
        const newMemberRole = interaction.guild.roles.cache.find(r => r.name === 'New Member');
        if (newMemberRole && interaction.member.roles.cache.has(newMemberRole.id)) {
            await interaction.member.roles.remove(newMemberRole);
        }

        await interaction.reply({
            content: '✅ Welcome to ShipYard! Your introduction has been posted.',
            ephemeral: true
        });
    }

    async processClinic(interaction) {
        const data = {
            goal: interaction.fields.getTextInputValue('goal'),
            draft: interaction.fields.getTextInputValue('draft'),
            questions: interaction.fields.getTextInputValue('questions').split('\n').filter(q => q.trim()),
            ask: interaction.fields.getTextInputValue('ask')
        };

        // Create clinic in database
        await this.db.query(
            `INSERT INTO clinics (author_id, goal, draft, questions, ask, status)
             VALUES (?, ?, ?, ?, ?, 'open')`,
            [interaction.user.id, data.goal, data.draft, data.questions, data.ask]
        );
        
        const result = await this.db.query('SELECT last_insert_rowid() as id');

        const clinicId = result.rows[0].id;

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle('💡 Feedback Request')
            .setAuthor({ 
                name: interaction.user.username,
                iconURL: interaction.user.displayAvatarURL()
            })
            .addFields(
                { name: '🎯 Goal', value: data.goal },
                { name: '📝 Current Draft', value: data.draft.substring(0, 1024) },
                { name: '❓ Questions', value: data.questions.join('\n').substring(0, 1024) },
                { name: '🙏 What would help', value: data.ask }
            )
            .setFooter({ text: `Clinic ID: ${clinicId}` })
            .setTimestamp();

        // Add helpful button
        const helpfulButton = new ButtonBuilder()
            .setCustomId(`helpful_${clinicId}`)
            .setLabel('Mark as Helpful')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const row = new ActionRowBuilder().addComponents(helpfulButton);

        // Post to clinic channel
        const clinicChannel = interaction.guild.channels.cache.get(process.env.CLINIC_CHANNEL_ID);
        if (!clinicChannel) {
            return interaction.reply({
                content: '❌ Clinic channel not found. Please contact a moderator.',
                ephemeral: true
            });
        }

        const message = await clinicChannel.send({ 
            embeds: [embed],
            components: [row]
        });

        // Update with message ID
        await this.db.query(
            'UPDATE clinics SET message_id = ? WHERE id = ?',
            [message.id, clinicId]
        );

        await interaction.reply({
            content: '✅ Your feedback request has been posted!',
            ephemeral: true
        });
    }

    async processReport(interaction, params) {
        const targetId = params.join('_'); // Rejoin in case ID had underscores
        const details = interaction.fields.getTextInputValue('details');

        // Get pending report data
        const pendingData = await this.db.query(
            'SELECT value FROM policies WHERE key = ?',
            [`report.pending.${interaction.user.id}`]
        );

        if (pendingData.rows.length === 0) {
            return interaction.reply({
                content: '❌ Report data not found. Please try again.',
                ephemeral: true
            });
        }

        const reportData = JSON.parse(pendingData.rows[0].value);

        // Create full report
        const fullReason = `${reportData.reason}${details ? `\n\nAdditional Details: ${details}` : ''}`;

        const reportId = await this.createReport(
            interaction.user.id,
            targetId,
            fullReason
        );

        // Clean up pending data
        await this.db.query(
            'DELETE FROM policies WHERE key = ?',
            [`report.pending.${interaction.user.id}`]
        );

        await interaction.reply({
            content: `✅ Report #${reportId} has been filed. Moderators will review it soon.`,
            ephemeral: true
        });
    }

    // Helper Methods
    async updateRSVPCount(message, meetId) {
        const rsvps = await this.db.query(
            `SELECT status, COUNT(*) as count
             FROM meet_rsvps
             WHERE meet_id = ?
             GROUP BY status`,
            [meetId]
        );

        const counts = { yes: 0, no: 0, maybe: 0 };
        rsvps.rows.forEach(row => {
            counts[row.status] = parseInt(row.count);
        });

        // Update embed with counts
        const embed = EmbedBuilder.from(message.embeds[0]);
        const footerText = embed.data.footer.text;
        const newFooter = `${footerText} | ✅ ${counts.yes} | ❌ ${counts.no} | 🤷 ${counts.maybe}`;
        embed.setFooter({ text: newFooter });

        await message.edit({ embeds: [embed] });
    }

    async createReport(reporterId, targetId, reason) {
        if (this.bot.services?.moderation) {
            return await this.bot.services.moderation.createReport(reporterId, targetId, reason);
        }

        // Fallback
        await this.db.query(
            `INSERT INTO reports (reporter_id, target_id, reason, created_at)
             VALUES (?, ?, ?, ?)`,
            [reporterId, targetId, reason, new Date()]
        );
        
        const result = await this.db.query('SELECT last_insert_rowid() as id');

        return result.rows[0].id;
    }

    isValidTimezone(tz) {
        try {
            Intl.DateTimeFormat(undefined, { timeZone: tz });
            return true;
        } catch {
            return false;
        }
    }

    isModerator(member) {
        return member.roles.cache.some(role => 
            role.name === 'Mod' || role.name === 'Founder'
        );
    }

    isFounder(member) {
        return member.roles.cache.some(role => role.name === 'Founder');
    }

    // Select Menu Handlers
    async handleAttendanceSelect(interaction, params) {
        const meetId = params[0];
        const attendees = interaction.values;

        // Store temporarily
        await this.db.query(
            `INSERT OR REPLACE INTO policies (key, value) 
             VALUES (?, ?)`,
            [`attendance.temp.${meetId}`, JSON.stringify(attendees)]
        );

        await interaction.reply({
            content: `${attendees.length} attendees selected. Click "Save Attendance" to confirm.`,
            ephemeral: true
        });
    }
}