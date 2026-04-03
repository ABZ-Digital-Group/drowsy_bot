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

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildVoiceStates, 
        GatewayIntentBits.GuildMembers 
    ] 
});

const BOT_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// --- CONFIGURATION ---
const MAX_HYPE = 100;
const DECAY_RATE = 3; 
const UPDATE_INTERVAL = 4000; 

const channelData = new Map();

// --- PERMISSION CHECK ---
function isAdmin(member) {
    if (member.guild.ownerId === member.id) return true;
    const allowedRoles = ['Guards', 'Knights', 'Drowsy Defenders', 'God'];
    return member.roles.cache.some(role => allowedRoles.includes(role.name));
}

function getChannelData(channelId) {
    if (!channelData.has(channelId)) {
        channelData.set(channelId, { 
            queue: [], 
            currentSpeaker: null, 
            lastMessageId: null,
            activeHypeCollector: null 
        });
    }
    return channelData.get(channelId);
}

// --- EMBED BUILDERS ---
function createQueueEmbed(data) {
    const list = data.queue.length > 0 
        ? data.queue.map((id, i) => `**${i + 1}.** <@${id}>`).join('\n') 
        : "*The queue is empty. Anyone can chat!*";

    return new EmbedBuilder()
        .setTitle("💤 Drowsy Speaker Queue")
        .setDescription(`**Currently on the Mic:** ${data.currentSpeaker ? `<@${data.currentSpeaker}>` : "Open Mic"}\n\n**Up Next:**\n${list}`)
        .setColor(0x5865F2)
        .setFooter({ text: "Join the line to get your turn! Must be in VC." });
}

function createButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('Join Queue').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('finished').setLabel('Done Speaking 🏁').setStyle(ButtonStyle.Success)
    );
}

// --- SLASH COMMAND REGISTRATION ---
const commands = [
    new SlashCommandBuilder().setName('start-queue').setDescription('Start the event queue (Staff Only)'),
    new SlashCommandBuilder().setName('stop-queue').setDescription('Stop the event (Staff Only)'),
    new SlashCommandBuilder().setName('queue').setDescription('Repost the queue at the bottom'),
    new SlashCommandBuilder().setName('next').setDescription('Move to next speaker (Staff Only)')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🎙️ Drowsy Vocals is online as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (e) { console.error(e); }
});

// --- CORE FUNCTIONS ---
async function refreshPopup(channel) {
    const data = getChannelData(channel.id);
    if (data.lastMessageId) {
        try {
            const oldMsg = await channel.messages.fetch(data.lastMessageId);
            if (oldMsg) await oldMsg.delete();
        } catch (e) {}
    }
    const newMsg = await channel.send({ embeds: [createQueueEmbed(data)], components: [createButtonRow()] });
    data.lastMessageId = newMsg.id;
}

async function startHypeSession(channel, data) {
    if (data.activeHypeCollector) {
        data.activeHypeCollector.stop();
        data.activeHypeCollector = null;
    }

    let currentHype = 35; // Starting boost
    const speakerId = data.currentSpeaker;
    console.log(`Starting Hype Session for: ${speakerId}`);

    const getHypeEmbed = (hype) => {
        const progress = Math.round((hype / MAX_HYPE) * 10);
        const bar = "🟦".repeat(progress) + "⬛".repeat(10 - progress);
        return new EmbedBuilder()
            .setTitle(`🎶 NOW PERFORMING:`)
            .setDescription(`## <@${speakerId}>\n\n**Hype Meter:**\n${bar} **${hype}%**\n\n*Audience: Smash the buttons to cheer!*`)
            .setColor(hype > 80 ? 0xFEE75C : 0x5865F2);
    };

    const hypeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hype_clap`).setLabel('👏').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`hype_fire`).setLabel('🔥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`hype_crown`).setLabel('👑').setStyle(ButtonStyle.Secondary)
    );

    const hypeMsg = await channel.send({ 
        content: `🎙️ **The stage is yours, <@${speakerId}>!**`,
        embeds: [getHypeEmbed(currentHype)], 
        components: [hypeRow] 
    });

    const collector = hypeMsg.createMessageComponentCollector({ time: 600000 });
    data.activeHypeCollector = collector;

    const refreshLoop = setInterval(async () => {
        // Kill loop if speaker changes or bot stops
        if (data.currentSpeaker !== speakerId || !data.activeHypeCollector) {
            clearInterval(refreshLoop);
            return;
        }

        currentHype = Math.max(currentHype - DECAY_RATE, 0);
        try {
            await hypeMsg.edit({ embeds: [getHypeEmbed(currentHype)] });
        } catch (e) { 
            clearInterval(refreshLoop); 
        }
    }, UPDATE_INTERVAL);

    collector.on('collect', async i => {
        if (i.customId.startsWith('hype_')) {
            currentHype = Math.min(currentHype + 7, MAX_HYPE);
            await i.deferUpdate();
        }
    });

    collector.on('end', () => {
        clearInterval(refreshLoop);
        hypeMsg.edit({ content: `✅ **Performance ended for <@${speakerId}>**`, components: [] }).catch(() => {});
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

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    
    // Safety: ignore hype buttons here
    if (interaction.isButton() && interaction.customId.startsWith('hype_')) return;

    const data = getChannelData(interaction.channelId);
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (['start-queue', 'stop-queue', 'next'].includes(commandName)) {
            if (!isAdmin(member)) return interaction.reply({ content: "❌ You don't have permission.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        if (commandName === 'start-queue' || commandName === 'queue') {
            await refreshPopup(interaction.channel);
            await interaction.editReply({ content: "Queue refreshed!" });
        }

        if (commandName === 'stop-queue') {
            if (data.activeHypeCollector) data.activeHypeCollector.stop();
            if (data.lastMessageId) {
                try {
                    const oldMsg = await interaction.channel.messages.fetch(data.lastMessageId);
                    await oldMsg.delete();
                } catch (e) {}
            }
            channelData.delete(interaction.channelId);
            await interaction.editReply({ content: "🏁 Event stopped." });
        }

        if (commandName === 'next') {
            await handleNextSpeaker(interaction.channel, data);
            await refreshPopup(interaction.channel);
            await interaction.editReply({ content: "Moved to next speaker!" });
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'join') {
            if (!member.voice.channel) return interaction.reply({ content: "❌ Join a Voice Channel first!", ephemeral: true });
            if (data.queue.includes(interaction.user.id) || data.currentSpeaker === interaction.user.id) 
                return interaction.reply({ content: "You're already in line!", ephemeral: true });
            
            data.queue.push(interaction.user.id);
        }

        if (interaction.customId === 'leave') {
            const wasSpeaker = data.currentSpeaker === interaction.user.id;
            data.queue = data.queue.filter(id => id !== interaction.user.id);
            if (wasSpeaker) {
                data.currentSpeaker = null;
                await handleNextSpeaker(interaction.channel, data);
            }
        }

        if (interaction.customId === 'finished') {
            if (interaction.user.id !== data.currentSpeaker) return interaction.reply({ content: "It's not your turn!", ephemeral: true });
            await handleNextSpeaker(interaction.channel, data);
        }

        await interaction.deferUpdate();
        await refreshPopup(interaction.channel);
    }
});

client.login(process.env.DISCORD_TOKEN);