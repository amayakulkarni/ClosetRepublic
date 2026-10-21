// The Discord side of ambient sound: joining a voice or stage channel, looping a file through ffmpeg,
// posting the room's picture, and setting the channel status. The rules are in ambience.mjs.
// @discordjs/voice and ffmpeg-static are loaded on demand, so a missing library only turns ambience off
// and never stops the membership bot.
import { spawn } from 'node:child_process';
import { ChannelType, Client, Events, GatewayIntentBits } from 'discord.js';

/** One loop of the file, forever, as Ogg Opus (so Discord needs no extra encoder in Node). */
export function ffmpegArgs(file, gainDb = 0) {
  const gain = Number(gainDb) || 0;
  return [
    '-hide_banner', '-loglevel', 'error',
    '-stream_loop', '-1', '-i', file,
    '-vn', '-af', `loudnorm=I=-24:TP=-2:LRA=11${gain ? `,volume=${gain}dB` : ''}`,
    '-ar', '48000', '-ac', '2', '-c:a', 'libopus', '-b:a', '64k', '-f', 'ogg', 'pipe:1',
  ];
}

let libs = null;
async function loadLibs(env) {
  if (libs) return libs;
  const voice = await import('@discordjs/voice').catch((err) => {
    throw new Error(`@discordjs/voice is not installed (run npm install): ${err.message}`);
  });
  let ffmpeg = env.AMBIENCE_FFMPEG || null;
  if (!ffmpeg) {
    ffmpeg = await import('ffmpeg-static').then((m) => m.default).catch(() => null);
  }
  libs = { voice, ffmpeg: ffmpeg || 'ffmpeg' };
  return libs;
}

/** Builds the helper clients from AMBIENCE_HELPER_TOKENS (comma separated) and logs them in. */
export async function startHelperClients(env, log = console.log) {
  const tokens = String(env.AMBIENCE_HELPER_TOKENS || '').split(',').map((t) => t.trim()).filter(Boolean);
  const out = [];
  for (const [n, token] of tokens.entries()) {
    const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
    try {
      await c.login(token);
      await new Promise((res) => (c.isReady() ? res() : c.once(Events.ClientReady, res)));
      out.push({ name: `helper ${n + 1} (${c.user.tag})`, client: c });
    } catch (err) {
      log(`[ambience] helper ${n + 1} could not log in: ${err.message}`);
      c.destroy();
    }
  }
  return out;
}

/**
 * One pool entry for a logged-in client. getClient is a function because the main client can be recreated at login.
 * Returns { name, busy, start }.
 */
export function createVoiceEntry({ name, getClient, guildId, env = process.env, log = console.log }) {
  const entry = {
    name,
    busy: false,
    async start(room, channel, assets, onLost) {
      const { voice, ffmpeg } = await loadLibs(env);
      const client = getClient();
      const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId));
      const ch = await guild.channels.fetch(channel.id);
      const conn = voice.joinVoiceChannel({ channelId: ch.id, guildId, adapterCreator: guild.voiceAdapterCreator, group: name, selfDeaf: true });
      const player = voice.createAudioPlayer({ behaviors: { noSubscriber: voice.NoSubscriberBehavior.Play } });
      let ff = null;
      let stopped = false;
      let post = null;
      let statusSet = false;

      const playOnce = () => {
        if (stopped) return;
        ff = spawn(ffmpeg, ffmpegArgs(assets.track.path, room.gainDb), { stdio: ['ignore', 'pipe', 'pipe'] });
        let err = '';
        ff.stderr.on('data', (d) => (err = (err + d).slice(-400)));
        ff.on('error', (e) => log(`[ambience] ffmpeg could not start (${e.message}). Install ffmpeg or run npm install.`));
        ff.on('close', (code) => {
          if (!stopped && code) log(`[ambience] ffmpeg stopped (${code}): ${err.trim()}`);
        });
        player.play(voice.createAudioResource(ff.stdout, { inputType: voice.StreamType.OggOpus }));
      };

      const stop = async () => {
        if (stopped) return;
        stopped = true;
        try { ff?.kill('SIGKILL'); } catch {}
        try { player.stop(true); } catch {}
        if (post) await post.delete().catch(() => {});
        if (statusSet) await setStatus(client, ch.id, '').catch(() => {});
        try { conn.destroy(); } catch {}
      };

      try {
        await voice.entersState(conn, voice.VoiceConnectionStatus.Ready, 20_000);
        if (ch.type === ChannelType.GuildStageVoice) {
          const me = guild.members.me ?? (await guild.members.fetchMe());
          await me.voice.setSuppressed(false).catch(() => me.voice.setRequestToSpeak(true).catch(() => {}));
        }
        conn.subscribe(player);
        player.on(voice.AudioPlayerStatus.Idle, () => playOnce());
        player.on('error', (e) => log(`[ambience] player error: ${e.message}`));
        playOnce();
      } catch (e) {
        await stop();
        throw new Error(/ready/i.test(e.message) || e.name === 'AbortError' ? 'could not join the voice channel in time (check Connect and Speak permissions)' : e.message);
      }

      conn.on(voice.VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            voice.entersState(conn, voice.VoiceConnectionStatus.Signalling, 5_000),
            voice.entersState(conn, voice.VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          if (!stopped) {
            await stop();
            onLost();
          }
        }
      });

      // The picture and the channel status are extras: a missing permission only skips them.
      if (assets.visual && ch.isTextBased?.()) {
        post = await ch.send({ content: room.caption, files: [assets.visual], allowedMentions: { parse: [] } }).catch((e) => (log(`[ambience] could not post the picture in ${ch.name}: ${e.message}`), null));
      }
      if (room.status) statusSet = await setStatus(client, ch.id, room.status).then(() => true).catch((e) => (log(`[ambience] could not set the channel status (${e.message}); the bot needs Set Voice Channel Status`), false));

      return { stop };
    },
  };
  return entry;
}

/** Voice channel status (the small line under the channel name). discord.js has no helper for it yet. */
export function setStatus(client, channelId, text) {
  return client.rest.put(`/channels/${channelId}/voice-status`, { body: { status: String(text).slice(0, 500) } });
}

/** Channels the matcher can pair with: voice and stage channels of the guild. */
export function voiceChannels(guild) {
  return [...guild.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
    .map((c) => ({ id: c.id, name: c.name, kind: c.type === ChannelType.GuildStageVoice ? 'stage' : 'voice' }));
}

export function humansInChannel(guild, channelId) {
  const ch = guild.channels.cache.get(channelId);
  return ch ? [...ch.members.values()].filter((m) => !m.user.bot).length : 0;
}
