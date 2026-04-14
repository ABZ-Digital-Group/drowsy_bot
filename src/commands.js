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
        new SlashCommandBuilder()
            .setName('reaction-role')
            .setDescription('Manage reaction roles')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('post')
                    .setDescription('Post a reaction-role embed')
                    .addChannelOption(option => option.setName('channel').setDescription('Channel to post in').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
                    .addStringOption(option => option.setName('title').setDescription('Embed title').setRequired(true))
                    .addStringOption(option => option.setName('description').setDescription('Embed description').setRequired(true))
                    .addBooleanOption(option => option.setName('unique').setDescription('Only one role from this message at a time'))
                    .addBooleanOption(option => option.setName('verify').setDescription('Keep roles when reactions are removed'))
                    .addBooleanOption(option => option.setName('reversed').setDescription('Invert add/remove behavior'))
                    .addBooleanOption(option => option.setName('binding').setDescription('Remove reactions if bound roles disappear'))
                    .addIntegerOption(option => option.setName('temporary_minutes').setDescription('Remove assigned roles after this many minutes').setMinValue(1))
                    .addIntegerOption(option => option.setName('self_destruct_minutes').setDescription('Delete the message after this many minutes').setMinValue(1))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('map')
                    .setDescription('Add a role mapping to a reaction-role message')
                    .addChannelOption(option => option.setName('channel').setDescription('Channel containing the message').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
                    .addStringOption(option => option.setName('message_id').setDescription('Reaction-role message ID').setRequired(true))
                    .addStringOption(option => option.setName('emoji').setDescription('Emoji to map').setRequired(true))
                    .addRoleOption(option => option.setName('role').setDescription('Role to assign').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('unmap')
                    .setDescription('Remove a role mapping from a reaction-role message')
                    .addChannelOption(option => option.setName('channel').setDescription('Channel containing the message').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
                    .addStringOption(option => option.setName('message_id').setDescription('Reaction-role message ID').setRequired(true))
                    .addStringOption(option => option.setName('emoji').setDescription('Emoji to unmap').setRequired(true))
                    .addRoleOption(option => option.setName('role').setDescription('Role to remove').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('access')
                    .setDescription('Manage whitelist and blacklist rules')
                    .addChannelOption(option => option.setName('channel').setDescription('Channel containing the message').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
                    .addStringOption(option => option.setName('message_id').setDescription('Reaction-role message ID').setRequired(true))
                    .addStringOption(option => option.setName('list').setDescription('Access list to edit').setRequired(true).addChoices(
                        { name: 'whitelist', value: 'whitelist' },
                        { name: 'blacklist', value: 'blacklist' }
                    ))
                    .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
                        { name: 'add', value: 'add' },
                        { name: 'remove', value: 'remove' }
                    ))
                    .addRoleOption(option => option.setName('role').setDescription('Role to add or remove').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('Show the stored config for a reaction-role message')
                    .addChannelOption(option => option.setName('channel').setDescription('Channel containing the message').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
                    .addStringOption(option => option.setName('message_id').setDescription('Reaction-role message ID').setRequired(true))
            ),
        new SlashCommandBuilder()
            .setName('logging')
            .setDescription('Configure logs and ignores')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('channel')
                    .setDescription('Assign a log channel')
                    .addStringOption(option => option.setName('category').setDescription('Category to route').setRequired(true).addChoices(
                        { name: 'message', value: 'messageChannelId' },
                        { name: 'invite', value: 'inviteChannelId' },
                        { name: 'member', value: 'memberChannelId' },
                        { name: 'server', value: 'serverChannelId' },
                        { name: 'mod', value: 'modChannelId' },
                        { name: 'drama', value: 'dramaChannelId' },
                        { name: 'highlight', value: 'highlightChannelId' }
                    ))
                    .addChannelOption(option => option.setName('channel').setDescription('Target text channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ignore-channel')
                    .setDescription('Add or remove a channel from the logging ignore list')
                    .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
                        { name: 'add', value: 'add' },
                        { name: 'remove', value: 'remove' }
                    ))
                    .addChannelOption(option => option.setName('channel').setDescription('Channel to ignore').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ignore-member')
                    .setDescription('Add or remove a member from the logging ignore list')
                    .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
                        { name: 'add', value: 'add' },
                        { name: 'remove', value: 'remove' }
                    ))
                    .addUserOption(option => option.setName('member').setDescription('Member to ignore').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ignore-prefix')
                    .setDescription('Add or remove a message prefix from the logging ignore list')
                    .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
                        { name: 'add', value: 'add' },
                        { name: 'remove', value: 'remove' }
                    ))
                    .addStringOption(option => option.setName('prefix').setDescription('Prefix to ignore').setRequired(true))
            )
            .addSubcommand(subcommand => subcommand.setName('status').setDescription('Show the current logging config')),
        new SlashCommandBuilder()
            .setName('moderation')
            .setDescription('Moderation and modlog tools')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('warn')
                    .setDescription('Warn a member')
                    .addUserOption(option => option.setName('member').setDescription('Member to warn').setRequired(true))
                    .addStringOption(option => option.setName('reason').setDescription('Reason').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('timeout')
                    .setDescription('Timeout a member')
                    .addUserOption(option => option.setName('member').setDescription('Member to timeout').setRequired(true))
                    .addIntegerOption(option => option.setName('minutes').setDescription('Length in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
                    .addStringOption(option => option.setName('reason').setDescription('Reason').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('untimeout')
                    .setDescription('Remove a member timeout')
                    .addUserOption(option => option.setName('member').setDescription('Member to untimeout').setRequired(true))
                    .addStringOption(option => option.setName('reason').setDescription('Reason'))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('kick')
                    .setDescription('Kick a member')
                    .addUserOption(option => option.setName('member').setDescription('Member to kick').setRequired(true))
                    .addStringOption(option => option.setName('reason').setDescription('Reason').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ban')
                    .setDescription('Ban a member')
                    .addUserOption(option => option.setName('member').setDescription('Member to ban').setRequired(true))
                    .addIntegerOption(option => option.setName('delete_days').setDescription('Delete message history in days').setMinValue(0).setMaxValue(7))
                    .addStringOption(option => option.setName('reason').setDescription('Reason').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('unban')
                    .setDescription('Unban a user by ID')
                    .addStringOption(option => option.setName('user_id').setDescription('User ID to unban').setRequired(true))
                    .addStringOption(option => option.setName('reason').setDescription('Reason'))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('purge')
                    .setDescription('Bulk-delete recent messages')
                    .addIntegerOption(option => option.setName('amount').setDescription('Messages to delete').setRequired(true).setMinValue(1).setMaxValue(100))
                    .addUserOption(option => option.setName('member').setDescription('Only purge messages from this member'))
                    .addStringOption(option => option.setName('reason').setDescription('Reason'))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('history')
                    .setDescription('Show recorded infractions for a member')
                    .addUserOption(option => option.setName('member').setDescription('Member to inspect').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('bulk-role')
                    .setDescription('Add or remove a role from everyone with another role')
                    .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
                        { name: 'add', value: 'add' },
                        { name: 'remove', value: 'remove' }
                    ))
                    .addRoleOption(option => option.setName('target_role').setDescription('Role to add or remove').setRequired(true))
                    .addRoleOption(option => option.setName('source_role').setDescription('Only members with this role are affected').setRequired(true))
                    .addStringOption(option => option.setName('reason').setDescription('Reason'))
            ),
        new SlashCommandBuilder()
            .setName('moderation-config')
            .setDescription('Configure moderation helpers')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('muted-role')
                    .setDescription('Set the muted role used by sticky roles')
                    .addRoleOption(option => option.setName('role').setDescription('Muted role').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('sticky-role')
                    .setDescription('Add or remove a sticky role')
                    .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
                        { name: 'add', value: 'add' },
                        { name: 'remove', value: 'remove' }
                    ))
                    .addRoleOption(option => option.setName('role').setDescription('Role to update').setRequired(true))
            )
            .addSubcommand(subcommand => subcommand.setName('show').setDescription('Show the moderation helper config')),
    ].map(command => command.toJSON());
}

module.exports = { buildCommands };