const { PNG } = require('pngjs');

const FONT = {
    ' ': ['000', '000', '000', '000', '000', '000', '000'],
    '!': ['1', '1', '1', '1', '1', '0', '1'],
    '#': ['01010', '11111', '01010', '01010', '11111', '01010', '00000'],
    '-': ['0000', '0000', '0000', '1111', '0000', '0000', '0000'],
    '.': ['0', '0', '0', '0', '0', '0', '1'],
    ',': ['0', '0', '0', '0', '0', '1', '1'],
    ':': ['0', '1', '0', '0', '0', '1', '0'],
    '/': ['0001', '0001', '0010', '0010', '0100', '0100', '1000'],
    '&': ['0110', '1001', '1010', '0100', '1010', '1001', '0111'],
    '+': ['0000', '0100', '0100', '1110', '0100', '0100', '0000'],
    '0': ['111', '101', '101', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '010', '010', '111'],
    '2': ['111', '001', '001', '111', '100', '100', '111'],
    '3': ['111', '001', '001', '111', '001', '001', '111'],
    '4': ['101', '101', '101', '111', '001', '001', '001'],
    '5': ['111', '100', '100', '111', '001', '001', '111'],
    '6': ['111', '100', '100', '111', '101', '101', '111'],
    '7': ['111', '001', '001', '010', '010', '100', '100'],
    '8': ['111', '101', '101', '111', '101', '101', '111'],
    '9': ['111', '101', '101', '111', '001', '001', '111'],
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'G': ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'I': ['111', '010', '010', '010', '010', '010', '111'],
    'J': ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
    'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
    'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

function color(hex) {
    const normalized = hex.replace('#', '');
    return [
        Number.parseInt(normalized.slice(0, 2), 16),
        Number.parseInt(normalized.slice(2, 4), 16),
        Number.parseInt(normalized.slice(4, 6), 16),
        255,
    ];
}

function setPixel(png, x, y, rgba) {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const index = ((png.width * y) + x) << 2;
    png.data[index] = rgba[0];
    png.data[index + 1] = rgba[1];
    png.data[index + 2] = rgba[2];
    png.data[index + 3] = rgba[3];
}

function fillRect(png, x, y, width, height, rgba) {
    for (let yy = y; yy < y + height; yy += 1) {
        for (let xx = x; xx < x + width; xx += 1) {
            setPixel(png, xx, yy, rgba);
        }
    }
}

function fillRoundedRect(png, x, y, width, height, radius, rgba) {
    for (let yy = y; yy < y + height; yy += 1) {
        for (let xx = x; xx < x + width; xx += 1) {
            const dx = xx < x + radius ? x + radius - xx : xx >= x + width - radius ? xx - (x + width - radius - 1) : 0;
            const dy = yy < y + radius ? y + radius - yy : yy >= y + height - radius ? yy - (y + height - radius - 1) : 0;
            if ((dx * dx) + (dy * dy) <= radius * radius || dx === 0 || dy === 0) {
                setPixel(png, xx, yy, rgba);
            }
        }
    }
}

function drawLine(png, x1, y1, x2, y2, rgba) {
    let dx = Math.abs(x2 - x1);
    let sx = x1 < x2 ? 1 : -1;
    let dy = -Math.abs(y2 - y1);
    let sy = y1 < y2 ? 1 : -1;
    let error = dx + dy;
    let x = x1;
    let y = y1;

    while (true) {
        fillRect(png, x - 1, y - 1, 3, 3, rgba);
        if (x === x2 && y === y2) break;
        const nextError = 2 * error;
        if (nextError >= dy) {
            error += dy;
            x += sx;
        }
        if (nextError <= dx) {
            error += dx;
            y += sy;
        }
    }
}

function measureText(text, scale) {
    return [...text.toUpperCase()].reduce((width, character, index) => {
        const glyph = FONT[character] ?? FONT[' '];
        return width + (glyph[0].length * scale) + (index === text.length - 1 ? 0 : scale);
    }, 0);
}

function drawText(png, text, x, y, scale, rgba, maxWidth = Infinity) {
    let cursorX = x;
    const upperText = text.toUpperCase();

    for (const character of upperText) {
        const glyph = FONT[character] ?? FONT[' '];
        const glyphWidth = glyph[0].length * scale;
        if (cursorX + glyphWidth > x + maxWidth) return;

        for (let row = 0; row < glyph.length; row += 1) {
            for (let column = 0; column < glyph[row].length; column += 1) {
                if (glyph[row][column] === '1') {
                    fillRect(png, cursorX + (column * scale), y + (row * scale), scale, scale, rgba);
                }
            }
        }

        cursorX += glyphWidth + scale;
    }
}

function formatHours(milliseconds) {
    return (milliseconds / 3600000).toFixed(2);
}

function formatDate(date) {
    if (!date) return 'UNKNOWN';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date).replace(',', '');
}

function drawStatRow(png, x, y, label, value) {
    const labelScale = label.length > 3 ? 2 : 3;
    fillRoundedRect(png, x, y, 260, 36, 5, color('#202327'));
    fillRoundedRect(png, x, y, 65, 36, 5, color('#15191c'));
    drawText(png, label, x + 15, y + 9, labelScale, color('#d8dbe0'), 55);
    drawText(png, value, x + 86, y + 9, 2, color('#d8dbe0'), 160);
}

