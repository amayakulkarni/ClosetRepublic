// Closet Republic membership bot: gives and removes Discord class roles from Buy Me a
// Coffee memberships. Runs from the site's folder as a second pm2 app (ecosystem.config.cjs):
//   node bot/index.mjs
// It needs: DISCORD_BOT_TOKEN, config/discord-tiers.json (from discord/setup/setup-server.mjs),
// the site's database (DATABASE_PATH) and BOT_INTERNAL_SECRET (shared with the site).
// The bot's role must sit above every class and access role (it does after the setup script).
import crypto from 'node:crypto';
import http from 'node:http';
import { Client, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';
import { env, loadTiers } from './config.mjs';
import { openStore } from './store.mjs';
import { createSync } from './sync.mjs';
import { commandDefinitions, handleCommand, withPendingNotices } from './commands.mjs';
import { reconcileWithBmc } from './bmc-api.mjs';

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
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers], partials: [Partials.Channel] });
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

// ---------- Discord events ----------

client.once(Events.ClientReady, async () => {
  guild = await client.guilds.fetch(cfg.guildId);
  await guild.commands.set(commandDefinitions(cfg));
  console.log(`[bot] connected to ${guild.name} as ${client.user.tag}`);
  discord.post(cfg.channels.botLog, 'Republic Bot is online.').catch(() => {});
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

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.guildId !== cfg.guildId) return;
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

client.login(env.token).catch((err) => {
  console.error('[bot] Discord login failed:', err.message);
  process.exit(1);
});
