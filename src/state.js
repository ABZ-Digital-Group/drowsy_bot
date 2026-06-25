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

    if (!fs.existsSync(config.FILES.voiceHours)) {
        fs.writeFileSync(config.FILES.voiceHours, JSON.stringify({
            sessions: [],
            active: {},
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

    function getVoiceHoursKey(guildId, userId) {
        return `${guildId}:${userId}`;
    }

    function normalizeIsoDate(value) {
        const timestamp = Date.parse(value ?? '');
        return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
    }

    function loadVoiceHoursState() {
        const parsed = readJsonFile(config.FILES.voiceHours, {
            sessions: [],
            active: {},
        });
        const sessions = Array.isArray(parsed?.sessions)
            ? parsed.sessions
                .map(session => ({
                    guildId: typeof session?.guildId === 'string' ? session.guildId : null,
                    userId: typeof session?.userId === 'string' ? session.userId : null,
                    channelId: typeof session?.channelId === 'string' ? session.channelId : null,
                    startedAt: normalizeIsoDate(session?.startedAt),
                    endedAt: normalizeIsoDate(session?.endedAt),
                }))
                .filter(session => session.guildId && session.userId && session.startedAt && session.endedAt)
            : [];
        const active = {};

        if (parsed?.active && typeof parsed.active === 'object') {
            for (const [key, session] of Object.entries(parsed.active)) {
                const guildId = typeof session?.guildId === 'string' ? session.guildId : key.split(':')[0];
                const userId = typeof session?.userId === 'string' ? session.userId : key.split(':')[1];
                const startedAt = normalizeIsoDate(session?.startedAt);
                if (!guildId || !userId || !startedAt) continue;

                active[getVoiceHoursKey(guildId, userId)] = {
                    guildId,
                    userId,
                    channelId: typeof session?.channelId === 'string' ? session.channelId : null,
                    startedAt,
                };
            }
        }

        return { sessions, active };
    }

    const guildConfigs = readJsonFile(config.FILES.guildConfig, {});
    const advertisementState = loadAdvertisementState();
    const voiceHoursState = loadVoiceHoursState();

    const state = {
        guildConfigs,
        allowedInviteUsers: loadAllowedInviteUsers(),
        advertisements: advertisementState,
        voiceHours: voiceHoursState,
        guildStageSessions: new Map(),
        saveAllowedInviteUsers() {
            writeJsonFile(config.FILES.allowedInvites, { users: [...state.allowedInviteUsers] });
        },
        saveAdvertisements() {
            writeJsonFile(config.FILES.obsAds, state.advertisements);
        },
        saveVoiceHours() {
            writeJsonFile(config.FILES.voiceHours, state.voiceHours);
        },
        pruneVoiceHourSessions(now = new Date()) {
            const cutoff = now.getTime() - (16 * 24 * 60 * 60 * 1000);
            state.voiceHours.sessions = state.voiceHours.sessions.filter(session => Date.parse(session.endedAt) >= cutoff);
        },
        startVoiceHourSession(guildId, userId, channelId, startedAt = new Date()) {
            const key = getVoiceHoursKey(guildId, userId);
            if (state.voiceHours.active[key]) {
                state.voiceHours.active[key].channelId = channelId;
                state.saveVoiceHours();
                return state.voiceHours.active[key];
            }

            state.voiceHours.active[key] = {
                guildId,
                userId,
                channelId,
                startedAt: startedAt.toISOString(),
            };
            state.saveVoiceHours();
            return state.voiceHours.active[key];
        },
        moveVoiceHourSession(guildId, userId, channelId) {
            const key = getVoiceHoursKey(guildId, userId);
            if (!state.voiceHours.active[key]) return null;
            state.voiceHours.active[key].channelId = channelId;
            state.saveVoiceHours();
            return state.voiceHours.active[key];
        },
        endVoiceHourSession(guildId, userId, endedAt = new Date()) {
            const key = getVoiceHoursKey(guildId, userId);
            const activeSession = state.voiceHours.active[key];
            if (!activeSession) return null;

            delete state.voiceHours.active[key];

            const startedAtMs = Date.parse(activeSession.startedAt);
            const endedAtMs = endedAt.getTime();
            if (Number.isFinite(startedAtMs) && endedAtMs > startedAtMs) {
                const completedSession = {
                    ...activeSession,
                    endedAt: endedAt.toISOString(),
                };
                state.voiceHours.sessions.push(completedSession);
                state.pruneVoiceHourSessions(endedAt);
                state.saveVoiceHours();
                return completedSession;
            }

            state.saveVoiceHours();
            return null;
        },
        getVoiceHourTotals(guildId, userId, now = new Date()) {
            const nowMs = now.getTime();
            const windows = [1, 7, 14];
            const totals = Object.fromEntries(windows.map(days => [days, 0]));
            const sessions = [
                ...state.voiceHours.sessions,
                ...Object.values(state.voiceHours.active)
                    .filter(session => session.guildId === guildId && session.userId === userId)
                    .map(session => ({ ...session, endedAt: now.toISOString() })),
            ];

            for (const session of sessions) {
                if (session.guildId !== guildId || session.userId !== userId) continue;

                const startedAtMs = Date.parse(session.startedAt);
                const endedAtMs = Date.parse(session.endedAt);
                if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) continue;

                for (const days of windows) {
                    const windowStartMs = nowMs - (days * 24 * 60 * 60 * 1000);
                    const overlapStartMs = Math.max(startedAtMs, windowStartMs);
                    const overlapEndMs = Math.min(endedAtMs, nowMs);
                    if (overlapEndMs > overlapStartMs) {
                        totals[days] += overlapEndMs - overlapStartMs;
                    }
                }
            }

            return totals;
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
                    acceptingJoins: true,
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
