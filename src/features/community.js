const {
    AttachmentBuilder,
    ChannelType,
    EmbedBuilder,
    GuildScheduledEventStatus,
    MessageFlags,
} = require('discord.js');
const { PNG } = require('pngjs');

const STATS_METRIC_LABELS = {
    members: 'Members',
    humans: 'Humans',
    bots: 'Bots',
    channels: 'Channels',
    text_channels: 'Text Channels',
    voice_channels: 'Voice Channels',
    roles: 'Roles',
    in_voice: 'In Voice',
};

const TEXT_CHANNEL_TYPES = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
].filter(type => typeof type !== 'undefined'));

const VOICE_CHANNEL_TYPES = new Set([
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
]);

function createCommunityFeature({ client, config, state, helpers, stageFeature }) {
    const statsRefreshTimers = new Map();
    const activeVoiceSessions = new Map();

    function buildAddMoneyCommand(balanceTarget, userId, amount) {
        const commandParts = ['!add-money'];
        if (balanceTarget) commandParts.push(balanceTarget);
        commandParts.push(`<@${userId}>`, String(amount));
        return commandParts.join(' ');
    }

    function parseAddMoneyMessage(content) {
        const trimmed = content.trim();
        const match = trimmed.match(/^add-money(?:\s+(cash|bank))?\s+(<@!?(\d{17,20})>|(\d{17,20}))\s+(\d+)$/i);
        if (!match) return null;

        return {
            balanceTarget: match[1]?.toLowerCase() ?? null,
            userId: match[3] ?? match[4],
            amount: Number(match[5]),
        };
    }

    function getDateKey(timestamp = Date.now()) {
        return new Date(timestamp).toISOString().slice(0, 10);
    }

    function getLastDateKeys(days, timestamp = Date.now()) {
        const keys = [];
        const end = new Date(timestamp);
        end.setUTCHours(0, 0, 0, 0);

        for (let index = days - 1; index >= 0; index -= 1) {
            const current = new Date(end);
            current.setUTCDate(end.getUTCDate() - index);
            keys.push(current.toISOString().slice(0, 10));
        }

        return keys;
    }

    function incrementCounter(map, key, amount) {
        map[key] = (map[key] ?? 0) + amount;
    }

    function getVoiceSessionKey(guildId, userId) {
        return `${guildId}:${userId}`;
    }

    function getStatsConfig(guildId) {
        const guildConfig = state.getGuildConfig(guildId);
        if (!guildConfig.stats) guildConfig.stats = { channels: {} };
        if (!guildConfig.stats.channels) guildConfig.stats.channels = {};
        return guildConfig.stats;
    }

    function trackMessageStats(message) {
        if (!message.guild || !message.author || message.author.bot) return;

        const userStats = state.getMemberStats(message.guild.id, message.author.id);
        const dateKey = getDateKey();
        userStats.messages.total += 1;
        incrementCounter(userStats.messages.daily, dateKey, 1);
        incrementCounter(userStats.messages.channels, message.channelId, 1);
        state.persistMemberStatsStore();
    }

    function beginVoiceSession(guildId, userId, channelId, startedAt = Date.now()) {
        activeVoiceSessions.set(getVoiceSessionKey(guildId, userId), { channelId, startedAt });
    }

    function finalizeVoiceSession(guildId, userId, endedAt = Date.now()) {
        const key = getVoiceSessionKey(guildId, userId);
        const session = activeVoiceSessions.get(key);
        if (!session) return;

        activeVoiceSessions.delete(key);
        const durationSeconds = Math.max(Math.round((endedAt - session.startedAt) / 1000), 0);
        if (durationSeconds <= 0) return;

        const userStats = state.getMemberStats(guildId, userId);
        const dateKey = getDateKey(endedAt);
        userStats.voice.totalSeconds += durationSeconds;
        incrementCounter(userStats.voice.daily, dateKey, durationSeconds);
        incrementCounter(userStats.voice.channels, session.channelId, durationSeconds);
        state.persistMemberStatsStore();
    }

    function getLookbackValue(dailyMap, days) {
        return getLastDateKeys(days).reduce((sum, key) => sum + (dailyMap[key] ?? 0), 0);
    }

    function formatDurationHours(totalSeconds) {
        const hours = totalSeconds / 3600;
        if (hours >= 10) return `${hours.toFixed(2)}h`;
        if (hours >= 1) return `${hours.toFixed(1)}h`;
        const minutes = totalSeconds / 60;
        if (minutes >= 10) return `${minutes.toFixed(0)}m`;
        return `${minutes.toFixed(1)}m`;
    }

    function formatDurationVerbose(totalSeconds) {
        const hours = totalSeconds / 3600;
        return `${hours.toFixed(2)} hours`;
    }

    function getRank(users, userId, selector) {
        const ranked = Object.entries(users)
            .map(([id, stats]) => ({ id, value: selector(stats) }))
            .sort((left, right) => right.value - left.value);

        const index = ranked.findIndex(entry => entry.id === userId);
        return index === -1 ? null : index + 1;
    }

    function getTopEntries(entryMap, count = 3) {
        return Object.entries(entryMap)
            .sort((left, right) => right[1] - left[1])
            .slice(0, count);
    }

    async function buildTopChannelLines(guild, channelMap, formatter) {
        const topChannels = getTopEntries(channelMap);
        if (topChannels.length === 0) return 'No channel activity recorded.';

        const lines = [];
        for (const [channelId, value] of topChannels) {
            const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
            const label = channel ? `<#${channel.id}>` : `Deleted channel (${channelId})`;
            lines.push(`${label} - ${formatter(value)}`);
        }

        return lines.join('\n');
    }

    function setPixel(png, x, y, color) {
        if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
        const index = (png.width * y + x) << 2;
        png.data[index] = color[0];
        png.data[index + 1] = color[1];
        png.data[index + 2] = color[2];
        png.data[index + 3] = color[3];
    }

    function drawRect(png, x, y, width, height, color) {
        for (let yOffset = 0; yOffset < height; yOffset += 1) {
            for (let xOffset = 0; xOffset < width; xOffset += 1) {
                setPixel(png, x + xOffset, y + yOffset, color);
            }
        }
    }

    function drawLine(png, startX, startY, endX, endY, color) {
        const dx = Math.abs(endX - startX);
        const dy = Math.abs(endY - startY);
        const stepX = startX < endX ? 1 : -1;
        const stepY = startY < endY ? 1 : -1;
        let error = dx - dy;

        let x = startX;
        let y = startY;
        while (true) {
            drawRect(png, x - 1, y - 1, 3, 3, color);
            if (x === endX && y === endY) break;
            const error2 = error * 2;
            if (error2 > -dy) {
                error -= dy;
                x += stepX;
            }
            if (error2 < dx) {
                error += dx;
                y += stepY;
            }
        }
    }

    function renderActivityChartBuffer(messageValues, voiceValues) {
        const width = 960;
        const height = 320;
        const paddingLeft = 52;
        const paddingRight = 28;
        const paddingTop = 30;
        const paddingBottom = 42;
        const plotWidth = width - paddingLeft - paddingRight;
        const plotHeight = height - paddingTop - paddingBottom;
        const png = new PNG({ width, height });

        const colors = {
            background: [24, 27, 31, 255],
            panel: [36, 39, 43, 255],
            grid: [68, 73, 80, 255],
            axis: [110, 118, 129, 255],
            message: [87, 242, 135, 255],
            voice: [235, 69, 158, 255],
            fill: [47, 49, 54, 255],
        };

        drawRect(png, 0, 0, width, height, colors.background);
        drawRect(png, 14, 14, width - 28, height - 28, colors.panel);
        drawRect(png, paddingLeft, paddingTop, plotWidth, plotHeight, colors.fill);

        for (let index = 0; index <= 4; index += 1) {
            const y = paddingTop + Math.round((plotHeight / 4) * index);
            drawRect(png, paddingLeft, y, plotWidth, 1, index === 4 ? colors.axis : colors.grid);
        }

        for (let index = 0; index < 14; index += 1) {
            const x = paddingLeft + Math.round((plotWidth / 13) * index);
            drawRect(png, x, paddingTop, 1, plotHeight, index === 0 ? colors.axis : colors.grid);
        }

        const maxValue = Math.max(...messageValues, ...voiceValues, 1);
        const toPoint = (values, index) => {
            const x = paddingLeft + Math.round((plotWidth / 13) * index);
            const y = paddingTop + plotHeight - Math.round((values[index] / maxValue) * plotHeight);
            return { x, y };
        };

        for (let index = 1; index < 14; index += 1) {
            const previousMessagePoint = toPoint(messageValues, index - 1);
            const messagePoint = toPoint(messageValues, index);
            drawLine(png, previousMessagePoint.x, previousMessagePoint.y, messagePoint.x, messagePoint.y, colors.message);

            const previousVoicePoint = toPoint(voiceValues, index - 1);
            const voicePoint = toPoint(voiceValues, index);
            drawLine(png, previousVoicePoint.x, previousVoicePoint.y, voicePoint.x, voicePoint.y, colors.voice);
        }

        for (let index = 0; index < 14; index += 1) {
            const messagePoint = toPoint(messageValues, index);
            const voicePoint = toPoint(voiceValues, index);
            drawRect(png, messagePoint.x - 2, messagePoint.y - 2, 5, 5, colors.message);
            drawRect(png, voicePoint.x - 2, voicePoint.y - 2, 5, 5, colors.voice);
        }

        return PNG.sync.write(png);
    }

    function buildPresenceSummary(targetMember) {
        const activities = targetMember?.presence?.activities ?? [];
        const filteredActivities = activities.filter(activity => activity.name && activity.type !== 4);
        if (filteredActivities.length === 0) {
            return 'No current activities.';
        }

        return filteredActivities.slice(0, 3).map(activity => {
            const prefix = activity.type === 0 ? 'Playing' : activity.type === 1 ? 'Streaming' : activity.type === 2 ? 'Listening to' : activity.type === 3 ? 'Watching' : activity.type === 5 ? 'Competing in' : 'Using';
            return `${prefix}: ${activity.name}`;
        }).join('\n');
    }

    async function buildMemberStatsPayload(guild, targetMember, targetUser) {
        await guild.members.fetch().catch(() => null);

        const guildStats = state.getGuildMemberStats(guild.id);
        const userStats = state.getMemberStats(guild.id, targetUser.id);
        const messageRank = getRank(guildStats.users, targetUser.id, stats => stats.messages?.total ?? 0);
        const voiceRank = getRank(guildStats.users, targetUser.id, stats => stats.voice?.totalSeconds ?? 0);

        const message1d = getLookbackValue(userStats.messages.daily, 1);
        const message7d = getLookbackValue(userStats.messages.daily, 7);
        const message14d = getLookbackValue(userStats.messages.daily, 14);
        const voice1d = getLookbackValue(userStats.voice.daily, 1);
        const voice7d = getLookbackValue(userStats.voice.daily, 7);
        const voice14d = getLookbackValue(userStats.voice.daily, 14);

        const messageChartValues = getLastDateKeys(14).map(key => userStats.messages.daily[key] ?? 0);
        const voiceChartValues = getLastDateKeys(14).map(key => Math.round((userStats.voice.daily[key] ?? 0) / 60));

        const topMessageChannels = await buildTopChannelLines(guild, userStats.messages.channels, value => `${value} messages`);
        const topVoiceChannels = await buildTopChannelLines(guild, userStats.voice.channels, value => formatDurationVerbose(value));

        const displayName = targetMember?.displayName || targetUser.displayName || targetUser.username;
        const roleSummary = targetMember?.roles?.highest && targetMember.roles.highest.id !== guild.id
            ? targetMember.roles.highest.toString()
            : 'No prominent role';

        const attachment = new AttachmentBuilder(renderActivityChartBuffer(messageChartValues, voiceChartValues), {
            name: 'activity-chart.png',
        });

        const embed = new EmbedBuilder()
            .setAuthor({ name: `${displayName} (${targetUser.username})`, iconURL: targetUser.displayAvatarURL() })
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                {
                    name: 'Profile',
                    value: [
                        `Created: <t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`,
                        `Joined: ${targetMember?.joinedTimestamp ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:D>` : 'Unknown'}`,
                        `Top Role: ${roleSummary}`,
                    ].join('\n'),
                },
                {
                    name: 'Server Ranks',
                    value: [
                        `Messages: ${messageRank ? `#${messageRank}` : 'Unranked'}`,
                        `Voice: ${voiceRank ? `#${voiceRank}` : 'Unranked'}`,
                    ].join('\n'),
                    inline: true,
                },
                {
                    name: 'Messages',
                    value: [
                        `1d: ${message1d}`,
                        `7d: ${message7d}`,
                        `14d: ${message14d}`,
                        `Total: ${userStats.messages.total}`,
                    ].join('\n'),
                    inline: true,
                },
                {
                    name: 'Voice Activity',
                    value: [
                        `1d: ${formatDurationHours(voice1d)}`,
                        `7d: ${formatDurationHours(voice7d)}`,
                        `14d: ${formatDurationHours(voice14d)}`,
                        `Total: ${formatDurationHours(userStats.voice.totalSeconds)}`,
                    ].join('\n'),
                    inline: true,
                },
                {
                    name: 'Top Channels',
                    value: [
                        `Text:\n${topMessageChannels}`,
                        `Voice:\n${topVoiceChannels}`,
                    ].join('\n\n'),
                },
                {
                    name: 'Activity',
                    value: buildPresenceSummary(targetMember),
                }
            )
            .setColor(0x5865F2)
            .setFooter({ text: 'Lookback window: 14 days UTC' })
            .setImage('attachment://activity-chart.png')
            .setTimestamp();

        return { embeds: [embed], files: [attachment] };
    }

    async function computeGuildStats(guild, options = {}) {
        if (options.refreshMembers) {
            await guild.members.fetch().catch(() => null);
        }

        const totalMembers = guild.memberCount ?? guild.members.cache.size;
        const botCount = guild.members.cache.filter(member => member.user.bot).size;
        const humanCount = Math.max(totalMembers - botCount, 0);
        const channelCount = guild.channels.cache.filter(channel => channel.type !== ChannelType.GuildCategory).size;
        const textChannelCount = guild.channels.cache.filter(channel => TEXT_CHANNEL_TYPES.has(channel.type)).size;
        const voiceChannelCount = guild.channels.cache.filter(channel => VOICE_CHANNEL_TYPES.has(channel.type)).size;
        const roleCount = guild.roles.cache.filter(role => role.id !== guild.id).size;
        const inVoiceCount = new Set(guild.voiceStates.cache.filter(voiceState => voiceState.channelId).map(voiceState => voiceState.id)).size;

        return {
            members: totalMembers,
            humans: humanCount,
            bots: botCount,
            channels: channelCount,
            text_channels: textChannelCount,
            voice_channels: voiceChannelCount,
            roles: roleCount,
            in_voice: inVoiceCount,
        };
    }

    function formatStatsChannelName(metric, value) {
        return `${STATS_METRIC_LABELS[metric] || metric}: ${value}`;
    }

    function buildServerStatsEmbed(guild, stats, statsConfig) {
        const configuredChannels = Object.entries(statsConfig.channels)
            .map(([metric, channelId]) => `${STATS_METRIC_LABELS[metric] || metric}: <#${channelId}>`)
            .join('\n') || 'No auto-updating stats channels configured.';

        return new EmbedBuilder()
            .setTitle(`${guild.name} Stats`)
            .addFields(
                {
                    name: 'Member Stats',
                    value: [
                        `Members: ${stats.members}`,
                        `Humans: ${stats.humans}`,
                        `Bots: ${stats.bots}`,
                        `In Voice: ${stats.in_voice}`,
                    ].join('\n'),
                    inline: true,
                },
                {
                    name: 'Server Stats',
                    value: [
                        `Channels: ${stats.channels}`,
                        `Text Channels: ${stats.text_channels}`,
                        `Voice Channels: ${stats.voice_channels}`,
                        `Roles: ${stats.roles}`,
                    ].join('\n'),
                    inline: true,
                },
                {
                    name: 'Configured Stat Channels',
                    value: configuredChannels,
                }
            )
            .setColor(0x57F287)
            .setTimestamp();
    }

    async function refreshConfiguredStatsForGuild(guild, options = {}) {
        const statsConfig = getStatsConfig(guild.id);
        const bindings = Object.entries(statsConfig.channels);
        if (bindings.length === 0) {
            return { updated: 0, removed: 0, missingPermissions: 0, stats: await computeGuildStats(guild, options) };
        }

        const stats = await computeGuildStats(guild, options);
        let updated = 0;
        let removed = 0;
        let missingPermissions = 0;
        let didMutateConfig = false;

        for (const [metric, channelId] of bindings) {
            const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                delete statsConfig.channels[metric];
                removed += 1;
                didMutateConfig = true;
                continue;
            }

            if (!VOICE_CHANNEL_TYPES.has(channel.type)) {
                missingPermissions += 1;
                continue;
            }

            const nextName = formatStatsChannelName(metric, stats[metric] ?? 0);
            if (channel.name === nextName) continue;
            if (!channel.manageable) {
                missingPermissions += 1;
                continue;
            }

            await channel.setName(nextName, 'Refreshing server stats.').then(() => {
                updated += 1;
            }).catch(() => {
                missingPermissions += 1;
            });
        }

        if (didMutateConfig) state.persistGuildConfigs();
        return { updated, removed, missingPermissions, stats };
    }

    function scheduleStatsRefresh(guild, options = {}) {
        const statsConfig = getStatsConfig(guild.id);
        if (Object.keys(statsConfig.channels).length === 0) return;

        const key = guild.id;
        if (statsRefreshTimers.has(key)) clearTimeout(statsRefreshTimers.get(key));

        const timer = setTimeout(() => {
            refreshConfiguredStatsForGuild(guild, options).catch(error => {
                console.error('Failed to refresh server stats:', error);
            }).finally(() => {
                statsRefreshTimers.delete(key);
            });
        }, 3000);

        statsRefreshTimers.set(key, timer);
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

    function buildStatsBindingList(statsConfig) {
        return Object.entries(statsConfig.channels)
            .map(([metric, channelId]) => `${STATS_METRIC_LABELS[metric] || metric}: <#${channelId}>`)
            .join('\n') || 'No stats channels configured.';
    }

    async function restoreScheduledTasks() {
        for (const guild of client.guilds.cache.values()) {
            await refreshConfiguredStatsForGuild(guild, { refreshMembers: true }).catch(error => {
                console.error('Failed to initialize server stats:', error);
            });

            for (const voiceState of guild.voiceStates.cache.values()) {
                if (voiceState.channelId && !voiceState.member?.user?.bot) {
                    beginVoiceSession(guild.id, voiceState.id, voiceState.channelId);
                }
            }
        }
    }

    async function handleMessageCreate(message) {
        if (message.author.bot) return;
        if (message.guild) trackMessageStats(message);

        if (message.guild) {
            const addMoneyCommand = parseAddMoneyMessage(message.content);
            if (addMoneyCommand) {
                if (!helpers.isStaff(message.member)) {
                    await message.reply('Staff only.');
                    return;
                }

                const relayedCommand = buildAddMoneyCommand(addMoneyCommand.balanceTarget, addMoneyCommand.userId, addMoneyCommand.amount);
                await message.channel.send(relayedCommand);
                return;
            }
        }

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

    async function handleGuildMemberAdd(member) {
        scheduleStatsRefresh(member.guild);
    }

    async function handleGuildMemberRemove(member) {
        finalizeVoiceSession(member.guild.id, member.id);
        scheduleStatsRefresh(member.guild);
    }

    async function handleChannelCreate(channel) {
        if (!channel.guild) return;
        scheduleStatsRefresh(channel.guild);
    }

    async function handleChannelDelete(channel) {
        if (!channel.guild) return;
        scheduleStatsRefresh(channel.guild);
    }

    async function handleRoleCreate(role) {
        scheduleStatsRefresh(role.guild);
    }

    async function handleRoleDelete(role) {
        scheduleStatsRefresh(role.guild);
    }

    async function handleVoiceStateUpdate(oldState, newState) {
        const guild = newState.guild ?? oldState.guild;
        if (!guild) return;

        const memberId = newState.id ?? oldState.id;
        const wasBot = newState.member?.user?.bot ?? oldState.member?.user?.bot;
        if (!wasBot && oldState.channelId !== newState.channelId) {
            if (oldState.channelId) finalizeVoiceSession(guild.id, memberId);
            if (newState.channelId) beginVoiceSession(guild.id, memberId, newState.channelId);
        }

        if (oldState.channelId === newState.channelId) return;
        scheduleStatsRefresh(guild);
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
            'add-money',
        ]);

        const isStaffStatsSubcommand = interaction.commandName === 'server-stats'
            && new Set(['show', 'channel', 'remove', 'refresh', 'list']).has(interaction.options.getSubcommand());

        if ((staffOnlyCommands.has(interaction.commandName) || isStaffStatsSubcommand) && !helpers.isStaff(member)) {
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

        if (interaction.commandName === 'add-money') {
            const balanceTarget = interaction.options.getString('target');
            const targetUser = interaction.options.getUser('member', true);
            const amount = interaction.options.getInteger('amount', true);
            const relayedCommand = buildAddMoneyCommand(balanceTarget, targetUser.id, amount);

            await interaction.channel.send(relayedCommand);
            await interaction.reply(helpers.privateReply(`Relayed ${relayedCommand}`));
            return;
        }

        if (interaction.commandName !== 'server-stats') return;

        const subcommand = interaction.options.getSubcommand();
        const statsConfig = getStatsConfig(interaction.guild.id);

        if (subcommand === 'user') {
            const targetUser = interaction.options.getUser('member') ?? interaction.user;
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            const payload = await buildMemberStatsPayload(interaction.guild, targetMember, targetUser);
            await interaction.reply(payload);
            return;
        }

        if (subcommand === 'show') {
            const stats = await computeGuildStats(interaction.guild, { refreshMembers: true });
            await interaction.reply({ embeds: [buildServerStatsEmbed(interaction.guild, stats, statsConfig)], flags: MessageFlags.Ephemeral });
            return;
        }

        if (subcommand === 'channel') {
            const metric = interaction.options.getString('metric', true);
            const channel = interaction.options.getChannel('channel', true);

            if (!VOICE_CHANNEL_TYPES.has(channel.type)) {
                await interaction.reply(helpers.privateReply('Stats channels must be a voice or stage channel.'));
                return;
            }

            if (!channel.manageable) {
                await interaction.reply(helpers.privateReply('I cannot rename that channel because it is above my highest role or managed by Discord.'));
                return;
            }

            statsConfig.channels[metric] = channel.id;
            state.persistGuildConfigs();
            const result = await refreshConfiguredStatsForGuild(interaction.guild, { refreshMembers: true });
            await interaction.reply(helpers.privateReply(`Configured ${STATS_METRIC_LABELS[metric]} to update <#${channel.id}>. Refreshed ${result.updated} channel names.`));
            return;
        }

        if (subcommand === 'remove') {
            const metric = interaction.options.getString('metric', true);
            const removed = Boolean(statsConfig.channels[metric]);
            delete statsConfig.channels[metric];
            state.persistGuildConfigs();
            await interaction.reply(helpers.privateReply(
                removed
                    ? `Removed the ${STATS_METRIC_LABELS[metric]} stats channel binding.`
                    : `No stats channel is configured for ${STATS_METRIC_LABELS[metric]}.`
            ));
            return;
        }

        if (subcommand === 'refresh') {
            const result = await refreshConfiguredStatsForGuild(interaction.guild, { refreshMembers: true });
            await interaction.reply(helpers.privateReply(`Stats refresh complete. Updated ${result.updated} channels, removed ${result.removed} stale bindings, and hit ${result.missingPermissions} permission or channel issues.`));
            return;
        }

        await interaction.reply(helpers.privateReply(buildStatsBindingList(statsConfig)));
    }

    return {
        restoreScheduledTasks,
        handleMessageCreate,
        handleGuildMemberAdd,
        handleGuildMemberRemove,
        handleChannelCreate,
        handleChannelDelete,
        handleRoleCreate,
        handleRoleDelete,
        handleVoiceStateUpdate,
        handleInteraction,
    };
}

module.exports = { createCommunityFeature };