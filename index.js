require('dotenv').config();
const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder 
} = require('discord.js');
const { 
    joinVoiceChannel, EndBehaviorType, createAudioPlayer, 
    createAudioResource, AudioPlayerStatus, NoSubscriberBehavior 
} = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, 
        GatewayIntentBits.GuildMembers 
    ] 
});

// Ensure folders exist
if (!fs.existsSync('./recordings')) fs.mkdirSync('./recordings');
if (!fs.existsSync('./assets')) fs.mkdirSync('./assets');

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
            queue: [], currentSpeaker: null, lastMessageId: null,
            activeHypeCollector: null, radioPlayer: null, voiceConnection: null
        });
    }
    return channelData.get(channelId);
}

// --- RADIO LOGIC (WITH LOOP) ---
async function startRadio(channel, data) {
    const vc = channel.guild.members.cache.get(client.user.id)?.voice.channel || 
               channel.guild.channels.cache.find(c => c.type === 2 && c.members.size > 0);
    
    if (!vc) return console.log("📡 No VC found for radio.");

    data.voiceConnection = joinVoiceChannel({
        channelId: vc.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false
    });

    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    
    const playTrack = () => {
        if (fs.existsSync('./assets/intermission.mp3')) {
            const resource = createAudioResource('./assets/intermission.mp3');
            player.play(resource);
            data.voiceConnection.subscribe(player);
            data.radioPlayer = player;
        }
    };

    // THE LOOP FIX
    player.on(AudioPlayerStatus.Idle, () => {
        if (data.radioPlayer) {
            console.log("🔄 Radio track finished. Looping...");
            playTrack();
        }
    });

    playTrack();
    await channel.send("📻 **Radio Mode:** Looping background vibes.");
}

function stopRadio(data) {
    if (data.radioPlayer) {
        data.radioPlayer.stop();
        data.radioPlayer = null;
    }
}

