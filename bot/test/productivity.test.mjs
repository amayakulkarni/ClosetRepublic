// To-do lists, voice channel tracking, Pomodoro (with opt-in muting and the cafe helper) and /rank.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openStore } from '../store.mjs';
import { elderProgress, entitlement } from '../core.mjs';
import { handleCommand } from '../commands.mjs';
import { TODO_LIMITS, cleanTask, todoCommand } from '../todos.mjs';
import { POMODORO_DEFAULTS, createPomodoro, isPomodoroRoom, loadPomodoroConfig } from '../pomodoro.mjs';
import { createVcTools } from '../vc-tools.mjs';
import { DEFAULT_ROOMS, createAmbience } from '../ambience.mjs';
import { PRODUCTIVITY_COMMANDS } from '../discord-productivity.mjs';

mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-24T12:00:00Z') });

const DAY = 86_400_000;
const schema = fs.readFileSync(new URL('../../src/lib/db.ts', import.meta.url), 'utf8').match(/const SCHEMA = `([\s\S]*?)`;/)[1];
const slugs = ['alien', 'citizen', 'top-1', 'upper-middle-class', 'middle-class'];
const names = ['Alien', 'Citizen', 'Top 1%', 'Upper Middle Class', 'Middle Class'];
const cfg = {
  guildId: '1',
  tiers: slugs.map((slug, i) => ({ slug, name: names[i], rank: i + 1, roleId: `r-${slug}`, accessRoleId: `a-${slug}`, bmcLevelIds: [], bmcLevels: [slug] })),
  staffRoleIds: ['founder', 'rep', 'minister'],
  grace: { lapseDays: 7, remindDaysBeforeEnd: [3], remindDuringGrace: [0, 5] },
  channels: {},
  unknownLevelTier: 'alien',
  elder: { roleId: 'elder', afterDays: 90, lobbyChannelId: 'lobby', categoryId: 'elders', maxRoomsPerElder: 1 },
  hobbies: [],
};

function openTestStore() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crprod-')), 'db.sqlite');
  new Database(file).exec(schema);
  return openStore(file);
}

const todo = (store, ctx) => todoCommand({ list: 'mine', isMod: false, roomId: null, inRoom: false, ...ctx }, { store });

// ---------- to-do lists ----------

test('a personal to-do list: add, list, done and remove, numbered in order', () => {
  const store = openTestStore();
  assert.match(todo(store, { sub: 'add', userId: 'u1', task: 'Write the gazette' }), /number 1/);
  todo(store, { sub: 'add', userId: 'u1', task: 'Fix the  footer\nlink' });
  assert.equal(todo(store, { sub: 'list', userId: 'u1' }), '**Your to-do list**\n1. Write the gazette\n2. Fix the footer link');
  assert.equal(todo(store, { sub: 'list', userId: 'u2' }), '**Your to-do list**\nNothing on the list.');
  assert.equal(todo(store, { sub: 'done', userId: 'u1', item: 1 }), 'Done: ~~Write the gazette~~');
  assert.match(todo(store, { sub: 'remove', userId: 'u1', item: 5 }), /from 1 to 1/);
  assert.equal(todo(store, { sub: 'remove', userId: 'u1', item: 1 }), 'Removed: Fix the footer link');
  assert.equal(store.todoList('u1', null).length, 0);
});

test('task text is one line, cannot ping everyone, and is capped', () => {
  assert.equal(cleanTask('  ping @everyone\tnow '), 'ping @​everyone now');
  assert.equal(cleanTask('x'.repeat(500)).length, TODO_LIMITS.textLength);
  const store = openTestStore();
  assert.equal(todo(store, { sub: 'add', userId: 'u1', task: '   ' }), 'Write the task.');
});

