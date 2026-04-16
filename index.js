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
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User],
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
bindAsync('interactionCreate', interaction => communityFeature.handleInteraction(interaction));

client.login(config.BOT_TOKEN);