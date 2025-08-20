// src/events/interactionCreate.js
import { Events, MessageFlags } from 'discord.js';
import { ChannelManager } from '../utils/ChannelManager.js';
import { WelcomeCardService } from '../services/WelcomeCardService.js';

export default {
    name: Events.InteractionCreate,
    async execute(interaction, bot) {
        const channelManager = new ChannelManager(bot);
        
        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                const command = bot.commands.get(interaction.commandName);
                if (!command) {
                    bot.logger.warn(`Unknown command: ${interaction.commandName}`);
                    return;
                }
                
                try {
                    await command.execute(interaction);
                } catch (error) {
                    bot.logger.error(`Error executing command ${interaction.commandName}:`, error);
                    
                    const errorMessage = {
                        content: 'There was an error executing this command!',
                        ephemeral: true
                    };
                    
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMessage);
                    } else {
                        await interaction.reply(errorMessage);
                    }
                }
            }
            
            // Handle button interactions
            else if (interaction.isButton()) {
                await handleButtonInteraction(interaction, bot);
            }
            
            // Handle modal submissions
            else if (interaction.isModalSubmit()) {
                await handleModalSubmit(interaction, bot, channelManager);
            }
            
            // Handle select menu interactions
            else if (interaction.isStringSelectMenu()) {
                await handleSelectMenu(interaction, bot);
            }
            
        } catch (error) {
            bot.logger.error('Error in interaction:', error);
        }
    }
};

async function handleButtonInteraction(interaction, bot) {
    const [action, ...params] = interaction.customId.split('_');
    
    switch (action) {
        case 'rsvp':
            await handleRSVP(bot, interaction, params[0], params[1]);
            break;
        case 'solved':
            await markAsSolved(bot, interaction, params[0]);
            break;
        case 'helpful':
            await markAsHelpful(bot, interaction, params[0]);
            break;
        case 'resolved':
            await markAsResolved(bot, interaction, params[0]);
            break;
        case 'consent':
            await handleConsent(bot, interaction, params[0], params[1]);
            break;
        case 'delete':
            if (params[0] === 'confirm') {
                await confirmDataDeletion(bot, interaction, params[1]);
            } else if (params[0] === 'cancel') {
                await interaction.update({ content: 'Data deletion cancelled.', components: [] });
            }
            break;
        case 'unlock':
            if (params[0] === 'server' && bot.services?.moderation) {
                await bot.services.moderation.unlockServer(interaction.guild);
                await interaction.reply({ content: 'Server unlocked', ephemeral: true });
            }
            break;
    }
}

async function handleRSVP(bot, interaction, meetId, response) {
    if (bot.services?.meet) {
        await bot.services.meet.recordRSVP(meetId, interaction.user.id, response);
    } else {
        await bot.db.query(
            `INSERT OR REPLACE INTO meet_rsvps (meet_id, user_id, status, updated_at)
             VALUES (?, ?, ?, ?)`,
            [meetId, interaction.user.id, response, new Date()]
        );
    }
    
    await interaction.reply({
        content: `RSVP recorded: ${response === 'yes' ? '✅ Attending' : response === 'no' ? '❌ Not attending' : '🤷 Maybe'}`,
        ephemeral: true
    });
}

async function markAsSolved(bot, interaction, requestId) {
    const result = await bot.db.query(
        'SELECT author_id FROM help_requests WHERE id = ?',
        [requestId]
    );
    
    const isAuthor = result.rows[0]?.author_id === interaction.user.id;
    const isMod = interaction.member.roles.cache.some(r => r.name === 'Mod' || r.name === 'Founder');
    
    if (!isAuthor && !isMod) {
        return interaction.reply({
            content: 'Only the request author or moderators can mark this as solved.',
            ephemeral: true
        });
    }
    
    await bot.db.query(
        'UPDATE help_requests SET status = ?, solved_at = ?, solved_by = ? WHERE id = ?',
        ['solved', new Date(), interaction.user.id, requestId]
    );
    
    if (bot.services?.gamification) {
        await bot.services.gamification.logAction(interaction.user.id, 'help_solved', interaction.message.id);
    }
    
    await interaction.reply({
        content: 'Help request marked as solved!',
        ephemeral: true
    });
}