test('a voice channel list needs the voice channel, and writing needs being in it', () => {
  const store = openTestStore();
  assert.match(todo(store, { sub: 'add', userId: 'u1', list: 'room', task: 'x' }), /Run this from a voice channel/);
  assert.match(todo(store, { sub: 'add', userId: 'u1', list: 'room', roomId: 'vc1', inRoom: false, task: 'x' }), /Join that voice channel/);
  assert.match(todo(store, { sub: 'add', userId: 'u1', list: 'room', roomId: 'vc1', inRoom: true, task: 'Agenda point' }), /Everyone in the channel can read it/);
  // Reading is fine from the channel's chat without being connected.
  assert.match(todo(store, { sub: 'list', userId: 'u2', list: 'room', roomId: 'vc1' }), /1\. Agenda point/);
  // Someone else in the room can tick it off but not delete it unfinished; a mod can.
  todo(store, { sub: 'add', userId: 'u1', list: 'room', roomId: 'vc1', inRoom: true, task: 'Second' });
  assert.match(todo(store, { sub: 'remove', userId: 'u2', list: 'room', roomId: 'vc1', inRoom: true, item: 1 }), /Only the person who added it/);
  assert.equal(todo(store, { sub: 'done', userId: 'u2', list: 'room', roomId: 'vc1', inRoom: true, item: 1 }), 'Done: ~~Agenda point~~');
  assert.equal(todo(store, { sub: 'remove', userId: 'u3', isMod: true, list: 'room', roomId: 'vc1', item: 1 }), 'Removed: Second');
});

test('clearing a voice channel list only clears your own items unless you are a mod', () => {
  const store = openTestStore();
  for (const u of ['u1', 'u2']) todo(store, { sub: 'add', userId: u, list: 'room', roomId: 'vc1', inRoom: true, task: `from ${u}` });
  assert.match(todo(store, { sub: 'clear', userId: 'u1', list: 'room', roomId: 'vc1', inRoom: true }), /Cleared 1 item/);
  assert.deepEqual(store.todoList(null, 'vc1').map((t) => t.text), ['from u2']);
  assert.match(todo(store, { sub: 'clear', userId: 'm', isMod: true, list: 'room', roomId: 'vc1' }), /Cleared 1 item/);
});

test('lists are capped, old items expire, and /forget-me deletes every item the member wrote', () => {
  const store = openTestStore();
  for (let n = 0; n < TODO_LIMITS.personalItems; n++) store.todoAdd('u1', null, `t${n}`);
  assert.match(todo(store, { sub: 'add', userId: 'u1', task: 'one more' }), /full/);
  store.todoAdd('u1', 'vc1', 'room item');
  store.todoAdd('u2', 'vc1', 'other room item');
  assert.equal(store.todoExpire(TODO_LIMITS.personalDays, TODO_LIMITS.roomDays, Date.now() + 15 * DAY), 2);
  assert.equal(store.todoList('u1', null).length, TODO_LIMITS.personalItems);
  assert.equal(store.todoExpire(TODO_LIMITS.personalDays, TODO_LIMITS.roomDays, Date.now() + 31 * DAY), TODO_LIMITS.personalItems);
  store.todoAdd('u1', null, 'mine');
  store.todoAdd('u1', 'vc2', 'room');
  store.todoAdd('u2', 'vc2', 'theirs');
  store.forget('u1');
  assert.deepEqual(store.db.prepare('SELECT owner_id FROM todos').all().map((r) => r.owner_id), ['u2']);
});

// ---------- /rank and the Elder countdown ----------

