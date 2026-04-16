const { SlashCommandBuilder } = require('discord.js');
const config = require('./config');

function buildCommands() {
    return [
        new SlashCommandBuilder().setName('start-queue').setDescription('Launch a stage in this channel (Staff Only)'),
        new SlashCommandBuilder().setName('stop-queue').setDescription('Shutdown this stage (Staff Only)'),
        new SlashCommandBuilder().setName('next').setDescription('Move to the next performer (Staff Only)'),
        new SlashCommandBuilder().setName('radio').setDescription('Toggle the background track (Staff Only)'),
        new SlashCommandBuilder().setName('events').setDescription('Post links for live and upcoming server events'),
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