async function markAsHelpful(bot, interaction, clinicId) {
    await bot.db.query(
        'UPDATE clinics SET helpful_count = helpful_count + 1 WHERE id = ?',
        [clinicId]
    );
    
    if (bot.services?.gamification) {
        await bot.services.gamification.logAction(interaction.user.id, 'clinic_helpful', interaction.message.id);
    }
    
    await interaction.reply({
        content: 'Thanks for marking this feedback as helpful!',
        ephemeral: true
    });
}

async function markAsResolved(bot, interaction, clinicId) {
    const result = await bot.db.query(
        'SELECT author_id FROM clinics WHERE id = ?',
        [clinicId]
    );
    
    const isAuthor = result.rows[0]?.author_id === interaction.user.id;
    const isMod = interaction.member.roles.cache.some(r => r.name === 'Mod' || r.name === 'Founder');
    
    if (!isAuthor && !isMod) {
        return interaction.reply({
            content: 'Only the request author or moderators can mark this as resolved.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    await bot.db.query(
        'UPDATE clinics SET status = ?, solved_at = ? WHERE id = ?',
        ['solved', new Date(), clinicId]
    );
    
    await interaction.reply({
        content: 'Feedback request marked as resolved!',
        flags: MessageFlags.Ephemeral
    });
}

async function handleConsent(bot, interaction, response, sessionId) {
    await bot.db.query(
        'INSERT INTO consents (session_id, user_id, consent, timestamp) VALUES (?, ?, ?, ?)',
        [sessionId, interaction.user.id, response === 'yes' ? 1 : 0, new Date()]
    );
    
    await interaction.reply({
        content: response === 'yes' ? '✅ Consent recorded' : '❌ Consent declined',
        ephemeral: true
    });
}

async function confirmDataDeletion(bot, interaction, userId) {
    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: 'You can only delete your own data.',
            ephemeral: true
        });
    }
    
    // Delete user data (keep anonymized records)
    await bot.db.query(
        `UPDATE users 
         SET username = 'DELETED', 
             timezone = NULL, 
             x_profile = NULL, 
             skills = NULL, 
             offer = NULL, 
             need = NULL,
             deleted_at = ?
         WHERE id = ?`,
        [new Date(), userId]
    );
    
    await interaction.update({
        content: '✅ Your data has been deleted. Anonymized activity records have been retained for community statistics.',
        components: []
    });
}

async function handleModalSubmit(interaction, bot, channelManager) {
    if (interaction.customId === 'onboarding_modal') {
        await processOnboarding(interaction, bot, channelManager);
    } else if (interaction.customId === 'clinic_modal') {
        await processClinicRequest(interaction, bot, channelManager);
    } else if (interaction.customId.startsWith('report_details_')) {
        await processReportDetails(interaction, bot);
    }
}

async function processOnboarding(interaction, bot, channelManager) {
    const welcomeCardService = new WelcomeCardService(bot);
    
    const name = interaction.fields.getTextInputValue('username');
    const timezone = interaction.fields.getTextInputValue('timezone');
    const oneliner = interaction.fields.getTextInputValue('offer');
    const project = interaction.fields.getTextInputValue('x_profile');
    const skills = interaction.fields.getTextInputValue('skills').split(',').map(s => s.trim());
    
    // Get intro channel for API-generated welcome card
    const { channel: introChannel, usedFallback, errorMessage } = await channelManager.getChannel(
        'INTRO',
        interaction,
        false
    );

    if (!introChannel) {
        return interaction.reply({
            content: `Unable to find introduction channel: ${errorMessage}`,
            ephemeral: true
        });
    }
    
    // Insert or update user record
    await bot.db.query(
        `INSERT OR IGNORE INTO users (id, username, joined_at) 
         VALUES (?, ?, ?)`,
        [interaction.user.id, interaction.user.username, new Date()]
    );
    
    await bot.db.query(
        `UPDATE users 
         SET username = ?, timezone = ?, offer = ?, x_profile = ?, skills = ?
         WHERE id = ?`,
        [name, timezone, oneliner, project, bot.db.formatArray(skills), interaction.user.id]
    );
    
    // Add Member role
    const memberRole = interaction.guild.roles.cache.find(r => r.name === 'Member');
    if (memberRole) {
        await interaction.member.roles.add(memberRole);
    }
    
    // Reply to user immediately to avoid timeout
    const successMessage = usedFallback 
        ? '✅ Welcome to ShipYard! Your introduction has been posted in this channel.'
        : `✅ Welcome to ShipYard! Your introduction has been posted in <#${introChannel.id}>.`;
    
    await interaction.reply({
        content: successMessage,
        flags: MessageFlags.Ephemeral
    });
    
    // Generate and send introduction card in background (don't await to avoid timeout)
    const formData = { name, timezone, x_profile: project, skills };
    const introCardData = welcomeCardService.generateIntroductionData(interaction.user, formData);
    
    // Process welcome card asynchronously
    welcomeCardService.sendIntroductionCard(introChannel, introCardData).catch(error => {
        bot.logger.error('Failed to send introduction card:', error);
    });
}

