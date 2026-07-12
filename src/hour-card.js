const fs = require('fs');
const path = require('path');

const WIDTH = 856;
const HEIGHT = 464;
const FONT_FAMILY = '"Satoshi", "Segoe UI", Arial, sans-serif';
let satoshiRegistered = false;

const COLORS = {
    page: '#1a1f36',
    panel: '#252b46',
    panelDark: '#1d233b',
    chip: '#313a66',
    text: '#edf2ff',
    muted: '#a8b5df',
    green: '#19c7a3',
    pink: '#ff5fa2',
    cyan: '#4dc8ff',
    violet: '#7b61ff',
    shadow: 'rgba(6, 10, 26, 0.48)',
    shadowSoft: 'rgba(10, 16, 38, 0.3)',
    highlight: 'rgba(86, 105, 170, 0.32)',
};

function strokeRound(ctx, x, y, width, height, radius, strokeStyle, lineWidth = 1) {
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    roundedRect(ctx, x, y, width, height, radius);
    ctx.stroke();
    ctx.restore();
}

function fillClippedRound(ctx, x, y, width, height, radius, draw) {
    ctx.save();
    roundedRect(ctx, x, y, width, height, radius);
    ctx.clip();
    draw();
    ctx.restore();
}

function getFontSearchPaths() {
    const rootDir = path.resolve(__dirname, '..');
    const configuredPath = process.env.SATOSHI_FONT_PATH?.trim();
    const candidates = [
        configuredPath,
        path.join(rootDir, 'assets', 'fonts', 'Satoshi-Regular.ttf'),
        path.join(rootDir, 'assets', 'fonts', 'Satoshi-Regular.otf'),
        path.join(rootDir, 'assets', 'fonts', 'Satoshi-Medium.ttf'),
        path.join(rootDir, 'assets', 'fonts', 'Satoshi-Medium.otf'),
        path.join(rootDir, 'assets', 'fonts', 'Satoshi-Bold.ttf'),
        path.join(rootDir, 'assets', 'fonts', 'Satoshi-Bold.otf'),
        path.join(rootDir, 'assests', 'fonts', 'Satoshi-Regular.ttf'),
        path.join(rootDir, 'assests', 'fonts', 'Satoshi-Regular.otf'),
        path.join(rootDir, 'assests', 'fonts', 'Satoshi-Medium.ttf'),
        path.join(rootDir, 'assests', 'fonts', 'Satoshi-Medium.otf'),
        path.join(rootDir, 'assests', 'fonts', 'Satoshi-Bold.ttf'),
        path.join(rootDir, 'assests', 'fonts', 'Satoshi-Bold.otf'),
    ];

    return candidates.filter(Boolean);
}

function registerSatoshiFont(GlobalFonts) {
    if (satoshiRegistered || !GlobalFonts?.registerFromPath) return;

    let registeredAny = false;
    for (const fontPath of getFontSearchPaths()) {
        if (!fs.existsSync(fontPath)) continue;
        registeredAny = GlobalFonts.registerFromPath(fontPath, 'Satoshi') || registeredAny;
    }

    satoshiRegistered = registeredAny;
}

function formatHours(milliseconds) {
    return (milliseconds / 3600000).toFixed(2);
}

function formatDate(date) {
    if (!date) return 'Unknown';

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date).replace(',', '');
}

function roundedRect(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
    ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
    ctx.arcTo(x, y + height, x, y, safeRadius);
    ctx.arcTo(x, y, x + width, y, safeRadius);
    ctx.closePath();
}

function fillRound(ctx, x, y, width, height, radius, fillStyle) {
    ctx.fillStyle = fillStyle;
    roundedRect(ctx, x, y, width, height, radius);
    ctx.fill();
}

function panel(ctx, x, y, width, height) {
    ctx.save();
    ctx.shadowColor = COLORS.highlight;
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = -8;
    ctx.shadowOffsetY = -8;
    fillRound(ctx, x, y, width, height, 12, COLORS.panel);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = COLORS.shadow;
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 10;
    fillRound(ctx, x, y, width, height, 12, COLORS.panel);
    ctx.restore();

    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, '#30385c');
    gradient.addColorStop(0.45, COLORS.panel);
    gradient.addColorStop(1, '#1d2340');
    fillRound(ctx, x, y, width, height, 12, gradient);

    fillClippedRound(ctx, x, y, width, height, 12, () => {
        const glow = ctx.createRadialGradient(x + (width * 0.2), y + (height * 0.12), 0, x + (width * 0.2), y + (height * 0.12), width * 0.85);
        glow.addColorStop(0, 'rgba(123, 97, 255, 0.24)');
        glow.addColorStop(0.55, 'rgba(77, 200, 255, 0.12)');
        glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x, y, width, height);

        const topSheen = ctx.createLinearGradient(x, y, x, y + (height * 0.5));
        topSheen.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        topSheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = topSheen;
        ctx.fillRect(x, y, width, height * 0.5);
    });

    strokeRound(ctx, x + 0.5, y + 0.5, width - 1, height - 1, 11.5, 'rgba(124, 145, 220, 0.22)');
    strokeRound(ctx, x + 1.5, y + 1.5, width - 3, height - 3, 10.5, 'rgba(8, 12, 28, 0.34)');
}

