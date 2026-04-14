const fs = require('fs');
const path = require('path');
const prism = require('prism-media');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require('discord.js');
const {
    joinVoiceChannel,
    EndBehaviorType,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
} = require('@discordjs/voice');

function createStageFeature({ client, config, state, helpers }) {
    async function startRadio(channel, data) {
        if (!data.targetVC) return;

        data.voiceConnection = joinVoiceChannel({
            channelId: data.targetVC,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
        const playTrack = () => {
            const trackPath = path.join(config.ASSETS_DIR, 'intermission.mp3');
            if (!fs.existsSync(trackPath)) return;

            const resource = createAudioResource(trackPath);
            player.play(resource);
            if (data.voiceConnection) data.voiceConnection.subscribe(player);
            data.radioPlayer = player;
        };

        player.on(AudioPlayerStatus.Idle, () => {
            if (data.radioPlayer) playTrack();
        });

        playTrack();
    }

    function stopRadio(data) {
        if (data.radioPlayer) {
            data.radioPlayer.stop();
            data.radioPlayer = null;
        }
    }

    async function refreshPopup(channel) {
        const data = state.getChannelData(channel.id);
        if (data.lastMessageId) {
            const previousMessage = await channel.messages.fetch(data.lastMessageId).catch(() => null);
            if (previousMessage) await previousMessage.delete().catch(() => {});
        }

        const embed = new EmbedBuilder()
            .setTitle('Drowsy Multi-Stage Queue')
            .setDescription(`On Stage: ${data.currentSpeaker ? `<@${data.currentSpeaker}>` : 'Open Mic'}\nCurrent VC: <#${data.targetVC}>\n\nComing Up:\n${data.queue.length > 0 ? data.queue.map((id, index) => `${index + 1}. <@${id}>`).join('\n') : 'The queue is empty.'}`)
            .setColor(0x5865F2)
            .setFooter({ text: `Control Room: #${channel.name}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('join').setLabel('Join Queue').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('finished').setLabel('Done').setStyle(ButtonStyle.Success)
        );

        const message = await channel.send({ embeds: [embed], components: [row] });
        data.lastMessageId = message.id;
    }

    async function startHypeSession(channel, data) {
        stopRadio(data);
        if (data.activeHypeCollector) data.activeHypeCollector.stop();

        const speakerId = data.currentSpeaker;
        let currentHype = 30;
        let isRecording = false;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('hype_c').setLabel('Clap').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('hype_f').setLabel('Fire').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('hype_r').setLabel('Record Me').setStyle(ButtonStyle.Danger)
        );

        const getHypeEmbed = (hype, recording) => {
            const filled = Math.round(hype / 10);
            const bar = `${'='.repeat(filled)}${'-'.repeat(10 - filled)}`;
            return new EmbedBuilder()
                .setTitle(recording ? 'Recording Live' : 'Now Singing')
                .setDescription(`<@${speakerId}>\nHype Meter: [${bar}] ${hype}%\nStage: <#${data.targetVC}>`)
                .setColor(recording ? 0xED4245 : (hype > 80 ? 0xFEE75C : 0x5865F2));
        };

        const hypeMessage = await channel.send({
            content: `<@${speakerId}>, the floor is yours in <#${data.targetVC}>!`,
            embeds: [getHypeEmbed(currentHype, false)],
            components: [row],
        });

        const collector = hypeMessage.createMessageComponentCollector({ time: 20 * 60 * 1000 });
        data.activeHypeCollector = collector;

        const hypeInterval = setInterval(async () => {
            if (data.currentSpeaker !== speakerId) {
                clearInterval(hypeInterval);
                return;
            }

            currentHype = Math.max(currentHype - config.DECAY_RATE, 0);
            await hypeMessage.edit({ embeds: [getHypeEmbed(currentHype, isRecording)] }).catch(() => {
                clearInterval(hypeInterval);
            });
        }, config.UPDATE_INTERVAL);

        collector.on('collect', async interaction => {
            if (interaction.customId === 'hype_r') {
                if (interaction.user.id !== speakerId) {
                    await interaction.reply(helpers.privateReply('Only the singer can record.'));
                    return;
                }

                if (isRecording) {
                    await interaction.reply(helpers.privateReply('Recording is already running.'));
                    return;
                }

                isRecording = true;
                await interaction.reply(helpers.privateReply('Recording started. Your demo will be sent by DM after the set ends.'));

                if (!data.voiceConnection?.receiver) return;

                const fileName = path.join(config.RECORDINGS_DIR, `${speakerId}-${Date.now()}.mp3`);
                const output = fs.createWriteStream(fileName);
                const opusStream = data.voiceConnection.receiver.subscribe(speakerId, { end: { behavior: EndBehaviorType.Manual } });
                const transcoder = new prism.FFmpeg({
                    args: ['-f', 's16le', '-ar', '48000', '-ac', '2', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3'],
                });

                opusStream.pipe(transcoder).pipe(output);

                collector.once('end', () => {
                    setTimeout(() => {
                        opusStream.destroy();
                        output.end();

                        setTimeout(async () => {
                            try {
                                const stats = fs.statSync(fileName);
                                if (stats.size > 1000) {
                                    const userRecord = await client.users.fetch(speakerId);
                                    await userRecord.send({ content: `Here is your demo from <#${data.targetVC}>.`, files: [fileName] });
                                }
                            } catch (error) {
                                console.error('Recording delivery failed:', error);
                            }
                        }, 2000);
                    }, 2500);
                });

                return;
            }

            currentHype = Math.min(currentHype + 8, config.MAX_HYPE);
            await interaction.deferUpdate();
        });

        collector.on('end', () => {
            clearInterval(hypeInterval);
            hypeMessage.edit({ components: [] }).catch(() => {});
        });
    }

    async function handleNextSpeaker(channel, data) {
        if (data.queue.length > 0) {
            data.currentSpeaker = data.queue.shift();
            await startHypeSession(channel, data);
            return;
        }

        data.currentSpeaker = null;
        if (data.activeHypeCollector) data.activeHypeCollector.stop();
        await startRadio(channel, data);
    }

    async function startStage(channel, voiceChannelId) {
        const data = state.getChannelData(channel.id);
        data.targetVC = voiceChannelId;
        await refreshPopup(channel);
        await startRadio(channel, data);
        return data;
    }

    async function nextSpeaker(channel) {
        const data = state.getChannelData(channel.id);
        await handleNextSpeaker(channel, data);
        await refreshPopup(channel);
    }

    async function toggleRadio(channel) {
        const data = state.getChannelData(channel.id);
        if (data.radioPlayer) stopRadio(data);
        else await startRadio(channel, data);
    }

    function stopStage(channelId) {
        const data = state.getChannelData(channelId);
        stopRadio(data);
        if (data.voiceConnection) data.voiceConnection.destroy();
        state.channelData.delete(channelId);
    }

    async function handleButtonInteraction(interaction) {
        if (!interaction.isButton()) return false;
        if (interaction.customId.startsWith('hype_')) return true;

        const data = state.getChannelData(interaction.channelId);
        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (interaction.customId === 'join') {
            if (!member.voice.channel || member.voice.channelId !== data.targetVC) {
                await interaction.reply(helpers.privateReply(`You must be in <#${data.targetVC}> to join this queue.`));
                return true;
            }

            if (data.queue.includes(interaction.user.id) || data.currentSpeaker === interaction.user.id) {
                await interaction.reply(helpers.privateReply('You are already in the lineup.'));
                return true;
            }

            data.queue.push(interaction.user.id);
        } else if (interaction.customId === 'leave') {
            data.queue = data.queue.filter(id => id !== interaction.user.id);
            if (data.currentSpeaker === interaction.user.id) {
                data.currentSpeaker = null;
                await handleNextSpeaker(interaction.channel, data);
            }
        } else if (interaction.customId === 'finished') {
            if (interaction.user.id !== data.currentSpeaker) {
                await interaction.reply(helpers.privateReply('It is not your turn.'));
                return true;
            }

            await handleNextSpeaker(interaction.channel, data);
        } else {
            return false;
        }

        await interaction.deferUpdate();
        await refreshPopup(interaction.channel);
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