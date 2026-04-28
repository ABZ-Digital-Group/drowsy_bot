require('dotenv').config();

const fs = require('fs');
const http = require('http');

const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
} = require('discord.js');

const config = require('./src/config');
const { buildCommands } = require('./src/commands');
const { createHelpers } = require('./src/helpers');
const { createState } = require('./src/state');
const { createCommunityFeature } = require('./src/features/community');
const { createStageFeature } = require('./src/features/stage');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildScheduledEvents,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User],
});

const state = createState(config);
const helpers = createHelpers(config, state);
const stageFeature = createStageFeature({ client, config, state, helpers });
const communityFeature = createCommunityFeature({ client, config, state, helpers, stageFeature });

function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function readObsNowSingingText() {
    return fs.readFileSync(config.FILES.obsNowSinging, 'utf8').trim() || 'Show Offline';
}

function buildObsOverlayHtml(text) {
    const safeText = escapeHtml(text);
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Now Singing</title>
    <style>
        :root {
            color-scheme: only light;
        }

        * {
            box-sizing: border-box;
        }

        html,
        body {
            margin: 0;
            min-height: 100%;
            background: transparent;
            overflow: hidden;
            font-family: Georgia, "Times New Roman", serif;
        }

        body {
            display: grid;
            place-items: center;
            padding: 16px;
        }

        .card {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 320px;
            max-width: 100%;
            padding: 18px 28px;
            border: 2px solid rgba(255, 230, 167, 0.65);
            border-radius: 999px;
            background: linear-gradient(135deg, rgba(17, 24, 39, 0.82), rgba(64, 34, 16, 0.78));
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
            color: #fff8dc;
            font-size: 40px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-align: center;
            text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
            white-space: pre-wrap;
            word-break: break-word;
        }
    </style>
</head>
<body>
    <div class="card" id="now-singing">${safeText}</div>
    <script>
        const singerElement = document.getElementById('now-singing');

        async function refreshSinger() {
            const response = await fetch('/obs/now-singing.txt', { cache: 'no-store' });
            if (!response.ok) return;

            const nextText = (await response.text()).trim() || 'Show Offline';
            singerElement.textContent = nextText;
        }

        refreshSinger().catch(() => {});
        setInterval(() => {
            refreshSinger().catch(() => {});
        }, 1000);
    </script>
</body>
</html>`;
}

function startObsHttpServer() {
    if (!config.OBS_HTTP_PORT) return;

    const server = http.createServer((request, response) => {
        const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
        const currentSinger = readObsNowSingingText();

        if (url.pathname === '/health') {
            response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ ok: true }));
            return;
        }

        if (url.pathname === '/obs/now-singing.txt') {
            response.writeHead(200, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
            });
            response.end(`${currentSinger}\n`);
            return;
        }

        if (url.pathname === '/obs/now-singing') {
            response.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
            });
            response.end(buildObsOverlayHtml(currentSinger));
            return;
        }

        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    });

    server.listen(config.OBS_HTTP_PORT, config.OBS_HTTP_HOST, () => {
        console.log(`OBS overlay server listening on http://${config.OBS_HTTP_HOST}:${config.OBS_HTTP_PORT}`);
    });

    server.on('error', error => {
        console.error('Failed to start OBS overlay server:', error);
    });
}

function bindAsync(eventName, handler) {
    client.on(eventName, (...args) => {
        Promise.resolve(handler(...args)).catch(error => {
            console.error(`Unhandled ${eventName} error:`, error);
        });
    });
}
    startObsHttpServer();

client.once('clientReady', async () => {
    console.log('Drowsy bot online.');

    const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), { body: buildCommands() });
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }

    await communityFeature.restoreScheduledTasks();
});

bindAsync('messageCreate', message => communityFeature.handleMessageCreate(message));
bindAsync('interactionCreate', interaction => communityFeature.handleInteraction(interaction));

client.login(config.BOT_TOKEN);