// Elder role, Elder private rooms, hobby picker, the public-voice notice and cloned ambient rooms.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openStore } from '../store.mjs';
import { createSync } from '../sync.mjs';
import { entitlement, isElder } from '../core.mjs';
import { createElderRooms } from '../elder-rooms.mjs';
import { planHobbyChange } from '../hobbies.mjs';
import { DEFAULT_ROOMS, createAmbience, matchRooms } from '../ambience.mjs';
import { VOICE_NOTICE } from '../voice-notice.mjs';

mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-22T12:00:00Z') });

const DAY = 86_400_000;
const schema = fs.readFileSync(new URL('../../src/lib/db.ts', import.meta.url), 'utf8').match(/const SCHEMA = `([\s\S]*?)`;/)[1];
const slugs = ['alien', 'citizen', 'top-1', 'upper-middle-class', 'middle-class'];
const cfg = {
  guildId: '1',
  tiers: slugs.map((slug, i) => ({ slug, name: slug, rank: i + 1, roleId: `r-${slug}`, accessRoleId: `a-${slug}`, bmcLevelIds: [], bmcLevels: [slug] })),
  staffRoleIds: ['founder', 'rep', 'minister'],
  grace: { lapseDays: 7, remindDaysBeforeEnd: [3], remindDuringGrace: [0, 5] },
  channels: { botLog: 'botlog', modLog: 'modlog' },
  unknownLevelTier: 'alien',
  elder: { roleId: 'elder', afterDays: 90, lobbyChannelId: 'lobby', categoryId: 'elders', maxRoomsPerElder: 1 },
  hobbies: [
    { slug: 'gaming', label: 'Gaming', roleId: 'h-gaming' },
    { slug: 'books', label: 'Books', roleId: 'h-books' },
    { slug: 'art', label: 'Art', roleId: 'h-art' },
  ],
};
const env = { siteUrl: 'https://closetrepublic.com', renewUrl: '', bmcApiToken: '', bmcApiUrl: '' };

function setup() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crcom-')), 'db.sqlite');
  new Database(file).exec(schema);
  const store = openStore(file);
  const guildRoles = new Map();
  const dms = [];
  const discord = {
    fetchMember: async (id) => (guildRoles.has(id) ? { roles: new Set(guildRoles.get(id)) } : null),
    addRole: async (id, r) => guildRoles.get(id).add(r),
    removeRole: async (id, r) => guildRoles.get(id).delete(r),
    dm: async (id, text) => (dms.push({ id, text }), true),
    post: async () => {},
  };
  let clock = Date.parse('2026-10-22T12:00:00Z');
  const sync = createSync({ cfg, store, discord, env, now: () => clock });
  const at = () => new Date(clock).toISOString();
  const verify = (id, email) => store.db.prepare('INSERT INTO discord_members (discord_id, email, linked_at, updated_at) VALUES (?, ?, ?, ?)').run(id, email, at(), at());
  const pay = (sub, email, level) =>
    store.db.prepare("INSERT INTO memberships (subscription_id, email, level_name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run(sub, email, level, at(), at());
  return { store, sync, guildRoles, dms, verify, pay, tick: (d) => (clock += d * DAY), roles: (id) => [...guildRoles.get(id)].sort() };
}

test('Alien is never free: a verified member with nothing paid is a Visitor', async () => {
  const t = setup();
  t.verify('100000000000000001', 'a@example.com');
  t.guildRoles.set('100000000000000001', new Set());
  const r = await t.sync.syncMember('100000000000000001');
  assert.equal(r.tier, null);
  assert.equal(r.state, 'none');
  assert.deepEqual(t.roles('100000000000000001'), []);
});

