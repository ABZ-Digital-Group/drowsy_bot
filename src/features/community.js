const {
    ChannelType,
    GuildScheduledEventStatus,
    MessageFlags,
} = require('discord.js');

function createCommunityFeature({ client, config, state, helpers, stageFeature }) {
    async function fetchActiveEventLinks(guild) {
        const scheduledEvents = await guild.scheduledEvents.fetch();
        return [...scheduledEvents.values()]
            .filter(event => event.status === GuildScheduledEventStatus.Scheduled || event.status === GuildScheduledEventStatus.Active)
            .sort((left, right) => {
                const leftStart = left.scheduledStartTimestamp ?? Number.MAX_SAFE_INTEGER;
                const rightStart = right.scheduledStartTimestamp ?? Number.MAX_SAFE_INTEGER;
                return leftStart - rightStart;
            })
            .map(event => `https://discord.com/events/${guild.id}/${event.id}`);
    }

    async function sendActiveEvents(target, guild) {
        const eventLinks = await fetchActiveEventLinks(guild);
        const payload = eventLinks.length > 0
            ? eventLinks.join('\n')
            : 'There are no live or upcoming server events right now.';
        return target.reply(payload);
    }

    async function purgeInviteLinksInChannel(channel, guild, scanLimit) {
        let lastMessageId;
        let scannedMessages = 0;
        let deletedMessages = 0;

        while (scannedMessages < scanLimit) {
            const batchSize = Math.min(100, scanLimit - scannedMessages);
            const messages = await channel.messages.fetch({ limit: batchSize, before: lastMessageId });
            if (messages.size === 0) break;

            for (const message of messages.values()) {
                if (message.author.bot) continue;
                if (!helpers.containsInviteLink(message.content)) continue;
                if (helpers.canPostInviteLinkInGuild(guild, message.author.id)) continue;

                try {
                    await message.delete();
                    deletedMessages += 1;
                } catch (error) {
                    console.error(`Failed to delete invite link in #${channel.name}:`, error);
                }
            }

            scannedMessages += messages.size;
            lastMessageId = messages.last()?.id;
            if (!lastMessageId) break;
        }

        return { scannedMessages, deletedMessages };
    }

    async function purgeInviteLinksInGuild(guild, scanLimit) {
        const botMember = guild.members.me ?? await guild.members.fetchMe();
        const channels = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement);

        let scannedChannels = 0;
        let skippedChannels = 0;
        let scannedMessages = 0;
        let deletedMessages = 0;

        for (const channel of channels.values()) {
            const permissions = channel.permissionsFor(botMember);
            if (!permissions?.has(['ViewChannel', 'ReadMessageHistory', 'ManageMessages'])) {
                skippedChannels += 1;
                continue;
            }

            scannedChannels += 1;
            const result = await purgeInviteLinksInChannel(channel, guild, scanLimit);
            scannedMessages += result.scannedMessages;
            deletedMessages += result.deletedMessages;
        }

        return { scannedChannels, skippedChannels, scannedMessages, deletedMessages };
    }

    async function restoreScheduledTasks() {}

    async function handleMessageCreate(message) {
        if (message.author.bot) return;

        if (message.guild && message.content.trim().toLowerCase() === '-events') {
            try {
                await sendActiveEvents(message, message.guild);
            } catch (error) {
                console.error('Event lookup failed:', error);
                await message.reply('I could not fetch the server events right now.');
            }
            return;
        }

        if (message.channel.type === ChannelType.DM && message.content.startsWith('!allowinvite ')) {
            if (!config.ALLOW_INVITE_PASSWORD) {
                await message.reply('Invite password is not configured right now.');
                return;
            }

            const input = message.content.slice('!allowinvite '.length).trim();
            if (input === config.ALLOW_INVITE_PASSWORD) {
                state.allowedInviteUsers.add(message.author.id);
                state.saveAllowedInviteUsers();
                await message.reply('You are now allowed to send Discord invite links in the server.');
            } else {
                await message.reply('Incorrect password.');
            }
            return;
        }

        if (!message.guild) return;
        if (!helpers.containsInviteLink(message.content)) return;
        if (helpers.canPostInviteLinkInGuild(message.guild, message.author.id)) return;

        try {
            await message.delete();
            const warning = await message.channel.send('Invite links are not allowed here.');
            setTimeout(() => warning.delete().catch(() => {}), 5000);
        } catch (error) {
            console.error('Invite moderation failed:', error);
        }
    }

    async function handleInteraction(interaction) {
        if (!interaction.guild) return;

        if (interaction.isButton()) {
            const handled = await stageFeature.handleButtonInteraction(interaction);
            if (handled) return;
        }

        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'events') {
            try {
                await sendActiveEvents(interaction, interaction.guild);
            } catch (error) {
                console.error('Slash event lookup failed:', error);
                const method = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
                await interaction[method]('I could not fetch the server events right now.');
            }
            return;
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        const staffOnlyCommands = new Set([
            'start-queue',
            'stop-queue',
            'next',
            'radio',
            'allow-invites',
            'revoke-invites',
            'purge-invites',
        ]);

        if (staffOnlyCommands.has(interaction.commandName) && !helpers.isStaff(member)) {
            await interaction.reply(helpers.privateReply('Staff only.'));
            return;
        }

        if (interaction.commandName === 'start-queue') {
            if (!member.voice.channel) {
                await interaction.reply(helpers.privateReply('Join the voice channel you want me to host in first.'));
                return;
            }

            const result = await stageFeature.startStage(interaction.channel, member.voice.channelId);
            if (result.status === 'conflict') {
                await interaction.reply(helpers.privateReply(`A stage is already active in <#${result.targetVC}>. You can add more control panels only for that same voice channel.`));
                return;
            }

            const response = result.status === 'created'
                ? `Stage initialized for <#${member.voice.channelId}>.`
                : result.status === 'added-panel'
                    ? `Added a control panel for the active stage in <#${result.targetVC}>.`
                    : `Refreshed this control panel for the active stage in <#${result.targetVC}>.`;

            await interaction.reply(helpers.privateReply(response));
            return;
        }

        if (interaction.commandName === 'next') {
            const result = await stageFeature.nextSpeaker(interaction.channel);
            if (result.status === 'missing') {
                await interaction.reply(helpers.privateReply('There is no active stage in this server.'));
                return;
            }

            await interaction.reply(helpers.privateReply('Moved to the next performer.'));
            return;
        }

        if (interaction.commandName === 'radio') {
            const result = await stageFeature.toggleRadio(interaction.channel);
            if (result.status === 'missing') {
                await interaction.reply(helpers.privateReply('There is no active stage in this server.'));
                return;
            }

            await interaction.reply(helpers.privateReply(result.status === 'started' ? 'Radio started.' : 'Radio stopped.'));
            return;
        }

        if (interaction.commandName === 'stop-queue') {
            const result = await stageFeature.stopStage(interaction.channel);
            if (result.status === 'missing') {
                await interaction.reply(helpers.privateReply('There is no active stage in this server.'));
                return;
            }

            await interaction.reply(helpers.privateReply('Event finished. Connection closed.'));
            return;
        }

        if (interaction.commandName === 'allow-invites') {
            const target = interaction.options.getUser('target', true);
            state.allowedInviteUsers.add(target.id);
            state.saveAllowedInviteUsers();
            await interaction.reply(helpers.privateReply(`<@${target.id}> can now post Discord invite links.`));
            return;
        }

        if (interaction.commandName === 'revoke-invites') {
            const target = interaction.options.getUser('target', true);
            const removed = state.allowedInviteUsers.delete(target.id);
            if (removed) state.saveAllowedInviteUsers();
            await interaction.reply(helpers.privateReply(
                removed
                    ? `Removed invite link permission for <@${target.id}>.`
                    : `<@${target.id}> was not on the invite allowlist.`
            ));
            return;
        }

        if (interaction.commandName === 'purge-invites') {
            const scanLimit = interaction.options.getInteger('messages_per_channel') ?? config.DEFAULT_PURGE_SCAN_LIMIT;
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const result = await purgeInviteLinksInGuild(interaction.guild, scanLimit);
            await interaction.editReply(`Invite cleanup finished. Scanned ${result.scannedChannels} channels, skipped ${result.skippedChannels}, checked ${result.scannedMessages} messages, and deleted ${result.deletedMessages} invite links.`);
            return;
        }
    }

    return {
        restoreScheduledTasks,
        handleMessageCreate,
        handleInteraction,
    };
}

module.exports = { createCommunityFeature };