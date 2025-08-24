// src/commands/admin/check-permissions.js
import { SlashCommandBuilder } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';
import { PermissionDiagnostic } from '../../utils/PermissionDiagnostic.js';

export default class CheckPermissionsCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('check-permissions')
            .setDescription('Run permission diagnostics for bot channels and operations (Founder only)')
            .addBooleanOption(option =>
                option
                    .setName('detailed')
                    .setDescription('Show detailed permission breakdown for each channel')
                    .setRequired(false));
        
        this.diagnostic = new PermissionDiagnostic(bot);
    }

    async execute(interaction) {
        if (!this.isFounder(interaction.member)) {
            return this.sendError(interaction, 'Only founders can run permission diagnostics');
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const detailed = interaction.options.getBoolean('detailed') ?? false;
            
            // Run diagnostics
            const results = await this.diagnostic.runDiagnostics(interaction.guild);
            
            // Format results
            let output = this.diagnostic.formatResults(results);
            
            // Add detailed breakdown if requested
            if (detailed && results.channels) {
                output += '\n\n## Detailed Channel Breakdown:\n';
                for (const [channelName, channelData] of Object.entries(results.channels)) {
                    if (!channelData.exists) continue;
                    
                    output += `\n### ${channelName} (${channelData.name})\n`;
                    output += `Type: ${this.getChannelTypeName(channelData.type)}\n`;
                    output += `Accessible: ${channelData.accessible ? '✅' : '❌'}\n`;
                    
                    if (channelData.permissions) {
                        output += `Basic Permissions: ${channelData.permissions.basic.hasAll ? '✅' : '❌'}\n`;
                        if (!channelData.permissions.basic.hasAll) {
                            output += `  Missing: ${channelData.permissions.basic.missing.join(', ')}\n`;
                        }
                        
                        if (channelData.type === 15) { // Forum channel
                            output += `Forum Permissions: ${channelData.permissions.forum.hasAll ? '✅' : '❌'}\n`;
                            if (!channelData.permissions.forum.hasAll) {
                                output += `  Missing: ${channelData.permissions.forum.missing.join(', ')}\n`;
                            }
                        }
                        
                        output += `Admin Permissions: ${channelData.permissions.admin.hasAll ? '✅' : '❌'}\n`;
                        if (!channelData.permissions.admin.hasAll) {
                            output += `  Missing: ${channelData.permissions.admin.missing.join(', ')}\n`;
                        }
                    }
                }
            }

            // Split response if too long
            const maxLength = 4000; // Discord embed limit with some buffer
            if (output.length > maxLength) {
                const parts = this.splitMessage(output, maxLength);
                await interaction.editReply({ content: parts[0] });
                
                for (let i = 1; i < parts.length; i++) {
                    await interaction.followUp({ content: parts[i], ephemeral: true });
                }
            } else {
                await interaction.editReply({ content: output });
            }

            // Log critical issues
            if (results.issues.length > 0) {
                this.logger.warn('Permission diagnostic found issues:', results.issues);
            } else {
                this.logger.info('Permission diagnostic completed successfully - no issues found');
            }

        } catch (error) {
            this.logger.error('Permission diagnostic failed:', error);
            await interaction.editReply({ 
                content: `❌ **Diagnostic failed:** ${error.message}` 
            });
        }
    }

    /**
     * Get human-readable channel type name
     */
    getChannelTypeName(type) {
        const typeNames = {
            0: 'Text Channel',
            2: 'Voice Channel',
            4: 'Category',
            5: 'Announcement Channel',
            10: 'Announcement Thread',
            11: 'Public Thread',
            12: 'Private Thread',
            13: 'Stage Channel',
            15: 'Forum Channel'
        };
        return typeNames[type] || `Unknown (${type})`;
    }

    /**
     * Split message into chunks that fit Discord's limits
     */
    splitMessage(text, maxLength) {
        const parts = [];
        let currentPart = '';
        
        const lines = text.split('\n');
        for (const line of lines) {
            if (currentPart.length + line.length + 1 > maxLength) {
                if (currentPart) {
                    parts.push(currentPart.trim());
                    currentPart = '';
                }
                
                // If single line is too long, truncate it
                if (line.length > maxLength) {
                    parts.push(line.substring(0, maxLength - 3) + '...');
                } else {
                    currentPart = line + '\n';
                }
            } else {
                currentPart += line + '\n';
            }
        }
        
        if (currentPart.trim()) {
            parts.push(currentPart.trim());
        }
        
        return parts;
    }
}