// --- SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName('start-queue').setDescription('Start the event (Staff Only)'),
    new SlashCommandBuilder().setName('stop-queue').setDescription('Stop the event (Staff Only)'),
    new SlashCommandBuilder().setName('next').setDescription('Move to next speaker (Staff Only)'),
    new SlashCommandBuilder().setName('radio').setDescription('Toggle background music manually')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🎙️ Drowsy Vocals PRO-EDITION Online!`);
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try { await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- UI REFRESH ---
async function refreshPopup(channel) {
    const data = getChannelData(channel.id);
    if (data.lastMessageId) {
        try { const m = await channel.messages.fetch(data.lastMessageId); if (m) await m.delete(); } catch (e) {}
    }
    const embed = new EmbedBuilder()
        .setTitle("💤 Drowsy Speaker Queue")
        .setDescription(`**Current Mic:** ${data.currentSpeaker ? `<@${data.currentSpeaker}>` : "Open Mic"}\n\n**Next:**\n${data.queue.length > 0 ? data.queue.map((id, i) => `**${i+1}.** <@${id}>`).join('\n') : "*The queue is empty.*"}`)
        .setColor(0x5865F2);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('Join Queue').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('finished').setLabel('Done 🏁').setStyle(ButtonStyle.Success)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    data.lastMessageId = msg.id;
}

// --- HYPE & RECORDING SESSION ---
async function startHypeSession(channel, data) {
    stopRadio(data); 
    if (data.activeHypeCollector) data.activeHypeCollector.stop();
    
    let currentHype = 30; 
    let isRecording = false;
    const speakerId = data.currentSpeaker;

    const getHypeEmbed = (h, r) => {
        const bar = "🟦".repeat(Math.round(h/10)) + "⬛".repeat(10 - Math.round(h/10));
        return new EmbedBuilder()
            .setTitle(r ? `🔴 RECORDING LIVE: <@${speakerId}>` : `🎶 NOW SINGING: <@${speakerId}>`)
            .setDescription(`**Hype Meter:**\n${bar} **${h}%**\n\n*Singer: Hit Record for a high-quality demo!*`)
            .setColor(r ? 0xff0000 : (h > 80 ? 0xFEE75C : 0x5865F2));
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hype_c`).setLabel('👏').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`hype_f`).setLabel('🔥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`hype_r`).setLabel('⏺️ Record Me').setStyle(ButtonStyle.Danger)
    );

    const hypeMsg = await channel.send({ content: `🎙️ **Attention! <@${speakerId}> is on stage!**`, embeds: [getHypeEmbed(currentHype, false)], components: [row] });
    const collector = hypeMsg.createMessageComponentCollector({ time: 900000 }); // 15 mins
    data.activeHypeCollector = collector;

    const loop = setInterval(async () => {
        if (data.currentSpeaker !== speakerId) return clearInterval(loop);
        currentHype = Math.max(currentHype - DECAY_RATE, 0);
        try { await hypeMsg.edit({ embeds: [getHypeEmbed(currentHype, isRecording)] }); } catch (e) { clearInterval(loop); }
    }, UPDATE_INTERVAL);

    collector.on('collect', async i => {
        if (i.customId === 'hype_r') {
            if (i.user.id !== speakerId) return i.reply({ content: "Only the singer can record!", ephemeral: true });
            if (isRecording) return i.reply({ content: "Already recording!", ephemeral: true });

            const vc = i.member.voice.channel;
            if (!vc) return i.reply({ content: "Join VC first!", ephemeral: true });

            isRecording = true;
            await i.reply({ content: "🔴 Recording... I will DM you the MP3 when your turn ends!", ephemeral: true });
            
            data.voiceConnection = joinVoiceChannel({ channelId: vc.id, guildId: i.guild.id, adapterCreator: i.guild.voiceAdapterCreator, selfDeaf: false });
            
            const fileName = `./recordings/${speakerId}-${Date.now()}.mp3`;
            const outStream = fs.createWriteStream(fileName);
            const opusStream = data.voiceConnection.receiver.subscribe(speakerId, { end: { behavior: EndBehaviorType.Manual } });
            const transcoder = new prism.FFmpeg({ args: ['-f', 's16le', '-ar', '48000', '-ac', '2', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3'] });

            opusStream.pipe(transcoder).pipe(outStream);

            collector.once('end', () => {
                // THE RECORDING BUFFER FIX: Wait 2.5s to flush audio
                setTimeout(() => {
                    opusStream.destroy();
                    outStream.end();
                    setTimeout(async () => {
                        try {
                            const user = await client.users.fetch(speakerId);
                            await user.send({ content: "🎁 Here is your Drowsy Vocals Demo!", files: [fileName] });
                        } catch (e) { console.log("DM failed."); }
                    }, 2000);
                }, 2500);
            });
        } else if (i.customId.startsWith('hype_')) {
            currentHype = Math.min(currentHype + 8, MAX_HYPE);
            await i.deferUpdate();
        }
    });

    collector.on('end', () => { clearInterval(loop); hypeMsg.edit({ components: [] }).catch(() => {}); });
}

async function handleNextSpeaker(channel, data) {
    if (data.queue.length > 0) {
        data.currentSpeaker = data.queue.shift();
        await startHypeSession(channel, data);
    } else {
        data.currentSpeaker = null;
        if (data.activeHypeCollector) data.activeHypeCollector.stop();
        await startRadio(channel, data); 
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    if (interaction.isButton() && interaction.customId.startsWith('hype_')) return;

    const data = getChannelData(interaction.channelId);
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (['start-queue', 'stop-queue', 'next', 'radio'].includes(commandName) && !isAdmin(member)) return interaction.reply({ content: "Staff Only.", ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        if (commandName === 'start-queue') {
            await refreshPopup(interaction.channel);
            await startRadio(interaction.channel, data);
            await interaction.editReply("Event Started!");
        } else if (commandName === 'next') {
            await handleNextSpeaker(interaction.channel, data);
            await refreshPopup(interaction.channel);
            await interaction.editReply("Moved to next!");
        } else if (commandName === 'radio') {
            data.radioPlayer ? stopRadio(data) : await startRadio(interaction.channel, data);
            await interaction.editReply("Radio Toggled.");
        } else if (commandName === 'stop-queue') {
            stopRadio(data);
            if (data.voiceConnection) data.voiceConnection.destroy();
            channelData.delete(interaction.channelId);
            await interaction.editReply("Event Stopped.");
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'join') {
            if (!member.voice.channel) return interaction.reply({ content: "Join VC first!", ephemeral: true });
            if (data.queue.includes(interaction.user.id) || data.currentSpeaker === interaction.user.id) return interaction.reply({ content: "Already in line!", ephemeral: true });
            data.queue.push(interaction.user.id);
        } else if (interaction.customId === 'leave') {
            data.queue = data.queue.filter(id => id !== interaction.user.id);
            if (data.currentSpeaker === interaction.user.id) { data.currentSpeaker = null; await handleNextSpeaker(interaction.channel, data); }
        } else if (interaction.customId === 'finished') {
            if (interaction.user.id !== data.currentSpeaker) return interaction.reply({ content: "Not your turn!", ephemeral: true });
            await handleNextSpeaker(interaction.channel, data);
        }
        await interaction.deferUpdate();
        await refreshPopup(interaction.channel);
    }
});

client.login(process.env.DISCORD_TOKEN);