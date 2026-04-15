# Drowsy Bot

Drowsy Bot is a Discord bot focused on three areas:

- hosted stage and queue events
- invite-link moderation and invite allowlisting
- Statbot-style server and member stats

It is built with Node.js and discord.js and stores runtime data in JSON files under `data/`.

## Current Feature Set

- Multi-stage queue flow for voice events
- Intermission radio playback from a local MP3 file
- Hype session buttons for active speakers
- Optional recording delivery for the current speaker
- Public scheduled-event lookup
- Invite moderation with allowlist and cleanup tools
- Auto-updating stat channels
- Statbot-style member stats cards with image charts

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
UNBELIEVABOAT_PREFIX=!!
```

### Variable Reference

- `DISCORD_TOKEN`: bot token from the Discord developer portal
- `CLIENT_ID`: Discord application ID used to register guild commands
- `GUILD_ID`: guild where slash commands are registered
- `ALLOW_INVITE_PASSWORD`: optional password used by the DM command `!allowinvite <password>`
- `UNBELIEVABOAT_PREFIX`: prefix used when relaying economy commands to UnbelievaBoat, for example `!` or `!!`

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
recordings/
assets/
data/
```

## Data Files

The bot creates and uses these files under `data/`:

- `guild-config.json`: guild-level settings, including stats-channel bindings
- `allowed-invite-users.json`: invite allowlist
- `member-stats.json`: tracked message and voice analytics

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
4. Members join or leave the lineup using buttons.
5. Staff move the event forward with `/next` or the active speaker ends their turn with `Done`.

### Queue Buttons

- `Join Queue`
- `Leave`
- `Done`

### Hype Buttons

- `Clap`
- `Fire`
- `Record Me`

### Notes

- `assets/intermission.mp3` is used for radio playback.
- recordings are written into `recordings/`
- the active speaker can request a recording and receive it by DM

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
- `/add-money [target] <member> <amount>`

### User Self-Allow Flow

Users can DM the bot:

```text
!allowinvite your_password_here
```

If the password matches `ALLOW_INVITE_PASSWORD`, they are added to the allowlist.

### Invite Cleanup

`/purge-invites` scans accessible text and announcement channels and deletes unauthorized invite links.

## UnbelievaBoat Helper

The bot includes a staff-only helper for formatting UnbelievaBoat's economy grant command.

### Staff Command

- `/add-money [cash|bank] <member> <amount>`

### What It Does

- builds the exact UnbelievaBoat command string
- defaults to the normal cash form when `cash` or `bank` is omitted
- replies ephemerally so staff can copy the generated command

### Important Limitation

This bot does not execute UnbelievaBoat commands directly. It formats the command for staff to paste manually, because bots generally do not process prefix commands sent by other bots.

If your server uses a custom UnbelievaBoat prefix such as `!!`, set `UNBELIEVABOAT_PREFIX` in `.env` so the relayed command matches your server configuration.

## Server Stats System

The bot includes two stats surfaces:

- server-wide counters
- member activity cards

### Server Stats Commands

- `/server-stats show`
- `/server-stats channel`
- `/server-stats remove`
- `/server-stats refresh`
- `/server-stats list`

These commands are staff-only except for member profile lookup.

### Supported Channel Metrics

- `members`
- `humans`
- `bots`
- `channels`
- `text_channels`
- `voice_channels`
- `roles`
- `in_voice`

### Stat Channels

The bot can rename voice or stage channels to display live counters like:

- `Members: 420`
- `In Voice: 17`

Configured stat channels refresh on:

- bot startup
- member join and leave
- voice-state changes
- channel creation and deletion
- role creation and deletion

## Member Stats Cards

The bot tracks per-member message and voice activity from the moment this version is deployed.

### Public Lookup Methods

- `/server-stats user`
- `/server-stats user member:@someone`

### What the Card Includes

- account creation date
- server join date
- top role
- message rank
- voice rank
- message totals for `1d`, `7d`, `14d`, and total tracked history
- voice totals for `1d`, `7d`, `14d`, and total tracked history
- top message channels
- top voice channels
- a rendered 14-day chart image
- current Discord presence activity when available

### Important Limitation

The bot cannot backfill historical analytics from before tracking began. Stats only reflect activity recorded while this version of the bot is running.

## Command Reference

### Public Commands

- `/events`
- `/server-stats user [member]`
- `-events`

### Staff Commands

- `/start-queue`
- `/stop-queue`
- `/next`
- `/radio`
- `/add-money [target] <member> <amount>`
- `/allow-invites`
- `/revoke-invites`
- `/purge-invites`
- `/server-stats show`
- `/server-stats channel`
- `/server-stats remove`
- `/server-stats refresh`
- `/server-stats list`

## First-Time Setup Checklist

1. Create the Discord application and bot.
2. Enable the required intents in the Discord developer portal.
3. Invite the bot to the target server.
4. Create `.env` with valid IDs and token.
5. Run `npm install`.
6. Add `assets/intermission.mp3` if you want radio playback.
7. Start the bot so it registers slash commands for the configured guild.
8. Configure stat channels with `/server-stats channel` if needed.
9. Test `/events`, `/server-stats user`, and the stage queue commands.

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

### Stats Channels Do Not Rename

Check:

- the configured channel is a voice or stage channel
- the bot can rename the channel
- the bot role is high enough in the hierarchy

### Member Stats Card Looks Empty

This usually means the member has little or no tracked data yet. The bot only records analytics from the point this feature is active.

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
- [src/features/stage.js](src/features/stage.js): queue, hype, radio, and recording flow
- [src/features/community.js](src/features/community.js): events, invite moderation, stats, and member analytics

## License

ISC