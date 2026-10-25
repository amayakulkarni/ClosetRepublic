// Tourist (free role), Elder activity rule, activity counters and private-room creator roles.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openStore } from '../store.mjs';
import { createSync } from '../sync.mjs';
import { isElder, wantedRoles } from '../core.mjs';
import { createActivity } from '../activity.mjs';
import { createElderRooms } from '../elder-rooms.mjs';

mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-25T12:00:00Z') });

const DAY = 86_400_000;
const schema = fs.readFileSync(new URL('../../src/lib/db.ts', import.meta.url), 'utf8').match(/const SCHEMA = `([\s\S]*?)`;/)[1];
const slugs = ['alien', 'citizen', 'top-1', 'upper-middle-class', 'middle-class'];
const cfg = {
  guildId: '1',
  tiers: slugs.map((slug, i) => ({ slug, name: slug, rank: i + 1, roleId: `r-${slug}`, accessRoleId: `a-${slug}`, bmcLevelIds: [], bmcLevels: [slug] })),
  tourist: { roleId: 'tourist', accessRoleId: 'a-tourist', free: true },
  staffRoleIds: ['founder'],
  grace: { lapseDays: 7, remindDaysBeforeEnd: [3], remindDuringGrace: [0, 5] },
  channels: { botLog: 'botlog', modLog: 'modlog' },
  unknownLevelTier: 'alien',
  elder: { roleId: 'elder', afterDays: 90, activeDaysRequired: 30, activityWindowDays: 90, lobbyChannelId: 'lobby', categoryId: 'elders', creatorRoleIds: ['founder', 'rep', 'minister'], privateRoomPrefix: 'Private: ', maxRoomsPerElder: 2 },
  hobbies: [],
};
const env = { siteUrl: 'https://closetrepublic.com', renewUrl: '', bmcApiToken: '', bmcApiUrl: '' };

function setup() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crtour-')), 'db.sqlite');
  new Database(file).exec(schema);
  const store = openStore(file);
  const guildRoles = new Map();
  const discord = {
    fetchMember: async (id) => (guildRoles.has(id) ? { roles: new Set(guildRoles.get(id)) } : null),
    addRole: async (id, r) => guildRoles.get(id).add(r),
    removeRole: async (id, r) => guildRoles.get(id).delete(r),
    dm: async () => true,
    post: async () => {},
  };
  let clock = Date.now();
  const sync = createSync({ cfg, store, discord, env, now: () => clock });
  const at = () => new Date(clock).toISOString();
  const verify = (id, email, daysAgo = 0) => {
    const t = new Date(clock - daysAgo * DAY).toISOString();
    store.db.prepare('INSERT INTO discord_members (discord_id, email, linked_at, updated_at) VALUES (?, ?, ?, ?)').run(id, email, t, t);
    guildRoles.set(id, new Set());
  };
  const pay = (sub, email, level) =>
    store.db.prepare("INSERT INTO memberships (subscription_id, email, level_name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run(sub, email, level, at(), at());
  return { store, sync, guildRoles, verify, pay, tick: (d) => (clock += d * DAY), roles: (id) => [...guildRoles.get(id)].sort() };
}

test('wantedRoles gives a Tourist the access and display roles, minus display when discreet', () => {
  assert.deepEqual([...wantedRoles(cfg, null, { tourist: true })].sort(), ['a-tourist', 'tourist']);
  assert.deepEqual([...wantedRoles(cfg, null, { tourist: true, discreet: true })], ['a-tourist']);
  assert.deepEqual([...wantedRoles(cfg, null, {})], []);
});

test('a Tourist gets the free roles, a paid class replaces them, and a lapse falls back to Tourist', async () => {
  const t = setup();
  t.verify('u1', 'a@b.c');
  await t.sync.syncMember('u1');
  assert.deepEqual(t.roles('u1'), []);
  assert.equal(t.store.touristSet('u1'), true);
  await t.sync.syncMember('u1');
  assert.deepEqual(t.roles('u1'), ['a-tourist', 'tourist']);
  t.pay('s1', 'a@b.c', 'citizen');
  await t.sync.syncMember('u1');
  assert.ok(t.roles('u1').includes('r-citizen') && !t.roles('u1').includes('tourist'));
  t.store.db.prepare("UPDATE memberships SET status = 'lapsed', ended_at = ?, updated_at = ?").run(new Date(Date.now() - 30 * DAY).toISOString(), new Date().toISOString());
  await t.sync.syncMember('u1', 'sweep');
  assert.deepEqual(t.roles('u1'), ['a-tourist', 'tourist']);
});

test('the sweep never removes Tourist and touristSet needs a verified email', async () => {
  const t = setup();
  assert.equal(t.store.touristSet('nobody'), false);
  t.verify('u2', 'x@y.z');
  t.store.touristSet('u2');
  await t.sync.syncMember('u2', 'sweep');
  await t.sync.syncMember('u2', 'sweep');
  assert.ok(t.roles('u2').includes('tourist'));
});

