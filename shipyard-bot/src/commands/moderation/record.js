// src/commands/moderation/record.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BaseCommand } from '../BaseCommand.js';
import { v4 as uuidv4 } from 'uuid';

export default class RecordCommand extends BaseCommand {
    constructor(bot) {
        super(bot);
        this.data = new SlashCommandBuilder()
            .setName('record')
            .setDescription('Manage recording consent')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('start')
                    .setDescription('Start recording consent collection')
                    .addChannelOption(option =>
                        option
                            .setName('channel')
                            .setDescription('Voice channel to record')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('stop')
                    .setDescription('Stop recording and export consent log')
                    .addStringOption(option =>
                        option
                            .setName('session')
                            .setDescription('Session ID')
                            .setRequired(true)));
    }

    async execute(interaction) {
        if (!this.isModerator(interaction.member)) {
            return this.sendError(interaction, 'Only moderators can manage recordings');
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'start') {
            await this.startRecording(interaction);
        } else if (subcommand === 'stop') {
            await this.stopRecording(interaction);
        }
    }

    async startRecording(interaction) {
        const channel = interaction.options.getChannel('channel');
        
        if (channel.type !== 2) { // Not a voice channel
            return this.sendError(interaction, 'Please select a voice channel');
        }

        const sessionId = uuidv4();

        // Create consent message
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🎙️ Recording Consent Required')
            .setDescription(
                `This session will be recorded for documentation purposes.\n\n` +
                `By clicking "I Consent", you agree to:\n` +
                `• Have your voice recorded during this session\n` +
                `• Allow the recording to be stored for community purposes\n` +
                `• Understand you can leave the channel if you don't consent\n\n` +
                `Session ID: \`${sessionId}\``
            )
            .setFooter({ text: 'Your consent will be logged' })
            .setTimestamp();

        const consentButton = new ButtonBuilder()
            .setCustomId(`consent_yes_${sessionId}`)
            .setLabel('I Consent')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const declineButton = new ButtonBuilder()
            .setCustomId(`consent_no_${sessionId}`)
            .setLabel('I Do Not Consent')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌');

        const row = new ActionRowBuilder().addComponents(consentButton, declineButton);

        // Store session info
        await this.db.query(
            `INSERT INTO policies (key, value) 
             VALUES (?, ?)`,
            [`recording.${sessionId}`, JSON.stringify({
                channel: channel.id,
                startedBy: interaction.user.id,
                startedAt: new Date()
            })]
        );

        await interaction.reply({
            content: `Recording consent request posted for ${channel}`,
            ephemeral: true
        });

        // Post consent request in text channel
        const textChannel = interaction.guild.channels.cache.get(process.env.ANNOUNCEMENTS_CHANNEL_ID);
        if (textChannel) {
            await textChannel.send({
                content: `@everyone - Recording consent needed for ${channel}`,
                embeds: [embed],
                components: [row]
            });
        }

        await this.sendSuccess(
            interaction,
            `Recording session started\nSession ID: \`${sessionId}\`\nUse this ID to stop recording later`
        );
    }

    async stopRecording(interaction) {
        const sessionId = interaction.options.getString('session');

        // Get session info
        const session = await this.db.query(
            'SELECT value FROM policies WHERE key = ?',
            [`recording.${sessionId}`]
        );

        if (session.rows.length === 0) {
            return this.sendError(interaction, 'Session not found');
        }

        // Get consents
        const consents = await this.db.query(
            'SELECT user_id, consent, timestamp FROM consents WHERE session_id = ?',
            [sessionId]
        );

        // Create consent log
        const consentLog = {
            sessionId,
            ...session.rows[0].value,
            endedAt: new Date(),
            consents: consents.rows
        };

        // Generate report
        const consented = consents.rows.filter(c => c.consent).length;
        const declined = consents.rows.filter(c => !c.consent).length;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('📊 Recording Session Complete')
            .setDescription(`Session \`${sessionId}\` has ended`)
            .addFields(
                { name: 'Duration', value: this.calculateDuration(session.rows[0].value.startedAt), inline: true },
                { name: 'Consented', value: consented.toString(), inline: true },
                { name: 'Declined', value: declined.toString(), inline: true }
            )
            .setTimestamp();

        // Add consent list
        if (consents.rows.length > 0) {
            const consentList = consents.rows
                .map(c => `${c.consent ? '✅' : '❌'} <@${c.user_id}>`)
                .join('\n');
            embed.addFields({ name: 'Participants', value: consentList.substring(0, 1024) });
        }

        // Clean up session
        await this.db.query(
            'DELETE FROM policies WHERE key = ?',
            [`recording.${sessionId}`]
        );

        await interaction.reply({ embeds: [embed], ephemeral: true });

        // Log to mod room
        const modChannel = interaction.guild.channels.cache.get(process.env.MOD_ROOM_CHANNEL_ID);
        if (modChannel) {
            await modChannel.send({
                content: `Recording session \`${sessionId}\` completed`,
                embeds: [embed]
            });
        }
    }

    calculateDuration(startTime) {
        const start = new Date(startTime);
        const duration = Date.now() - start.getTime();
        const hours = Math.floor(duration / 3600000);
        const minutes = Math.floor((duration % 3600000) / 60000);
        return `${hours}h ${minutes}m`;
    }
}