const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const OBS_NOW_SINGING_FILE = path.join(ASSETS_DIR, 'obs-now-singing.txt');
const OBS_NOW_SINGING_JSON_FILE = path.join(ASSETS_DIR, 'obs-now-singing.json');
const parsedObsHttpPort = Number.parseInt(process.env.OBS_HTTP_PORT ?? '', 10);

module.exports = {
    ROOT_DIR,
    BOT_TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID,
    ALLOW_INVITE_PASSWORD: process.env.ALLOW_INVITE_PASSWORD?.trim(),
    INVITE_REGEX: /(https?:\/\/)?(www\.)?(discord\.gg|discord(?:app)?\.com\/(invite|events))\/[A-Za-z0-9-]+(?:\/[A-Za-z0-9-]+)?/i,
    DEFAULT_PURGE_SCAN_LIMIT: 250,
    MAX_PURGE_SCAN_LIMIT: 1000,
    OBS_HTTP_HOST: process.env.OBS_HTTP_HOST?.trim() || '0.0.0.0',
    OBS_HTTP_PORT: Number.isFinite(parsedObsHttpPort) ? parsedObsHttpPort : null,
    STAGE_ADMIN_ROLES: ['Guards', 'Knights', 'Drowsy Defenders', 'God'],
    DATA_DIR,
    ASSETS_DIR,
    OBS_NOW_SINGING_FILE,
    OBS_NOW_SINGING_JSON_FILE,
    FILES: {
        guildConfig: path.join(DATA_DIR, 'guild-config.json'),
        allowedInvites: path.join(DATA_DIR, 'allowed-invite-users.json'),
        obsNowSinging: OBS_NOW_SINGING_FILE,
        obsNowSingingJson: OBS_NOW_SINGING_JSON_FILE,
    },
};