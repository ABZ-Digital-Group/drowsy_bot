const fs = require('fs');
const path = require('path');

const WIDTH = 856;
const HEIGHT = 464;
const FONT_FAMILY = '"Satoshi", "Segoe UI", Arial, sans-serif';
let satoshiRegistered = false;

const COLORS = {
    page: '#24282f',
    panel: '#2f343b',
    panelDark: '#22262b',
    chip: '#171b1f',
    text: '#d8dbe0',
    muted: '#aeb4bd',
    green: '#43c767',
    pink: '#d7528a',
    shadow: 'rgba(0, 0, 0, 0.28)',
};

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
    ctx.shadowColor = COLORS.shadow;
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    fillRound(ctx, x, y, width, height, 10, COLORS.panel);
    ctx.restore();
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
    fillRound(ctx, x, y, 260, 34, 5, COLORS.panelDark);
    fillRound(ctx, x, y, 84, 34, 5, COLORS.chip);
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

    fillRound(ctx, 12, 8, 58, 58, 14, '#11151a');
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
    fillRound(ctx, x, 7, 138, 60, 7, COLORS.panel);
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
        gradient.addColorStop(0, index === 2 ? '#45d36a' : '#e65a97');
        gradient.addColorStop(1, index === 2 ? '#31a953' : '#ba3f75');
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
    background.addColorStop(0, '#262b32');
    background.addColorStop(1, '#20242a');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    fillRound(ctx, 0, 0, WIDTH, HEIGHT, 18, 'rgba(255, 255, 255, 0.015)');
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
