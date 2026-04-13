require('dotenv').config();
const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, EmbedBuilder, MessageFlags, REST, Routes, SlashCommandBuilder, ChannelType
} = require('discord.js');
const { 
    joinVoiceChannel, EndBehaviorType, createAudioPlayer, 
    createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, 
    getVoiceConnection, VoiceConnectionStatus
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

// Setup Folders
if (!fs.existsSync('./recordings')) fs.mkdirSync('./recordings');
if (!fs.existsSync('./assets')) fs.mkdirSync('./assets');

const BOT_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const MAX_HYPE = 100;
const DECAY_RATE = 3; 
const UPDATE_INTERVAL = 4000; 

// This Map stores EVERYTHING unique to each text channel
const channelData = new Map();

function privateReply(content) {
    return { content, flags: MessageFlags.Ephemeral };
}

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
            radioPlayer: null, 
            voiceConnection: null, 
            targetVC: null 
        });
    }
    return channelData.get(channelId);
}

// --- INDEPENDENT RADIO LOGIC ---
async function startRadio(channel, data) {
    if (!data.targetVC) return;

    // Connect to the VC assigned to THIS channel
    data.voiceConnection = joinVoiceChannel({
        channelId: data.targetVC,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false
    });

    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    
    const playTrack = () => {
        if (fs.existsSync('./assets/intermission.mp3')) {
            const resource = createAudioResource('./assets/intermission.mp3');
            player.play(resource);
            if (data.voiceConnection) data.voiceConnection.subscribe(player);
            data.radioPlayer = player;
        }
    };

    player.on(AudioPlayerStatus.Idle, () => {
        if (data.radioPlayer) {
            console.log(`🔄 [Stage ${channel.id}] Looping radio...`);
            playTrack();
        }
    });

    playTrack();
}

function stopRadio(data) {
    if (data.radioPlayer) {
        data.radioPlayer.stop();
        data.radioPlayer = null;
    }
}

