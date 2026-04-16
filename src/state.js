const fs = require('fs');
const path = require('path');

function createState(config) {
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

    const state = {
        guildConfigs,
        allowedInviteUsers: loadAllowedInviteUsers(),
        guildStageSessions: new Map(),
        saveAllowedInviteUsers() {
            writeJsonFile(config.FILES.allowedInvites, { users: [...state.allowedInviteUsers] });
        },
        persistGuildConfigs() {
            writeJsonFile(config.FILES.guildConfig, state.guildConfigs);
        },
        getGuildConfig(guildId) {
            if (!state.guildConfigs[guildId]) {
                state.guildConfigs[guildId] = {};
            }

            return state.guildConfigs[guildId];
        },
        getGuildStageSession(guildId) {
            if (!state.guildStageSessions.has(guildId)) {
                state.guildStageSessions.set(guildId, {
                    queue: [],
                    currentSpeaker: null,
                    panelMessageIds: new Map(),
                    panelChannelIds: new Set(),
                    radioPlayer: null,
                    voiceConnection: null,
                    targetVC: null,
                });
            }

            return state.guildStageSessions.get(guildId);
        },
        peekGuildStageSession(guildId) {
            return state.guildStageSessions.get(guildId) ?? null;
        },
        clearGuildStageSession(guildId) {
            state.guildStageSessions.delete(guildId);
        },
    };

    return state;
}

module.exports = { createState };