test('Elder role arrives after 90 days of verified membership and not before', async () => {
  const t = setup();
  const id = '100000000000000002';
  t.verify(id, 'e@example.com');
  t.pay('s1', 'e@example.com', 'alien');
  t.guildRoles.set(id, new Set());
  await t.sync.syncMember(id);
  assert.deepEqual(t.roles(id), ['a-alien', 'r-alien']);
  t.tick(89);
  await t.sync.syncMember(id, 'sweep');
  assert.ok(!t.roles(id).includes('elder'));
  t.tick(1);
  await t.sync.syncMember(id, 'sweep');
  assert.ok(t.roles(id).includes('elder'));
  assert.equal(t.dms.filter((d) => /Elder/.test(d.text)).length, 1);
  await t.sync.syncMember(id, 'sweep');
  assert.equal(t.dms.filter((d) => /Elder/.test(d.text)).length, 1, 'told once');
});

test('Elder is removed when the membership ends for good', async () => {
  const t = setup();
  const id = '100000000000000003';
  t.verify(id, 'x@example.com');
  t.pay('s2', 'x@example.com', 'citizen');
  t.guildRoles.set(id, new Set());
  t.tick(100);
  await t.sync.syncMember(id);
  assert.ok(t.roles(id).includes('elder'));
  t.store.db.prepare("UPDATE memberships SET status = 'lapsed', ended_at = ?, updated_at = ? WHERE subscription_id = 's2'").run(new Date(Date.now() - 30 * DAY).toISOString(), new Date().toISOString());
  await t.sync.syncMember(id, 'sweep');
  assert.ok(!t.roles(id).includes('elder'));
});

test('isElder needs a role id, a verified link and a class', () => {
  const ent = entitlement(cfg, { memberships: [{ status: 'active', level_name: 'citizen' }], member: { email: 'a@b.c' } });
  const old = { email: 'a@b.c', linked_at: new Date(Date.now() - 91 * DAY).toISOString() };
  assert.equal(isElder(cfg, old, ent), true);
  assert.equal(isElder(cfg, { ...old, linked_at: null }, ent), false);
  assert.equal(isElder({ ...cfg, elder: { ...cfg.elder, roleId: '' } }, old, ent), false);
  assert.equal(isElder(cfg, old, { state: 'none' }), false);
});

function elderSetup() {
  const t = setup();
  const channels = new Map(); // id → people
  let n = 0;
  const log = [];
  const timers = [];
  const dc = {
    createRoom: async ({ ownerId, name }) => { const id = `room${++n}`; channels.set(id, 0); log.push(['create', ownerId, name]); return id; },
    moveMember: async (u, id) => { channels.set(id, channels.get(id) + 1); log.push(['move', u, id]); },
    deleteChannel: async (id) => { channels.delete(id); log.push(['delete', id]); },
    allow: async (id, u) => log.push(['allow', id, u]),
    deny: async (id, u) => log.push(['deny', id, u]),
    rename: async (id, name) => log.push(['rename', id, name]),
    setLimit: async (id, k) => log.push(['limit', id, k]),
    peopleIn: (id) => channels.get(id) ?? 0,
    exists: (id) => channels.has(id),
  };
  const rooms = createElderRooms({ cfg, store: t.store, dc, setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length), clearTimer: () => {} });
  return { ...t, rooms, channels, log, timers };
}

test('an Elder joining the lobby gets a private room and is moved in; non-Elders get nothing', async () => {
  const e = elderSetup();
  const no = await e.rooms.lobbyJoin({ userId: 'u1', displayName: 'Ada', roleIds: new Set() });
  assert.equal(no.moved, false);
  const yes = await e.rooms.lobbyJoin({ userId: 'u1', displayName: 'Ada <b>!', roleIds: new Set(['elder']) });
  assert.equal(yes.moved, true);
  assert.deepEqual(e.log[0], ['create', 'u1', "Ada b's room"]);
  // joining again reuses the room
  await e.rooms.lobbyJoin({ userId: 'u1', displayName: 'Ada', roleIds: new Set(['elder']) });
  assert.equal(e.log.filter((x) => x[0] === 'create').length, 1);
});