function drawBarChart(png, x, y, width, height, totals) {
    const values = [totals[1] ?? 0, totals[7] ?? 0, totals[14] ?? 0].map(value => value / 3600000);
    const max = Math.max(...values, 1);
    const labels = ['1D', '7D', '14D'];
    const barWidth = 54;
    const gap = 52;
    const baseY = y + height - 28;

    fillRoundedRect(png, x, y, width, height, 10, color('#2b2f35'));
    drawText(png, 'CHARTS', x + 14, y + 14, 3, color('#d3d6da'));

    values.forEach((value, index) => {
        const barHeight = Math.max(4, Math.round((value / max) * (height - 84)));
        const barX = x + 38 + (index * (barWidth + gap));
        const barY = baseY - barHeight;
        fillRoundedRect(png, barX, barY, barWidth, barHeight, 6, color(index === 2 ? '#3fc15d' : '#d65089'));
        drawText(png, labels[index], barX + 8, baseY + 9, 2, color('#cfd2d7'));
    });
}

function buildHoursCard({ subject, guild, totals }) {
    const png = new PNG({ width: 856, height: 464 });
    const background = color('#20242a');
    const panel = color('#2d3137');
    const field = color('#202327');
    const title = color('#d7d9dd');
    const muted = color('#aeb3ba');
    const accent = color('#d65089');
    const voice = color('#3fc15d');

    fillRect(png, 0, 0, png.width, png.height, background);
    fillRoundedRect(png, 0, 0, png.width, png.height, 18, color('#252a31'));

    fillRoundedRect(png, 12, 8, 58, 58, 12, color('#111317'));
    drawText(png, (subject.displayName ?? subject.user.username).slice(0, 2), 22, 27, 3, title);
    drawText(png, `${subject.displayName ?? subject.user.username}`, 84, 14, 3, title, 440);
    drawText(png, guild.name, 84, 44, 2, muted, 390);

    fillRoundedRect(png, 546, 7, 138, 60, 7, panel);
    fillRoundedRect(png, 704, 7, 138, 60, 7, panel);
    drawText(png, 'CREATED ON', 558, 16, 2, title);
    drawText(png, formatDate(subject.user.createdAt), 558, 43, 2, muted);
    drawText(png, 'JOINED ON', 716, 16, 2, title);
    drawText(png, formatDate(subject.joinedAt), 716, 43, 2, muted);

    fillRoundedRect(png, 12, 80, 268, 162, 10, panel);
    drawText(png, 'SERVER RANKS', 22, 91, 3, title);
    drawStatRow(png, 21, 122, 'VOICE', '#--');
    drawStatRow(png, 21, 184, 'HOURS', '#--');

    fillRoundedRect(png, 292, 80, 268, 162, 10, panel);
    drawText(png, 'MESSAGES', 302, 91, 3, title);
    drawStatRow(png, 302, 118, '1D', 'N/A');
    drawStatRow(png, 302, 158, '7D', 'N/A');
    drawStatRow(png, 302, 198, '14D', 'N/A');

    fillRoundedRect(png, 574, 80, 268, 162, 10, panel);
    drawText(png, 'VOICE ACTIVITY', 584, 91, 3, title);
    drawStatRow(png, 584, 118, '1D', `${formatHours(totals[1] ?? 0)} HOURS`);
    drawStatRow(png, 584, 158, '7D', `${formatHours(totals[7] ?? 0)} HOURS`);
    drawStatRow(png, 584, 198, '14D', `${formatHours(totals[14] ?? 0)} HOURS`);

    fillRoundedRect(png, 12, 256, 408, 162, 10, panel);
    drawText(png, 'TOP CHANNELS & APPS', 24, 270, 2, title);
    fillRoundedRect(png, 64, 294, 346, 34, 5, field);
    fillRoundedRect(png, 64, 336, 346, 34, 5, field);
    fillRoundedRect(png, 64, 378, 346, 34, 5, field);
    drawText(png, '#', 26, 300, 3, title);
    drawText(png, '#VOICE', 84, 304, 3, title);
    drawText(png, `${formatHours(totals[14] ?? 0)} HOURS`, 248, 306, 2, muted);
    drawText(png, 'VOICE', 84, 346, 3, title);
    drawText(png, `${formatHours(totals[7] ?? 0)} HOURS`, 248, 348, 2, muted);

    drawBarChart(png, 432, 256, 410, 162, totals);
    drawText(png, 'MESSAGE', 658, 268, 2, title);
    fillRoundedRect(png, 633, 266, 16, 16, 8, voice);
    drawText(png, 'VOICE', 772, 268, 2, title);
    fillRoundedRect(png, 747, 266, 16, 16, 8, accent);

    drawText(png, 'SERVER LOOKBACK: LAST 14 DAYS - TIMEZONE: UTC', 14, 438, 2, title);
    drawText(png, 'DROWSY BOT', 708, 438, 2, muted);

    return PNG.sync.write(png);
}

module.exports = { buildHoursCard };
