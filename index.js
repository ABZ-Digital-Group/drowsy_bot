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

function readObsNowSingingOverlay() {
    try {
        const parsed = JSON.parse(fs.readFileSync(config.FILES.obsNowSingingJson, 'utf8'));
        return {
            text: typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim() : 'Show Offline',
            avatarUrl: typeof parsed.avatarUrl === 'string' && parsed.avatarUrl.trim() ? parsed.avatarUrl.trim() : null,
        };
    } catch (error) {
        return {
            text: readObsNowSingingText(),
            avatarUrl: null,
        };
    }
}

function readObsAdvertisement() {
    try {
        const parsed = JSON.parse(fs.readFileSync(config.FILES.obsAds, 'utf8'));
        const items = Array.isArray(parsed?.items) ? parsed.items : [];
        const activeId = typeof parsed?.activeId === 'string' ? parsed.activeId : null;
        const activeIndex = Math.max(0, items.findIndex(item => item?.id === activeId));
        const rotationIntervalMs = Number.isInteger(parsed?.rotationIntervalMs) && parsed.rotationIntervalMs > 0
            ? parsed.rotationIntervalMs
            : null;
        const rotationStartedAt = Date.parse(parsed?.rotationStartedAt ?? '');
        const hasRotation = rotationIntervalMs && items.length > 1 && Number.isFinite(rotationStartedAt);
        const rotationOffset = hasRotation
            ? Math.floor(Math.max(0, Date.now() - rotationStartedAt) / rotationIntervalMs) % items.length
            : 0;
        const activeItem = items[(activeIndex + rotationOffset) % Math.max(items.length, 1)] ?? null;

        if (!activeItem) {
            return {
                active: false,
                item: null,
                rotationIntervalMs: null,
            };
        }

        return {
            active: state.guildStageSessions.size > 0,
            rotationIntervalMs,
            item: {
                title: typeof activeItem.title === 'string' ? activeItem.title : 'Advertisement',
                contentType: typeof activeItem.contentType === 'string' ? activeItem.contentType : 'application/octet-stream',
                fileName: activeItem.fileName,
                url: `/obs/ads/files/${encodeURIComponent(activeItem.fileName)}`,
            },
        };
    } catch (error) {
        return {
            active: false,
            item: null,
            rotationIntervalMs: null,
        };
    }
}

function readObsAdvertisementByFileName(fileName) {
    try {
        const parsed = JSON.parse(fs.readFileSync(config.FILES.obsAds, 'utf8'));
        const items = Array.isArray(parsed?.items) ? parsed.items : [];
        return items.find(item => item?.fileName === fileName) ?? null;
    } catch (error) {
        return null;
    }
}

function buildObsOverlayHtml(overlay) {
    const safeText = escapeHtml(overlay.text);
    const avatarClasses = overlay.avatarUrl ? 'avatar' : 'avatar avatar--placeholder';
    const avatarSrc = overlay.avatarUrl ? ` src="${escapeHtml(overlay.avatarUrl)}"` : '';
    const imageMarkup = `<img id="now-singing-avatar" class="${avatarClasses}"${avatarSrc} alt="${safeText}">`;

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

        .frame {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 360px;
            height: 360px;
            padding: 16px;
            border: 3px solid rgba(255, 230, 167, 0.7);
            border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, rgba(255, 248, 220, 0.2), rgba(64, 34, 16, 0.78));
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
            overflow: hidden;
        }

        .avatar {
            display: block;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            object-fit: cover;
            background: rgba(17, 24, 39, 0.72);
        }

        .avatar--placeholder {
            background:
                radial-gradient(circle at 50% 35%, rgba(255, 248, 220, 0.92) 0 16%, transparent 17%),
                radial-gradient(circle at 50% 78%, rgba(255, 248, 220, 0.92) 0 28%, transparent 29%),
                linear-gradient(135deg, rgba(17, 24, 39, 0.9), rgba(64, 34, 16, 0.82));
        }
    </style>
</head>
<body>
    <div class="frame" title="${safeText}">
        ${imageMarkup}
    </div>
    <script>
        const singerAvatarElement = document.getElementById('now-singing-avatar');

        async function refreshSinger() {
            const response = await fetch('/obs/now-singing.json', { cache: 'no-store' });
            if (!response.ok) return;

            const nextOverlay = await response.json();
            const nextText = typeof nextOverlay.text === 'string' && nextOverlay.text.trim() ? nextOverlay.text.trim() : 'Show Offline';
            const nextAvatarUrl = typeof nextOverlay.avatarUrl === 'string' && nextOverlay.avatarUrl.trim() ? nextOverlay.avatarUrl.trim() : null;

            singerAvatarElement.setAttribute('aria-label', nextText);
            singerAvatarElement.parentElement.setAttribute('title', nextText);

            if (nextAvatarUrl) {
                singerAvatarElement.classList.remove('avatar--placeholder');
                singerAvatarElement.setAttribute('src', nextAvatarUrl);
                singerAvatarElement.setAttribute('alt', nextText);
            } else {
                singerAvatarElement.removeAttribute('src');
                singerAvatarElement.setAttribute('alt', nextText);
                singerAvatarElement.classList.add('avatar--placeholder');
            }
        }

        refreshSinger().catch(() => {});
        setInterval(() => {
            refreshSinger().catch(() => {});
        }, 1000);
    </script>
