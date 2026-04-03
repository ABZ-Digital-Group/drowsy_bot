require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    REST, 
    Routes, 
    SlashCommandBuilder 
} = require('discord.js');
const { joinVoiceChannel, EndBehaviorType, VoiceConnectionStatus } = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');
const path = require('path');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildVoiceStates, 
        GatewayIntentBits.GuildMembers 
    ] 
});

// Create recordings folder if it doesn't exist
if (!fs.existsSync('./recordings')) fs.mkdirSync('./recordings');

const BOT_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const MAX_HYPE = 100;
const DECAY_RATE = 3; 
const UPDATE_INTERVAL = 4000; 

const channelData = new Map();

function isAdmin(member) {
    const allowedRoles = ['Guards', 'Knights', 'Drowsy Defenders', 'God'];
    return member.roles.cache.some(role => allowedRoles.includes(role.name)) || member.guild.ownerId === member.id;
}

function getChannelData(channelId) {
    if (!channelData.has(channelId)) {
        channelData.set(channelId, { 
            queue: [], 
            currentSpeaker: null, 
            lastMessageId: null,
            activeHypeCollector: null,
            isRecording: false
        });
    }
    return channelData.get(channelId);
}

// --- SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName('start-queue').setDescription('Start the event queue (Staff Only)'),
    new SlashCommandBuilder().setName('stop-queue').setDescription('Stop the event (Staff Only)'),
    new SlashCommandBuilder().setName('queue').setDescription('Repost the queue at the bottom'),
    new SlashCommandBuilder().setName('next').setDescription('Move to next speaker (Staff Only)')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🎙️ Drowsy Vocals PRO is online as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    } catch (e) { console.error(e); }
});

async function refreshPopup(channel) {
    const data = getChannelData(channel.id);
    if (data.lastMessageId) {
        try {
            const oldMsg = await channel.messages.fetch(data.lastMessageId);
            if (oldMsg) await oldMsg.delete();
        } catch (e) {}
    }
    const embed = new EmbedBuilder()
        .setTitle("💤 Drowsy Speaker Queue")
        .setDescription(`**Currently on the Mic:** ${data.currentSpeaker ? `<@${data.currentSpeaker}>` : "Open Mic"}\n\n**Up Next:**\n${data.queue.length > 0 ? data.queue.map((id, i) => `**${i + 1}.** <@${id}>`).join('\n') : "*The queue is empty.*"}`)
        .setColor(0x5865F2);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('Join Queue').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('finished').setLabel('Done Speaking 🏁').setStyle(ButtonStyle.Success)
    );

    const newMsg = await channel.send({ embeds: [embed], components: [row] });
    data.lastMessageId = newMsg.id;
}

