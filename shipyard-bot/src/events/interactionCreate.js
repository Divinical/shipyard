// src/events/interactionCreate.js
import { Events, MessageFlags, EmbedBuilder } from 'discord.js';
import { ChannelManager } from '../utils/ChannelManager.js';
import { PermissionUtils } from '../utils/PermissionUtils.js';

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
                        flags: MessageFlags.Ephemeral
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
                await interaction.reply({ content: 'Server unlocked', flags: MessageFlags.Ephemeral });
            }
            break;
        case 'continue':
            if (params[0] === 'intro') {
                await showSkillsModal(interaction, bot, params[1]); // params[1] is userId
            }
            break;
        case 'start':
            if (params[0] === 'intro') {
                await startIntroductionModal(interaction, bot, params[1]); // params[1] is userId
            }
            break;
        case 'spam':
            if (params[0] === 'allow') {
                await handleSpamAllow(interaction, bot, params[1]); // params[1] is messageId
            } else if (params[0] === 'delete') {
                await handleSpamDelete(interaction, bot, params[1]); // params[1] is messageId
            }
            break;
    }
}

async function startIntroductionModal(interaction, bot, userId) {
    // Verify user matches the one who clicked the button
    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: '❌ This introduction button was created for someone else.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Check if user already has intro
    const user = await bot.db.query(
        'SELECT thread_id FROM users WHERE id = ?',
        [interaction.user.id]
    );

    if (user.rows.length > 0 && user.rows[0].thread_id) {
        return interaction.reply({
            content: '✅ You have already completed your introduction! You should now have access to all channels.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Create and show the introduction modal (same as /introduce command)
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
    const modal = new ModalBuilder()
        .setCustomId('onboarding_modal')
        .setTitle('Welcome to ShipYard! (Step 1/2)');

    // Add input fields (same as /introduce command)
    const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('What should we call you?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setPlaceholder('Your name or nickname');

    const locationInput = new TextInputBuilder()
        .setCustomId('location')
        .setLabel('Where are you from?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setPlaceholder('Country / City (e.g., Spain / Barcelona)');

    const ageInput = new TextInputBuilder()
        .setCustomId('age')
        .setLabel('How old are you?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3)
        .setPlaceholder('25');

    const personalLineInput = new TextInputBuilder()
        .setCustomId('personal_line')
        .setLabel('Tell us about yourself (one sentence)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(200)
        .setPlaceholder('I\'m passionate about building tech solutions for small businesses');

    const xHandleInput = new TextInputBuilder()
        .setCustomId('x_handle')
        .setLabel('Your X/Twitter handle')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setPlaceholder('@yourusername or yourusername');

    // Create action rows
    const rows = [
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(locationInput),
        new ActionRowBuilder().addComponents(ageInput),
        new ActionRowBuilder().addComponents(personalLineInput),
        new ActionRowBuilder().addComponents(xHandleInput)
    ];

    modal.addComponents(...rows);
    await interaction.showModal(modal);
}

async function showSkillsModal(interaction, bot, userId) {
    // Verify user matches the one who started the process
    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: '❌ This introduction process was started by someone else.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Create skills modal (second part)  
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
    const modal = new ModalBuilder()
        .setCustomId('skills_modal')
        .setTitle('Skills & Projects (Step 2/2)');

    const skill1Input = new TextInputBuilder()
        .setCustomId('skill_1')
        .setLabel('Your most valuable skill #1')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setPlaceholder('JavaScript, Design, Marketing, etc.');

    const skill2Input = new TextInputBuilder()
        .setCustomId('skill_2')
        .setLabel('Your most valuable skill #2')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setPlaceholder('React, UI/UX, Sales, etc.');

    const skill3Input = new TextInputBuilder()
        .setCustomId('skill_3')
        .setLabel('Your most valuable skill #3')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setPlaceholder('Node.js, Product Strategy, etc.');

    const project1Input = new TextInputBuilder()
        .setCustomId('project_1')
        .setLabel('Recent project #1 URL (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(200)
        .setPlaceholder('https://yourproject.com');

    const project2Input = new TextInputBuilder()
        .setCustomId('project_2')
        .setLabel('Recent project #2 URL (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(200)
        .setPlaceholder('https://anotherproject.com');

    const skillRows = [
        new ActionRowBuilder().addComponents(skill1Input),
        new ActionRowBuilder().addComponents(skill2Input),
        new ActionRowBuilder().addComponents(skill3Input),
        new ActionRowBuilder().addComponents(project1Input),
        new ActionRowBuilder().addComponents(project2Input)
    ];

    modal.addComponents(...skillRows);
    await interaction.showModal(modal);
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
    
    if (result.rows.length === 0) {
        return interaction.reply({
            content: 'Help request not found.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const isAuthor = result.rows[0].author_id === interaction.user.id;
    const isMod = PermissionUtils.isModerator(interaction.member);
    
    if (!isAuthor && !isMod) {
        return interaction.reply({
            content: 'Only the request author, moderators, or founders can mark this as solved.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    await bot.db.query(
        'UPDATE help_requests SET status = ?, solved_at = ?, solved_by = ? WHERE id = ?',
        ['solved', new Date(), interaction.user.id, requestId]
    );
    
    if (bot.services?.gamification) {
        await bot.services.gamification.logAction(interaction.user.id, 'help_solved', interaction.message.id);
    }
    
    // Update the message embed and remove the button
    const currentEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(currentEmbed)
        .setColor(0x00FF00); // Green color for solved
    
    // Find and update the Status field
    const statusFieldIndex = currentEmbed.fields.findIndex(field => field.name === 'Status');
    if (statusFieldIndex !== -1) {
        updatedEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: '✅ Solved', inline: true });
    } else {
        updatedEmbed.addFields({ name: 'Status', value: '✅ Solved', inline: true });
    }
    
    // Add solved by field
    updatedEmbed.addFields({ name: 'Solved by', value: `<@${interaction.user.id}>`, inline: true });

    // Remove the button by setting components to empty array
    await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
    
    await interaction.reply({
        content: '✅ Help request marked as solved!',
        flags: MessageFlags.Ephemeral
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
        flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
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
        await processOnboardingPart1(interaction, bot, channelManager);
    } else if (interaction.customId === 'skills_modal') {
        await processOnboardingPart2(interaction, bot, channelManager);
    } else if (interaction.customId === 'clinic_modal') {
        await processClinicRequest(interaction, bot, channelManager);
    } else if (interaction.customId === 'goals_modal') {
        await processGoalsSubmission(interaction, bot, channelManager);
    } else if (interaction.customId.startsWith('report_details_')) {
        await processReportDetails(interaction, bot);
    }
}

async function processOnboardingPart1(interaction, bot, channelManager) {
    // Store first part of data temporarily in database
    const name = interaction.fields.getTextInputValue('name');
    const location = interaction.fields.getTextInputValue('location');
    const age = interaction.fields.getTextInputValue('age');
    const personalLine = interaction.fields.getTextInputValue('personal_line');
    const xHandle = interaction.fields.getTextInputValue('x_handle');

    // Store temporary data
    await bot.db.query(
        `INSERT OR REPLACE INTO temp_intros (user_id, name, location, age, personal_line, x_handle, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [interaction.user.id, name, location, age, personalLine, xHandle, new Date()]
    );

    // Check for significant name differences and warn user
    const discordUsername = interaction.user.username;
    const normalizedIntroName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedDiscordName = discordUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    let nameWarning = '';
    if (normalizedIntroName !== normalizedDiscordName && 
        !normalizedIntroName.includes(normalizedDiscordName) && 
        !normalizedDiscordName.includes(normalizedIntroName)) {
        nameWarning = `\n\n⚠️ **Name Notice**: Your Discord username is "${discordUsername}" but you want to be called "${name}". Your Discord nickname will be updated to "${name}" to avoid confusion in the community.`;
    }

    // Create continue button for second part
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const continueButton = new ButtonBuilder()
        .setCustomId(`continue_intro_${interaction.user.id}`)
        .setLabel('Continue to Skills & Projects')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('▶️');

    const row = new ActionRowBuilder().addComponents(continueButton);

    await interaction.reply({
        content: `✅ **Step 1 Complete!**\n\nThanks ${name}! Now let's add your skills and projects.${nameWarning}\n\n*Click the button below to continue:*`,
        components: [row],
        ephemeral: true
    });
}

async function processOnboardingPart2(interaction, bot, channelManager) {
    // Get temporary data from first modal
    const tempData = await bot.db.query(
        'SELECT * FROM temp_intros WHERE user_id = ?',
        [interaction.user.id]
    );

    if (tempData.rows.length === 0) {
        return interaction.reply({
            content: '❌ Session expired. Please run `/introduce` again.',
            flags: MessageFlags.Ephemeral
        });
    }

    const firstPart = tempData.rows[0];
    const skill1 = interaction.fields.getTextInputValue('skill_1');
    const skill2 = interaction.fields.getTextInputValue('skill_2');
    const skill3 = interaction.fields.getTextInputValue('skill_3');
    const project1 = interaction.fields.getTextInputValue('project_1') || null;
    const project2 = interaction.fields.getTextInputValue('project_2') || null;

    // Generate X URL from handle
    const xUrl = generateXUrl(firstPart.x_handle);

    // Create introduction message
    const introMessage = generateIntroductionMessage({
        name: firstPart.name,
        location: firstPart.location,
        age: firstPart.age,
        personalLine: firstPart.personal_line,
        xUrl,
        skills: [skill1, skill2, skill3],
        projects: [project1, project2].filter(p => p),
        discordUsername: interaction.user.username
    });

    // Post to forum channel
    const postTitle = `Introduction: ${firstPart.name}`;
    const forumTags = ['New Member'];

    const { thread, message, channel: introChannel, usedFallback, error } = await channelManager.postToForumChannel(
        'INTRO',
        interaction,
        postTitle,
        { content: introMessage },
        forumTags
    );

    if (!message) {
        return interaction.reply({
            content: `Unable to post introduction: ${error}`,
            flags: MessageFlags.Ephemeral
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
         SET username = ?, location = ?, age = ?, personal_line = ?, x_handle = ?, 
             skills = ?, projects = ?, thread_id = ?
         WHERE id = ?`,
        [firstPart.name, firstPart.location, firstPart.age, firstPart.personal_line, firstPart.x_handle,
         JSON.stringify([skill1, skill2, skill3]), JSON.stringify([project1, project2].filter(p => p)),
         thread?.id, interaction.user.id]
    );

    // Clean up temporary data
    await bot.db.query('DELETE FROM temp_intros WHERE user_id = ?', [interaction.user.id]);

    // Add Member role (only after successful introduction completion)
    const memberRole = interaction.guild.roles.cache.find(r => r.name === 'Member');
    if (memberRole && thread?.id) {
        // Verify introduction is complete by checking thread_id exists
        await interaction.member.roles.add(memberRole);
        bot.logger.info(`Member role granted to ${interaction.user.tag} after completing introduction`);
        
        // Set nickname to match introduction name
        if (bot.services?.onboarding) {
            await bot.services.onboarding.setMemberNickname(interaction.member, firstPart.name, interaction.user.username);
        }
    } else {
        bot.logger.warn(`Failed to grant member role to ${interaction.user.tag} - missing thread_id or member role`);
    }

    // Reply to user
    const successMessage = usedFallback 
        ? '✅ Welcome to ShipYard! Your introduction has been posted in this channel.'
        : `✅ Welcome to ShipYard! Your introduction has been posted in <#${introChannel.id}>${thread ? ' (in a new thread)' : ''}!`;
    
    await interaction.reply({
        content: successMessage,
        flags: MessageFlags.Ephemeral
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
    const { EmbedBuilder } = await import('discord.js');
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
            { name: '🙏 What would help', value: ask },
            { name: 'Status', value: '🔴 Open for Feedback', inline: true }
        )
        .setFooter({ text: `Clinic ID: ${tempClinicId}` })
        .setTimestamp();
    
    // Post to forum channel using ChannelManager (no button - feedback requests should remain open)
    const { thread, message, channel: clinicChannel, usedFallback, error } = await channelManager.postToForumChannel(
        'CLINIC',
        interaction,
        postTitle,
        { embeds: [embed] },
        forumTags
    );

    if (!message) {
        return interaction.reply({
            content: `Unable to post feedback request: ${error}`,
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Create clinic post in database with message_id and thread_id
    const result = await bot.db.query(
        `INSERT INTO clinics (author_id, goal, draft, questions, ask, status, message_id, thread_id)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
        [interaction.user.id, goal, draft, JSON.stringify(questions), ask, message.id, thread?.id]
    );
    
    const clinicId = result.lastID;
    
    // Update the embed with real clinic ID (no button needed)
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
            { name: '🙏 What would help', value: ask },
            { name: 'Status', value: '🔴 Open for Feedback', inline: true }
        )
        .setFooter({ text: `Clinic ID: ${clinicId}` })
        .setTimestamp();
    
    // Update the message with correct clinic ID (no components = no button)
    await message.edit({
        embeds: [updatedEmbed]
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
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Clean up pending data
    await bot.db.query(
        'DELETE FROM policies WHERE key = ?',
        [`report.pending.${interaction.user.id}`]
    );
}

async function processGoalsSubmission(interaction, bot, channelManager) {
    const professionalGoals = interaction.fields.getTextInputValue('professional_goals').trim();
    const personalGoals = interaction.fields.getTextInputValue('personal_goals').trim();
    
    // Parse goals from comma-separated strings
    const profGoals = professionalGoals ? professionalGoals.split(',').map(g => g.trim()).filter(g => g.length > 0) : [];
    const persGoals = personalGoals ? personalGoals.split(',').map(g => g.trim()).filter(g => g.length > 0) : [];
    
    const totalGoals = profGoals.length + persGoals.length;
    
    // Validate goal count (max 7 total)
    if (totalGoals === 0) {
        return interaction.reply({
            content: '❌ Please add at least one goal before submitting!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (totalGoals > 7) {
        return interaction.reply({
            content: `❌ Too many goals! You have ${totalGoals} goals but the maximum is 7. Please reduce your goals and try again.`,
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Get user's preferred name from database (from their introduction)
    let displayName = interaction.user.username; // fallback to Discord username
    try {
        const userResult = await bot.db.query(
            'SELECT username FROM users WHERE id = ?',
            [interaction.user.id]
        );
        if (userResult.rows && userResult.rows.length > 0 && userResult.rows[0].username) {
            displayName = userResult.rows[0].username;
        }
    } catch (error) {
        bot.logger.warn(`Could not fetch user's intro name for ${interaction.user.id}, using Discord username`);
    }
    
    // Get current week information
    const { default: moment } = await import('moment');
    const currentDate = moment();
    const weekNumber = currentDate.week();
    const year = currentDate.year();
    const formattedDate = currentDate.format('MMMM Do, YYYY');
    
    // Create goals message
    const goalsMessage = generateGoalsMessage({
        username: displayName,
        professionalGoals: profGoals,
        personalGoals: persGoals,
        totalCount: totalGoals,
        weekNumber: weekNumber,
        year: year,
        dateSet: formattedDate
    });
    
    // Post to forum channel
    const postTitle = `🎯 [Week ${weekNumber}] ${displayName}'s Weekly Goals`;
    const forumTags = ['Weekly Goals', `Week ${weekNumber}`, `${year}`];
    
    const { thread, message, channel: goalsChannel, usedFallback, error } = await channelManager.postToForumChannel(
        'WEEKLY_GOALS',
        interaction,
        postTitle,
        { content: goalsMessage },
        forumTags
    );
    
    if (!message) {
        return interaction.reply({
            content: `Unable to post weekly goals: ${error}`,
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Success message
    const successMessage = usedFallback 
        ? '✅ Your weekly goals have been posted in this channel!'
        : `✅ Your weekly goals have been posted in <#${goalsChannel.id}>!`;
    
    await interaction.reply({
        content: successMessage,
        ephemeral: true
    });
}

async function handleSpamAllow(interaction, bot, messageId) {
    try {
        // Check if user is moderator
        if (!bot.services?.moderation?.isModerator(interaction.member)) {
            return interaction.reply({
                content: '❌ Only moderators can use this action.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get pending moderation record
        const pending = await bot.db.query(
            'SELECT * FROM pending_moderations WHERE message_id = ?',
            [messageId]
        );

        if (pending.rows.length === 0) {
            return interaction.reply({
                content: '❌ Moderation record not found or already processed.',
                flags: MessageFlags.Ephemeral
            });
        }

        const record = pending.rows[0];
        
        // Get the original message
        const channel = await bot.client.channels.fetch(record.channel_id);
        let message;
        try {
            message = await channel.messages.fetch(messageId);
        } catch (error) {
            // Message was deleted, remove from pending
            await bot.db.query('DELETE FROM pending_moderations WHERE message_id = ?', [messageId]);
            return interaction.reply({
                content: '❌ Original message not found (may have been deleted).',
                flags: MessageFlags.Ephemeral
            });
        }

        // Remove from pending moderations
        await bot.db.query('DELETE FROM pending_moderations WHERE message_id = ?', [messageId]);

        // Update the embed to show approved status
        const approvedEmbed = interaction.message.embeds[0];
        const { EmbedBuilder } = await import('discord.js');
        const updatedEmbed = new EmbedBuilder()
            .setColor(0x00FF00) // Green
            .setTitle('✅ Message Approved')
            .setDescription(`**Reason:** ${record.reason}\n**Action:** Approved by ${interaction.user}`)
            .addFields(approvedEmbed.fields);

        await interaction.update({ embeds: [updatedEmbed], components: [] });

        // Notify the user their message was approved
        try {
            const user = await bot.client.users.fetch(record.user_id);
            await user.send(`✅ Your message in <#${record.channel_id}> has been approved by a moderator.`);
        } catch (error) {
            // User may have DMs disabled
            bot.logger.warn(`Could not DM user ${record.user_id} about message approval`);
        }

    } catch (error) {
        bot.logger.error('Error handling spam allow:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing the approval.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleSpamDelete(interaction, bot, messageId) {
    try {
        // Check if user is moderator
        if (!bot.services?.moderation?.isModerator(interaction.member)) {
            return interaction.reply({
                content: '❌ Only moderators can use this action.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get pending moderation record
        const pending = await bot.db.query(
            'SELECT * FROM pending_moderations WHERE message_id = ?',
            [messageId]
        );

        if (pending.rows.length === 0) {
            return interaction.reply({
                content: '❌ Moderation record not found or already processed.',
                flags: MessageFlags.Ephemeral
            });
        }

        const record = pending.rows[0];

        // Get and delete the original message
        const channel = await bot.client.channels.fetch(record.channel_id);
        try {
            const message = await channel.messages.fetch(messageId);
            await message.delete();
        } catch (error) {
            // Message might already be deleted
            bot.logger.warn(`Could not delete message ${messageId}: ${error.message}`);
        }

        // Remove from pending moderations
        await bot.db.query('DELETE FROM pending_moderations WHERE message_id = ?', [messageId]);

        // Log as warning (like the old system)
        if (bot.services?.moderation) {
            await bot.services.moderation.trackWarning(record.user_id, 'spam', record.reason);
        }

        // Update the embed to show deleted status
        const deletedEmbed = interaction.message.embeds[0];
        const { EmbedBuilder } = await import('discord.js');
        const updatedEmbed = new EmbedBuilder()
            .setColor(0xFF0000) // Red
            .setTitle('🗑️ Message Deleted')
            .setDescription(`**Reason:** ${record.reason}\n**Action:** Deleted by ${interaction.user}`)
            .addFields(deletedEmbed.fields);

        await interaction.update({ embeds: [updatedEmbed], components: [] });

        // Notify the user their message was deleted with explanation
        try {
            const user = await bot.client.users.fetch(record.user_id);
            await user.send(
                `❌ Your message in <#${record.channel_id}> was removed by a moderator.\n\n` +
                `**Reason:** ${record.reason}\n\n` +
                `Please review the community guidelines and be mindful of your message content.`
            );
        } catch (error) {
            // User may have DMs disabled, send channel notification
            try {
                const notification = await channel.send(
                    `⚠️ <@${record.user_id}>, your message was removed: **${record.reason}**\n` +
                    `Please review the community guidelines. This notification will be deleted in 30 seconds.`
                );
                setTimeout(() => notification.delete().catch(() => {}), 30000);
            } catch (channelError) {
                bot.logger.warn(`Could not notify user ${record.user_id} about message deletion`);
            }
        }

    } catch (error) {
        bot.logger.error('Error handling spam delete:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing the deletion.',
            flags: MessageFlags.Ephemeral
        });
    }
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
            flags: MessageFlags.Ephemeral
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

/**
 * Generate X/Twitter URL from handle
 * @param {string} handle - User's X handle (@username, username, or full URL)
 * @returns {string} Full X URL
 */
function generateXUrl(handle) {
    if (handle.startsWith('https://')) {
        return handle;
    }
    
    // Remove @ symbol if present
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;
    return `https://x.com/${cleanHandle}`;
}

/**
 * Generate formatted introduction message
 * @param {Object} data - User introduction data
 * @returns {string} Formatted introduction message
 */
function generateIntroductionMessage(data) {
    let message = `👋 Hello everyone!
I'm ${data.name} ${data.discordUsername ? `(Discord: @${data.discordUsername})` : ''}

🌍 From ${data.location}

🔗 You can find me on [X/Twitter](${data.xUrl})

👤 A bit about me:
I'm ${data.age} years old and ${data.personalLine}

💡 My most valuable skills are:
💻 ${data.skills[0]}
🎨 ${data.skills[1]}
📈 ${data.skills[2]}`;

    if (data.projects.length > 0) {
        message += `

🚀 Let me share with you some of my most recent projects:`;
        data.projects.forEach(project => {
            message += `
<${project}>`;
        });
    }

    return message;
}

/**
 * Generate formatted weekly goals message
 * @param {Object} data - User goals data
 * @returns {string} Formatted goals message
 */
function generateGoalsMessage(data) {
    let message = `🎯 **${data.username}'s Weekly Goals**\n\n`;
    
    // Add week and date information
    message += `📅 **Week ${data.weekNumber}, ${data.year}** | Set on ${data.dateSet}\n\n`;
    
    if (data.professionalGoals.length > 0) {
        message += `🏢 **Professional Goals:**\n`;
        data.professionalGoals.forEach((goal, index) => {
            message += `${index + 1}. ${goal}\n`;
        });
        message += '\n';
    }
    
    if (data.personalGoals.length > 0) {
        message += `🏠 **Personal Goals:**\n`;
        data.personalGoals.forEach((goal, index) => {
            message += `${index + 1}. ${goal}\n`;
        });
        message += '\n';
    }
    
    message += `📊 **Total Goals:** ${data.totalCount}/7\n\n`;
    message += `💪 Let's make this week count! Good luck ${data.username}! 🚀`;
    
    return message;
}