</body>
</html>`;
}

function buildAdvertisementOverlayHtml(advertisementState) {
    const title = escapeHtml(advertisementState.item?.title ?? 'Advertisement');
    const imageMarkup = advertisementState.item
        ? `<div class="slide slide--visible" data-kind="image"><img id="ad-image" class="ad-image" src="${escapeHtml(advertisementState.item.url)}" alt="${title}"></div>`
        : '<div class="slide slide--visible" data-kind="empty"><div id="ad-empty" class="ad-empty">No active ad uploaded</div></div>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Drowsy Ads</title>
    <style>
        :root {
            color-scheme: only light;
            --paper: rgba(251, 244, 233, 0.94);
            --ink: #24130a;
            --shadow: rgba(43, 22, 11, 0.28);
            --accent: #d07a2d;
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
            padding: 24px;
        }

        .panel {
            width: min(720px, 100vw - 48px);
            padding: 18px;
            border: 2px solid rgba(208, 122, 45, 0.55);
            border-radius: 28px;
            background:
                linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0)),
                radial-gradient(circle at top, rgba(255, 221, 173, 0.55), rgba(53, 27, 13, 0.9));
            box-shadow: 0 16px 40px var(--shadow);
            backdrop-filter: blur(8px);
            transition: opacity 360ms ease, transform 360ms ease, box-shadow 360ms ease;
        }

        .eyebrow {
            margin: 0 0 12px;
            font-size: 13px;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: rgba(251, 244, 233, 0.85);
        }

        .canvas {
            position: relative;
            display: grid;
            min-height: 400px;
            place-items: center;
            border-radius: 20px;
            overflow: hidden;
            background: var(--paper);
            isolation: isolate;
        }

        .canvas::before {
            content: '';
            position: absolute;
            inset: 0;
            background:
                radial-gradient(circle at top right, rgba(208, 122, 45, 0.14), transparent 32%),
                linear-gradient(180deg, rgba(255, 255, 255, 0.45), transparent 28%);
            pointer-events: none;
            z-index: 0;
        }

        .stage {
            position: absolute;
            inset: 0;
            z-index: 1;
        }

        .slide {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            opacity: 0;
            transform: scale(1.02);
            filter: saturate(0.96);
            transition: opacity 520ms ease, transform 520ms ease, filter 520ms ease;
            will-change: opacity, transform, filter;
        }

        .slide--visible {
            opacity: 1;
            transform: scale(1);
            filter: saturate(1);
        }

        .ad-image {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: #fff;
            transform-origin: center;
        }

        .ad-empty {
            padding: 48px;
            color: rgba(36, 19, 10, 0.7);
            font-size: 28px;
            text-align: center;
        }

        .status {
            position: absolute;
            top: 16px;
            right: 16px;
            padding: 8px 12px;
            border-radius: 999px;
            background: rgba(36, 19, 10, 0.8);
            color: #fff4e7;
            font-size: 12px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            z-index: 2;
        }

        .rotation {
            position: absolute;
            left: 16px;
            bottom: 16px;
            padding: 8px 12px;
            border-radius: 999px;
            background: rgba(255, 244, 231, 0.9);
            color: rgba(36, 19, 10, 0.82);
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            z-index: 2;
        }

        body[data-stage-active="false"] .panel {
            opacity: 0.45;
            transform: scale(0.98);
            box-shadow: 0 10px 24px rgba(43, 22, 11, 0.18);
        }

        body[data-stage-active="false"] .status::after {
            content: 'Stage inactive';
        }

        body[data-stage-active="true"] .status::after {
            content: 'Stage live';
        }

        body[data-rotation-active="false"] .rotation {
            display: none;
        }

        @media (prefers-reduced-motion: reduce) {
            .panel,
            .slide {
                transition: none;
            }
        }
    </style>
</head>
<body data-stage-active="${advertisementState.active ? 'true' : 'false'}" data-rotation-active="${advertisementState.rotationIntervalMs ? 'true' : 'false'}">
    <section class="panel">
        <p class="eyebrow">Drowsy Sponsor Panel</p>
        <div class="canvas">
            <div class="stage" id="ad-stage">
                ${imageMarkup}
            </div>
            <div class="status"></div>
            <div class="rotation">Rotating</div>
        </div>
    </section>
    <script>
        const body = document.body;
        const stage = document.getElementById('ad-stage');
        const rotationElement = document.querySelector('.rotation');

        function buildSlide(nextState) {
            const slideElement = document.createElement('div');

            if (!nextState.item) {
                slideElement.className = 'slide';
                slideElement.dataset.kind = 'empty';

                const emptyElement = document.createElement('div');
                emptyElement.id = 'ad-empty';
                emptyElement.className = 'ad-empty';
                emptyElement.textContent = 'No active ad uploaded';
                slideElement.appendChild(emptyElement);
                return slideElement;
            }

            slideElement.className = 'slide';
            slideElement.dataset.kind = 'image';

            const imageElement = document.createElement('img');
            imageElement.id = 'ad-image';
            imageElement.className = 'ad-image';
            imageElement.src = nextState.item.url;
            imageElement.alt = nextState.item.title;
            slideElement.appendChild(imageElement);
            return slideElement;
        }

        function getVisibleSlide() {
            return stage.querySelector('.slide--visible');
        }

        function isSameSlide(currentSlide, nextState) {
            if (!currentSlide) return false;

            if (!nextState.item) {
                return currentSlide.dataset.kind === 'empty';
            }

            const imageElement = currentSlide.querySelector('.ad-image');
            return currentSlide.dataset.kind === 'image'
                && imageElement
                && imageElement.getAttribute('src') === nextState.item.url
                && imageElement.getAttribute('alt') === nextState.item.title;
        }

        function renderAdvertisement(nextState) {
            body.dataset.stageActive = nextState.active ? 'true' : 'false';
            body.dataset.rotationActive = nextState.rotationIntervalMs ? 'true' : 'false';
            rotationElement.textContent = nextState.rotationIntervalMs
                ? 'Rotating every ' + Math.max(1, Math.floor(nextState.rotationIntervalMs / 1000)) + 's'
                : 'Rotating';

            const currentSlide = getVisibleSlide();
            if (isSameSlide(currentSlide, nextState)) {
                return;
            }

            const nextSlide = buildSlide(nextState);
            stage.appendChild(nextSlide);

            requestAnimationFrame(() => {
                nextSlide.classList.add('slide--visible');
                if (currentSlide) currentSlide.classList.remove('slide--visible');
            });

            if (currentSlide) {
                setTimeout(() => {
                    if (currentSlide.parentElement === stage) {
                        currentSlide.remove();
                    }
                }, 560);
            }
        }

        async function refreshAdvertisement() {
            const response = await fetch('/obs/ad.json', { cache: 'no-store' });
            if (!response.ok) return;
            const nextState = await response.json();
            renderAdvertisement(nextState);
        }

        refreshAdvertisement().catch(() => {});
        setInterval(() => {
            refreshAdvertisement().catch(() => {});
        }, 3000);
    </script>
</body>
</html>`;
}