test('an empty private room is deleted after a pause, and kept if someone returns', async () => {
  const e = elderSetup();
  const { channelId } = await e.rooms.lobbyJoin({ userId: 'u1', displayName: 'Ada', roleIds: new Set(['elder']) });
  e.channels.set(channelId, 0);
  e.rooms.roomChanged(channelId);
  assert.equal(e.timers.at(-1).ms, 15_000);
  e.channels.set(channelId, 1);
  await e.timers.at(-1).fn();
  assert.ok(e.channels.has(channelId));
  e.channels.set(channelId, 0);
  e.rooms.roomChanged(channelId);
  await e.timers.at(-1).fn();
  assert.ok(!e.channels.has(channelId));
  assert.equal(e.store.elderRoomByChannel(channelId), null);
});

test('/room invite, rename, limit and close act on the owner’s own room only', async () => {
  const e = elderSetup();
  assert.match(await e.rooms.command({ sub: 'invite', userId: 'u1', roleIds: new Set(['elder']), target: 'u2' }), /no private room/);
  const { channelId } = await e.rooms.lobbyJoin({ userId: 'u1', displayName: 'Ada', roleIds: new Set(['elder']) });
  assert.match(await e.rooms.command({ sub: 'invite', userId: 'u1', roleIds: new Set(['elder']), target: 'u2' }), /can now see/);
  assert.match(await e.rooms.command({ sub: 'rename', userId: 'u1', roleIds: new Set(['elder']), name: 'Tea <time>' }), /Tea time/);
  assert.match(await e.rooms.command({ sub: 'limit', userId: 'u1', roleIds: new Set(['elder']), limit: 4 }), /up to 4/);
  assert.match(await e.rooms.command({ sub: 'invite', userId: 'u2', roleIds: new Set(['elder']), target: 'u3' }), /no private room/);
  assert.match(await e.rooms.command({ sub: 'invite', userId: 'u1', roleIds: new Set(), target: 'u2' }), /for Elders/);
  assert.match(await e.rooms.command({ sub: 'close', userId: 'u1', roleIds: new Set(['elder']) }), /closed/);
  assert.ok(!e.channels.has(channelId));
});

test('start-up cleanup removes rooms that are gone or empty', async () => {
  const e = elderSetup();
  e.store.elderRoomCreate('ghost', 'u9');
  const { channelId } = await e.rooms.lobbyJoin({ userId: 'u1', displayName: 'Ada', roleIds: new Set(['elder']) });
  e.channels.set(channelId, 0);
  await e.rooms.cleanup();
  assert.deepEqual(e.store.elderRoomsAll(), []);
  assert.ok(!e.channels.has(channelId));
});

test('/forget-me removes the member’s Elder rooms row', () => {
  const e = elderSetup();
  e.store.elderRoomCreate('roomX', 'u5');
  e.store.forget('u5');
  assert.equal(e.store.elderRoomByChannel('roomX'), null);
});

test('hobby picker: the member ends up with exactly the picked hobbies, other roles untouched', () => {
  const plan = planHobbyChange(cfg, new Set(['h-gaming', 'h-art', 'a-alien']), ['books', 'art']);
  assert.deepEqual(plan.add.map((h) => h.slug), ['books']);
  assert.deepEqual(plan.remove.map((h) => h.slug), ['gaming']);
  const none = planHobbyChange(cfg, new Set(['h-books', 'r-citizen']), []);
  assert.deepEqual(none.remove.map((h) => h.slug), ['books']);
  assert.deepEqual(planHobbyChange(cfg, new Set(), []).add, []);
});