// --- SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName('start-queue').setDescription('Launch a stage in this channel (Staff Only)'),
    new SlashCommandBuilder().setName('stop-queue').setDescription('Shutdown this stage (Staff Only)'),
    new SlashCommandBuilder().setName('next').setDescription('Next performer (Staff Only)'),
    new SlashCommandBuilder().setName('radio').setDescription('Toggle background vibes manually')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🎙️ Drowsy Multi-Stage Hub Online!`);
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try { await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- UI REFRESH (Independent per Channel) ---
async function refreshPopup(channel) {
    const data = getChannelData(channel.id);
    if (data.lastMessageId) {
        try { const m = await channel.messages.fetch(data.lastMessageId); if (m) await m.delete(); } catch (e) {}
    }
    
    const embed = new EmbedBuilder()
        .setTitle("💤 Drowsy Multi-Stage Queue")
        .setDescription(`## **On Stage:** ${data.currentSpeaker ? `<@${data.currentSpeaker}>` : "Open Mic"}\n**Current VC:** <#${data.targetVC}>\n\n**Coming Up:**\n${data.queue.length > 0 ? data.queue.map((id, i) => `**${i+1}.** <@${id}>`).join('\n') : "*The queue is empty.*"}`)
        .setColor(0x5865F2)
        .setFooter({ text: `Control Room: #${channel.name}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('Join Queue').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('finished').setLabel('Done 🏁').setStyle(ButtonStyle.Success)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    data.lastMessageId = msg.id;
}

// --- HYPE & RECORDING (Independent per Channel) ---
async function startHypeSession(channel, data) {
    stopRadio(data); 
    if (data.activeHypeCollector) data.activeHypeCollector.stop();
    
    let currentHype = 30; 
    let isRecording = false;
    const speakerId = data.currentSpeaker;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hype_c`).setLabel('👏').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`hype_f`).setLabel('🔥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`hype_r`).setLabel('⏺️ Record Me').setStyle(ButtonStyle.Danger)
    );

    const getHypeEmbed = (h, r) => {
        const bar = "🟦".repeat(Math.round(h/10)) + "⬛".repeat(10 - Math.round(h/10));
        return new EmbedBuilder()
            .setTitle(r ? `🔴 RECORDING LIVE` : `🎶 NOW SINGING`)
            .setDescription(`### <@${speakerId}>\n**Hype Meter:**\n${bar} **${h}%**\nStage: <#${data.targetVC}>`)
            .setColor(r ? 0xff0000 : (h > 80 ? 0xFEE75C : 0x5865F2));
    };

    const hypeMsg = await channel.send({ content: `🎙️ <@${speakerId}>, the floor is yours in <#${data.targetVC}>!`, embeds: [getHypeEmbed(currentHype, false)], components: [row] });
    const collector = hypeMsg.createMessageComponentCollector({ time: 1200000 }); // 20 mins max
    data.activeHypeCollector = collector;

    const loop = setInterval(async () => {
        if (data.currentSpeaker !== speakerId) return clearInterval(loop);
        currentHype = Math.max(currentHype - DECAY_RATE, 0);
        try { await hypeMsg.edit({ embeds: [getHypeEmbed(currentHype, isRecording)] }); } catch (e) { clearInterval(loop); }
    }, UPDATE_INTERVAL);

    collector.on('collect', async i => {
        if (i.customId === 'hype_r') {
            if (i.user.id !== speakerId) return i.reply(privateReply("Only the singer can record!"));
            if (isRecording) return i.reply(privateReply("Recording already active!"));

            isRecording = true;
            await i.reply(privateReply("🔴 Recording... Your demo will be DMed when your set ends!"));
            
            const fileName = `./recordings/${speakerId}-${Date.now()}.mp3`;
            const outStream = fs.createWriteStream(fileName);
            const opusStream = data.voiceConnection.receiver.subscribe(speakerId, { end: { behavior: EndBehaviorType.Manual } });
            const transcoder = new prism.FFmpeg({ args: ['-f', 's16le', '-ar', '48000', '-ac', '2', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3'] });

            opusStream.pipe(transcoder).pipe(outStream);

            collector.once('end', () => {
                setTimeout(() => {
                    opusStream.destroy(); outStream.end();
                    setTimeout(async () => {
                        try {
                            if (fs.statSync(fileName).size > 1000) {
                                const user = await client.users.fetch(speakerId);
                                await user.send({ content: `🎁 Here is your Demo from <#${data.targetVC}>!`, files: [fileName] });
                            }
                        } catch (e) { console.log("Recording failed/empty."); }
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

// --- ALLOWLIST FOR INVITE LINKS ---
const ALLOW_INVITE_PASSWORD = process.env.ALLOW_INVITE_PASSWORD; // Change this password as needed
const allowedInviteUsers = new Set();

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // DM command to allow invite links
    if (message.channel.type === ChannelType.DM && message.content.startsWith('!allowinvite ')) {
        const input = message.content.slice('!allowinvite '.length).trim();
        if (input === ALLOW_INVITE_PASSWORD) {
            allowedInviteUsers.add(message.author.id);
            await message.reply('✅ You are now allowed to send Discord invite links in the server.');
        } else {
            await message.reply('❌ Incorrect password.');
        }
        return;
    }

    // Regex for Discord invite links
    const inviteRegex = /(discord\.gg\/\w+|discord\.com\/invite\/\w+)/i;
    if (inviteRegex.test(message.content)) {
        try {
            const guild = message.guild;
            // Allow server owner or allowed users
            if ((guild && message.author.id === guild.ownerId) || allowedInviteUsers.has(message.author.id)) return;
            await message.delete();
            await message.channel.send({ content: `🚫 Invite links are not allowed!`, ephemeral: true });
        } catch (e) {
            // Ignore errors (e.g., missing permissions)
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    const data = getChannelData(interaction.channelId);

    if (interaction.isChatInputCommand()) {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!isAdmin(member)) return interaction.reply(privateReply("Staff Only."));

        if (interaction.commandName === 'start-queue') {
            if (!member.voice.channel) return interaction.reply(privateReply("❌ Error: Join the Voice Channel you want me to host in first!"));
            
            data.targetVC = member.voice.channelId;
            await refreshPopup(interaction.channel);
            await startRadio(interaction.channel, data);
            return interaction.reply(privateReply(`✅ Stage initialized for <#${data.targetVC}>`));
        }

        if (interaction.commandName === 'next') {
            await handleNextSpeaker(interaction.channel, data);
            await refreshPopup(interaction.channel);
            return interaction.reply(privateReply("➡️ Mic passed!"));
        }

        if (interaction.commandName === 'radio') {
            data.radioPlayer ? stopRadio(data) : await startRadio(interaction.channel, data);
            return interaction.reply(privateReply("📻 Radio toggled."));
        }

        if (interaction.commandName === 'stop-queue') {
            stopRadio(data);
            if (data.voiceConnection) data.voiceConnection.destroy();
            channelData.delete(interaction.channelId);
            return interaction.reply(privateReply("🏁 Event finished. Connection closed."));
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId.startsWith('hype_')) return;

        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (interaction.customId === 'join') {
            if (!member.voice.channel || member.voice.channelId !== data.targetVC) 
                return interaction.reply(privateReply(`❌ You must be in <#${data.targetVC}> to join this specific queue!`));
            
            if (data.queue.includes(interaction.user.id) || data.currentSpeaker === interaction.user.id) 
                return interaction.reply(privateReply("You're already in the lineup!"));
            
            data.queue.push(interaction.user.id);
        } else if (interaction.customId === 'leave') {
            data.queue = data.queue.filter(id => id !== interaction.user.id);
            if (data.currentSpeaker === interaction.user.id) { data.currentSpeaker = null; await handleNextSpeaker(interaction.channel, data); }
        } else if (interaction.customId === 'finished') {
            if (interaction.user.id !== data.currentSpeaker) return interaction.reply(privateReply("Not your turn!"));
            await handleNextSpeaker(interaction.channel, data);
        } else {
            return;
        }
        await interaction.deferUpdate();
        await refreshPopup(interaction.channel);
    }
});

client.login(process.env.DISCORD_TOKEN);