function rankSetup() {
  const store = openTestStore();
  const at = (d) => new Date(Date.now() - d * DAY).toISOString();
  const verify = (id, email, daysAgo) => store.db.prepare('INSERT INTO discord_members (discord_id, email, linked_at, updated_at) VALUES (?, ?, ?, ?)').run(id, email, at(daysAgo), at(0));
  const pay = (email, level) => store.db.prepare("INSERT INTO memberships (subscription_id, email, level_name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run(`s-${email}`, email, level, at(0), at(0));
  const rank = (userId) => handleCommand({ command: 'rank', userId, roleIds: new Set(), option: () => null }, { cfg, store, sync: {}, env: {}, discord: {} });
  return { store, verify, pay, rank };
}

test('/rank shows the class, its place on the ladder and the days left to Elder', async () => {
  const t = rankSetup();
  t.verify('u1', 'a@example.com', 40);
  t.pay('a@example.com', 'citizen');
  const text = await t.rank('u1');
  assert.match(text, /Your class: Citizen, rank 2 of 5 \(Alien < \*\*Citizen\*\* < Top 1%/);
  assert.match(text, /verified 40 day\(s\) ago, 50 day\(s\) to go \(around 13 December 2026\)/);
});

test('/rank for a Visitor, an unverified member and an Elder', async () => {
  const t = rankSetup();
  assert.match(await t.rank('nobody'), /You are a Visitor.*\n.*starts when you verify/);
  t.verify('u2', 'b@example.com', 95);
  t.pay('b@example.com', 'alien');
  assert.match(await t.rank('u2'), /You are an Elder \(verified 95 days ago\)/);
  t.verify('u3', 'c@example.com', 100); // verified long ago but no class now
  assert.match(await t.rank('u3'), /your 90 days are done; the role arrives once you hold a class again/);
});

test('elderProgress counts whole days and agrees with the Elder rule on day 90', () => {
  const now = Date.now();
  const member = { email: 'x@example.com', linked_at: new Date(now - 90 * DAY).toISOString() };
  const ent = { state: 'active' };
  assert.deepEqual(elderProgress(cfg, member, ent, now), { verified: true, days: 90, remaining: 0, eligibleAt: now, elder: true });
  const p = elderProgress(cfg, member, ent, now - 1);
  assert.equal(p.remaining, 1);
  assert.equal(p.elder, false);
  assert.equal(elderProgress(cfg, { email: null }, ent, now).verified, false);
  assert.equal(entitlement(cfg, {}).state, 'none');
});

// ---------- Pomodoro ----------

const CHANNELS = {
  office: { id: 'office', name: '💼│office', kind: 'voice' },
  cafe: { id: 'cafe', name: '☕│Cafe', kind: 'voice' },
  hammock: { id: 'hammock', name: '🌊│Hammock', kind: 'voice' },
};

function pomoSetup({ ambience = null } = {}) {
  const store = openTestStore();
  const voice = new Map(); // userId → { channelId, serverMute }
  const posts = [];
  const statuses = [];
  const mutes = [];
  const timers = [];
  let clock = Date.now();
  const pd = {
    channel: (id) => CHANNELS[id] ?? null,
    humans: (channelId) => [...voice].filter(([, v]) => v.channelId === channelId).map(([id]) => id),
    voiceOf: (id) => voice.get(id) ?? null,
    async setMute(id, on) {
      if (!voice.has(id)) throw new Error('Target user is not connected to voice.');
      voice.get(id).serverMute = on;
      mutes.push([id, on]);
    },
    setStatus: async (channelId, text) => statuses.push([channelId, text]),
    post: async (channelId, payload) => (posts.push([channelId, payload.content]), { id: `m${posts.length}` }),
    pin: async () => {},
    unpin: async () => {},
  };
  const pomo = createPomodoro({
    config: { ...POMODORO_DEFAULTS, match: ['office', 'cowork', 'cafe', 'study'], channelIds: [] },
    store, pd, ambience: () => ambience,
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimer: (t) => { if (t) t.cleared = true; },
    now: () => clock,
  });
  const fire = async () => {
    const t = timers.filter((x) => !x.cleared).pop();
    t.cleared = true;
    clock += t.ms;
    await t.fn();
    await new Promise((r) => setImmediate(r));
  };
  const join = (id, channelId) => voice.set(id, { channelId, serverMute: voice.get(id)?.serverMute ?? false });
  return { store, voice, posts, statuses, mutes, timers, pomo, pd, fire, join };
}

test('Pomodoro runs only in office and coworking channels, and only from inside them', async () => {
  const config = loadPomodoroConfig('/nonexistent.json', {});
  assert.ok(isPomodoroRoom(config, CHANNELS.office));
  assert.ok(isPomodoroRoom(config, CHANNELS.cafe));
  assert.ok(!isPomodoroRoom(config, CHANNELS.hammock));
  assert.ok(!isPomodoroRoom(config, { id: 'x', name: 'Studio' }));
  assert.ok(isPomodoroRoom({ ...config, channelIds: ['hammock'] }, CHANNELS.hammock));
  assert.equal(loadPomodoroConfig('/nonexistent.json', { POMODORO: 'off' }).enabled, false);

  const t = pomoSetup();
  t.join('u1', 'hammock');
  assert.match(await t.pomo.start({ channelId: 'hammock', userId: 'u1' }), /only in the office and coworking/);
  assert.match(await t.pomo.start({ channelId: 'office', userId: 'u1' }), /Join an office or coworking voice channel first/);
  t.join('u1', 'office');
  assert.match(await t.pomo.start({ channelId: 'office', userId: 'u1', focus: 50, brk: 10, rounds: 2 }), /2 focus block\(s\) of 50 minutes/);
  assert.match(await t.pomo.start({ channelId: 'office', userId: 'u1' }), /already running/);
});

test('nobody is muted without opting in; opted-in members are muted in focus and unmuted in breaks and at the end', async () => {
  const t = pomoSetup();
  t.join('u1', 'office');
  t.join('u2', 'office');
  t.store.todoAdd('u2', 'office', 'Draft the bill');
  await t.pomo.start({ channelId: 'office', userId: 'u1', rounds: 2 });
  assert.deepEqual(t.mutes, []);
  assert.match(t.statuses.at(-1)[1], /focus 1\/2 \(25 min\)/);
  assert.match(t.posts.at(-1)[1], /Focus 1 of 2[\s\S]*1\. Draft the bill/);

  assert.match(await t.pomo.optIn({ channelId: 'office', userId: 'u2' }), /muted until this focus block ends/);
  assert.deepEqual(t.mutes, [['u2', true]]);
  assert.ok(t.store.pomodoroMuted('u2'));

  await t.fire(); // focus 1 → break
  assert.deepEqual(t.mutes.at(-1), ['u2', false]);
  assert.match(t.statuses.at(-1)[1], /break \(5 min\)/);
  assert.equal(t.store.pomodoroMuted('u2'), null);

  await t.fire(); // break → focus 2
  assert.deepEqual(t.mutes.at(-1), ['u2', true]);
  assert.match(t.posts.at(-1)[1], /Focus 2 of 2/);

  await t.fire(); // focus 2 was the last → done
  assert.deepEqual(t.mutes.at(-1), ['u2', false]);
  assert.equal(t.statuses.at(-1)[1], '');
  assert.match(t.posts.at(-1)[1], /Pomodoro finished/);
  assert.equal(t.pomo.isRunning('office'), false);
  assert.equal(t.voice.get('u1').serverMute, false);
});

test('a member a moderator muted is never taken over by the Pomodoro', async () => {
  const t = pomoSetup();
  t.join('u1', 'office');
  t.voice.set('mod-muted', { channelId: 'office', serverMute: true });
  await t.pomo.start({ channelId: 'office', userId: 'u1' });
  assert.match(await t.pomo.optIn({ channelId: 'office', userId: 'mod-muted' }), /already server-muted by a moderator/);
  await t.pomo.stop({ channelId: 'office', userId: 'u1' });
  assert.equal(t.voice.get('mod-muted').serverMute, true);
  assert.deepEqual(t.mutes, []);
});

test('leaving during focus: the mute is lifted as soon as the member is back in any voice channel', async () => {
  const t = pomoSetup();
  t.join('u1', 'office');
  t.join('u2', 'office');
  await t.pomo.start({ channelId: 'office', userId: 'u1' });
  await t.pomo.optIn({ channelId: 'office', userId: 'u2' });
  t.voice.delete('u2'); // disconnected while muted
  await t.pomo.voiceChanged({ userId: 'u2', from: 'office', to: null });
  assert.ok(t.store.pomodoroMuted('u2'), 'kept on record until Discord allows the unmute');
  t.voice.set('u2', { channelId: 'hammock', serverMute: true });
  await t.pomo.voiceChanged({ userId: 'u2', from: null, to: 'hammock' });
  assert.equal(t.voice.get('u2').serverMute, false);
  assert.equal(t.store.pomodoroMuted('u2'), null);
});

test('the session ends quietly when the channel empties, and a restart lifts mutes left on record', async () => {
  const t = pomoSetup();
  t.join('u1', 'office');
  await t.pomo.start({ channelId: 'office', userId: 'u1' });
  await t.pomo.optIn({ channelId: 'office', userId: 'u1' });
  t.voice.delete('u1');
  await t.pomo.voiceChanged({ userId: 'u1', from: 'office', to: null });
  assert.equal(t.pomo.isRunning('office'), false);
  assert.ok(t.store.pomodoroMuted('u1'));

  // A new bot process (sessions are gone) with the member back in voice.
  t.voice.set('u1', { channelId: 'cafe', serverMute: true });
  const after = createPomodoro({ config: loadPomodoroConfig('/nonexistent.json', {}), store: t.store, pd: t.pd });
  await after.recover();
  assert.equal(t.voice.get('u1').serverMute, false);
  assert.equal(t.store.pomodoroMutesAll().length, 0);
});

test('only the starter or a mod can stop it, unless the starter has left', async () => {
  const t = pomoSetup();
  t.join('u1', 'office');
  t.join('u2', 'office');
  await t.pomo.start({ channelId: 'office', userId: 'u1' });
  assert.match(await t.pomo.stop({ channelId: 'office', userId: 'u2' }), /Only the person who started it/);
  t.voice.delete('u1');
  assert.match(await t.pomo.stop({ channelId: 'office', userId: 'u2' }), /Pomodoro stopped/);
});

test('the Pomodoro calls a helper in for the cafe sound, and sends it away at the end', async () => {
  const people = { office: 0, cafe: 0 };
  const started = [];
  const pool = [{ name: 'Snitch Helper 1', busy: false, async start(room, channel, assets) { started.push([room.key, channel.id, room.status, assets.notice]); return { stop: async () => started.push(['stop', channel.id]) }; } }];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pomo-amb-'));
  for (const r of DEFAULT_ROOMS) fs.writeFileSync(path.join(dir, `${r.key}.ogg`), 'x');
  const amb = createAmbience({
    config: { enabled: true, dir: path.join(dir, 'mine'), defaultsDir: dir, visualsDir: dir, leaveDelayMs: 20_000, rooms: DEFAULT_ROOMS },
    pool,
    humansIn: (id) => people[id] ?? 0,
    channels: () => Object.values(CHANNELS),
    notice: () => 'NOTICE',
    setTimer: () => ({}),
    clearTimer: () => {},
  });
  const t = pomoSetup({ ambience: amb });
  t.join('u1', 'office');
  people.office = 1;
  await t.pomo.start({ channelId: 'office', userId: 'u1' });
  await new Promise((r) => setImmediate(r));
  // The office has no sound of its own: the helper plays the cafe loop, without its own status or notice.
  assert.deepEqual(started[0], ['cafe', 'office', null, null]);
  assert.match(t.posts[0][1], /cafe sound plays/);
  await t.pomo.stop({ channelId: 'office', userId: 'u1' });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started.at(-1), ['stop', 'office']);
  assert.equal(pool[0].busy, false);

  // The Cafe plays its own sound already; the Pomodoro keeps it and puts its status back at the end.
  people.cafe = 1;
  amb.evaluate('cafe');
  await new Promise((r) => setImmediate(r));
  t.join('u1', 'cafe');
  await t.pomo.start({ channelId: 'cafe', userId: 'u1' });
  await t.pomo.stop({ channelId: 'cafe', userId: 'u1' });
  assert.deepEqual(t.statuses.at(-1), ['cafe', '☕ coffee brewing']);
});

// ---------- voice channel tracking ----------

function vcSetup() {
  const t = pomoSetup();
  const pins = [];
  t.pd.pin = async (ch, id) => pins.push(['pin', ch, id]);
  t.pd.unpin = async (ch, id) => pins.push(['unpin', ch, id]);
  const timers = [];
  const vc = createVcTools({
    store: t.store, pd: t.pd, pomodoro: t.pomo,
    setTimer: (fn, ms) => { const x = { fn, ms }; timers.push(x); return x; },
    clearTimer: () => {},
  });
  return { ...t, vc, pins, vcTimers: timers };
}

test('/vc status works for people in the channel and never during a Pomodoro', async () => {
  const t = vcSetup();
  assert.match(await t.vc.command({ sub: 'status', userId: 'u1', roomId: 'office', inRoom: false, text: 'x' }), /Join that voice channel first/);
  assert.match(await t.vc.command({ sub: 'status', userId: 'u1', roomId: 'office', inRoom: true, text: 'Writing <@123> the bill\n@everyone' }), /Status of <#office>: Writing the bill/);
  assert.deepEqual(t.statuses.at(-1), ['office', 'Writing the bill']);
  t.join('u1', 'office');
  await t.pomo.start({ channelId: 'office', userId: 'u1' });
  assert.match(await t.vc.command({ sub: 'status', userId: 'u1', roomId: 'office', inRoom: true, text: 'x' }), /Pomodoro is running here/);
});

test('/vc meeting sets the status, pins the agenda from the channel list and ends on time', async () => {
  const t = vcSetup();
  t.store.todoAdd('u2', 'office', 'Budget');
  assert.match(await t.vc.command({ sub: 'meeting', userId: 'u1', roomId: 'office', inRoom: true, text: 'Weekly', minutes: 30 }), /for 30 min/);
  assert.deepEqual(t.statuses.at(-1), ['office', '📅 Meeting: Weekly']);
  assert.match(t.posts.at(-1)[1], /Meeting: Weekly[\s\S]*Agenda[\s\S]*1\. Budget/);
  assert.deepEqual(t.pins.at(-1), ['pin', 'office', 'm1']);
  assert.match(await t.vc.command({ sub: 'status', userId: 'u1', roomId: 'office', inRoom: true, text: 'x' }), /meeting is running/);
  await t.vcTimers[0].fn();
  assert.deepEqual(t.pins.at(-1), ['unpin', 'office', 'm1']);
  assert.deepEqual(t.statuses.at(-1), ['office', '']);
  assert.match(t.posts.at(-1)[1], /ended after \d+ min \(time is up\)/);
});

test('pinning from the menu needs the member in that voice channel (or a mod)', async () => {
  const t = vcSetup();
  assert.match(await t.vc.pinMessage({ userId: 'u1', roomId: null, messageId: 'x', pin: true }), /voice channel's chat/);
  assert.match(await t.vc.pinMessage({ userId: 'u1', roomId: 'office', inRoom: false, messageId: 'x', pin: true }), /Join that voice channel/);
  assert.equal(await t.vc.pinMessage({ userId: 'u1', roomId: 'office', inRoom: true, messageId: 'x', pin: true }), 'Pinned.');
  assert.equal(await t.vc.pinMessage({ userId: 'm', roomId: 'office', inRoom: false, isMod: true, messageId: 'x', pin: false }), 'Unpinned.');
  assert.deepEqual(t.pins, [['pin', 'office', 'x'], ['unpin', 'office', 'x']]);
});

test('the new slash commands are valid Discord definitions', () => {
  for (const c of PRODUCTIVITY_COMMANDS) {
    if (c.type === 3) {
      assert.ok(c.name.length <= 32 && !c.description);
      continue;
    }
    assert.match(c.name, /^[a-z-]{1,32}$/);
    assert.ok(c.description.length <= 100, c.name);
    for (const o of c.options) {
      assert.match(o.name, /^[a-z-]{1,32}$/);
      assert.ok(o.description.length <= 100, `${c.name} ${o.name}`);
      for (const p of o.options || []) assert.ok(p.description.length <= 100, `${c.name} ${o.name} ${p.name}`);
    }
  }
});
