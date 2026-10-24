// Closet Republic membership bot: gives and removes Discord class roles from Buy Me a
// Coffee memberships. Runs from the site's folder as a second pm2 app (ecosystem.config.cjs):
//   node bot/index.mjs
// It needs: DISCORD_BOT_TOKEN, config/discord-tiers.json (from discord/setup/setup-server.mjs),
// the site's database (DATABASE_PATH) and BOT_INTERNAL_SECRET (shared with the site).
// The bot's role must sit above every class and access role (it does after the setup script).
import crypto from 'node:crypto';
import http from 'node:http';
import { Client, Events, GatewayIntentBits, MessageFlags, Partials, SlashCommandBuilder } from 'discord.js';
import { env, loadTiers } from './config.mjs';
import { openStore } from './store.mjs';
import { createSync } from './sync.mjs';
import { commandDefinitions, handleCommand, withPendingNotices } from './commands.mjs';
import { reconcileWithBmc } from './bmc-api.mjs';
import { createTickets, modRoleIds } from './tickets.mjs';
import { createAmbience, loadAmbienceConfig, matchRooms } from './ambience.mjs';
import { createVoiceEntry, humansInChannel, startHelperClients, voiceChannels } from './ambience-voice.mjs';
import { VOICE_NOTICE, ensureStaticNotices } from './voice-notice.mjs';
import { createElderRooms } from './elder-rooms.mjs';
import { createElderAdapter } from './discord-elder.mjs';
import { ensureCollegeMessage, handleHobbyInteraction } from './hobbies.mjs';
import { createUnlink } from './unlink.mjs';
import { createTicketAdapter, ensureDeskMessage, handleTicketInteraction } from './discord-tickets.mjs';
import { createPomodoro, loadPomodoroConfig } from './pomodoro.mjs';
import { createVcTools } from './vc-tools.mjs';
import { PRODUCTIVITY_COMMANDS, createProductivityAdapter, handleProductivityInteraction } from './discord-productivity.mjs';
import { TODO_LIMITS } from './todos.mjs';

