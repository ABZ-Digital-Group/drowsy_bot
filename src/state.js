const fs = require('fs');
const path = require('path');

function createState(config) {
    fs.mkdirSync(config.RECORDINGS_DIR, { recursive: true });
    fs.mkdirSync(config.ASSETS_DIR, { recursive: true });
    fs.mkdirSync(config.DATA_DIR, { recursive: true });

    function readJsonFile(filePath, fallbackValue) {
        if (!fs.existsSync(filePath)) return fallbackValue;

        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            console.error(`Failed to parse ${path.basename(filePath)}:`, error);
            return fallbackValue;
        }
    }

    function writeJsonFile(filePath, value) {
        fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    }

    function loadAllowedInviteUsers() {
        const parsed = readJsonFile(config.FILES.allowedInvites, []);
        if (Array.isArray(parsed)) return new Set(parsed);
        if (parsed && Array.isArray(parsed.users)) return new Set(parsed.users);
        return new Set();
    }

    const guildConfigs = readJsonFile(config.FILES.guildConfig, {});
    const memberStatsStore = readJsonFile(config.FILES.memberStats, {});
    const reactionRoleStore = readJsonFile(config.FILES.reactionRoles, {});
    const modlogStore = readJsonFile(config.FILES.modlog, {});
    const stickyRoleStore = readJsonFile(config.FILES.stickyRoles, {});
    const temporaryReactionRoleStore = readJsonFile(config.FILES.temporaryRoles, {});

    const state = {
        guildConfigs,
        memberStatsStore,
        reactionRoleStore,
        modlogStore,
        stickyRoleStore,
        temporaryReactionRoleStore,
        allowedInviteUsers: loadAllowedInviteUsers(),
        channelData: new Map(),
        selfDestructTimers: new Map(),
        temporaryRoleTimers: new Map(),
        saveAllowedInviteUsers() {
            writeJsonFile(config.FILES.allowedInvites, { users: [...state.allowedInviteUsers] });
        },
        persistGuildConfigs() {
            writeJsonFile(config.FILES.guildConfig, state.guildConfigs);
        },
        persistMemberStatsStore() {
            writeJsonFile(config.FILES.memberStats, state.memberStatsStore);
        },
        persistReactionRoles() {
            writeJsonFile(config.FILES.reactionRoles, state.reactionRoleStore);
        },
        persistModlogStore() {
            writeJsonFile(config.FILES.modlog, state.modlogStore);
        },
        persistStickyRoleStore() {
            writeJsonFile(config.FILES.stickyRoles, state.stickyRoleStore);
        },
        persistTemporaryReactionRoleStore() {
            writeJsonFile(config.FILES.temporaryRoles, state.temporaryReactionRoleStore);
        },
        getGuildConfig(guildId) {
            if (!state.guildConfigs[guildId]) {
                state.guildConfigs[guildId] = {
                    logging: {
                        messageChannelId: null,
                        inviteChannelId: null,
                        memberChannelId: null,
                        serverChannelId: null,
                        modChannelId: null,
                        dramaChannelId: null,
                        highlightChannelId: null,
                    },
                    ignoredChannelIds: [],
                    ignoredMemberIds: [],
                    ignoredPrefixes: [],
                    reactionRoles: {
                        defaultUnique: false,
                    },
                    stats: {
                        channels: {},
                    },
                    moderation: {
                        mutedRoleId: null,
                        stickyRoleIds: [],
                    },
                };
            }

            if (!state.guildConfigs[guildId].logging) {
                state.guildConfigs[guildId].logging = {
                    messageChannelId: null,
                    inviteChannelId: null,
                    memberChannelId: null,
                    serverChannelId: null,
                    modChannelId: null,
                    dramaChannelId: null,
                    highlightChannelId: null,
                };
            }

            if (!state.guildConfigs[guildId].ignoredChannelIds) state.guildConfigs[guildId].ignoredChannelIds = [];
            if (!state.guildConfigs[guildId].ignoredMemberIds) state.guildConfigs[guildId].ignoredMemberIds = [];
            if (!state.guildConfigs[guildId].ignoredPrefixes) state.guildConfigs[guildId].ignoredPrefixes = [];
            if (!state.guildConfigs[guildId].reactionRoles) state.guildConfigs[guildId].reactionRoles = { defaultUnique: false };
            if (typeof state.guildConfigs[guildId].reactionRoles.defaultUnique !== 'boolean') {
                state.guildConfigs[guildId].reactionRoles.defaultUnique = false;
            }
            if (!state.guildConfigs[guildId].stats) state.guildConfigs[guildId].stats = { channels: {} };
            if (!state.guildConfigs[guildId].stats.channels) state.guildConfigs[guildId].stats.channels = {};
            if (!state.guildConfigs[guildId].moderation) {
                state.guildConfigs[guildId].moderation = {
                    mutedRoleId: null,
                    stickyRoleIds: [],
                };
            }
            if (!Array.isArray(state.guildConfigs[guildId].moderation.stickyRoleIds)) {
                state.guildConfigs[guildId].moderation.stickyRoleIds = [];
            }
            if (!Object.prototype.hasOwnProperty.call(state.guildConfigs[guildId].moderation, 'mutedRoleId')) {
                state.guildConfigs[guildId].moderation.mutedRoleId = null;
            }

            return state.guildConfigs[guildId];
        },
        getModlog(guildId) {
            if (!state.modlogStore[guildId]) {
                state.modlogStore[guildId] = { nextCaseNumber: 1, cases: [] };
            }

            return state.modlogStore[guildId];
        },
        getGuildMemberStats(guildId) {
            if (!state.memberStatsStore[guildId]) {
                state.memberStatsStore[guildId] = { users: {} };
            }

            if (!state.memberStatsStore[guildId].users) {
                state.memberStatsStore[guildId].users = {};
            }

            return state.memberStatsStore[guildId];
        },
        getMemberStats(guildId, userId) {
            const guildStats = state.getGuildMemberStats(guildId);
            if (!guildStats.users[userId]) {
                guildStats.users[userId] = {
                    messages: {
                        total: 0,
                        daily: {},
                        channels: {},
                    },
                    voice: {
                        totalSeconds: 0,
                        daily: {},
                        channels: {},
                    },
                };
            }

            const userStats = guildStats.users[userId];
            if (!userStats.messages) {
                userStats.messages = { total: 0, daily: {}, channels: {} };
            }
            if (typeof userStats.messages.total !== 'number') userStats.messages.total = 0;
            if (!userStats.messages.daily) userStats.messages.daily = {};
            if (!userStats.messages.channels) userStats.messages.channels = {};

            if (!userStats.voice) {
                userStats.voice = { totalSeconds: 0, daily: {}, channels: {} };
            }
            if (typeof userStats.voice.totalSeconds !== 'number') userStats.voice.totalSeconds = 0;
            if (!userStats.voice.daily) userStats.voice.daily = {};
            if (!userStats.voice.channels) userStats.voice.channels = {};

            return userStats;
        },
        getStickyRolesForGuild(guildId) {
            if (!state.stickyRoleStore[guildId]) state.stickyRoleStore[guildId] = {};
            return state.stickyRoleStore[guildId];
        },
        getTemporaryRoleAssignments(guildId) {
            if (!state.temporaryReactionRoleStore[guildId]) state.temporaryReactionRoleStore[guildId] = [];
            return state.temporaryReactionRoleStore[guildId];
        },
        getReactionRoleGuildState(guildId) {
            if (!state.reactionRoleStore[guildId]) state.reactionRoleStore[guildId] = { messages: {} };
            if (!state.reactionRoleStore[guildId].messages) state.reactionRoleStore[guildId].messages = {};
            return state.reactionRoleStore[guildId];
        },
        getReactionRoleMessageConfig(guildId, messageId) {
            return state.getReactionRoleGuildState(guildId).messages[messageId] ?? null;
        },
        getChannelData(channelId) {
            if (!state.channelData.has(channelId)) {
                state.channelData.set(channelId, {
                    queue: [],
                    currentSpeaker: null,
                    lastMessageId: null,
                    activeHypeCollector: null,
                    radioPlayer: null,
                    voiceConnection: null,
                    targetVC: null,
                });
            }

            return state.channelData.get(channelId);
        },
    };

    return state;
}

module.exports = { createState };