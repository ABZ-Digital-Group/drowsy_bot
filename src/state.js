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

    const state = {
        guildConfigs,
        memberStatsStore,
        allowedInviteUsers: loadAllowedInviteUsers(),
        channelData: new Map(),
        saveAllowedInviteUsers() {
            writeJsonFile(config.FILES.allowedInvites, { users: [...state.allowedInviteUsers] });
        },
        persistGuildConfigs() {
            writeJsonFile(config.FILES.guildConfig, state.guildConfigs);
        },
        persistMemberStatsStore() {
            writeJsonFile(config.FILES.memberStats, state.memberStatsStore);
        },
        getGuildConfig(guildId) {
            if (!state.guildConfigs[guildId]) {
                state.guildConfigs[guildId] = {
                    stats: {
                        channels: {},
                    },
                };
            }

            if (!state.guildConfigs[guildId].stats) state.guildConfigs[guildId].stats = { channels: {} };
            if (!state.guildConfigs[guildId].stats.channels) state.guildConfigs[guildId].stats.channels = {};

            return state.guildConfigs[guildId];
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
