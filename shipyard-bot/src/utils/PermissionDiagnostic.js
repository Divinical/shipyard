// src/utils/PermissionDiagnostic.js
import { PermissionsBitField, ChannelType } from 'discord.js';

export class PermissionDiagnostic {
    constructor(bot) {
        this.bot = bot;
        this.requiredPermissions = {
            // Basic bot permissions
            basic: [
                PermissionsBitField.Flags.ViewChannels,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.UseExternalEmojis,
                PermissionsBitField.Flags.AddReactions
            ],
            // Forum channel specific permissions
            forum: [
                PermissionsBitField.Flags.CreatePublicThreads,
                PermissionsBitField.Flags.SendMessagesInThreads,
                PermissionsBitField.Flags.ManageThreads
            ],
            // Admin operations (reset-intro command)
            admin: [
                PermissionsBitField.Flags.ManageThreads
            ]
        };
    }

    /**
     * Run comprehensive permission diagnostics
     * @param {Object} guild - Discord guild object
     * @returns {Object} Diagnostic results
     */
    async runDiagnostics(guild) {
        const results = {
            guild: guild.name,
            botMember: null,
            channels: {},
            permissions: {
                basic: { hasAll: false, missing: [], details: {} },
                forum: { hasAll: false, missing: [], details: {} },
                admin: { hasAll: false, missing: [], details: {} }
            },
            issues: [],
            recommendations: []
        };

        try {
            // Get bot member in guild
            results.botMember = await guild.members.fetch(this.bot.user.id);
            
            // Check each configured channel
            const channelTypes = {
                INTRO: process.env.INTRO_CHANNEL_ID,
                CLINIC: process.env.CLINIC_CHANNEL_ID,
                HELP: process.env.HELP_CHANNEL_ID,
                MOD_ROOM: process.env.MOD_ROOM_CHANNEL_ID,
                ANNOUNCEMENTS: process.env.ANNOUNCEMENTS_CHANNEL_ID,
                BUILD_LOG: process.env.BUILD_LOG_CHANNEL_ID,
                SHOWCASE: process.env.SHOWCASE_CHANNEL_ID,
                DOCK_CHECK: process.env.DOCK_CHECK_CHANNEL_ID,
                JOBS_COLLABS: process.env.JOBS_COLLABS_CHANNEL_ID,
                WEEKLY_GOALS: process.env.WEEKLY_GOALS_CHANNEL_ID
            };

            for (const [channelName, channelId] of Object.entries(channelTypes)) {
                if (channelId) {
                    results.channels[channelName] = await this.checkChannelPermissions(
                        guild, 
                        channelId, 
                        channelName,
                        results.botMember
                    );
                } else {
                    results.channels[channelName] = {
                        exists: false,
                        error: 'Channel ID not configured in environment'
                    };
                }
            }

            // Check guild-level permissions
            this.checkGuildPermissions(results, results.botMember);

            // Generate issues and recommendations
            this.generateRecommendations(results);

            return results;

        } catch (error) {
            results.error = error.message;
            this.bot.logger.error('Permission diagnostic failed:', error);
            return results;
        }
    }

    /**
     * Check permissions for a specific channel
     */
    async checkChannelPermissions(guild, channelId, channelName, botMember) {
        const result = {
            exists: false,
            accessible: false,
            type: null,
            permissions: {
                basic: { hasAll: false, missing: [] },
                forum: { hasAll: false, missing: [] },
                admin: { hasAll: false, missing: [] }
            },
            issues: []
        };

        try {
            const channel = guild.channels.cache.get(channelId);
            if (!channel) {
                result.error = `Channel ${channelId} not found`;
                return result;
            }

            result.exists = true;
            result.type = channel.type;
            result.name = channel.name;

            // Check if bot can access the channel
            const permissions = channel.permissionsFor(botMember);
            if (!permissions) {
                result.error = 'Cannot determine permissions for channel';
                return result;
            }

            result.accessible = permissions.has(PermissionsBitField.Flags.ViewChannels);

            // Check basic permissions
            const basicMissing = [];
            for (const permission of this.requiredPermissions.basic) {
                if (!permissions.has(permission)) {
                    basicMissing.push(this.getPermissionName(permission));
                }
            }
            result.permissions.basic = {
                hasAll: basicMissing.length === 0,
                missing: basicMissing
            };

            // Check forum permissions (for forum channels)
            if (channel.type === ChannelType.GuildForum) {
                const forumMissing = [];
                for (const permission of this.requiredPermissions.forum) {
                    if (!permissions.has(permission)) {
                        forumMissing.push(this.getPermissionName(permission));
                    }
                }
                result.permissions.forum = {
                    hasAll: forumMissing.length === 0,
                    missing: forumMissing
                };

                // Forum-specific issues
                if (forumMissing.length > 0) {
                    result.issues.push(`Missing forum permissions: ${forumMissing.join(', ')}`);
                }
            }

            // Check admin permissions
            const adminMissing = [];
            for (const permission of this.requiredPermissions.admin) {
                if (!permissions.has(permission)) {
                    adminMissing.push(this.getPermissionName(permission));
                }
            }
            result.permissions.admin = {
                hasAll: adminMissing.length === 0,
                missing: adminMissing
            };

            return result;

        } catch (error) {
            result.error = error.message;
            return result;
        }
    }