function text(ctx, value, x, y, size, options = {}) {
    ctx.save();
    ctx.fillStyle = options.color ?? COLORS.text;
    ctx.font = `${options.weight ?? 700} ${size}px ${FONT_FAMILY}`;
    ctx.textBaseline = options.baseline ?? 'alphabetic';

    if (options.maxWidth) {
        const ellipsis = '...';
        let output = String(value);
        while (ctx.measureText(output).width > options.maxWidth && output.length > 0) {
            output = output.slice(0, -1);
        }

        if (output !== value && output.length > ellipsis.length) {
            output = `${output.slice(0, -ellipsis.length)}${ellipsis}`;
        }

        ctx.fillText(output, x, y);
    } else {
        ctx.fillText(String(value), x, y);
    }

    ctx.restore();
}

function statRow(ctx, x, y, label, value) {
    const rowGradient = ctx.createLinearGradient(x, y, x, y + 34);
    rowGradient.addColorStop(0, '#30375b');
    rowGradient.addColorStop(1, '#1d233b');
    fillRound(ctx, x, y, 260, 34, 5, rowGradient);

    const chipGradient = ctx.createLinearGradient(x, y, x, y + 34);
    chipGradient.addColorStop(0, '#8c7dff');
    chipGradient.addColorStop(1, '#47c7ff');
    fillRound(ctx, x, y, 84, 34, 5, chipGradient);

    strokeRound(ctx, x + 0.5, y + 0.5, 259, 33, 4.5, 'rgba(123, 142, 214, 0.2)');
    strokeRound(ctx, x + 0.5, y + 0.5, 83, 33, 4.5, 'rgba(255, 255, 255, 0.18)');
    text(ctx, label, x + 17, y + 23, 22, { maxWidth: 66 });
    text(ctx, value, x + 104, y + 22, 20, { color: COLORS.text, weight: 500, maxWidth: 140 });
}

function drawInitialsAvatar(ctx, subject) {
    const name = subject.displayName ?? subject.user.globalName ?? subject.user.username;
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join('')
        .toUpperCase() || '?';

    const avatarGradient = ctx.createLinearGradient(12, 8, 70, 66);
    avatarGradient.addColorStop(0, '#7a67ff');
    avatarGradient.addColorStop(1, '#36d4ff');
    fillRound(ctx, 12, 8, 58, 58, 14, avatarGradient);
    text(ctx, initials, 23, 45, 21, { color: COLORS.text, maxWidth: 38 });
}

async function drawAvatar(ctx, subject, loadImage) {
    const avatarUrl = subject.user.displayAvatarURL?.({ extension: 'png', size: 128 }) ?? null;
    if (!avatarUrl) {
        drawInitialsAvatar(ctx, subject);
        return;
    }

    try {
        const image = await loadImage(avatarUrl);
        ctx.save();
        roundedRect(ctx, 12, 8, 58, 58, 14);
        ctx.clip();
        ctx.drawImage(image, 12, 8, 58, 58);
        ctx.restore();
    } catch (error) {
        drawInitialsAvatar(ctx, subject);
    }
}

function dateBox(ctx, x, label, value) {
    const gradient = ctx.createLinearGradient(x, 7, x, 67);
    gradient.addColorStop(0, '#2f375c');
    gradient.addColorStop(1, '#202742');
    fillRound(ctx, x, 7, 138, 60, 7, gradient);
    fillClippedRound(ctx, x, 7, 138, 60, 7, () => {
        const highlight = ctx.createLinearGradient(x, 7, x, 34);
        highlight.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlight;
        ctx.fillRect(x, 7, 138, 27);
    });
    strokeRound(ctx, x + 0.5, 7.5, 137, 59, 6.5, 'rgba(125, 145, 219, 0.18)');
    text(ctx, label, x + 12, 29, 16, { color: COLORS.text, maxWidth: 114 });
    text(ctx, value, x + 12, 57, 20, { color: COLORS.muted, weight: 500, maxWidth: 114 });
}

function drawRanks(ctx) {
    panel(ctx, 12, 80, 268, 162);
    text(ctx, 'Server Ranks', 22, 105, 22);
    statRow(ctx, 21, 122, 'Voice', '#--');
    statRow(ctx, 21, 184, 'Hours', '#--');
}

