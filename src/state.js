const fs = require('fs');
const path = require('path');

function createState(config) {
    fs.mkdirSync(config.ASSETS_DIR, { recursive: true });
    fs.mkdirSync(config.ADS_DIR, { recursive: true });
    fs.mkdirSync(config.DATA_DIR, { recursive: true });

    if (!fs.existsSync(config.FILES.obsNowSinging)) {
        fs.writeFileSync(config.FILES.obsNowSinging, 'Show Offline\n', 'utf8');
    }

    if (!fs.existsSync(config.FILES.obsNowSingingJson)) {
        fs.writeFileSync(config.FILES.obsNowSingingJson, JSON.stringify({
            text: 'Show Offline',
            avatarUrl: null,
        }, null, 2));
    }

    if (!fs.existsSync(config.FILES.obsAds)) {
        fs.writeFileSync(config.FILES.obsAds, JSON.stringify({
            items: [],
            activeId: null,
            rotationIntervalMs: null,
            rotationStartedAt: null,
        }, null, 2));
    }

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

    function loadAdvertisementState() {
        const parsed = readJsonFile(config.FILES.obsAds, {
            items: [],
            activeId: null,
            rotationIntervalMs: null,
            rotationStartedAt: null,
        });
        const items = Array.isArray(parsed?.items)
            ? parsed.items.filter(item => item && typeof item.id === 'string' && typeof item.fileName === 'string')
            : [];
        const activeId = typeof parsed?.activeId === 'string' ? parsed.activeId : null;
        const rotationIntervalMs = Number.isInteger(parsed?.rotationIntervalMs) && parsed.rotationIntervalMs > 0
            ? parsed.rotationIntervalMs
            : null;
        const rotationStartedAt = typeof parsed?.rotationStartedAt === 'string' ? parsed.rotationStartedAt : null;
        return {
            items,
            activeId: items.some(item => item.id === activeId) ? activeId : items[0]?.id ?? null,
            rotationIntervalMs,
            rotationStartedAt,
        };
    }

    const guildConfigs = readJsonFile(config.FILES.guildConfig, {});
    const advertisementState = loadAdvertisementState();

    const state = {
        guildConfigs,
        allowedInviteUsers: loadAllowedInviteUsers(),
        advertisements: advertisementState,
        guildStageSessions: new Map(),
        saveAllowedInviteUsers() {
            writeJsonFile(config.FILES.allowedInvites, { users: [...state.allowedInviteUsers] });
        },
        saveAdvertisements() {
            writeJsonFile(config.FILES.obsAds, state.advertisements);
        },
        getAdvertisements() {
            return state.advertisements.items;
        },
        getActiveAdvertisement() {
            return state.advertisements.items.find(item => item.id === state.advertisements.activeId) ?? null;
        },
        addAdvertisement(advertisement) {
            state.advertisements.items.push(advertisement);
            state.advertisements.activeId = advertisement.id;
            state.advertisements.rotationStartedAt = new Date().toISOString();
            state.saveAdvertisements();
        },
        setActiveAdvertisementByIndex(index) {
            const item = state.advertisements.items[index] ?? null;
            if (!item) return null;
            state.advertisements.activeId = item.id;
            state.advertisements.rotationStartedAt = new Date().toISOString();
            state.saveAdvertisements();
            return item;
        },
        setAdvertisementRotationIntervalMs(intervalMs) {
            state.advertisements.rotationIntervalMs = intervalMs;
            state.advertisements.rotationStartedAt = new Date().toISOString();
            state.saveAdvertisements();
        },
        removeAdvertisementByIndex(index) {
            const [removed] = state.advertisements.items.splice(index, 1);
            if (!removed) return null;

            if (state.advertisements.activeId === removed.id) {
                state.advertisements.activeId = state.advertisements.items[index]?.id
                    ?? state.advertisements.items[index - 1]?.id
                    ?? null;
            }

            if (state.advertisements.items.length < 2) {
                state.advertisements.rotationIntervalMs = null;
            }

            state.advertisements.rotationStartedAt = new Date().toISOString();

            state.saveAdvertisements();
            return removed;
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
                    adMessageIds: new Map(),
                    panelChannelIds: new Set(),
                    radioPlayer: null,
                    voiceConnection: null,
                    lastAdvertisementSignature: null,
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