    /**
     * Check guild-level permissions
     */
    checkGuildPermissions(results, botMember) {
        const guildPermissions = botMember.permissions;

        // Check basic permissions
        const basicMissing = [];
        for (const permission of this.requiredPermissions.basic) {
            if (!guildPermissions.has(permission)) {
                basicMissing.push(this.getPermissionName(permission));
            }
        }
        results.permissions.basic = {
            hasAll: basicMissing.length === 0,
            missing: basicMissing,
            details: { scope: 'guild' }
        };

        // Check forum permissions
        const forumMissing = [];
        for (const permission of this.requiredPermissions.forum) {
            if (!guildPermissions.has(permission)) {
                forumMissing.push(this.getPermissionName(permission));
            }
        }
        results.permissions.forum = {
            hasAll: forumMissing.length === 0,
            missing: forumMissing,
            details: { scope: 'guild' }
        };

        // Check admin permissions
        const adminMissing = [];
        for (const permission of this.requiredPermissions.admin) {
            if (!guildPermissions.has(permission)) {
                adminMissing.push(this.getPermissionName(permission));
            }
        }
        results.permissions.admin = {
            hasAll: adminMissing.length === 0,
            missing: adminMissing,
            details: { scope: 'guild' }
        };
    }

    /**
     * Generate issues and recommendations based on results
     */
    generateRecommendations(results) {
        // Guild-level permission issues
        if (!results.permissions.basic.hasAll) {
            results.issues.push(`Missing basic guild permissions: ${results.permissions.basic.missing.join(', ')}`);
            results.recommendations.push('Grant basic bot permissions in Server Settings → Roles → [Bot Role]');
        }

        if (!results.permissions.forum.hasAll) {
            results.issues.push(`Missing forum guild permissions: ${results.permissions.forum.missing.join(', ')}`);
            results.recommendations.push('Grant forum permissions: Create Public Threads, Manage Threads, Send Messages in Threads');
        }

        // Channel-specific issues
        const criticalChannels = ['INTRO', 'CLINIC'];
        for (const channelName of criticalChannels) {
            const channelResult = results.channels[channelName];
            if (!channelResult?.exists) {
                results.issues.push(`${channelName} channel not found or not configured`);
                results.recommendations.push(`Configure ${channelName}_CHANNEL_ID in environment variables`);
            } else if (!channelResult.accessible) {
                results.issues.push(`Bot cannot access ${channelName} channel`);
                results.recommendations.push(`Grant bot View Channels permission in ${channelName} channel`);
            } else if (channelResult.type === ChannelType.GuildForum && !channelResult.permissions.forum.hasAll) {
                results.issues.push(`${channelName} forum channel missing permissions: ${channelResult.permissions.forum.missing.join(', ')}`);
                results.recommendations.push(`Grant forum permissions to bot in ${channelName} channel settings`);
            }
        }

        // Role hierarchy check
        results.recommendations.push('Ensure bot role is positioned above any roles that might restrict permissions');
        results.recommendations.push('Test forum post creation manually: Right-click INTRO channel → Create Post');
    }

    /**
     * Get human-readable permission name
     */
    getPermissionName(permission) {
        const permissionNames = {
            [PermissionsBitField.Flags.ViewChannels]: 'View Channels',
            [PermissionsBitField.Flags.SendMessages]: 'Send Messages',
            [PermissionsBitField.Flags.ReadMessageHistory]: 'Read Message History',
            [PermissionsBitField.Flags.UseExternalEmojis]: 'Use External Emojis',
            [PermissionsBitField.Flags.AddReactions]: 'Add Reactions',
            [PermissionsBitField.Flags.CreatePublicThreads]: 'Create Public Threads',
            [PermissionsBitField.Flags.SendMessagesInThreads]: 'Send Messages in Threads',
            [PermissionsBitField.Flags.ManageThreads]: 'Manage Threads'
        };
        return permissionNames[permission] || `Unknown (${permission})`;
    }

    /**
     * Format diagnostic results for display
     */
    formatResults(results) {
        const lines = [];
        lines.push(`# Permission Diagnostic Results for ${results.guild}`);
        lines.push('');

        if (results.error) {
            lines.push(`❌ **Error:** ${results.error}`);
            return lines.join('\n');
        }

        // Summary
        const issueCount = results.issues.length;
        if (issueCount === 0) {
            lines.push('✅ **No permission issues detected!**');
        } else {
            lines.push(`⚠️ **Found ${issueCount} permission issue${issueCount > 1 ? 's' : ''}**`);
        }
        lines.push('');

        // Issues
        if (results.issues.length > 0) {
            lines.push('## Issues Found:');
            for (const issue of results.issues) {
                lines.push(`❌ ${issue}`);
            }
            lines.push('');
        }

        // Channel Status
        lines.push('## Channel Status:');
        for (const [channelName, channelData] of Object.entries(results.channels)) {
            const status = channelData.exists && channelData.accessible ? '✅' : '❌';
            const type = channelData.type === ChannelType.GuildForum ? ' (Forum)' : '';
            lines.push(`${status} **${channelName}**${type}: ${channelData.exists ? channelData.name || 'Found' : 'Not found'}`);
            
            if (channelData.issues?.length > 0) {
                for (const issue of channelData.issues) {
                    lines.push(`   ⚠️ ${issue}`);
                }
            }
        }
        lines.push('');

        // Recommendations
        if (results.recommendations.length > 0) {
            lines.push('## Recommendations:');
            for (let i = 0; i < results.recommendations.length; i++) {
                lines.push(`${i + 1}. ${results.recommendations[i]}`);
            }
        }

        return lines.join('\n');
    }
}