async function startHypeSession(channel, data) {
    if (data.activeHypeCollector) data.activeHypeCollector.stop();
    
    let currentHype = 30; 
    let isRecording = false;
    const speakerId = data.currentSpeaker;
    let connection = null;

    const getHypeEmbed = (hype, recording) => {
        const bar = "🟦".repeat(Math.round(hype/10)) + "⬛".repeat(10 - Math.round(hype/10));
        return new EmbedBuilder()
            .setTitle(recording ? `🔴 RECORDING LIVE: <@${speakerId}>` : `🎶 NOW PERFORMING: <@${speakerId}>`)
            .setDescription(`**Hype Meter:**\n${bar} **${hype}%**\n\n*Audience: Use buttons to cheer! Singer: Hit Record for a demo!*`)
            .setColor(recording ? 0xff0000 : (hype > 80 ? 0xFEE75C : 0x5865F2));
    };

    const hypeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hype_clap`).setLabel('👏').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`hype_fire`).setLabel('🔥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`hype_record`).setLabel('⏺️ Record Me').setStyle(ButtonStyle.Danger)
    );

    const hypeMsg = await channel.send({ embeds: [getHypeEmbed(currentHype, false)], components: [hypeRow] });
    const collector = hypeMsg.createMessageComponentCollector({ time: 600000 });
    data.activeHypeCollector = collector;

    const refreshLoop = setInterval(async () => {
        if (data.currentSpeaker !== speakerId) return clearInterval(refreshLoop);
        currentHype = Math.max(currentHype - DECAY_RATE, 0);
        try { await hypeMsg.edit({ embeds: [getHypeEmbed(currentHype, isRecording)] }); } catch (e) { clearInterval(refreshLoop); }
    }, UPDATE_INTERVAL);

    collector.on('collect', async i => {
        if (i.customId === 'hype_record') {
            if (i.user.id !== speakerId) return i.reply({ content: "Only the singer can record!", ephemeral: true });
            if (isRecording) return i.reply({ content: "Already recording!", ephemeral: true });

            const vc = i.member.voice.channel;
            if (!vc) return i.reply({ content: "Join VC first!", ephemeral: true });

            isRecording = true;
            await i.reply({ content: "🔴 Recording started! I will DM you the MP3 when finished.", ephemeral: true });

            connection = joinVoiceChannel({ channelId: vc.id, guildId: i.guild.id, adapterCreator: i.guild.voiceAdapterCreator, selfDeaf: false });
            
            const fileName = `./recordings/${speakerId}-${Date.now()}.mp3`;
            const outStream = fs.createWriteStream(fileName);
            const opusStream = connection.receiver.subscribe(speakerId, { end: { behavior: EndBehaviorType.Manual } });
            
            const transcoder = new prism.FFmpeg({
                args: ['-f', 's16le', '-ar', '48000', '-ac', '2', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3']
            });

            opusStream.pipe(transcoder).pipe(outStream);

            collector.once('end', () => {
                opusStream.destroy();
                outStream.end();
                if (connection) connection.destroy();
                setTimeout(async () => {
                    try {
                        const user = await client.users.fetch(speakerId);
                        await user.send({ content: "🎁 Here is your Drowsy Vocals Demo!", files: [fileName] });
                    } catch (e) { console.log("DM failed."); }
                }, 2000);
            });
        } else if (i.customId.startsWith('hype_')) {
            currentHype = Math.min(currentHype + 8, MAX_HYPE);
            await i.deferUpdate();
        }
    });

    collector.on('end', () => {
        clearInterval(refreshLoop);
        hypeMsg.edit({ components: [] }).catch(() => {});
    });
}

async function handleNextSpeaker(channel, data) {
    if (data.queue.length > 0) {
        data.currentSpeaker = data.queue.shift();
        await startHypeSession(channel, data);
    } else {
        if (data.activeHypeCollector) data.activeHypeCollector.stop();
        data.currentSpeaker = null;
        await channel.send("📭 The queue is now empty.");
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    if (interaction.isButton() && interaction.customId.startsWith('hype_')) return;

    const data = getChannelData(interaction.channelId);
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (['start-queue', 'stop-queue', 'next'].includes(commandName) && !isAdmin(member)) 
            return interaction.reply({ content: "❌ No permission.", ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        if (commandName === 'start-queue' || commandName === 'queue') {
            await refreshPopup(interaction.channel);
            await interaction.editReply("Refreshed!");
        } else if (commandName === 'stop-queue') {
            if (data.activeHypeCollector) data.activeHypeCollector.stop();
            channelData.delete(interaction.channelId);
            await interaction.editReply("Stopped.");
        } else if (commandName === 'next') {
            await handleNextSpeaker(interaction.channel, data);
            await refreshPopup(interaction.channel);
            await interaction.editReply("Next!");
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'join') {
            if (!member.voice.channel) return interaction.reply({ content: "Join VC first!", ephemeral: true });
            if (data.queue.includes(interaction.user.id) || data.currentSpeaker === interaction.user.id) 
                return interaction.reply({ content: "Already in line!", ephemeral: true });
            data.queue.push(interaction.user.id);
        } else if (interaction.customId === 'leave') {
            const wasSpeaker = data.currentSpeaker === interaction.user.id;
            data.queue = data.queue.filter(id => id !== interaction.user.id);
            if (wasSpeaker) { data.currentSpeaker = null; await handleNextSpeaker(interaction.channel, data); }
        } else if (interaction.customId === 'finished') {
            if (interaction.user.id !== data.currentSpeaker) return interaction.reply({ content: "Not your turn!", ephemeral: true });
            await handleNextSpeaker(interaction.channel, data);
        }
        await interaction.deferUpdate();
        await refreshPopup(interaction.channel);
    }
});

client.login(process.env.DISCORD_TOKEN);