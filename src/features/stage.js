const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
} = require('@discordjs/voice');

function createStageFeature({ config, state, helpers }) {
    function writeObsNowSinging(text) {
        fs.writeFileSync(config.FILES.obsNowSinging, `${text}\n`, 'utf8');
    }

    async function startRadio(guild, session) {
        if (!session.targetVC) return;

        session.voiceConnection = joinVoiceChannel({
            channelId: session.targetVC,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
        const playTrack = () => {
            const trackPath = path.join(config.ASSETS_DIR, 'intermission.mp3');
            if (!fs.existsSync(trackPath)) return;

            const resource = createAudioResource(trackPath);
            player.play(resource);
            if (session.voiceConnection) session.voiceConnection.subscribe(player);
            session.radioPlayer = player;
        };

        player.on(AudioPlayerStatus.Idle, () => {
            if (session.radioPlayer) playTrack();
        });

        playTrack();
    }

    function stopRadio(session) {
        if (session.radioPlayer) {
            session.radioPlayer.stop();
            session.radioPlayer = null;
        }
    }

    function buildQueueEmbed(channel, session) {
        return new EmbedBuilder()
            .setTitle('Drowsy Multi-Stage Queue')
            .setDescription(`On Stage: ${session.currentSpeaker ? `<@${session.currentSpeaker}>` : 'Open Mic'}\nCurrent VC: <#${session.targetVC}>\n\nComing Up:\n${session.queue.length > 0 ? session.queue.map((id, index) => `${index + 1}. <@${id}>`).join('\n') : 'The queue is empty.'}`)
            .setColor(0x5865F2)
            .setFooter({ text: `Control Room: #${channel.name}` });
    }

    function buildQueueButtons() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('join').setLabel('Join Queue').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('finished').setLabel('Done').setStyle(ButtonStyle.Success)
        );
    }

    async function refreshPanel(channel, session) {
        const previousMessageId = session.panelMessageIds.get(channel.id);
        if (previousMessageId) {
            const previousMessage = await channel.messages.fetch(previousMessageId).catch(() => null);
            if (previousMessage) await previousMessage.delete().catch(() => {});
        }

        const message = await channel.send({ embeds: [buildQueueEmbed(channel, session)], components: [buildQueueButtons()] });
        session.panelMessageIds.set(channel.id, message.id);
    }

    async function refreshAllPanels(guild, session) {
        for (const channelId of [...session.panelChannelIds]) {
            const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
            if (!channel?.isTextBased()) {
                session.panelChannelIds.delete(channelId);
                session.panelMessageIds.delete(channelId);
                continue;
            }

            await refreshPanel(channel, session);
        }
    }

    async function announceCurrentSpeaker(guild, session) {
        stopRadio(session);
        const speakerId = session.currentSpeaker;
        const speakerMember = await guild.members.fetch(speakerId).catch(() => null);
        const speakerName = speakerMember?.displayName ?? speakerMember?.user?.username ?? 'Unknown Singer';

        writeObsNowSinging(speakerName);

        const nowSingingEmbed = new EmbedBuilder()
            .setTitle('Now Singing')
            .setDescription(`<@${speakerId}>\nStage: <#${session.targetVC}>`)
            .setColor(0x5865F2);

        for (const channelId of session.panelChannelIds) {
            const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
            if (!channel?.isTextBased()) continue;

            await channel.send({
                content: `<@${speakerId}>, the floor is yours in <#${session.targetVC}>!`,
                embeds: [nowSingingEmbed],
            }).catch(() => {});
        }
    }

    async function handleNextSpeaker(guild, session) {
        if (session.queue.length > 0) {
            session.currentSpeaker = session.queue.shift();
            await announceCurrentSpeaker(guild, session);
            return;
        }

        session.currentSpeaker = null;
        writeObsNowSinging('Open Mic');
        await startRadio(guild, session);
    }

    async function startStage(channel, voiceChannelId) {
        const existingSession = state.peekGuildStageSession(channel.guild.id);
        if (existingSession) {
            if (existingSession.targetVC !== voiceChannelId) {
                return { status: 'conflict', targetVC: existingSession.targetVC };
            }

            const hadPanel = existingSession.panelChannelIds.has(channel.id);
            existingSession.panelChannelIds.add(channel.id);
            await refreshAllPanels(channel.guild, existingSession);
            return { status: hadPanel ? 'existing-panel' : 'added-panel', targetVC: existingSession.targetVC };
        }

        const session = state.getGuildStageSession(channel.guild.id);
        session.targetVC = voiceChannelId;
        session.panelChannelIds.add(channel.id);
        writeObsNowSinging('Open Mic');
        await refreshAllPanels(channel.guild, session);
        await startRadio(channel.guild, session);
        return { status: 'created', targetVC: session.targetVC };
    }

    async function nextSpeaker(channel) {
        const session = state.peekGuildStageSession(channel.guild.id);
        if (!session) return { status: 'missing' };

        await handleNextSpeaker(channel.guild, session);
        await refreshAllPanels(channel.guild, session);
        return { status: 'ok', currentSpeaker: session.currentSpeaker };
    }

    async function toggleRadio(channel) {
        const session = state.peekGuildStageSession(channel.guild.id);
        if (!session) return { status: 'missing' };

        if (session.radioPlayer) {
            stopRadio(session);
            return { status: 'stopped' };
        }

        await startRadio(channel.guild, session);
        return { status: 'started' };
    }

    async function stopStage(channel) {
        const session = state.peekGuildStageSession(channel.guild.id);
        if (!session) return { status: 'missing' };

        stopRadio(session);
        if (session.voiceConnection) session.voiceConnection.destroy();

        for (const [panelChannelId, messageId] of session.panelMessageIds.entries()) {
            const panelChannel = channel.guild.channels.cache.get(panelChannelId) ?? await channel.guild.channels.fetch(panelChannelId).catch(() => null);
            if (!panelChannel?.isTextBased()) continue;
            const panelMessage = await panelChannel.messages.fetch(messageId).catch(() => null);
            if (panelMessage) await panelMessage.delete().catch(() => {});
        }

        writeObsNowSinging('Show Ended');
        state.clearGuildStageSession(channel.guild.id);
        return { status: 'stopped' };
    }

    async function handleButtonInteraction(interaction) {
        if (!interaction.isButton()) return false;

        const session = state.peekGuildStageSession(interaction.guild.id);
        if (!session) {
            await interaction.reply(helpers.privateReply('This control panel is no longer active.'));
            return true;
        }

        if (!session.panelChannelIds.has(interaction.channelId)) {
            await interaction.reply(helpers.privateReply('This control panel is no longer active.'));
            return true;
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (interaction.customId === 'join') {
            if (!member.voice.channel || member.voice.channelId !== session.targetVC) {
                await interaction.reply(helpers.privateReply(`You must be in <#${session.targetVC}> to join this queue.`));
                return true;
            }

            if (session.queue.includes(interaction.user.id) || session.currentSpeaker === interaction.user.id) {
                await interaction.reply(helpers.privateReply('You are already in the lineup.'));
                return true;
            }

            session.queue.push(interaction.user.id);
        } else if (interaction.customId === 'leave') {
            session.queue = session.queue.filter(id => id !== interaction.user.id);
            if (session.currentSpeaker === interaction.user.id) {
                session.currentSpeaker = null;
                await handleNextSpeaker(interaction.guild, session);
            }
        } else if (interaction.customId === 'finished') {
            if (interaction.user.id !== session.currentSpeaker) {
                await interaction.reply(helpers.privateReply('It is not your turn.'));
                return true;
            }

            await handleNextSpeaker(interaction.guild, session);
        } else {
            return false;
        }

        await interaction.deferUpdate();
        await refreshAllPanels(interaction.guild, session);
        return true;
    }

    return {
        startStage,
        nextSpeaker,
        toggleRadio,
        stopStage,
        handleButtonInteraction,
    };
}

module.exports = { createStageFeature };