async function processClinicRequest(interaction, bot, channelManager) {
    const goal = interaction.fields.getTextInputValue('goal');
    const draft = interaction.fields.getTextInputValue('draft');
    const questions = interaction.fields.getTextInputValue('questions').split('\n').filter(q => q.trim());
    const ask = interaction.fields.getTextInputValue('ask');
    
    // Generate forum post title and tags
    const postTitle = `Feedback: ${goal.length > 50 ? goal.slice(0, 47) + '...' : goal}`;
    const forumTags = generateFeedbackForumTags({ goal, draft, questions, ask });
    
    // Create temporary clinic ID for UI
    const tempClinicId = `temp_${Date.now()}`;
    
    // Create embed
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const embed = new EmbedBuilder()
        .setColor(0x00FFFF)
        .setTitle('💡 Feedback Request')
        .setAuthor({ 
            name: interaction.user.username,
            iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
            { name: '🎯 Goal', value: goal },
            { name: '📝 Current Draft', value: draft.substring(0, 1024) },
            { name: '❓ Questions', value: questions.join('\n').substring(0, 1024) },
            { name: '🙏 What would help', value: ask }
        )
        .setFooter({ text: `Clinic ID: ${tempClinicId}` })
        .setTimestamp();
    
    const helpfulButton = new ButtonBuilder()
        .setCustomId(`helpful_${tempClinicId}`)
        .setLabel('Mark as Helpful')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');
    
    const row = new ActionRowBuilder().addComponents(helpfulButton);
    
    // Post to forum channel using ChannelManager
    const { thread, message, channel: clinicChannel, usedFallback, error } = await channelManager.postToForumChannel(
        'CLINIC',
        interaction,
        postTitle,
        { embeds: [embed], components: [row] },
        forumTags
    );

    if (!message) {
        return interaction.reply({
            content: `Unable to post feedback request: ${error}`,
            ephemeral: true
        });
    }
    
    // Create clinic post in database with message_id and thread_id
    const result = await bot.db.query(
        `INSERT INTO clinics (author_id, goal, draft, questions, ask, status, message_id, thread_id)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
        [interaction.user.id, goal, draft, JSON.stringify(questions), ask, message.id, thread?.id]
    );
    
    const clinicId = result.lastID;
    
    // Update the embed and button with real clinic ID
    const updatedEmbed = new EmbedBuilder()
        .setColor(0x00FFFF)
        .setTitle('💡 Feedback Request')
        .setAuthor({ 
            name: interaction.user.username,
            iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
            { name: '🎯 Goal', value: goal },
            { name: '📝 Current Draft', value: draft.substring(0, 1024) },
            { name: '❓ Questions', value: questions.join('\n').substring(0, 1024) },
            { name: '🙏 What would help', value: ask }
        )
        .setFooter({ text: `Clinic ID: ${clinicId}` })
        .setTimestamp();

    const updatedHelpfulButton = new ButtonBuilder()
        .setCustomId(`helpful_${clinicId}`)
        .setLabel('Mark as Helpful')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');

    const updatedRow = new ActionRowBuilder().addComponents(updatedHelpfulButton);
    
    // Update the message with correct clinic ID
    await message.edit({
        embeds: [updatedEmbed],
        components: [updatedRow]
    });
    
    const successMessage = usedFallback 
        ? 'Your feedback request has been posted in this channel!'
        : `Your feedback request has been posted in <#${clinicChannel.id}>${thread ? ' (in a new thread)' : ''}!`;
    
    await interaction.reply({
        content: successMessage,
        flags: MessageFlags.Ephemeral
    });
}

async function processReportDetails(interaction, bot) {
    const targetId = interaction.customId.replace('report_details_', '');
    const details = interaction.fields.getTextInputValue('details');
    
    // Get pending report data
    const pendingData = await bot.db.query(
        'SELECT value FROM policies WHERE key = ?',
        [`report.pending.${interaction.user.id}`]
    );
    
    if (pendingData.rows.length === 0) {
        return interaction.reply({
            content: 'Report data not found. Please try again.',
            ephemeral: true
        });
    }
    
    const reportData = pendingData.rows[0].value;
    
    // Create full report
    if (bot.services?.moderation) {
        const reportId = await bot.services.moderation.createReport(
            interaction.user.id,
            targetId,
            `${reportData.reason}\n\nDetails: ${details}`
        );
        
        await interaction.reply({
            content: `Report #${reportId} has been filed. Moderators will review it soon.`,
            ephemeral: true
        });
    } else {
        // Fallback
        await bot.db.query(
            `INSERT INTO reports (reporter_id, target_id, reason, created_at)
             VALUES (?, ?, ?, ?)`,
            [interaction.user.id, targetId, `${reportData.reason}\n\nDetails: ${details}`, new Date()]
        );
        
        const result = await bot.db.query('SELECT last_insert_rowid() as id');
        await interaction.reply({
            content: `Report #${result.rows[0].id} has been filed.`,
            ephemeral: true
        });
    }
    
    // Clean up pending data
    await bot.db.query(
        'DELETE FROM policies WHERE key = ?',
        [`report.pending.${interaction.user.id}`]
    );
}

async function handleSelectMenu(interaction, bot) {
    if (interaction.customId.startsWith('attendance_')) {
        const meetId = interaction.customId.replace('attendance_', '');
        const attendees = interaction.values;
        
        // Store temporarily
        await bot.db.query(
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

/**
 * Generate forum tags for feedback requests
 * @param {Object} feedbackData - Feedback request data
 * @returns {Array<string>} Array of forum tag names
 */
function generateFeedbackForumTags(feedbackData) {
    const forumTags = ['Feedback Request']; // Always add this tag

    // Analyze the goal and draft to determine what kind of feedback
    const content = `${feedbackData.goal} ${feedbackData.draft} ${feedbackData.questions.join(' ')}`.toLowerCase();

    // Category detection based on keywords
    if (content.includes('design') || content.includes('ui') || content.includes('ux') || 
        content.includes('interface') || content.includes('visual') || content.includes('color') ||
        content.includes('layout') || content.includes('figma')) {
        forumTags.push('Design Review');
    }

    if (content.includes('code') || content.includes('function') || content.includes('bug') ||
        content.includes('error') || content.includes('syntax') || content.includes('algorithm') ||
        content.includes('programming') || content.includes('development')) {
        forumTags.push('Code Review');
    }

    if (content.includes('product') || content.includes('feature') || content.includes('user') ||
        content.includes('market') || content.includes('strategy') || content.includes('business') ||
        content.includes('idea') || content.includes('concept')) {
        forumTags.push('Product Strategy');
    }

    if (content.includes('ui') || content.includes('ux') || content.includes('user experience') ||
        content.includes('usability') || content.includes('mobile') || content.includes('app')) {
        forumTags.push('UI/UX');
    }

    // If no specific category was detected, add General
    if (forumTags.length === 1) {
        forumTags.push('General');
    }

    return forumTags;
}