test('Elder: Tourists qualify after 90 days and enough active days, and a timeout blocks it', async () => {
  const t = setup();
  t.verify('u3', 'e@f.g', 100);
  t.store.touristSet('u3');
  t.store.db.prepare("UPDATE discord_members SET tourist_since = ? WHERE discord_id = 'u3'").run(new Date(Date.now() - 100 * DAY).toISOString());
  await t.sync.syncMember('u3');
  assert.ok(!t.roles('u3').includes('elder'), 'no activity yet');
  for (let d = 0; d < 30; d++) t.store.activityAdd('u3', new Date(Date.now() - d * DAY).toISOString().slice(0, 10), 3, 0);
  t.store.strikeAdd('u3', 'timeout');
  await t.sync.syncMember('u3');
  assert.ok(!t.roles('u3').includes('elder'), 'timeout blocks');
  t.store.db.prepare('DELETE FROM discord_strikes').run();
  await t.sync.syncMember('u3');
  assert.ok(t.roles('u3').includes('elder'));
  assert.ok(t.store.member('u3').elder_since);
});

test('Elder: existing holders are grandfathered, and too-recent members are not Elders', async () => {
  const t = setup();
  t.verify('old', 'o@o.o', 200);
  t.store.touristSet('old');
  t.guildRoles.get('old').add('elder');
  await t.sync.syncMember('old');
  assert.ok(t.roles('old').includes('elder') && t.store.member('old').elder_since);
  t.verify('new', 'n@n.n', 10);
  t.store.touristSet('new');
  for (let d = 0; d < 30; d++) t.store.activityAdd('new', new Date(Date.now() - d * DAY).toISOString().slice(0, 10), 5, 0);
  await t.sync.syncMember('new');
  assert.ok(!t.roles('new').includes('elder'));
});

test('isElder is false without an email even for a Tourist row', () => {
  assert.equal(isElder(cfg, { email: null, tourist_since: '2026-01-01T00:00:00Z' }, { state: 'none' }, Date.now(), { activeDays: 99, moderated: false }), false);
});

test('activity counters flush as numbers per day and expire after the keep window', () => {
  const t = setup();
  let clock = Date.now();
  const act = createActivity({ store: t.store, now: () => clock, keepDays: 120 });
  act.message('u'); act.message('u'); act.voiceMinute('u');
  act.flush();
  assert.deepEqual(t.store.activitySummary('u', 90, clock, 1, 1), { activeDays: 1, moderated: false });
  clock += 130 * DAY;
  act.expire();
  assert.equal(t.store.db.prepare('SELECT COUNT(*) n FROM discord_activity').get().n, 0);
});

test('forget-me removes Tourist, Elder, activity and strikes', () => {
  const t = setup();
  t.verify('u4', 'f@f.f');
  t.store.touristSet('u4');
  t.store.activityAdd('u4', '2026-10-24', 1, 0);
  t.store.strikeAdd('u4', 'timeout');
  t.store.forget('u4');
  assert.equal(t.store.db.prepare("SELECT COUNT(*) n FROM discord_activity WHERE discord_id = 'u4'").get().n, 0);
  assert.equal(t.store.db.prepare("SELECT COUNT(*) n FROM discord_strikes WHERE discord_id = 'u4'").get().n, 0);
});

test('private rooms: staff creator roles may create, rooms get the prefix, the cap applies', async () => {
  const t = setup();
  const channels = new Set();
  const names = [];
  const dc = {
    createRoom: async ({ name }) => (names.push(name), channels.add(`v${names.length}`), `v${names.length}`),
    moveMember: async () => {},
    deleteRoom: async () => {},
    peopleIn: () => 1,
    exists: (id) => channels.has(id),
  };
  const rooms = createElderRooms({ cfg, store: t.store, dc });
  assert.equal((await rooms.lobbyJoin({ userId: 'x', displayName: 'Xo', roleIds: new Set(['member']) })).moved, false);
  for (const role of ['founder', 'rep', 'minister', 'elder']) {
    assert.equal((await rooms.lobbyJoin({ userId: `u-${role}`, displayName: 'Fae', roleIds: new Set([role]) })).moved, true, role);
  }
  assert.equal(names[0], 'Private: Fae');
  // cap of 2: a third join reuses an existing room
  await rooms.lobbyJoin({ userId: 'u-founder', displayName: 'Fae', roleIds: new Set(['founder']) });
  await rooms.lobbyJoin({ userId: 'u-founder', displayName: 'Fae', roleIds: new Set(['founder']) });
  await rooms.lobbyJoin({ userId: 'u-founder', displayName: 'Fae', roleIds: new Set(['founder']) });
  assert.equal(names.length, 4 + 1);
});
