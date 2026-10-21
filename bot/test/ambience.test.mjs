import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_ROOMS, createAmbience, loadAmbienceConfig, matchRooms, normalizeName, resolveTrack } from '../ambience.mjs';
import { ffmpegArgs } from '../ambience-voice.mjs';

const CHANNELS = [
  { id: '1', name: '🏛️│Town Hall', kind: 'stage' },
  { id: '2', name: '🔥│Campfire', kind: 'voice' },
  { id: '3', name: "🛏️│Dictator's Bedroom", kind: 'voice' },
  { id: '4', name: 'cafe-coworking', kind: 'voice' },
  { id: '5', name: 'Lounge', kind: 'voice' },
];

function setup({ poolSize = 1, people = {}, tracks = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amb-'));
  const defaultsDir = path.join(dir, 'defaults');
  fs.mkdirSync(defaultsDir);
  if (tracks) for (const r of DEFAULT_ROOMS) fs.writeFileSync(path.join(defaultsDir, `${r.key}.ogg`), 'x');
  const timers = [];
  const log = [];
  const started = [];
  const pool = Array.from({ length: poolSize }, (_, n) => ({
    name: `bot${n}`,
    busy: false,
    stops: 0,
    async start(room, channel) {
      started.push([this.name, room.key, channel.id]);
      return { stop: async () => { this.stops++; } };
    },
  }));
  const amb = createAmbience({
    config: { enabled: true, dir: path.join(dir, 'mine'), defaultsDir, visualsDir: path.join(dir, 'v'), leaveDelayMs: 20_000, rooms: DEFAULT_ROOMS },
    pool,
    humansIn: (id) => people[id] ?? 0,
    channels: () => CHANNELS,
    log: (t) => log.push(t),
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimer: (t) => { t.cleared = true; },
  });
  const fire = async () => { for (const t of timers.splice(0)) if (!t.cleared) await t.fn(); await new Promise((r) => setImmediate(r)); };
  const settle = () => new Promise((r) => setImmediate(r));
  return { amb, pool, people, started, timers, log, fire, settle, dir };
}

test('names match regardless of emoji, case and apostrophes', () => {
  assert.equal(normalizeName("🛏️│Dictator's Bedroom"), 'dictatorsbedroom');
  const m = matchRooms(DEFAULT_ROOMS, CHANNELS);
  assert.deepEqual([...m.keys()].sort(), ['1', '2', '3', '4']);
  assert.equal(m.get('3').key, 'dictators-bedroom');
  assert.equal(m.get('4').key, 'cafe');
});

test('a configured channelId beats name matching', () => {
  const m = matchRooms([{ key: 'cafe', match: ['cafe'], channelId: '5' }], CHANNELS);
  assert.equal(m.get('5').key, 'cafe');
});

test('joins when someone enters, leaves 20 s after the room empties', async () => {
  const s = setup({ people: { 2: 1 } });
  s.amb.evaluate('2');
  await s.settle();
  assert.deepEqual(s.started, [['bot0', 'campfire', '2']]);
  s.people[2] = 0;
  s.amb.evaluate('2');
  assert.equal(s.timers.at(-1).ms, 20_000);
  await s.fire();
  assert.equal(s.pool[0].stops, 1);
  assert.equal(s.pool[0].busy, false);
});

test('someone coming back cancels the leave timer', async () => {
  const s = setup({ people: { 2: 1 } });
  s.amb.evaluate('2');
  await s.settle();
  s.people[2] = 0;
  s.amb.evaluate('2');
  s.people[2] = 2;
  s.amb.evaluate('2');
  await s.fire();
  assert.equal(s.pool[0].stops, 0);
});

test('with one bot the second room waits, then gets the bot when the first empties', async () => {
  const s = setup({ people: { 2: 1, 3: 1 } });
  s.amb.evaluate('2');
  s.amb.evaluate('3');
  await s.settle();
  assert.equal(s.started.length, 1);
  assert.ok(s.log.some((l) => /every bot is busy/.test(l)));
  s.people[2] = 0;
  s.amb.evaluate('2');
  await s.fire();
  await s.settle();
  assert.deepEqual(s.started.map((x) => x[1]), ['campfire', 'dictators-bedroom']);
});

test('helper bots let several rooms play at once', async () => {
  const s = setup({ poolSize: 2, people: { 2: 1, 3: 1 } });
  s.amb.scan();
  await s.settle();
  assert.deepEqual(s.started.map((x) => x[0]).sort(), ['bot0', 'bot1']);
});

test('rooms without a matching channel or with a bot-only crowd do nothing', async () => {
  const s = setup({ people: { 5: 3 } });
  s.amb.evaluate('5');
  s.amb.evaluate('2');
  await s.settle();
  assert.equal(s.started.length, 0);
});

test('a failed start is retried only after a pause and frees the bot', async () => {
  const s = setup({ people: { 2: 1 } });
  s.pool[0].start = async () => { throw new Error('no permission'); };
  s.amb.evaluate('2');
  await s.settle();
  assert.equal(s.pool[0].busy, false);
  assert.ok(s.log.some((l) => /could not start/.test(l)));
  s.pool[0].start = async () => { throw new Error('should not be called yet'); };
  s.amb.evaluate('2');
  await s.settle();
  assert.equal(s.log.filter((l) => /could not start/.test(l)).length, 1);
});

test('missing audio is reported and nothing joins', async () => {
  const s = setup({ people: { 2: 1 }, tracks: false });
  s.amb.evaluate('2');
  await s.settle();
  assert.equal(s.started.length, 0);
  assert.ok(s.log.some((l) => /no audio file/.test(l)));
});

test("Amaya's own file or folder beats the built-in loop", () => {
  const s = setup();
  const room = DEFAULT_ROOMS.find((r) => r.key === 'campfire');
  const opts = { dir: path.join(s.dir, 'mine'), defaultsDir: path.join(s.dir, 'defaults') };
  assert.equal(resolveTrack(room, opts).source, 'built-in');
  fs.mkdirSync(path.join(opts.dir, 'campfire'), { recursive: true });
  fs.writeFileSync(path.join(opts.dir, 'campfire', 'a.mp3'), 'x');
  fs.writeFileSync(path.join(opts.dir, 'campfire', 'notes.txt'), 'x');
  const t = resolveTrack(room, opts);
  assert.equal(t.source, 'yours');
  assert.match(t.path, /a\.mp3$/);
  const lone = DEFAULT_ROOMS.find((r) => r.key === 'cafe');
  fs.writeFileSync(path.join(opts.dir, 'cafe.wav'), 'x');
  assert.match(resolveTrack(lone, opts).path, /cafe\.wav$/);
});

test('AMBIENCE=off disables, and unset keeps it on', () => {
  assert.equal(loadAmbienceConfig('/nonexistent.json', { AMBIENCE: 'off' }).enabled, false);
  assert.equal(loadAmbienceConfig('/nonexistent.json', {}).enabled, true);
  assert.equal(loadAmbienceConfig('/nonexistent.json', { AMBIENCE: 'on' }).enabled, true);
});

test('ffmpeg loops the file forever and applies room gain', () => {
  const a = ffmpegArgs('/x/a.ogg', 6);
  assert.ok(a.join(' ').includes('-stream_loop -1 -i /x/a.ogg'));
  assert.ok(a.join(' ').includes('volume=6dB'));
  assert.ok(!ffmpegArgs('/x/a.ogg', 0).join(' ').includes('volume='));
  assert.ok(ffmpegArgs('/x/a.ogg', 6, -10).join(' ').includes('volume=-4dB'));
  assert.ok(ffmpegArgs('/x/a.ogg').join(' ').includes('alimiter=limit=0.79'));
});

test('describe lists every room', () => {
  const s = setup();
  const text = s.amb.describe();
  assert.match(text, /campfire/i);
  assert.match(text, /jantar-mantar: no voice channel matches/);
});

test('a dropped connection retries with growing pauses, never in a tight loop', async () => {
  const s = setup({ people: { 2: 1 } });
  const lost = [];
  s.pool[0].start = async (room, ch, assets, onLost) => { lost.push(onLost); return { stop: async () => {} }; };
  s.amb.evaluate('2');
  await s.settle();
  const waits = [];
  for (let n = 0; n < 3; n++) {
    lost.at(-1)();
    waits.push(s.timers.at(-1).ms);
    await s.fire();
    await s.settle();
  }
  assert.deepEqual(waits, [3000, 6000, 12000]);
});

test('duplicate helper tokens and the main token are ignored', async () => {
  const { startHelperClients } = await import('../ambience-voice.mjs');
  const log = [];
  const out = await startHelperClients({ AMBIENCE_HELPER_TOKENS: 'a,a, main', DISCORD_BOT_TOKEN: 'main' }, (t) => log.push(t));
  assert.ok(log.some((l) => /ignored 2 duplicate/.test(l)));
  out.forEach((o) => o.client.destroy());
});

test('people are counted from voice states, including members missing from the cache', async () => {
  const { humansInChannel } = await import('../ambience-voice.mjs');
  const users = new Map([['bot9', { bot: true }]]);
  const guild = {
    client: { users: { cache: users } },
    voiceStates: { cache: new Map([
      ['u1', { id: 'u1', channelId: '2', member: null }],
      ['u2', { id: 'u2', channelId: '2', member: { user: { bot: false } } }],
      ['snitch', { id: 'snitch', channelId: '2', member: { user: { bot: true } } }],
      ['bot9', { id: 'bot9', channelId: '2', member: null }],
      ['u3', { id: 'u3', channelId: '3', member: null }],
    ]) },
  };
  assert.equal(humansInChannel(guild, '2', new Set(['snitch'])), 2);
});