function startObsHttpServer() {
    if (!config.OBS_HTTP_PORT) return;

    const server = http.createServer((request, response) => {
        const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
        const currentSinger = readObsNowSingingText();
        const currentOverlay = readObsNowSingingOverlay();
        const currentAdvertisement = readObsAdvertisement();

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

        if (url.pathname === '/obs/now-singing.json') {
            response.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
            });
            response.end(JSON.stringify(currentOverlay));
            return;
        }

        if (url.pathname === '/obs/now-singing') {
            response.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
            });
            response.end(buildObsOverlayHtml(currentOverlay));
            return;
        }

        if (url.pathname === '/obs/ad.json') {
            response.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
            });
            response.end(JSON.stringify(currentAdvertisement));
            return;
        }

        if (url.pathname === '/obs/ad') {
            response.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
            });
            response.end(buildAdvertisementOverlayHtml(currentAdvertisement));
            return;
        }

        if (url.pathname.startsWith('/obs/ads/files/')) {
            const fileName = decodeURIComponent(url.pathname.slice('/obs/ads/files/'.length));
            const path = require('path');
            const safeFileName = path.basename(fileName);
            const filePath = path.resolve(config.ADS_DIR, safeFileName);

            if (safeFileName !== fileName || !filePath.startsWith(path.resolve(config.ADS_DIR) + path.sep) || !fs.existsSync(filePath)) {
                response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                response.end('Not found');
                return;
            }

            const advertisement = readObsAdvertisementByFileName(safeFileName);
            response.writeHead(200, {
                'Content-Type': advertisement?.contentType ?? 'application/octet-stream',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
            });
            fs.createReadStream(filePath).pipe(response);
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