function drawMessages(ctx) {
    panel(ctx, 292, 80, 268, 162);
    text(ctx, 'Messages', 302, 105, 22);
    statRow(ctx, 302, 118, '1d', 'N/A');
    statRow(ctx, 302, 158, '7d', 'N/A');
    statRow(ctx, 302, 198, '14d', 'N/A');
}

function drawVoiceActivity(ctx, totals) {
    panel(ctx, 574, 80, 268, 162);
    text(ctx, 'Voice Activity', 584, 105, 22);
    statRow(ctx, 584, 118, '1d', `${formatHours(totals[1] ?? 0)} hours`);
    statRow(ctx, 584, 158, '7d', `${formatHours(totals[7] ?? 0)} hours`);
    statRow(ctx, 584, 198, '14d', `${formatHours(totals[14] ?? 0)} hours`);
}

function drawTopChannels(ctx, totals) {
    panel(ctx, 12, 256, 408, 162);
    text(ctx, 'Top Channels & Apps', 24, 284, 21);

    fillRound(ctx, 64, 294, 346, 34, 5, COLORS.panelDark);
    fillRound(ctx, 64, 336, 346, 34, 5, COLORS.panelDark);
    fillRound(ctx, 64, 378, 346, 34, 5, COLORS.panelDark);

    text(ctx, '#', 26, 320, 24);
    text(ctx, '#voice', 84, 319, 23);
    text(ctx, `${formatHours(totals[14] ?? 0)} hours`, 248, 319, 20, { color: COLORS.text, weight: 500 });

    text(ctx, 'Voice', 84, 361, 23);
    text(ctx, `${formatHours(totals[7] ?? 0)} hours`, 248, 361, 20, { color: COLORS.text, weight: 500 });
}

function drawChart(ctx, totals) {
    panel(ctx, 432, 256, 410, 162);
    text(ctx, 'Charts', 446, 291, 23);

    ctx.fillStyle = COLORS.green;
    ctx.beginPath();
    ctx.arc(641, 274, 8, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'Message', 658, 281, 20);

    ctx.fillStyle = COLORS.pink;
    ctx.beginPath();
    ctx.arc(766, 274, 8, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'Voice', 783, 281, 20);

    const values = [totals[1] ?? 0, totals[7] ?? 0, totals[14] ?? 0].map(value => value / 3600000);
    const max = Math.max(...values, 1);
    const labels = ['1d', '7d', '14d'];
    const baseY = 390;

    values.forEach((value, index) => {
        const x = 470 + (index * 105);
        const height = Math.max(4, Math.round((value / max) * 78));
        const gradient = ctx.createLinearGradient(x, baseY - height, x, baseY);
        gradient.addColorStop(0, index === 2 ? '#20d9b1' : '#8d68ff');
        gradient.addColorStop(1, index === 2 ? '#00b7d6' : '#ff5f9e');
        fillRound(ctx, x, baseY - height, 54, height, 7, gradient);
        text(ctx, labels[index], x + 15, 413, 18, { color: COLORS.muted });
    });
}

async function buildHoursCard({ subject, guild, totals }) {
    const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
    registerSatoshiFont(GlobalFonts);

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    const displayName = subject.displayName ?? subject.user.globalName ?? subject.user.username;

    const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    background.addColorStop(0, '#171c31');
    background.addColorStop(0.45, '#202744');
    background.addColorStop(1, '#12172a');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const aura = ctx.createRadialGradient(120, 80, 0, 120, 80, 420);
    aura.addColorStop(0, 'rgba(123, 97, 255, 0.28)');
    aura.addColorStop(0.55, 'rgba(77, 200, 255, 0.16)');
    aura.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    fillRound(ctx, 0, 0, WIDTH, HEIGHT, 18, 'rgba(255, 255, 255, 0.02)');
    await drawAvatar(ctx, subject, loadImage);

    text(ctx, displayName, 84, 35, 26, { maxWidth: 430 });
    text(ctx, guild.name, 84, 61, 22, { color: COLORS.muted, weight: 500, maxWidth: 390 });

    dateBox(ctx, 546, 'Created On', formatDate(subject.user.createdAt));
    dateBox(ctx, 704, 'Joined On', formatDate(subject.joinedAt));

    drawRanks(ctx);
    drawMessages(ctx);
    drawVoiceActivity(ctx, totals);
    drawTopChannels(ctx, totals);
    drawChart(ctx, totals);

    text(ctx, 'Server Lookback: Last 14 days - Timezone: UTC', 14, 450, 17, { color: COLORS.text });
    text(ctx, 'Drowsy Bot', 734, 450, 17, { color: COLORS.muted });

    return canvas.toBuffer('image/png');
}

module.exports = { buildHoursCard };
