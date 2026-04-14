const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const RECORDINGS_DIR = path.join(ROOT_DIR, 'recordings');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

module.exports = {
    ROOT_DIR,
    BOT_TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID,
    ALLOW_INVITE_PASSWORD: process.env.ALLOW_INVITE_PASSWORD?.trim(),
    INVITE_REGEX: /(https?:\/\/)?(www\.)?(discord\.gg|discord(?:app)?\.com\/(invite|events))\/[A-Za-z0-9-]+(?:\/[A-Za-z0-9-]+)?/i,
    MAX_HYPE: 100,
    DECAY_RATE: 3,
    UPDATE_INTERVAL: 4000,
    DEFAULT_PURGE_SCAN_LIMIT: 250,
    MAX_PURGE_SCAN_LIMIT: 1000,
    STAGE_ADMIN_ROLES: ['Guards', 'Knights', 'Drowsy Defenders', 'God'],
    DATA_DIR,
    RECORDINGS_DIR,
    ASSETS_DIR,
    FILES: {
        guildConfig: path.join(DATA_DIR, 'guild-config.json'),
        allowedInvites: path.join(DATA_DIR, 'allowed-invite-users.json'),
        reactionRoles: path.join(DATA_DIR, 'reaction-roles.json'),
        modlog: path.join(DATA_DIR, 'modlog-cases.json'),
        stickyRoles: path.join(DATA_DIR, 'sticky-roles.json'),
        temporaryRoles: path.join(DATA_DIR, 'temporary-reaction-roles.json'),
    },
};