const {
    ChannelType,
    EmbedBuilder,
    GuildScheduledEventStatus,
    MessageFlags,
} = require('discord.js');

function createCommunityFeature({ client, config, state, helpers, stageFeature }) {
    function normalizeEmojiIdentifier(value) {
        if (!value) return null;
        const trimmed = value.trim();
        const customEmojiMatch = trimmed.match(/^<?a?:([^:>]+):(\d+)>?$/);
        if (customEmojiMatch) return customEmojiMatch[2];
        return trimmed;
    }

    function getReactionEmojiKey(reaction) {
        return reaction.emoji.id ?? reaction.emoji.name;
    }

    function formatRoleMentionList(roleIds) {
        return roleIds.length > 0 ? roleIds.map(roleId => `<@&${roleId}>`).join(', ') : 'none';
    }

    function getReactionRoleModeLabels(reactionRoleConfig) {
        const modeFlags = [];
        if (reactionRoleConfig.unique) modeFlags.push('Unique');
        if (reactionRoleConfig.verify) modeFlags.push('Verify');
        if (reactionRoleConfig.reversed) modeFlags.push('Reversed');
        if (reactionRoleConfig.binding) modeFlags.push('Binding');
        if (reactionRoleConfig.temporaryMinutes) modeFlags.push(`Temporary ${reactionRoleConfig.temporaryMinutes}m`);
        if (reactionRoleConfig.selfDestructAt) modeFlags.push('Self-destruct');
        return modeFlags;
    }

    function buildReactionRoleEmbed(reactionRoleConfig) {
        const mappingLines = Object.values(reactionRoleConfig.mappings)
            .map(mapping => `${mapping.display} -> ${formatRoleMentionList(mapping.roleIds)}`);
        const modeFlags = getReactionRoleModeLabels(reactionRoleConfig);

        const footerParts = ['React to choose your roles.'];
        if (reactionRoleConfig.temporaryMinutes) footerParts.push(`Assigned roles expire after ${reactionRoleConfig.temporaryMinutes} minutes.`);
        if (reactionRoleConfig.selfDestructAt) footerParts.push('This message is scheduled to self-destruct.');

        return new EmbedBuilder()
            .setTitle(reactionRoleConfig.title || 'Reaction Roles')
            .setDescription(reactionRoleConfig.description || 'React to assign your roles.')
            .addFields(
                {
                    name: 'Mappings',
                    value: mappingLines.length > 0 ? mappingLines.join('\n') : 'No role mappings yet.',
                },
                {
                    name: 'Modes',
                    value: modeFlags.length > 0 ? modeFlags.join(', ') : 'Standard',
                },
                {
                    name: 'Access',
                    value: [
                        reactionRoleConfig.whitelistRoleIds.length > 0
                            ? `Whitelist: ${formatRoleMentionList(reactionRoleConfig.whitelistRoleIds)}`
                            : 'Whitelist: none',
                        reactionRoleConfig.blacklistRoleIds.length > 0
                            ? `Blacklist: ${formatRoleMentionList(reactionRoleConfig.blacklistRoleIds)}`
                            : 'Blacklist: none',
                    ].join('\n'),
                }
            )
            .setColor(0x5865F2)
            .setFooter({ text: footerParts.join(' ') });
    }

    function buildReactionRoleConfigEmbed(reactionRoleConfig, messageId) {
        const mappingCount = Object.keys(reactionRoleConfig.mappings).length;
        const details = [
            `Message ID: ${messageId}`,
            `Mappings: ${mappingCount}`,
            `Modes: ${getReactionRoleModeLabels(reactionRoleConfig).join(', ') || 'Standard'}`,
            `Whitelist: ${formatRoleMentionList(reactionRoleConfig.whitelistRoleIds)}`,
            `Blacklist: ${formatRoleMentionList(reactionRoleConfig.blacklistRoleIds)}`,
        ];

        if (reactionRoleConfig.selfDestructAt) {
            details.push(`Self-destruct: <t:${Math.floor(reactionRoleConfig.selfDestructAt / 1000)}:f>`);
        }

        return new EmbedBuilder()
            .setTitle(reactionRoleConfig.title || 'Reaction Roles')
            .setDescription(reactionRoleConfig.description || 'React to assign your roles.')
            .addFields(
                {
                    name: 'Configuration',
                    value: details.join('\n'),
                },
                {
                    name: 'Mappings',
                    value: Object.values(reactionRoleConfig.mappings)
                        .map(mapping => `${mapping.display} -> ${formatRoleMentionList(mapping.roleIds)}`)
                        .join('\n') || 'No mappings configured yet.',
                }
            )
            .setColor(0x5865F2);
    }

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

    function shouldIgnoreLog(guildId, options = {}) {
        const guildConfig = state.getGuildConfig(guildId);
        if (options.channelId && guildConfig.ignoredChannelIds.includes(options.channelId)) return true;
        if (options.memberId && guildConfig.ignoredMemberIds.includes(options.memberId)) return true;

        if (options.content) {
            const lowerContent = options.content.toLowerCase();
            if (guildConfig.ignoredPrefixes.some(prefix => lowerContent.startsWith(prefix.toLowerCase()))) return true;
        }

        return false;
    }

    async function sendLog(guild, type, options) {
        const guildConfig = state.getGuildConfig(guild.id);
        const channelId = guildConfig.logging[type];
        if (!channelId) return;

        try {
            const channel = await guild.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) return;
            await channel.send(options);
        } catch (error) {
            console.error(`Failed to send ${type} log:`, error);
        }
    }

    async function sendDramaLog(guild, content) {
        await sendLog(guild, 'dramaChannelId', { content });
    }

    function createCaseRecord(guildId, data) {
        const modlog = state.getModlog(guildId);
        const entry = {
            caseNumber: modlog.nextCaseNumber++,
            createdAt: new Date().toISOString(),
            ...data,
        };
        modlog.cases.push(entry);
        state.persistModlogStore();
        return entry;
    }

    function formatCaseTarget(entry) {
        return entry.targetLabel || entry.targetId || 'Unknown target';
    }

    function formatCaseRecord(entry) {
        return `Case #${entry.caseNumber} | ${entry.action} | target ${formatCaseTarget(entry)} | moderator ${entry.moderatorId} | ${entry.reason || 'No reason provided'}`;
    }

    async function logModerationCase(guild, entry) {
        const embed = new EmbedBuilder()
            .setTitle(`Moderation Case #${entry.caseNumber}`)
            .addFields(
                { name: 'Action', value: entry.action, inline: true },
                { name: 'Target', value: formatCaseTarget(entry), inline: true },
                { name: 'Moderator', value: `<@${entry.moderatorId}>`, inline: true },
                { name: 'Reason', value: entry.reason || 'No reason provided' }
            )
            .setColor(0xED4245)
            .setTimestamp(new Date(entry.createdAt));

        await sendLog(guild, 'modChannelId', { embeds: [embed] });
        await sendDramaLog(guild, `[${entry.action}] ${formatCaseTarget(entry)} - ${entry.reason || 'No reason provided'}`);
    }

    async function updateReactionRoleMessage(guildId, messageId) {
        const reactionRoleConfig = state.getReactionRoleMessageConfig(guildId, messageId);
        if (!reactionRoleConfig) return;

        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(reactionRoleConfig.channelId);
        if (!channel || !channel.isTextBased()) return;

        const message = await channel.messages.fetch(messageId);
        await message.edit({ embeds: [buildReactionRoleEmbed(reactionRoleConfig)] });
    }

    function queueSelfDestruct(guildId, messageId, deleteAt) {
        const key = `${guildId}:${messageId}`;
        if (state.selfDestructTimers.has(key)) clearTimeout(state.selfDestructTimers.get(key));

        const delay = deleteAt - Date.now();
        if (delay <= 0) {
            handleReactionRoleMessageExpiration(guildId, messageId).catch(error => {
                console.error('Failed to expire reaction role message:', error);
            });
            return;
        }

        const timer = setTimeout(() => {
            handleReactionRoleMessageExpiration(guildId, messageId).catch(error => {
                console.error('Failed to expire reaction role message:', error);
            });
        }, delay);

        state.selfDestructTimers.set(key, timer);
    }

    async function handleReactionRoleMessageExpiration(guildId, messageId) {
        const guildState = state.getReactionRoleGuildState(guildId);
        const reactionRoleConfig = guildState.messages[messageId];
        if (!reactionRoleConfig) return;

        try {
            const guild = await client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(reactionRoleConfig.channelId);
            if (channel?.isTextBased()) {
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (message) await message.delete().catch(() => {});
            }
        } finally {
            delete guildState.messages[messageId];
            state.persistReactionRoles();
        }
    }

    function scheduleTemporaryRoleRemoval(guildId, userId, roleId, expiresAt, metadata = {}) {
        const key = `${guildId}:${userId}:${roleId}:${expiresAt}`;
        if (state.temporaryRoleTimers.has(key)) clearTimeout(state.temporaryRoleTimers.get(key));

        const delay = expiresAt - Date.now();
        const executeRemoval = async () => {
            try {
                const guild = await client.guilds.fetch(guildId);
                const member = await guild.members.fetch(userId).catch(() => null);
                const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
                if (member && role && member.roles.cache.has(roleId) && role.editable) {
                    await member.roles.remove(role, 'Temporary reaction role expired.');
                }
            } catch (error) {
                console.error('Failed to remove temporary reaction role:', error);
            } finally {
                const assignments = state.getTemporaryRoleAssignments(guildId);
                state.temporaryReactionRoleStore[guildId] = assignments.filter(entry => !(entry.userId === userId && entry.roleId === roleId && entry.expiresAt === expiresAt));
                state.persistTemporaryReactionRoleStore();
            }
        };

        if (delay <= 0) {
            executeRemoval().catch(() => {});
            return;
        }

        const timer = setTimeout(() => {
            executeRemoval().catch(() => {});
        }, delay);

        state.temporaryRoleTimers.set(key, timer);
        const assignments = state.getTemporaryRoleAssignments(guildId);
        if (!assignments.some(entry => entry.userId === userId && entry.roleId === roleId && entry.expiresAt === expiresAt)) {
            assignments.push({ userId, roleId, expiresAt, ...metadata });
            state.persistTemporaryReactionRoleStore();
        }
    }

    async function restoreScheduledTasks() {
        for (const [guildId, guildState] of Object.entries(state.reactionRoleStore)) {
            for (const [messageId, reactionRoleConfig] of Object.entries(guildState.messages ?? {})) {
                if (reactionRoleConfig.selfDestructAt) queueSelfDestruct(guildId, messageId, reactionRoleConfig.selfDestructAt);
            }
        }

        for (const [guildId, assignments] of Object.entries(state.temporaryReactionRoleStore)) {
            for (const assignment of assignments) {
                scheduleTemporaryRoleRemoval(guildId, assignment.userId, assignment.roleId, assignment.expiresAt, assignment);
            }
        }
    }

    function memberCanUseReactionRole(member, reactionRoleConfig) {
        if (reactionRoleConfig.whitelistRoleIds.length > 0 && !reactionRoleConfig.whitelistRoleIds.some(roleId => member.roles.cache.has(roleId))) {
            return false;
        }

        if (reactionRoleConfig.blacklistRoleIds.some(roleId => member.roles.cache.has(roleId))) {
            return false;
        }

        return true;
    }

    async function applyReactionRoleChange(reaction, user, action) {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();

        const { guild, id: messageId } = reaction.message;
        if (!guild) return;

        const reactionRoleConfig = state.getReactionRoleMessageConfig(guild.id, messageId);
        if (!reactionRoleConfig) return;

        const mapping = reactionRoleConfig.mappings[getReactionEmojiKey(reaction)];
        if (!mapping) return;

        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        if (!memberCanUseReactionRole(member, reactionRoleConfig)) {
            await reaction.users.remove(user.id).catch(() => {});
            return;
        }

        const roleIds = mapping.roleIds.filter(roleId => guild.roles.cache.has(roleId));
        if (roleIds.length === 0) return;

        const shouldAddRoles = (action === 'add' && !reactionRoleConfig.reversed) || (action === 'remove' && reactionRoleConfig.reversed);
        const shouldRemoveRoles = (action === 'remove' && !reactionRoleConfig.verify && !reactionRoleConfig.reversed) || (action === 'add' && reactionRoleConfig.reversed);

        if (shouldAddRoles && reactionRoleConfig.unique) {
            const otherRoleIds = Object.values(reactionRoleConfig.mappings)
                .flatMap(existingMapping => existingMapping.roleIds)
                .filter(roleId => !roleIds.includes(roleId));

            if (otherRoleIds.length > 0) {
                await member.roles.remove(otherRoleIds.filter(roleId => member.roles.cache.has(roleId))).catch(() => {});
            }
        }

        if (shouldAddRoles) {
            for (const roleId of roleIds) {
                const role = guild.roles.cache.get(roleId);
                if (!role || !role.editable || member.roles.cache.has(roleId)) continue;
                await member.roles.add(role, 'Reaction role granted.').catch(() => {});
                if (reactionRoleConfig.temporaryMinutes) {
                    scheduleTemporaryRoleRemoval(
                        guild.id,
                        user.id,
                        roleId,
                        Date.now() + reactionRoleConfig.temporaryMinutes * 60 * 1000,
                        { sourceMessageId: messageId, emojiKey: mapping.key }
                    );
                }
            }
        }

        if (shouldRemoveRoles) {
            for (const roleId of roleIds) {
                const role = guild.roles.cache.get(roleId);
                if (!role || !role.editable || !member.roles.cache.has(roleId)) continue;
                await member.roles.remove(role, 'Reaction role removed.').catch(() => {});
            }
        }
    }

    async function syncBindingReactionRoles(oldMember, newMember) {
        const guildState = state.reactionRoleStore[newMember.guild.id];
        if (!guildState?.messages) return;

        const removedRoleIds = oldMember.roles.cache
            .filter(role => !newMember.roles.cache.has(role.id))
            .map(role => role.id);

        if (removedRoleIds.length === 0) return;

        for (const [messageId, reactionRoleConfig] of Object.entries(guildState.messages)) {
            if (!reactionRoleConfig.binding) continue;

            const affectedMappings = Object.values(reactionRoleConfig.mappings).filter(mapping => mapping.roleIds.some(roleId => removedRoleIds.includes(roleId)));
            if (affectedMappings.length === 0) continue;

            try {
                const channel = await newMember.guild.channels.fetch(reactionRoleConfig.channelId);
                if (!channel?.isTextBased()) continue;
                const message = await channel.messages.fetch(messageId);

                for (const mapping of affectedMappings) {
                    const reaction = message.reactions.cache.find(existingReaction => getReactionEmojiKey(existingReaction) === mapping.key);
                    if (reaction) await reaction.users.remove(newMember.id).catch(() => {});
                }
            } catch (error) {
                console.error('Failed to sync binding reaction roles:', error);
            }
        }
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
                    await sendDramaLog(guild, `Invite deleted from ${message.author.tag} in <#${channel.id}>.`);
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

    function buildLoggingStatus(guildConfig) {
        return [
            `Message logs: ${guildConfig.logging.messageChannelId ? `<#${guildConfig.logging.messageChannelId}>` : 'off'}`,
            `Invite logs: ${guildConfig.logging.inviteChannelId ? `<#${guildConfig.logging.inviteChannelId}>` : 'off'}`,
            `Member logs: ${guildConfig.logging.memberChannelId ? `<#${guildConfig.logging.memberChannelId}>` : 'off'}`,
            `Server logs: ${guildConfig.logging.serverChannelId ? `<#${guildConfig.logging.serverChannelId}>` : 'off'}`,
            `Mod logs: ${guildConfig.logging.modChannelId ? `<#${guildConfig.logging.modChannelId}>` : 'off'}`,
            `Drama channel: ${guildConfig.logging.dramaChannelId ? `<#${guildConfig.logging.dramaChannelId}>` : 'off'}`,
            `Highlight channel: ${guildConfig.logging.highlightChannelId ? `<#${guildConfig.logging.highlightChannelId}>` : 'off'}`,
            `Ignored channels: ${guildConfig.ignoredChannelIds.length}`,
            `Ignored members: ${guildConfig.ignoredMemberIds.length}`,
            `Ignored prefixes: ${guildConfig.ignoredPrefixes.length}`,
        ].join('\n');
    }

    async function safeFetchMember(interaction, optionName) {
        const user = interaction.options.getUser(optionName, true);
        return interaction.guild.members.fetch(user.id).catch(() => null);
    }

    async function getManagedRole(guild, roleId) {
        return guild.roles.cache.get(roleId) ?? guild.roles.fetch(roleId).catch(() => null);
    }

    async function getRoleManagementError(guild, role, context) {
        const managedRole = await getManagedRole(guild, role.id);
        if (!managedRole) return `I could not find the role for ${context}.`;
        if (!managedRole.editable) return `I cannot manage ${managedRole.name} for ${context} because it is above my highest role or managed by Discord.`;
        return null;
    }

    function getHierarchyError(actor, target, actionLabel) {
        if (!target) return 'That member is not in the server.';
        if (target.id === actor.id) return `You cannot ${actionLabel} yourself.`;
        if (target.id === actor.guild.ownerId) return `You cannot ${actionLabel} the server owner.`;

        if (actor.guild.ownerId !== actor.id && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
            return `You cannot ${actionLabel} someone with an equal or higher top role.`;
        }

        return null;
    }

    function getBotTargetError(target, actionLabel, capability) {
        if (!target) return null;

        if (capability === 'timeout' && !target.moderatable) {
            return `I cannot ${actionLabel} that member because they are above my highest role or I am missing timeout permissions.`;
        }

        if (capability === 'kick' && !target.kickable) {
            return `I cannot ${actionLabel} that member because they are above my highest role or I am missing kick permissions.`;
        }

        if (capability === 'ban' && !target.bannable) {
            return `I cannot ${actionLabel} that member because they are above my highest role or I am missing ban permissions.`;
        }

        return null;
    }

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
        if (shouldIgnoreLog(message.guild.id, { channelId: message.channelId, memberId: message.author.id, content: message.content })) return;

        if (helpers.containsInviteLink(message.content)) {
            await sendLog(message.guild, 'inviteChannelId', {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Invite Link Seen')
                        .setDescription(message.content)
                        .addFields(
                            { name: 'Author', value: `<@${message.author.id}>`, inline: true },
                            { name: 'Channel', value: `<#${message.channelId}>`, inline: true }
                        )
                        .setColor(0xFAA61A)
                        .setTimestamp(),
                ],
            });

            if (!helpers.canPostInviteLinkInGuild(message.guild, message.author.id)) {
                try {
                    await message.delete();
                    const warning = await message.channel.send('Invite links are not allowed here.');
                    setTimeout(() => warning.delete().catch(() => {}), 5000);
                    await sendDramaLog(message.guild, `Unauthorized invite deleted from <@${message.author.id}> in <#${message.channelId}>.`);
                } catch (error) {
                    console.error('Invite moderation failed:', error);
                }
            }
        }
    }

    async function handleMessageDelete(message) {
        if (!message.guild || !message.author || message.author.bot) return;
        if (shouldIgnoreLog(message.guild.id, { channelId: message.channelId, memberId: message.author.id, content: message.content })) return;

        await sendLog(message.guild, 'messageChannelId', {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Message Deleted')
                    .addFields(
                        { name: 'Author', value: `<@${message.author.id}>`, inline: true },
                        { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
                        { name: 'Content', value: message.content?.slice(0, 1024) || 'No text content.' }
                    )
                    .setColor(0xED4245)
                    .setTimestamp(),
            ],
        });
    }

    async function handleMessageDeleteBulk(messages) {
        const firstMessage = messages.first();
        if (!firstMessage?.guild) return;

        await sendLog(firstMessage.guild, 'messageChannelId', {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Messages Purged')
                    .setDescription(`${messages.size} messages were bulk-deleted in <#${firstMessage.channelId}>.`)
                    .setColor(0xED4245)
                    .setTimestamp(),
            ],
        });
    }

    async function handleMessageUpdate(oldMessage, newMessage) {
        if (!newMessage.guild || !newMessage.author || newMessage.author.bot) return;
        if (oldMessage.content === newMessage.content) return;
        if (shouldIgnoreLog(newMessage.guild.id, { channelId: newMessage.channelId, memberId: newMessage.author.id, content: newMessage.content })) return;

        await sendLog(newMessage.guild, 'messageChannelId', {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Message Edited')
                    .addFields(
                        { name: 'Author', value: `<@${newMessage.author.id}>`, inline: true },
                        { name: 'Channel', value: `<#${newMessage.channelId}>`, inline: true },
                        { name: 'Before', value: oldMessage.content?.slice(0, 1024) || 'No text content.' },
                        { name: 'After', value: newMessage.content?.slice(0, 1024) || 'No text content.' }
                    )
                    .setColor(0xFAA61A)
                    .setTimestamp(),
            ],
        });
    }

    async function handleGuildMemberAdd(member) {
        const guildStickyRoles = state.getStickyRolesForGuild(member.guild.id)[member.id] ?? [];
        const guildConfig = state.getGuildConfig(member.guild.id);

        if (guildStickyRoles.length > 0) {
            const rolesToRestore = guildStickyRoles.filter(roleId => member.guild.roles.cache.has(roleId));
            if (rolesToRestore.length > 0) {
                await member.roles.add(rolesToRestore, 'Sticky roles restored.').catch(() => {});
            }
        }

        const joinEmbed = new EmbedBuilder()
            .setTitle('Member Joined')
            .setDescription(`<@${member.id}> joined the server.`)
            .setThumbnail(member.displayAvatarURL())
            .setColor(0x57F287)
            .setTimestamp();

        await sendLog(member.guild, 'memberChannelId', { embeds: [joinEmbed] });
        if (guildConfig.logging.highlightChannelId) {
            await sendLog(member.guild, 'highlightChannelId', { content: `Welcome <@${member.id}> to the server.` });
        }
    }

    async function handleGuildMemberRemove(member) {
        const guildConfig = state.getGuildConfig(member.guild.id);
        const stickyRoleIds = new Set([...(guildConfig.moderation.stickyRoleIds ?? []), guildConfig.moderation.mutedRoleId].filter(Boolean));
        const rolesToKeep = member.roles.cache.filter(role => stickyRoleIds.has(role.id)).map(role => role.id);

        if (rolesToKeep.length > 0) {
            const guildStickyRoles = state.getStickyRolesForGuild(member.guild.id);
            guildStickyRoles[member.id] = rolesToKeep;
            state.persistStickyRoleStore();
        }

        await sendLog(member.guild, 'memberChannelId', {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Member Left')
                    .setDescription(`${member.user.tag} left or was removed.`)
                    .setColor(0xED4245)
                    .setTimestamp(),
            ],
        });
    }

    async function handleGuildMemberUpdate(oldMember, newMember) {
        await syncBindingReactionRoles(oldMember, newMember);

        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
        const changes = [];

        if (oldMember.nickname !== newMember.nickname) {
            changes.push(`Nickname: ${oldMember.nickname || oldMember.user.username} -> ${newMember.nickname || newMember.user.username}`);
        }

        if (oldMember.user.avatar !== newMember.user.avatar) {
            changes.push('Avatar changed');
        }

        if (addedRoles.size > 0) {
            changes.push(`Roles added: ${addedRoles.map(role => role.name).join(', ')}`);
        }

        if (removedRoles.size > 0) {
            changes.push(`Roles removed: ${removedRoles.map(role => role.name).join(', ')}`);
        }

        if (changes.length === 0) return;

        await sendLog(newMember.guild, 'memberChannelId', {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Member Updated')
                    .setDescription(`<@${newMember.id}>\n${changes.join('\n')}`)
                    .setColor(0x5865F2)
                    .setTimestamp(),
            ],
        });
    }

    async function handleGuildBanAdd(ban) {
        await sendLog(ban.guild, 'memberChannelId', {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Member Banned')
                    .setDescription(`${ban.user.tag} was banned.`)
                    .setColor(0xED4245)
                    .setTimestamp(),
            ],
        });
    }

    async function handleGuildBanRemove(ban) {
        await sendLog(ban.guild, 'memberChannelId', {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Member Unbanned')
                    .setDescription(`${ban.user.tag} was unbanned.`)
                    .setColor(0x57F287)
                    .setTimestamp(),
            ],
        });
    }

    async function handleChannelCreate(channel) {
        if (!channel.guild) return;
        await sendLog(channel.guild, 'serverChannelId', { content: `Channel created: ${channel.name}` });
    }

    async function handleChannelDelete(channel) {
        if (!channel.guild) return;
        await sendLog(channel.guild, 'serverChannelId', { content: `Channel deleted: ${channel.name}` });
    }

    async function handleChannelUpdate(oldChannel, newChannel) {
        if (!newChannel.guild || oldChannel.name === newChannel.name) return;
        await sendLog(newChannel.guild, 'serverChannelId', { content: `Channel renamed: ${oldChannel.name} -> ${newChannel.name}` });
    }

    async function handleRoleCreate(role) {
        await sendLog(role.guild, 'serverChannelId', { content: `Role created: ${role.name}` });
    }

    async function handleRoleDelete(role) {
        await sendLog(role.guild, 'serverChannelId', { content: `Role deleted: ${role.name}` });
    }

    async function handleRoleUpdate(oldRole, newRole) {
        if (oldRole.name === newRole.name) return;
        await sendLog(newRole.guild, 'serverChannelId', { content: `Role renamed: ${oldRole.name} -> ${newRole.name}` });
    }

    async function handleEmojiCreate(emoji) {
        await sendLog(emoji.guild, 'serverChannelId', { content: `Emoji created: ${emoji.name}` });
    }

    async function handleEmojiDelete(emoji) {
        await sendLog(emoji.guild, 'serverChannelId', { content: `Emoji deleted: ${emoji.name}` });
    }

    async function handleEmojiUpdate(oldEmoji, newEmoji) {
        if (oldEmoji.name === newEmoji.name) return;
        await sendLog(newEmoji.guild, 'serverChannelId', { content: `Emoji renamed: ${oldEmoji.name} -> ${newEmoji.name}` });
    }

    async function handleReactionAdd(reaction, user) {
        await applyReactionRoleChange(reaction, user, 'add');
    }

    async function handleReactionRemove(reaction, user) {
        await applyReactionRoleChange(reaction, user, 'remove');
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
            'reaction-role',
            'logging',
            'moderation',
            'moderation-config',
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

            await stageFeature.startStage(interaction.channel, member.voice.channelId);
            await interaction.reply(helpers.privateReply(`Stage initialized for <#${member.voice.channelId}>.`));
            return;
        }

        if (interaction.commandName === 'next') {
            await stageFeature.nextSpeaker(interaction.channel);
            await interaction.reply(helpers.privateReply('Moved to the next performer.'));
            return;
        }

        if (interaction.commandName === 'radio') {
            await stageFeature.toggleRadio(interaction.channel);
            await interaction.reply(helpers.privateReply('Radio toggled.'));
            return;
        }

        if (interaction.commandName === 'stop-queue') {
            stageFeature.stopStage(interaction.channelId);
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

        if (interaction.commandName === 'reaction-role') {
            const subcommand = interaction.options.getSubcommand();
            const channel = interaction.options.getChannel('channel', true);
            const messageId = interaction.options.getString('message_id');
            const guildState = state.getReactionRoleGuildState(interaction.guild.id);

            if (subcommand === 'post') {
                const unique = interaction.options.getBoolean('unique') ?? state.getGuildConfig(interaction.guild.id).reactionRoles.defaultUnique;
                const verify = interaction.options.getBoolean('verify') ?? false;
                const reversed = interaction.options.getBoolean('reversed') ?? false;
                const binding = interaction.options.getBoolean('binding') ?? false;
                const temporaryMinutes = interaction.options.getInteger('temporary_minutes') ?? null;
                const selfDestructMinutes = interaction.options.getInteger('self_destruct_minutes') ?? null;

                const reactionRoleConfig = {
                    channelId: channel.id,
                    title: interaction.options.getString('title', true),
                    description: interaction.options.getString('description', true),
                    unique,
                    verify,
                    reversed,
                    binding,
                    temporaryMinutes,
                    whitelistRoleIds: [],
                    blacklistRoleIds: [],
                    mappings: {},
                    selfDestructAt: selfDestructMinutes ? Date.now() + selfDestructMinutes * 60 * 1000 : null,
                };

                const postedMessage = await channel.send({ embeds: [buildReactionRoleEmbed(reactionRoleConfig)] });
                guildState.messages[postedMessage.id] = reactionRoleConfig;
                state.persistReactionRoles();
                if (reactionRoleConfig.selfDestructAt) queueSelfDestruct(interaction.guild.id, postedMessage.id, reactionRoleConfig.selfDestructAt);

                await interaction.reply(helpers.privateReply(`Reaction-role message created in <#${channel.id}> with message ID ${postedMessage.id}.`));
                return;
            }

            const reactionRoleConfig = state.getReactionRoleMessageConfig(interaction.guild.id, messageId);
            if (!reactionRoleConfig || reactionRoleConfig.channelId !== channel.id) {
                await interaction.reply(helpers.privateReply('That reaction-role message was not found in my config.'));
                return;
            }

            if (subcommand === 'map') {
                const emojiInput = interaction.options.getString('emoji', true);
                const emojiKey = normalizeEmojiIdentifier(emojiInput);
                const role = interaction.options.getRole('role', true);
                const roleError = await getRoleManagementError(interaction.guild, role, 'reaction roles');
                if (roleError) {
                    await interaction.reply(helpers.privateReply(roleError));
                    return;
                }

                if (!reactionRoleConfig.mappings[emojiKey]) {
                    reactionRoleConfig.mappings[emojiKey] = { key: emojiKey, display: emojiInput, roleIds: [] };
                }

                if (!reactionRoleConfig.mappings[emojiKey].roleIds.includes(role.id)) {
                    reactionRoleConfig.mappings[emojiKey].roleIds.push(role.id);
                }

                state.persistReactionRoles();

                const targetMessage = await channel.messages.fetch(messageId);
                await targetMessage.react(emojiInput).catch(() => {});
                await updateReactionRoleMessage(interaction.guild.id, messageId);
                await interaction.reply(helpers.privateReply(`Mapped ${emojiInput} to ${role.name} on message ${messageId}.`));
                return;
            }

            if (subcommand === 'unmap') {
                const emojiInput = interaction.options.getString('emoji', true);
                const emojiKey = normalizeEmojiIdentifier(emojiInput);
                const role = interaction.options.getRole('role', true);
                const mapping = reactionRoleConfig.mappings[emojiKey];
                if (!mapping) {
                    await interaction.reply(helpers.privateReply('That emoji is not mapped on this message.'));
                    return;
                }

                mapping.roleIds = mapping.roleIds.filter(roleId => roleId !== role.id);
                if (mapping.roleIds.length === 0) delete reactionRoleConfig.mappings[emojiKey];
                state.persistReactionRoles();
                await updateReactionRoleMessage(interaction.guild.id, messageId);
                await interaction.reply(helpers.privateReply(`Removed ${role.name} from ${emojiInput} on message ${messageId}.`));
                return;
            }

            if (subcommand === 'access') {
                const listName = interaction.options.getString('list', true);
                const action = interaction.options.getString('action', true);
                const role = interaction.options.getRole('role', true);
                const key = listName === 'whitelist' ? 'whitelistRoleIds' : 'blacklistRoleIds';

                if (action === 'add' && !reactionRoleConfig[key].includes(role.id)) reactionRoleConfig[key].push(role.id);
                if (action === 'remove') reactionRoleConfig[key] = reactionRoleConfig[key].filter(roleId => roleId !== role.id);

                state.persistReactionRoles();
                await updateReactionRoleMessage(interaction.guild.id, messageId);
                await interaction.reply(helpers.privateReply(`${action === 'add' ? 'Added' : 'Removed'} ${role.name} ${action === 'add' ? 'to' : 'from'} the ${listName}.`));
                return;
            }

            await interaction.reply({ embeds: [buildReactionRoleConfigEmbed(reactionRoleConfig, messageId)], flags: MessageFlags.Ephemeral });
            return;
        }

        if (interaction.commandName === 'logging') {
            const guildConfig = state.getGuildConfig(interaction.guild.id);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'channel') {
                const category = interaction.options.getString('category', true);
                const channel = interaction.options.getChannel('channel', true);
                guildConfig.logging[category] = channel.id;
                state.persistGuildConfigs();
                await interaction.reply(helpers.privateReply(`Updated ${category} to <#${channel.id}>.`));
                return;
            }

            if (subcommand === 'ignore-channel') {
                const action = interaction.options.getString('action', true);
                const channel = interaction.options.getChannel('channel', true);
                if (action === 'add' && !guildConfig.ignoredChannelIds.includes(channel.id)) guildConfig.ignoredChannelIds.push(channel.id);
                if (action === 'remove') guildConfig.ignoredChannelIds = guildConfig.ignoredChannelIds.filter(id => id !== channel.id);
                state.persistGuildConfigs();
                await interaction.reply(helpers.privateReply(`Ignore list updated for <#${channel.id}>.`));
                return;
            }

            if (subcommand === 'ignore-member') {
                const action = interaction.options.getString('action', true);
                const target = interaction.options.getUser('member', true);
                if (action === 'add' && !guildConfig.ignoredMemberIds.includes(target.id)) guildConfig.ignoredMemberIds.push(target.id);
                if (action === 'remove') guildConfig.ignoredMemberIds = guildConfig.ignoredMemberIds.filter(id => id !== target.id);
                state.persistGuildConfigs();
                await interaction.reply(helpers.privateReply(`Ignore list updated for <@${target.id}>.`));
                return;
            }

            if (subcommand === 'ignore-prefix') {
                const action = interaction.options.getString('action', true);
                const prefix = interaction.options.getString('prefix', true);
                if (action === 'add' && !guildConfig.ignoredPrefixes.includes(prefix)) guildConfig.ignoredPrefixes.push(prefix);
                if (action === 'remove') guildConfig.ignoredPrefixes = guildConfig.ignoredPrefixes.filter(value => value !== prefix);
                state.persistGuildConfigs();
                await interaction.reply(helpers.privateReply(`Ignore prefixes updated for ${prefix}.`));
                return;
            }

            await interaction.reply(helpers.privateReply(buildLoggingStatus(guildConfig)));
            return;
        }

        if (interaction.commandName === 'moderation-config') {
            const guildConfig = state.getGuildConfig(interaction.guild.id);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'muted-role') {
                const role = interaction.options.getRole('role', true);
                guildConfig.moderation.mutedRoleId = role.id;
                state.persistGuildConfigs();
                await interaction.reply(helpers.privateReply(`Muted role set to ${role.name}.`));
                return;
            }

            if (subcommand === 'sticky-role') {
                const action = interaction.options.getString('action', true);
                const role = interaction.options.getRole('role', true);
                if (action === 'add' && !guildConfig.moderation.stickyRoleIds.includes(role.id)) guildConfig.moderation.stickyRoleIds.push(role.id);
                if (action === 'remove') guildConfig.moderation.stickyRoleIds = guildConfig.moderation.stickyRoleIds.filter(roleId => roleId !== role.id);
                state.persistGuildConfigs();
                await interaction.reply(helpers.privateReply(`Sticky roles updated for ${role.name}.`));
                return;
            }

            await interaction.reply(helpers.privateReply([
                `Muted role: ${guildConfig.moderation.mutedRoleId ? `<@&${guildConfig.moderation.mutedRoleId}>` : 'not set'}`,
                `Sticky roles: ${guildConfig.moderation.stickyRoleIds.length > 0 ? guildConfig.moderation.stickyRoleIds.map(roleId => `<@&${roleId}>`).join(', ') : 'none'}`,
            ].join('\n')));
            return;
        }

        if (interaction.commandName !== 'moderation') return;

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'warn') {
            const target = await safeFetchMember(interaction, 'member');
            const hierarchyError = getHierarchyError(member, target, 'warn');
            if (hierarchyError) {
                await interaction.reply(helpers.privateReply(hierarchyError));
                return;
            }

            const reason = interaction.options.getString('reason', true);
            const entry = createCaseRecord(interaction.guild.id, {
                action: 'warn',
                targetId: target.id,
                moderatorId: interaction.user.id,
                reason,
                targetLabel: `<@${target.id}>`,
            });
            await logModerationCase(interaction.guild, entry);
            await interaction.reply(helpers.privateReply(`Warned <@${target.id}>. ${formatCaseRecord(entry)}`));
            return;
        }

        if (subcommand === 'timeout') {
            const target = await safeFetchMember(interaction, 'member');
            const hierarchyError = getHierarchyError(member, target, 'timeout');
            const botError = getBotTargetError(target, 'timeout', 'timeout');
            if (hierarchyError || botError) {
                await interaction.reply(helpers.privateReply(hierarchyError || botError));
                return;
            }

            const minutes = interaction.options.getInteger('minutes', true);
            const reason = interaction.options.getString('reason', true);
            await target.timeout(minutes * 60 * 1000, reason);
            const entry = createCaseRecord(interaction.guild.id, {
                action: `timeout ${minutes}m`,
                targetId: target.id,
                moderatorId: interaction.user.id,
                reason,
                targetLabel: `<@${target.id}>`,
            });
            await logModerationCase(interaction.guild, entry);
            await interaction.reply(helpers.privateReply(`Timed out <@${target.id}> for ${minutes} minutes.`));
            return;
        }

        if (subcommand === 'untimeout') {
            const target = await safeFetchMember(interaction, 'member');
            const hierarchyError = getHierarchyError(member, target, 'remove the timeout from');
            const botError = getBotTargetError(target, 'remove the timeout from', 'timeout');
            if (hierarchyError || botError) {
                await interaction.reply(helpers.privateReply(hierarchyError || botError));
                return;
            }

            const reason = interaction.options.getString('reason') || 'Timeout removed.';
            await target.timeout(null, reason);
            const entry = createCaseRecord(interaction.guild.id, {
                action: 'untimeout',
                targetId: target.id,
                moderatorId: interaction.user.id,
                reason,
                targetLabel: `<@${target.id}>`,
            });
            await logModerationCase(interaction.guild, entry);
            await interaction.reply(helpers.privateReply(`Removed timeout from <@${target.id}>.`));
            return;
        }

        if (subcommand === 'kick') {
            const target = await safeFetchMember(interaction, 'member');
            const hierarchyError = getHierarchyError(member, target, 'kick');
            const botError = getBotTargetError(target, 'kick', 'kick');
            if (hierarchyError || botError) {
                await interaction.reply(helpers.privateReply(hierarchyError || botError));
                return;
            }

            const reason = interaction.options.getString('reason', true);
            await target.kick(reason);
            const entry = createCaseRecord(interaction.guild.id, {
                action: 'kick',
                targetId: target.id,
                moderatorId: interaction.user.id,
                reason,
                targetLabel: `<@${target.id}>`,
            });
            await logModerationCase(interaction.guild, entry);
            await interaction.reply(helpers.privateReply(`Kicked <@${target.id}>.`));
            return;
        }

        if (subcommand === 'ban') {
            const target = interaction.options.getUser('member', true);
            const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
            const hierarchyError = targetMember ? getHierarchyError(member, targetMember, 'ban') : (target.id === interaction.user.id ? 'You cannot ban yourself.' : null);
            const botError = getBotTargetError(targetMember, 'ban', 'ban');
            if (hierarchyError || botError) {
                await interaction.reply(helpers.privateReply(hierarchyError || botError));
                return;
            }

            const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
            const reason = interaction.options.getString('reason', true);
            await interaction.guild.members.ban(target.id, { deleteMessageSeconds: deleteDays * 24 * 60 * 60, reason });
            const entry = createCaseRecord(interaction.guild.id, {
                action: 'ban',
                targetId: target.id,
                moderatorId: interaction.user.id,
                reason,
                targetLabel: `<@${target.id}>`,
            });
            await logModerationCase(interaction.guild, entry);
            await interaction.reply(helpers.privateReply(`Banned <@${target.id}>.`));
            return;
        }

        if (subcommand === 'unban') {
            const userId = interaction.options.getString('user_id', true);
            const reason = interaction.options.getString('reason') || 'No reason provided';
            await interaction.guild.members.unban(userId, reason);
            const entry = createCaseRecord(interaction.guild.id, {
                action: 'unban',
                targetId: userId,
                moderatorId: interaction.user.id,
                reason,
                targetLabel: userId,
            });
            await logModerationCase(interaction.guild, entry);
            await interaction.reply(helpers.privateReply(`Unbanned ${userId}.`));
            return;
        }

        if (subcommand === 'purge') {
            const amount = interaction.options.getInteger('amount', true);
            const target = interaction.options.getUser('member');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            let toDelete = [...messages.values()].filter(message => !message.pinned).slice(0, amount);
            if (target) toDelete = toDelete.filter(message => message.author.id === target.id).slice(0, amount);
            const deleted = await interaction.channel.bulkDelete(toDelete, true);
            const entry = createCaseRecord(interaction.guild.id, {
                action: `purge ${deleted.size}`,
                targetId: target?.id || interaction.guild.id,
                moderatorId: interaction.user.id,
                reason,
            });
            await logModerationCase(interaction.guild, entry);
            await interaction.reply(helpers.privateReply(`Deleted ${deleted.size} messages.`));
            return;
        }

        if (subcommand === 'history') {
            const target = interaction.options.getUser('member', true);
            const history = state.getModlog(interaction.guild.id).cases.filter(entry => entry.targetId === target.id).slice(-10);
            if (history.length === 0) {
                await interaction.reply(helpers.privateReply(`No infractions recorded for <@${target.id}>.`));
                return;
            }

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`Moderation History for ${target.username}`)
                        .setDescription(history.map(formatCaseRecord).join('\n').slice(0, 4000))
                        .setColor(0xED4245)
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (subcommand !== 'bulk-role') return;

        const action = interaction.options.getString('action', true);
        const targetRole = interaction.options.getRole('target_role', true);
        const sourceRole = interaction.options.getRole('source_role', true);
        const reason = interaction.options.getString('reason') || 'Bulk role update';
        const roleError = await getRoleManagementError(interaction.guild, targetRole, 'bulk role updates');
        if (roleError) {
            await interaction.reply(helpers.privateReply(roleError));
            return;
        }

        if (sourceRole.id === targetRole.id) {
            await interaction.reply(helpers.privateReply('Source role and target role must be different for bulk role updates.'));
            return;
        }

        await interaction.guild.members.fetch();
        const members = interaction.guild.members.cache.filter(existingMember => existingMember.roles.cache.has(sourceRole.id));

        let affected = 0;
        let skipped = 0;
        for (const guildMember of members.values()) {
            if (!guildMember.manageable) {
                skipped += 1;
                continue;
            }

            if (interaction.guild.ownerId !== interaction.user.id && member.roles.highest.comparePositionTo(guildMember.roles.highest) <= 0) {
                skipped += 1;
                continue;
            }

            if (action === 'add' && !guildMember.roles.cache.has(targetRole.id)) {
                await guildMember.roles.add(targetRole, reason).catch(() => {});
                affected += 1;
            }

            if (action === 'remove' && guildMember.roles.cache.has(targetRole.id)) {
                await guildMember.roles.remove(targetRole, reason).catch(() => {});
                affected += 1;
            }
        }

        const entry = createCaseRecord(interaction.guild.id, {
            action: `bulk-role ${action}`,
            targetId: sourceRole.id,
            moderatorId: interaction.user.id,
            reason: `${reason} | target ${targetRole.name} | source ${sourceRole.name}`,
            targetLabel: `source role ${sourceRole.name}`,
        });
        await logModerationCase(interaction.guild, entry);
        await interaction.reply(helpers.privateReply(`Bulk role ${action} completed for ${affected} members. Skipped ${skipped}.`));
    }

    return {
        restoreScheduledTasks,
        handleMessageCreate,
        handleMessageDelete,
        handleMessageDeleteBulk,
        handleMessageUpdate,
        handleGuildMemberAdd,
        handleGuildMemberRemove,
        handleGuildMemberUpdate,
        handleGuildBanAdd,
        handleGuildBanRemove,
        handleChannelCreate,
        handleChannelDelete,
        handleChannelUpdate,
        handleRoleCreate,
        handleRoleDelete,
        handleRoleUpdate,
        handleEmojiCreate,
        handleEmojiDelete,
        handleEmojiUpdate,
        handleReactionAdd,
        handleReactionRemove,
        handleInteraction,
    };
}

module.exports = { createCommunityFeature };