const problems = [];
if (!env.token) problems.push('DISCORD_BOT_TOKEN is not set');
if (!env.secret) problems.push('BOT_INTERNAL_SECRET is not set (use the same value in the site)');
let cfg;
try {
  cfg = loadTiers();
  if (!cfg.guildId) problems.push('no guildId in config/discord-tiers.json (or DISCORD_GUILD_ID)');
  const missing = cfg.tiers.filter((t) => !/^\d+$/.test(t.roleId) || !/^\d+$/.test(t.accessRoleId)).map((t) => t.slug);
  if (missing.length) problems.push(`role ids missing in config/discord-tiers.json for: ${missing.join(', ')}`);
} catch (err) {
  problems.push(`cannot read config/discord-tiers.json: ${err.message}`);
}
if (problems.length) {
  console.error(`[bot] cannot start:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

const store = openStore(env.dbPath);
// Ticket transcripts need message text, which is the Message Content Intent (a switch in the Discord
// Developer Portal > Bot). If it is off, the bot logs a warning and runs without it; transcripts then
// list who wrote what and when but not the text. Set BOT_MESSAGE_CONTENT=false to skip the attempt.
let contentIntent = process.env.BOT_MESSAGE_CONTENT !== 'false';
let client = null;
let guild = null;

// ---------- Discord adapter (everything sync.mjs needs) ----------

const discord = {
  async fetchMember(id) {
    try {
      const m = await guild.members.fetch({ user: id, force: true });
      return { roles: new Set(m.roles.cache.keys()) };
    } catch (err) {
      if (err.code === 10007 || err.code === 10013) return null; // not in the server
      throw err;
    }
  },
  addRole: (id, roleId, reason) => guild.members.addRole({ user: id, role: roleId, reason }),
  removeRole: (id, roleId, reason) => guild.members.removeRole({ user: id, role: roleId, reason }),
  async dm(id, text) {
    try {
      const user = await client.users.fetch(id);
      await user.send(text);
      return true;
    } catch {
      return false; // DMs closed: shown with their next command instead
    }
  },
  async post(channelId, text) {
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId);
    await channel?.send({ content: text, allowedMentions: { parse: [] } });
  },
};

// One job at a time, so webhook pokes, joins and sweeps never interleave.
let chain = Promise.resolve();
const queue = (name, task) => {
  const next = chain.then(task).catch((err) => {
    console.error(`[bot] ${name} failed:`, err.message);
    return { error: err.message };
  });
  chain = next.then(() => {});
  return next;
};

const sync = createSync({ cfg, store, discord, env });
const ticketAdapter = createTicketAdapter({ getClient: () => client, getGuild: () => guild, cfg, contentIntent: () => contentIntent });
const tickets = createTickets({ cfg, store, tk: ticketAdapter });
const unlink = createUnlink({ cfg, store, sync, discord });

// Private voice rooms for Elders (elder-rooms.mjs): joining the Elder lobby channel creates one.
const elderRooms = createElderRooms({
  cfg,
  store,
  dc: createElderAdapter({ getClient: () => client, getGuild: () => guild, cfg }),
  log: (t) => console.log(`[elder] ${t}`),
});
const rolesOfInteraction = (i) => new Set(i.member?.roles?.cache?.keys?.() ?? i.member?.roles ?? []);

// Ambient sound in the voice rooms (ambience.mjs). Off with AMBIENCE=off.
let ambience = null;
let helperIds = new Set(); // the helper bots' user ids, once they are logged in
const ambienceCommand = new SlashCommandBuilder().setName('ambience').setDescription('Mods: show which rooms have ambient sound and which bot is playing where.');
// Channel ids that an ambience room already covers (they get the notice from the ambience session).
const ambienceRoomIds = (config) => {
  const ids = new Set();
  for (const r of matchRooms(config.rooms, voiceChannels(guild).filter((c) => c.id !== cfg.elder.lobbyChannelId)).values()) ids.add(r.channel.id);
  return ids;
};
async function startAmbience() {
  const config = loadAmbienceConfig();
  if (!config.enabled) return;
  const helpers = await startHelperClients(process.env, (t) => console.warn(t));
  helperIds = new Set(helpers.map((h) => h.client.user.id));
  const pool = [
    createVoiceEntry({ name: 'Snitch', getClient: () => client, guildId: cfg.guildId }),
    ...helpers.map((h) => createVoiceEntry({ name: h.name, getClient: () => h.client, guildId: cfg.guildId })),
  ];
  ambience = createAmbience({
    config,
    pool,
    humansIn: (id) => humansInChannel(guild, id, new Set([client.user.id, ...helpers.map((h) => h.client.user.id)])),
    // The Elder lobby and the private rooms made from it get no ambient sound.
    channels: () => voiceChannels(guild).map((c) => ({ ...c, ignore: c.id === cfg.elder.lobbyChannelId || Boolean(store.elderRoomByChannel(c.id)) })),
    // Every public room gets the "voices here are public" notice after its picture. The Elder category is for verified elders only.
    notice: (channel) => (cfg.elder.categoryId && channel.parentId === cfg.elder.categoryId ? null : VOICE_NOTICE),
    log: (t) => console.log(`[ambience] ${t}`),
  });
  ambience.scan();
  console.log(`[ambience] ready with ${pool.length} bot(s)`);
}

// To-do lists, voice channel tracking and Pomodoro (todos.mjs, vc-tools.mjs, pomodoro.mjs). Off with POMODORO=off.
const productivity = createProductivityAdapter({ getClient: () => client, getGuild: () => guild, botIds: () => new Set([client.user.id, ...helperIds]) });
const pomodoro = createPomodoro({ config: loadPomodoroConfig(), store, pd: productivity, ambience: () => ambience, log: (t) => console.log(`[pomodoro] ${t}`) });
const vcTools = createVcTools({ store, pd: productivity, pomodoro, ambience: () => ambience, log: (t) => console.log(`[vc] ${t}`) });

// ---------- Discord events ----------

function attach(client) {
client.once(Events.ClientReady, async () => {
  guild = await client.guilds.fetch(cfg.guildId);
  await guild.commands.set([...commandDefinitions(cfg), ambienceCommand.toJSON(), ...PRODUCTIVITY_COMMANDS]);
  ensureDeskMessage({ client, cfg }).catch((err) => console.error('[bot] could not set up the ticket button:', err.message));
  console.log(`[bot] connected to ${guild.name} as ${client.user.tag}`);
  discord.post(cfg.channels.botLog, 'Republic Bot is online.').catch(() => {});
  ensureCollegeMessage({ client, cfg }).catch((err) => console.error('[bot] could not set up the hobby picker:', err.message));
  elderRooms.cleanup().catch((err) => console.error('[elder] cleanup failed:', err.message));
  try {
    const ac = loadAmbienceConfig();
    ensureStaticNotices({ client, guild, categoryIds: cfg.voiceNotice.categoryIds, skipIds: ac.enabled ? ambienceRoomIds(ac) : new Set(), log: (t) => console.warn(`[bot] ${t}`) }).catch(() => {});
  } catch (err) {
    console.error('[bot] voice notices skipped:', err.message);
  }
  startAmbience().catch((err) => console.error('[bot] ambience is off:', err.message));
  // Sessions do not survive a restart: lift every Pomodoro mute still on record.
  queue('pomodoro recover', () => pomodoro.recover());
  setInterval(() => store.todoExpire(TODO_LIMITS.personalDays, TODO_LIMITS.roomDays), 6 * 60 * 60_000);
  queue('startup sweep', () => sync.syncAll('startup'));
  setInterval(() => queue('sweep', () => sync.syncAll('sweep')), 15 * 60_000);
  const bmc = () =>
    queue('Buy Me a Coffee check', async () => {
      const r = await reconcileWithBmc({ env, store, sync, log: (t) => discord.post(cfg.channels.botLog, t).catch(() => {}) });
      if (r.lapsed || r.skipped === 'no usable data') console.log('[bot] Buy Me a Coffee check', r);
      return r;
    });
  setInterval(bmc, 60 * 60_000);
  bmc();
});

client.on(Events.GuildMemberAdd, (member) => {
  if (member.guild.id === cfg.guildId) queue('join', () => sync.syncMember(member.id, 'rejoined the server'));
});

client.on(Events.VoiceStateUpdate, (before, after) => {
  if (after.guild.id !== cfg.guildId) return;
  for (const id of new Set([before.channelId, after.channelId])) if (id) elderRooms.roomChanged(id);
  const lobby = cfg.elder.lobbyChannelId;
  if (lobby && after.channelId === lobby && before.channelId !== lobby && !after.member?.user?.bot) {
    queue('elder room', () =>
      elderRooms.lobbyJoin({ userId: after.id, displayName: after.member?.displayName, roleIds: new Set(after.member?.roles?.cache?.keys?.() ?? []) }),
    ).then((r) => r?.moved === false && console.log(`[elder] ${after.id} joined the lobby: ${r.reason}`));
  }
  if (before.channelId !== after.channelId) {
    queue('pomodoro voice', async () => {
      await pomodoro.voiceChanged({ userId: after.id, from: before.channelId, to: after.channelId });
      if (before.channelId && productivity.humans(before.channelId).length === 0) await vcTools.channelEmpty(before.channelId);
    });
  }
  if (!ambience) return;
  for (const id of new Set([before.channelId, after.channelId])) if (id) ambience.evaluate(id);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.guildId !== cfg.guildId) return;
  if (await handleHobbyInteraction(interaction, { cfg, queue }).catch((err) => (console.error('[bot] hobby picker failed:', err.message), true))) return;
  if (interaction.isChatInputCommand() && interaction.commandName === 'room') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(false);
    const text = await queue('/room', () =>
      elderRooms.command({
        sub,
        userId: interaction.user.id,
        roleIds: rolesOfInteraction(interaction),
        target: interaction.options.get('member')?.user?.id ?? null,
        name: interaction.options.getString('name'),
        limit: interaction.options.getInteger('people'),
      }),
    );
    await interaction.editReply({ content: typeof text === 'string' ? text : 'Something went wrong. Please try again, or ask a Minister.', allowedMentions: { parse: [] } }).catch(() => {});
    return;
  }
  if (interaction.isChatInputCommand() && interaction.commandName === 'ambience') {
    const roles = new Set(interaction.member?.roles?.cache?.keys?.() ?? []);
    const allowed = modRoleIds(cfg).some((id) => roles.has(id));
    await interaction.reply({ content: allowed ? (ambience ? ambience.describe() : 'Ambient sound is off (AMBIENCE=off, or the voice libraries failed to load; see the bot log).') : 'Only mods can use this.', flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return;
  }
  if (await handleProductivityInteraction(interaction, { cfg, store, pomodoro, vcTools, queue }).catch((err) => (console.error('[bot] productivity tools failed:', err.message), true))) return;
  if (await handleTicketInteraction(interaction, { tickets, unlink, queue, cfg }).catch((err) => (console.error('[bot] ticket interaction failed:', err.message), true))) return;
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ctx = {
    command: interaction.commandName,
    sub: interaction.options.getSubcommand(false),
    userId: interaction.user.id,
    roleIds: new Set(interaction.member?.roles?.cache?.keys?.() ?? interaction.member?.roles ?? []),
    option: (name) => {
      const o = interaction.options.get(name);
      return o?.user?.id ?? o?.value ?? null;
    },
  };
  const reply = await queue(`/${ctx.command}`, () => handleCommand(ctx, { cfg, store, sync, env, discord }));
  const text = typeof reply === 'string' ? reply : 'Something went wrong. Please try again, or ask a Minister.';
  await interaction.editReply({ content: withPendingNotices(store, ctx.userId, text), allowedMentions: { parse: [] } }).catch(() => {});
});
}

// ---------- the site's poke: POST /sync ----------

const sameSecret = (a, b) => {
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return Boolean(a) && crypto.timingSafeEqual(h(a), h(b));
};

http
  .createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/healthz') return send(200, { ok: true, discord: guild ? 'connected' : 'connecting' });
    if (req.method !== 'POST' || req.url !== '/sync') return send(404, { error: 'not found' });
    if (!sameSecret(env.secret, req.headers['x-cr-secret'] || '')) return send(401, { error: 'unauthorized' });
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 10_000) req.destroy();
    });
    req.on('end', async () => {
      if (!guild) return send(503, { error: 'not connected to Discord yet' });
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch {}
      const result = await queue('poke', () =>
        body.discordId ? sync.syncMember(String(body.discordId), 'link page') : body.email ? sync.syncEmail(String(body.email).toLowerCase(), 'Buy Me a Coffee') : sync.syncAll('poke'),
      );
      send(200, result ?? {});
    });
  })
  .listen(env.port, env.host, () => console.log(`[bot] listening on http://${env.host}:${env.port}`));

function connect() {
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates];
  if (contentIntent) intents.push(GatewayIntentBits.MessageContent);
  client = new Client({ intents, partials: [Partials.Channel] });
  client.on('error', (e) => console.error('[bot] Discord client error:', e.message));
  attach(client);
  return client.login(env.token).catch((err) => {
    if (contentIntent && /disallowed intents/i.test(err.message)) {
      console.warn('[bot] The Message Content Intent is off in the Discord Developer Portal (Bot > Privileged Gateway Intents). Starting without it: ticket transcripts will not include message text until it is switched on.');
      contentIntent = false;
      client.destroy();
      return connect();
    }
    console.error('[bot] Discord login failed:', err.message);
    process.exit(1);
  });
}
connect();

// One failed picture, voice join or similar must never take the whole bot down, because every restart
// drops all rooms and re-runs the startup sweep. Log it and carry on.
process.on('unhandledRejection', (err) => console.error('[bot] unhandled rejection (kept running):', err?.stack || err));
process.on('uncaughtException', (err) => console.error('[bot] uncaught exception (kept running):', err?.stack || err));
process.on('exit', (code) => console.log(`[bot] exiting with code ${code}`));

const shutdown = () => {
  console.log('[bot] stop signal received (pm2 restart or stop, or its memory limit)');
  // Unmute everyone first: a Pomodoro mute must never outlive the bot.
  Promise.resolve(pomodoro.stopAll())
    .catch(() => {})
    .then(() => ambience?.stopAll())
    .finally(() => process.exit(0));
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
