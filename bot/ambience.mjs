// Ambient sound for the voice rooms: when someone sits in one of the rooms below, a bot joins and plays a
// looping track (and posts a small animated picture in the room's chat); when the room empties it leaves.
// This file holds the rules and no Discord library, so bot/test/ambience.test.mjs can run it against fakes.
// The voice side (joining, ffmpeg, the GIF post) is bot/ambience-voice.mjs.
//
// One Discord bot can sit in only ONE voice channel per server. A "pool" of bots therefore decides how
// many rooms can sound at once: Snitch itself, plus optional helper bots (AMBIENCE_HELPER_TOKENS).
// When every bot is busy, the other occupied rooms stay quiet until one frees up.
import fs from 'node:fs';
import path from 'node:path';

/** gainDb is added to the common loudness target (-24 LUFS). Jantar Mantar is meant to be louder. */
export const DEFAULT_ROOMS = [
  { key: 'town-hall', match: ['town hall', 'townhall'], visual: null, gainDb: 0, status: '🏛️ echoing hall', caption: '🏛️ The hall hums with distant voices.' },
  { key: 'campfire', match: ['campfire'], visual: 'fire', gainDb: 0, status: '🔥 crackling fire', caption: '🔥 A fire crackles in the grate.' },
  { key: 'hammock', match: ['hammock'], visual: 'beach', gainDb: 0, status: '🌊 waves on the beach', caption: '🌊 Waves roll in. Take it easy.' },
  { key: 'dictators-bedroom', match: ['dictators bedroom', 'dictator bedroom'], visual: 'clock', gainDb: 0, status: '🕰️ clock ticking', caption: '🕰️ Tick, tock.' },
  { key: 'jantar-mantar', match: ['jantar mantar'], visual: null, gainDb: 6, status: '🚦 traffic outside', caption: '🚦 Busy road outside.' },
  { key: 'cafe', match: ['cafe', 'café'], visual: 'coffee', gainDb: 0, status: '☕ coffee brewing', caption: '☕ Coffee is brewing.' },
  { key: 'dark-alley', match: ['dark alley'], visual: 'cat', gainDb: 0, status: '🐈‍⬛ something is watching', caption: '🐈‍⬛ A black cat watches from the dark.' },
];

export const AUDIO_EXT = ['.ogg', '.opus', '.mp3', '.wav', '.flac', '.m4a', '.aac'];

/** Lower-case letters and digits only, so "Dictator's Bedroom" and "dictators-bedroom" compare equal. */
export const normalizeName = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Reads config/ambience.json (optional) over the built-in rooms. A room with the same `key` is merged; new keys are added. */
export function loadAmbienceConfig(file = process.env.AMBIENCE_CONFIG || 'config/ambience.json', env = process.env) {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`cannot read ${file}: ${err.message}`);
  }
  const byKey = new Map(DEFAULT_ROOMS.map((r) => [r.key, { ...r }]));
  for (const r of raw.rooms || []) byKey.set(r.key, { ...(byKey.get(r.key) || { gainDb: 0, visual: null, match: [r.key] }), ...r });
  const flag = String(env.AMBIENCE ?? (raw.enabled === false ? 'off' : 'on')).toLowerCase();
  return {
    enabled: !['off', 'false', '0', 'no'].includes(flag),
    dir: env.AMBIENCE_DIR || raw.dir || 'data/ambience',
    defaultsDir: path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'ambience', 'defaults'),
    visualsDir: path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'ambience', 'visuals'),
    leaveDelayMs: Math.max(0, Number(env.AMBIENCE_LEAVE_DELAY ?? raw.leaveDelaySeconds ?? 20)) * 1000,
    rooms: [...byKey.values()],
  };
}

/**
 * Pairs rooms with voice or stage channels. A room with channelId uses that channel; otherwise the first
 * channel whose name contains one of the room's `match` words (exact name wins over "contains").
 * channels: [{ id, name, kind: 'voice' | 'stage' }]
 */
export function matchRooms(rooms, channels) {
  const out = new Map();
  for (const room of rooms) {
    let channel = room.channelId ? channels.find((c) => c.id === String(room.channelId)) : null;
    if (!channel && !room.channelId) {
      const words = (room.match?.length ? room.match : [room.key]).map(normalizeName).filter(Boolean);
      channel =
        channels.find((c) => words.includes(normalizeName(c.name))) ||
        channels.find((c) => words.some((w) => normalizeName(c.name).includes(w)));
    }
    if (channel && !out.has(channel.id)) out.set(channel.id, { ...room, channel });
  }
  return out;
}

/** Your own track beats the built-in one: data/ambience/<key>/ (a random file each time), data/ambience/<key>.<ext>, then the built-in loop. */
export function resolveTrack(room, { dir, defaultsDir, random = Math.random, fsApi = fs }) {
  const isAudio = (f) => AUDIO_EXT.includes(path.extname(f).toLowerCase());
  const sub = path.join(dir, room.key);
  try {
    const files = fsApi.readdirSync(sub).filter(isAudio).sort();
    if (files.length) return { path: path.join(sub, files[Math.floor(random() * files.length)]), source: 'yours' };
  } catch {}
  for (const ext of AUDIO_EXT) {
    const p = path.join(dir, room.key + ext);
    if (fsApi.existsSync(p)) return { path: p, source: 'yours' };
  }
  for (const ext of AUDIO_EXT) {
    const p = path.join(defaultsDir, room.key + ext);
    if (fsApi.existsSync(p)) return { path: p, source: 'built-in' };
  }
  return null;
}

