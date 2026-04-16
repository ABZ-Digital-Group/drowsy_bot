# Drowsy Bot

Drowsy Bot is a Discord bot focused on three areas:

- hosted stage and queue events
- invite-link moderation and invite allowlisting

It is built with Node.js and discord.js and stores runtime data in JSON files under `data/`.

## Current Feature Set

- Multi-stage queue flow for voice events
- Intermission radio playback from a local MP3 file
- Public scheduled-event lookup
- Invite moderation with allowlist and cleanup tools

## Removed Systems

These systems are no longer part of the bot:

- reaction roles
- logging system
- moderation commands
- sticky-role handling

## Requirements

- Node.js 20 or newer
- A Discord application with a bot user
- A Discord server where the bot can be invited and managed

## Installation

```bash
git clone https://github.com/ABZ-Digital-Group/drowsy_bot.git
cd drowsy_bot
npm install
node index.js
```

## Environment Variables

Create a `.env` file:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
ALLOW_INVITE_PASSWORD=optional_dm_password
```

### Variable Reference

- `DISCORD_TOKEN`: bot token from the Discord developer portal
- `CLIENT_ID`: Discord application ID used to register guild commands
- `GUILD_ID`: guild where slash commands are registered
- `ALLOW_INVITE_PASSWORD`: optional password used by the DM command `!allowinvite <password>`

## Discord Intents

The bot uses these intents:

- Guilds
- GuildMessages
- MessageContent
- GuildVoiceStates
- GuildMembers
- DirectMessages
- GuildScheduledEvents

## Staff Access Model

Staff-only commands are available to:

- the guild owner
- members with `Administrator`
- members with `Manage Guild`
- members with `Moderate Members`
- members who hold one of these role names:
  - `Guards`
  - `Knights`
  - `Drowsy Defenders`
  - `God`

## Project Structure

```text
index.js
src/
  commands.js
  config.js
  helpers.js
  state.js
  features/
    community.js
    stage.js
assets/
data/
```

## Data Files

The bot creates and uses these files under `data/`:

- `guild-config.json`: guild-level bot settings
- `allowed-invite-users.json`: invite allowlist

Some older data files may still exist from previous versions, but they are no longer used by the current runtime.

## Stage Queue System

The stage queue is built for hosted performances or open-mic style events.

### Commands

- `/start-queue`
- `/stop-queue`
- `/next`
- `/radio`

### How It Works

1. A staff member joins the voice channel they want to host.
2. They run `/start-queue` in a text channel.
3. The bot posts a queue panel with buttons.
4. Staff can run `/start-queue` in additional text channels for the same active voice channel to create mirrored control panels.
5. Members join or leave the lineup using buttons from any active control panel.
6. Staff move the event forward with `/next` or the active speaker ends their turn with `Done`.

### Queue Buttons

- `Join Queue`
- `Leave`
- `Done`

### Notes

- `assets/intermission.mp3` is used for radio playback.
- only one voice channel can be active per server at a time
- multiple text-channel control panels can manage that same active voice channel

## Events System

The bot can post active and upcoming Discord scheduled events.

### Public Entry Points

- `/events`
- `-events`

### Behavior

- fetches scheduled events from the guild
- filters to active and scheduled entries
- sorts by start time
- posts Discord event URLs so the client renders them naturally

## Invite Moderation

Invite links are allowed only for the guild owner and users on the bot's invite allowlist.

### Staff Commands

- `/allow-invites target:<user>`
- `/revoke-invites target:<user>`
- `/purge-invites [messages_per_channel]`

### User Self-Allow Flow

Users can DM the bot:

```text
!allowinvite your_password_here
```

If the password matches `ALLOW_INVITE_PASSWORD`, they are added to the allowlist.

### Invite Cleanup

`/purge-invites` scans accessible text and announcement channels and deletes unauthorized invite links.

## Command Reference

### Public Commands

- `/events`
- `-events`

### Staff Commands

- `/start-queue`
- `/stop-queue`
- `/next`
- `/radio`
- `/allow-invites`
- `/revoke-invites`
- `/purge-invites`

## First-Time Setup Checklist

1. Create the Discord application and bot.
2. Enable the required intents in the Discord developer portal.
3. Invite the bot to the target server.
4. Create `.env` with valid IDs and token.
5. Run `npm install`.
6. Add `assets/intermission.mp3` if you want radio playback.
7. Start the bot so it registers slash commands for the configured guild.
8. Test `/events` and the stage queue commands.

## Deployment Notes

Typical update flow:

```bash
git pull origin main
npm install
node index.js
```

If you use `pm2`:

```bash
git pull origin main
npm install
pm2 restart drowsy_bot
```

## Troubleshooting

### Slash Commands Do Not Appear

Check:

- `CLIENT_ID` is correct
- `GUILD_ID` is correct
- the bot can log in successfully
- the bot has been restarted after deployment

### Missing Dependency Error

If you see `Cannot find module 'dotenv'` or another dependency error, run:

```bash
npm install
```

### Invite Moderation Does Not Delete Links

Check:

- the bot can manage messages in that channel
- the message actually matches the Discord invite regex
- the sender is not the guild owner
- the sender is not on the allowlist

### Queue Radio Does Not Play

Check:

- `assets/intermission.mp3` exists
- the bot can connect and speak in the voice channel
- dependencies installed successfully on the host

## Architecture Notes

- [index.js](index.js): bot bootstrap and event binding
- [src/config.js](src/config.js): constants, env vars, and file paths
- [src/state.js](src/state.js): file-backed persistence and shared runtime state
- [src/helpers.js](src/helpers.js): shared helper utilities
- [src/commands.js](src/commands.js): slash command schema
- [src/features/stage.js](src/features/stage.js): queue, speaker handoff, and radio flow
- [src/features/community.js](src/features/community.js): events and invite moderation

## License

ISC