require('dotenv').config();

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
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildModeration,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

const state = createState(config);
const helpers = createHelpers(config, state);
const stageFeature = createStageFeature({ client, config, state, helpers });
const communityFeature = createCommunityFeature({ client, config, state, helpers, stageFeature });

function bindAsync(eventName, handler) {
    client.on(eventName, (...args) => {
        Promise.resolve(handler(...args)).catch(error => {
            console.error(`Unhandled ${eventName} error:`, error);
        });
    });
}

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
bindAsync('messageDelete', message => communityFeature.handleMessageDelete(message));
bindAsync('messageDeleteBulk', messages => communityFeature.handleMessageDeleteBulk(messages));
bindAsync('messageUpdate', (oldMessage, newMessage) => communityFeature.handleMessageUpdate(oldMessage, newMessage));
bindAsync('guildMemberAdd', member => communityFeature.handleGuildMemberAdd(member));
bindAsync('guildMemberRemove', member => communityFeature.handleGuildMemberRemove(member));
bindAsync('guildMemberUpdate', (oldMember, newMember) => communityFeature.handleGuildMemberUpdate(oldMember, newMember));
bindAsync('guildBanAdd', ban => communityFeature.handleGuildBanAdd(ban));
bindAsync('guildBanRemove', ban => communityFeature.handleGuildBanRemove(ban));
bindAsync('channelCreate', channel => communityFeature.handleChannelCreate(channel));
bindAsync('channelDelete', channel => communityFeature.handleChannelDelete(channel));
bindAsync('channelUpdate', (oldChannel, newChannel) => communityFeature.handleChannelUpdate(oldChannel, newChannel));
bindAsync('roleCreate', role => communityFeature.handleRoleCreate(role));
bindAsync('roleDelete', role => communityFeature.handleRoleDelete(role));
bindAsync('roleUpdate', (oldRole, newRole) => communityFeature.handleRoleUpdate(oldRole, newRole));
bindAsync('emojiCreate', emoji => communityFeature.handleEmojiCreate(emoji));
bindAsync('emojiDelete', emoji => communityFeature.handleEmojiDelete(emoji));
bindAsync('emojiUpdate', (oldEmoji, newEmoji) => communityFeature.handleEmojiUpdate(oldEmoji, newEmoji));
bindAsync('messageReactionAdd', (reaction, user) => communityFeature.handleReactionAdd(reaction, user));
bindAsync('messageReactionRemove', (reaction, user) => communityFeature.handleReactionRemove(reaction, user));
bindAsync('interactionCreate', interaction => communityFeature.handleInteraction(interaction));

client.login(config.BOT_TOKEN);