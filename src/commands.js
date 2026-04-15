const { SlashCommandBuilder, ChannelType } = require('discord.js');
const config = require('./config');

function buildCommands() {
    return [
        new SlashCommandBuilder().setName('start-queue').setDescription('Launch a stage in this channel (Staff Only)'),
        new SlashCommandBuilder().setName('stop-queue').setDescription('Shutdown this stage (Staff Only)'),
        new SlashCommandBuilder().setName('next').setDescription('Move to the next performer (Staff Only)'),
        new SlashCommandBuilder().setName('radio').setDescription('Toggle the background track (Staff Only)'),
        new SlashCommandBuilder().setName('events').setDescription('Post links for live and upcoming server events'),
        new SlashCommandBuilder()
            .setName('server-stats')
            .setDescription('Show and manage server stats channels')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('user')
                    .setDescription('Show activity stats for a member')
                    .addUserOption(option => option.setName('member').setDescription('Member to inspect'))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('show')
                    .setDescription('Show the current server stats summary')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('channel')
                    .setDescription('Assign a stat metric to an auto-updating channel')
                    .addStringOption(option => option.setName('metric').setDescription('Metric to show').setRequired(true).addChoices(
                        { name: 'members', value: 'members' },
                        { name: 'humans', value: 'humans' },
                        { name: 'bots', value: 'bots' },
                        { name: 'channels', value: 'channels' },
                        { name: 'text channels', value: 'text_channels' },
                        { name: 'voice channels', value: 'voice_channels' },
                        { name: 'roles', value: 'roles' },
                        { name: 'in voice', value: 'in_voice' }
                    ))
                    .addChannelOption(option => option.setName('channel').setDescription('Voice or stage channel to rename').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remove')
                    .setDescription('Remove a configured stats channel metric')
                    .addStringOption(option => option.setName('metric').setDescription('Metric to remove').setRequired(true).addChoices(
                        { name: 'members', value: 'members' },
                        { name: 'humans', value: 'humans' },
                        { name: 'bots', value: 'bots' },
                        { name: 'channels', value: 'channels' },
                        { name: 'text channels', value: 'text_channels' },
                        { name: 'voice channels', value: 'voice_channels' },
                        { name: 'roles', value: 'roles' },
                        { name: 'in voice', value: 'in_voice' }
                    ))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('refresh')
                    .setDescription('Refresh all configured stats channels now')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List configured stats channel bindings')
            ),
        new SlashCommandBuilder()
            .setName('allow-invites')
            .setDescription('Allow a user or bot to post Discord invite links (Staff Only)')
            .addUserOption(option => option.setName('target').setDescription('User or bot to allow').setRequired(true)),
        new SlashCommandBuilder()
            .setName('revoke-invites')
            .setDescription('Remove invite link permission from a user or bot (Staff Only)')
            .addUserOption(option => option.setName('target').setDescription('User or bot to remove').setRequired(true)),
        new SlashCommandBuilder()
            .setName('purge-invites')
            .setDescription('Delete unauthorized invite links across text channels (Staff Only)')
            .addIntegerOption(option => option.setName('messages_per_channel').setDescription('Messages to scan per channel').setMinValue(1).setMaxValue(config.MAX_PURGE_SCAN_LIMIT)),
    ].map(command => command.toJSON());
}

module.exports = { buildCommands };