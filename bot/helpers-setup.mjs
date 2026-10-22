// Checks and prepares the Snitch Helper bots that let several voice rooms play ambient sound at once.
//
//   node bot/helpers-setup.mjs                      show rooms, bots, missing invites and the next steps
//   node bot/helpers-setup.mjs --tokens-file t.txt  read helper tokens (one per line), validate them,
//                                                   and print the AMBIENCE_HELPER_TOKENS line
//   node bot/helpers-setup.mjs --tokens-file t.txt --write-env .env.local
//                                                   also put that line into the env file (a .bak copy is kept)
//
// Discord does not let a program create a bot application (that is only possible by hand in the Developer
// Portal), so this script automates everything around it: how many helpers the rooms need, checking each
// token, building each helper's invite link with the right permissions, and detecting which helpers have
// not joined the server yet.
import fs from 'node:fs';
import { PermissionFlagsBits as P, PermissionsBitField, REST, Routes } from 'discord.js';
import { env, loadTiers } from './config.mjs';
import { loadAmbienceConfig, matchRooms } from './ambience.mjs';

/** The permissions a helper needs on the voice channels. Mute Members is only used on the Town hall stage. */
export const HELPER_PERMISSIONS = new PermissionsBitField([P.ViewChannel, P.Connect, P.Speak, P.SendMessages, P.AttachFiles, P.MuteMembers, P.SetVoiceChannelStatus]);

export const inviteUrl = (clientId, guildId) =>
  `https://discord.com/oauth2/authorize?${new URLSearchParams({ client_id: clientId, scope: 'bot', permissions: String(HELPER_PERMISSIONS.bitfield), guild_id: guildId, disable_guild_select: 'true' })}`;

export const mask = (t) => `${t.slice(0, 6)}…${t.slice(-4)}`;

/** Names for the helpers still to create: "Snitch Helper 3" and so on. */
export const helperNames = (have, need) => Array.from({ length: Math.max(0, need - have) }, (_, i) => `Snitch Helper ${have + i + 1}`);

/** Replaces or adds KEY=value in env-file text. */
export function setEnvLine(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, () => line) : `${text.replace(/\n*$/, '\n')}${line}\n`;
}

export async function plan({ rest, guildId, tokens, ambience, helperRest = (t) => new REST({ version: '10' }).setToken(t) }) {
  const channels = (await rest.get(Routes.guildChannels(guildId))).filter((c) => c.type === 2 || c.type === 13);
  const rooms = matchRooms(
    ambience.rooms,
    channels.map((c) => ({ id: c.id, name: c.name, kind: c.type === 13 ? 'stage' : 'voice', parentId: c.parent_id })),
  );
  const need = rooms.size; // one bot per room, Snitch included
  const helpers = [];
  for (const token of tokens) {
    try {
      const me = await helperRest(token).get(Routes.user('@me'));
      let inServer = false;
      try {
        await rest.get(Routes.guildMember(guildId, me.id));
        inServer = true;
      } catch {}
      helpers.push({ token, id: me.id, name: me.username, inServer, ok: true });
    } catch (err) {
      helpers.push({ token, ok: false, error: err.status === 401 ? 'Discord rejected this token (401)' : err.message });
    }
  }
  const working = helpers.filter((h) => h.ok && h.inServer).length;
  return { rooms: [...rooms.values()], need, helpers, working, missing: Math.max(0, need - 1 - helpers.filter((h) => h.ok).length) };
}

function report(result, guildId) {
  const out = [];
  out.push(`Rooms that can play ambient sound: ${result.rooms.length}. One bot sits in one room, so every room sounding at once takes ${result.need} bot(s): Snitch plus ${Math.max(0, result.need - 1)} helper(s).`);
  out.push(`Helpers configured: ${result.helpers.length} (${result.working} ready in the server).`);
  for (const h of result.helpers) {
    if (!h.ok) out.push(`  ✗ ${mask(h.token)}: ${h.error}`);
    else if (!h.inServer) out.push(`  ! ${h.name}: not in the server yet. Invite: ${inviteUrl(h.id, guildId)}`);
    else out.push(`  ✓ ${h.name}: ready`);
  }
  if (result.missing > 0) {
    out.push('', `${result.missing} more helper(s) needed for every room to sound at once. For each one:`);
    helperNames(result.helpers.length, result.helpers.length + result.missing).forEach((n, i) => {
      out.push(`  ${i + 1}. https://discord.com/developers/applications > New Application > name it "${n}" > Bot > Reset Token > copy the token (leave every Privileged Intent off).`);
    });
    out.push('  Paste the new tokens, one per line, into a text file (existing helper tokens too), then run:', '    node bot/helpers-setup.mjs --tokens-file tokens.txt --write-env .env.local', '  The script validates them, prints each invite link, and writes AMBIENCE_HELPER_TOKENS. Delete tokens.txt afterwards.');
  } else out.push('', 'Every room has a bot. Restart the bot: pm2 restart cr-discord-bot --update-env');
  return out.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  if (!env.token) throw new Error('DISCORD_BOT_TOKEN is not set (run this from the site folder, where .env.local is).');
  const cfg = loadTiers();
  const rest = new REST({ version: '10' }).setToken(env.token);
  const file = arg('--tokens-file');
  let tokens = String(process.env.AMBIENCE_HELPER_TOKENS || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (file) tokens = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((t) => t.trim()).filter((t) => t && !t.startsWith('#'));
  tokens = [...new Set(tokens)].filter((t) => t !== env.token);
  const result = await plan({ rest, guildId: cfg.guildId, tokens, ambience: loadAmbienceConfig() });
  console.log(report(result, cfg.guildId));
  const target = arg('--write-env');
  if (target) {
    const good = result.helpers.filter((h) => h.ok).map((h) => h.token);
    const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (before) fs.writeFileSync(`${target}.bak`, before);
    fs.writeFileSync(target, setEnvLine(before, 'AMBIENCE_HELPER_TOKENS', good.join(',')));
    console.log(`\nWrote ${good.length} token(s) to ${target} (previous file kept as ${target}.bak).`);
  } else if (file) {
    console.log(`\nAMBIENCE_HELPER_TOKENS=${result.helpers.filter((h) => h.ok).map((h) => h.token).join(',')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('helpers-setup.mjs')) {
  main().catch((err) => {
    console.error(`[helpers] ${err.message}`);
    process.exit(1);
  });
}