export function resolveVisual(room, { visualsDir, fsApi = fs }) {
  if (!room.visual) return null;
  const p = path.join(visualsDir, `${room.visual}.gif`);
  return fsApi.existsSync(p) ? p : null;
}

/**
 * pool: [{ name, busy: false, start(room, channel, assets, onLost) → Promise<{ stop(): Promise }> }]
 * humansIn(channelId) → number of people (not bots) in the channel
 * channels() → [{ id, name, kind }]
 */
export function createAmbience({ config, pool, humansIn, channels, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, random = Math.random, fsApi = fs, retryMs = 60_000, now = () => Date.now() }) {
  const sessions = new Map(); // channelId → { entry, handle, timer, state }
  const waiting = new Set();
  const failedAt = new Map();
  const lostCount = new Map();
  const matches = () => matchRooms(config.rooms, channels());
  const assetsFor = (room) => ({ track: resolveTrack(room, { dir: config.dir, defaultsDir: config.defaultsDir, random, fsApi }), visual: resolveVisual(room, { visualsDir: config.visualsDir, fsApi }) });

  function cleanup(channelId) {
    const s = sessions.get(channelId);
    if (!s) return;
    if (s.timer) clearTimer(s.timer);
    sessions.delete(channelId);
    s.entry.busy = false;
    for (const id of [...waiting]) evaluate(id); // a bot is free again
  }

  async function leave(channelId) {
    const s = sessions.get(channelId);
    if (!s) return;
    s.timer = null;
    if (humansIn(channelId) > 0) return;
    try {
      await s.handle?.stop();
    } catch (err) {
      log(`could not leave cleanly: ${err.message}`);
    }
    cleanup(channelId);
  }

  function evaluate(channelId) {
    const room = matches().get(channelId);
    if (!room || !config.enabled) return;
    const people = humansIn(channelId);
    const s = sessions.get(channelId);
    if (people > 0) {
      if (s) {
        if (s.timer) clearTimer(s.timer);
        s.timer = null;
        return;
      }
      if (now() - (failedAt.get(channelId) ?? -Infinity) < retryMs) return;
      const entry = pool.find((e) => !e.busy);
      if (!entry) {
        if (!waiting.has(channelId)) log(`${room.channel.name}: every bot is busy in another room, so it stays quiet for now`);
        waiting.add(channelId);
        return;
      }
      const assets = assetsFor(room);
      if (!assets.track) {
        log(`${room.channel.name}: no audio file for "${room.key}"`);
        return;
      }
      waiting.delete(channelId);
      entry.busy = true;
      const session = { entry, handle: null, timer: null, state: 'starting' };
      sessions.set(channelId, session);
      entry
        .start(room, room.channel, assets, () => {
          // the connection dropped (moved out, kicked, network): start over if people are still there
          if (sessions.get(channelId) !== session) return;
          cleanup(channelId);
          // Back off 3 s, 6 s, 12 s ... up to 60 s, so a bad connection never turns into a join/leave loop.
          const lost = (lostCount.get(channelId) ?? 0) + 1;
          lostCount.set(channelId, lost);
          const wait = Math.min(60_000, 3000 * 2 ** (lost - 1));
          log(`${room.channel.name}: connection lost (${lost}), trying again in ${wait / 1000} s`);
          setTimer(() => evaluate(channelId), wait);
        })
        .then((handle) => {
          session.handle = handle;
          session.state = 'playing';
          setTimer(() => { if (sessions.get(channelId) === session) lostCount.delete(channelId); }, 120_000);
          log(`${room.channel.name}: ${entry.name} is playing ${assets.track.source === 'yours' ? 'your' : 'the built-in'} ${room.key} loop`);
          if (humansIn(channelId) === 0) evaluate(channelId);
        })
        .catch((err) => {
          log(`${room.channel.name}: could not start (${err.message})`);
          failedAt.set(channelId, now());
          if (sessions.get(channelId) === session) cleanup(channelId);
        });
      return;
    }
    waiting.delete(channelId);
    if (s && s.state === 'playing' && !s.timer) s.timer = setTimer(() => leave(channelId), config.leaveDelayMs);
  }

  const scan = () => {
    for (const id of matches().keys()) evaluate(id);
  };

  async function stopAll() {
    for (const id of [...sessions.keys()]) {
      const s = sessions.get(id);
      await s?.handle?.stop().catch(() => {});
      cleanup(id);
    }
  }

  /** The text for /ambience status. */
  function describe() {
    const found = matches();
    const lines = [`Bots available for ambience: ${pool.length} (${pool.filter((e) => !e.busy).length} free). One bot plays in one room at a time.`];
    for (const room of config.rooms) {
      const hit = [...found.values()].find((r) => r.key === room.key);
      if (!hit) {
        lines.push(`• ${room.key}: no voice channel matches (${(room.match || []).join(', ')}). Set channelId in config/ambience.json.`);
        continue;
      }
      const t = assetsFor(room).track;
      const s = sessions.get(hit.channel.id);
      lines.push(`• ${hit.channel.name} (${hit.channel.kind}): ${t ? `${t.source} track ${path.basename(t.path)}` : 'NO audio file'}${s ? `, playing via ${s.entry.name}` : waiting.has(hit.channel.id) ? ', waiting for a free bot' : ''}`);
    }
    return lines.join('\n').slice(0, 1900);
  }

  return { evaluate, scan, stopAll, describe };
}