test('a cloned Elder category sounds like the original, and only public rooms get the notice', async () => {
  const channels = [
    { id: 'c1', name: 'Campfire', kind: 'voice', parentId: 'rec' },
    { id: 'c2', name: '🔥 Underground Campfire', kind: 'voice', parentId: 'elders' },
    { id: 'lobby', name: 'Elder lobby', kind: 'voice', parentId: 'elders', ignore: true },
    { id: 'p1', name: "Ada's room", kind: 'voice', parentId: 'elders', ignore: true },
  ];
  const m = matchRooms(DEFAULT_ROOMS, channels);
  assert.deepEqual([...m.keys()].sort(), ['c1', 'c2']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambn-'));
  fs.mkdirSync(path.join(dir, 'defaults'));
  fs.writeFileSync(path.join(dir, 'defaults', 'campfire.ogg'), 'x');
  const seen = [];
  const people = { c1: 1, c2: 1 };
  const pool = [1, 2].map((n) => ({ name: `b${n}`, busy: false, start: async (room, ch, assets) => (seen.push([ch.id, assets.notice]), { stop: async () => {} }) }));
  const amb = createAmbience({
    config: { enabled: true, dir: path.join(dir, 'mine'), defaultsDir: path.join(dir, 'defaults'), visualsDir: dir, leaveDelayMs: 1, rooms: DEFAULT_ROOMS },
    pool,
    humansIn: (id) => people[id] ?? 0,
    channels: () => channels,
    notice: (c) => (c.parentId === 'elders' ? null : VOICE_NOTICE),
  });
  amb.scan();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(seen.sort(), [['c1', VOICE_NOTICE], ['c2', null]]);
  assert.match(amb.describe(), /2 room\(s\) matched/);
});

test('the public-voice notice says what Amaya asked for', () => {
  assert.match(VOICE_NOTICE, /public/i);
  assert.match(VOICE_NOTICE, /sensitive/i);
  assert.match(VOICE_NOTICE, /newcomers/i);
  assert.match(VOICE_NOTICE, /unsolicited DM/i);
  assert.match(VOICE_NOTICE, /Embassy/);
});

test('helper setup: counts rooms, validates tokens, builds invites and env lines', async () => {
  const { plan, inviteUrl, helperNames, setEnvLine, HELPER_PERMISSIONS } = await import('../helpers-setup.mjs');
  const chans = [
    { id: '1', name: 'Campfire', type: 2, parent_id: 'a' },
    { id: '2', name: 'Underground Campfire', type: 2, parent_id: 'b' },
    { id: '3', name: 'Town Hall', type: 13, parent_id: 'a' },
    { id: '4', name: 'general', type: 0 },
  ];
  const rest = { get: async (route) => (String(route).includes('/members/') ? (String(route).endsWith('/222') ? Promise.reject(new Error('Unknown Member')) : {}) : chans) };
  const helperRest = (t) => ({ get: async () => (t === 'bad' ? Promise.reject(Object.assign(new Error('x'), { status: 401 })) : { id: t === 'tok1' ? '111' : '222', username: `Helper ${t}` }) });
  const r = await plan({ rest, guildId: '9', tokens: ['tok1', 'tok2', 'bad'], ambience: { rooms: DEFAULT_ROOMS }, helperRest });
  assert.equal(r.need, 3);
  assert.equal(r.helpers.filter((h) => h.ok).length, 2);
  assert.equal(r.helpers.find((h) => h.id === '222').inServer, false);
  assert.equal(r.working, 1);
  assert.equal(r.missing, 0);
  assert.match(inviteUrl('222', '9'), /client_id=222.*scope=bot.*permissions=\d+.*guild_id=9/);
  assert.ok(HELPER_PERMISSIONS.has('SetVoiceChannelStatus') && HELPER_PERMISSIONS.has('Connect') && !HELPER_PERMISSIONS.has('Administrator'));
  assert.deepEqual(helperNames(2, 5), ['Snitch Helper 3', 'Snitch Helper 4', 'Snitch Helper 5']);
  assert.equal(setEnvLine('A=1\nAMBIENCE_HELPER_TOKENS=old\nB=2\n', 'AMBIENCE_HELPER_TOKENS', 'x,y'), 'A=1\nAMBIENCE_HELPER_TOKENS=x,y\nB=2\n');
  assert.equal(setEnvLine('A=1', 'AMBIENCE_HELPER_TOKENS', 'x'), 'A=1\nAMBIENCE_HELPER_TOKENS=x\n');
});
