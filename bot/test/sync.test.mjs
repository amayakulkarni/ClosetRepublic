// The bot against a real SQLite database (the site's schema) and a fake Discord server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openStore } from '../store.mjs';
import { createSync } from '../sync.mjs';
import { handleCommand, withPendingNotices } from '../commands.mjs';
import { reconcileWithBmc } from '../bmc-api.mjs';

const DAY = 86_400_000;
const schema = fs.readFileSync(new URL('../../src/lib/db.ts', import.meta.url), 'utf8').match(/const SCHEMA = `([\s\S]*?)`;/)[1];
const slugs = ['alien', 'citizen', 'top-1', 'upper-middle-class', 'middle-class'];
const names = { alien: 'Alien', citizen: 'Citizen', 'top-1': 'Top 1%', 'upper-middle-class': 'Upper Middle Class', 'middle-class': 'Middle Class' };
const cfg = {
  guildId: '1',
  tiers: slugs.map((slug, i) => ({
    slug, name: names[slug], rank: i + 1, roleId: `r-${slug}`, accessRoleId: `a-${slug}`, bmcLevelIds: [],
    bmcLevels: { alien: ['alien'], citizen: ['citizen'], 'top-1': ["in dictator's bed"], 'upper-middle-class': ['upper middle class'], 'middle-class': ['middle class'] }[slug],
  })),
  staffRoleIds: ['founder', 'rep', 'minister'],
  grace: { lapseDays: 7, remindDaysBeforeEnd: [3], remindDuringGrace: [0, 5] },
  channels: { botLog: 'botlog', modLog: 'modlog', thankYou: 'thanks' },
  unknownLevelTier: 'alien',
};
const env = { siteUrl: 'https://closetrepublic.com', renewUrl: 'https://buymeacoffee.com/closetrepublic', bmcApiToken: 't', bmcApiUrl: 'https://bmc.test' };

function setup() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crbot-')), 'db.sqlite');
  new Database(file).exec(schema);
  const store = openStore(file);
  const guildRoles = new Map(); // discord id → Set
  const dms = [];
  const posts = [];
  let dmsOpen = true;
  const discord = {
    fetchMember: async (id) => (guildRoles.has(id) ? { roles: new Set(guildRoles.get(id)) } : null),
    addRole: async (id, r) => guildRoles.get(id).add(r),
    removeRole: async (id, r) => guildRoles.get(id).delete(r),
    dm: async (id, text) => (dmsOpen ? (dms.push({ id, text }), true) : false),
    post: async (channel, text) => posts.push({ channel, text }),
  };
  let clock = Date.parse('2026-10-15T12:00:00Z');
  const sync = createSync({ cfg, store, discord, env, now: () => clock });
  const at = () => new Date(clock).toISOString();
  const membership = (sub, email, level, status, extra = {}) =>
    store.db
      .prepare(`INSERT INTO memberships (subscription_id, email, level_name, status, paid_until, ended_at, created_at, updated_at)
                VALUES (@sub, @email, @level, @status, @paid, @ended, @at, @at)
                ON CONFLICT(subscription_id) DO UPDATE SET level_name = excluded.level_name, status = excluded.status, paid_until = excluded.paid_until, ended_at = excluded.ended_at, updated_at = excluded.updated_at`)
      .run({ sub, email, level, status, paid: extra.paid_until ?? null, ended: extra.ended_at ?? null, at: at() });
  const linkEmail = (id, email) =>
    store.db.prepare('INSERT INTO discord_members (discord_id, email, linked_at, updated_at) VALUES (?, ?, ?, ?)').run(id, email, at(), at());
  const roles = (id) => [...guildRoles.get(id)].sort();
  return {
    store, sync, discord, dms, posts, guildRoles, membership, linkEmail, roles,
    tick: (days) => (clock += days * DAY),
    now: () => clock,
    closeDms: () => (dmsOpen = false),
    deps: () => ({ cfg, store, sync, env, discord }),
  };
}

const cmd = (t, userId, command, sub = null, options = {}, roleIds = []) =>
  handleCommand({ command, sub, userId, roleIds: new Set(roleIds), option: (n) => options[n] ?? null }, t.deps());

test('paying, then linking: roles stack, staff and pronoun roles are untouched', async () => {
  const t = setup();
  t.guildRoles.set('100', new Set(['she-her', 'founder']));
  t.membership('s1', 'ami@example.com', "In dictator's bed", 'active');
  assert.deepEqual(await t.sync.syncEmail('ami@example.com', 'webhook'), { skipped: 'not linked' });
  t.linkEmail('100', 'ami@example.com');
  const r = await t.sync.syncMember('100', 'link page');
  assert.equal(r.tier, 'top-1');
  assert.deepEqual(t.roles('100'), ['a-alien', 'a-citizen', 'a-top-1', 'founder', 'r-top-1', 'she-her']);
  assert.match(t.dms[0].text, /Welcome to the Top 1% class/);
  assert.match(t.posts.find((p) => p.channel === 'botlog').text, /Visitor → Top 1%/);
  // A second run changes nothing and sends nothing.
  const again = await t.sync.syncMember('100');
  assert.deepEqual([again.added, again.removed, t.dms.length], [[], [], 1]);
});

test('upgrade and downgrade swap the class at once', async () => {
  const t = setup();
  t.guildRoles.set('100', new Set());
  t.linkEmail('100', 'a@x.com');
  t.membership('s1', 'a@x.com', 'Citizen', 'active');
  await t.sync.syncMember('100');
  t.membership('s1', 'a@x.com', 'Middle class', 'active');
  await t.sync.syncMember('100');
  assert.deepEqual(t.roles('100'), ['a-alien', 'a-citizen', 'a-middle-class', 'a-top-1', 'a-upper-middle-class', 'r-middle-class']);
  assert.match(t.dms.at(-1).text, /now Middle Class/);
  t.membership('s1', 'a@x.com', 'Alien', 'active');
  await t.sync.syncMember('100');
  assert.deepEqual(t.roles('100'), ['a-alien', 'r-alien']);
});

test('cancel at period end: kept until then, reminders, 7-day grace with day 0 and day 5 notices, then removed', async () => {
  const t = setup();
  t.guildRoles.set('100', new Set());
  t.linkEmail('100', 'a@x.com');
  t.membership('s1', 'a@x.com', 'Citizen', 'cancelling', { paid_until: new Date(t.now() + 10 * DAY).toISOString() });
  await t.sync.syncMember('100');
  assert.ok(t.roles('100').includes('r-citizen'));
  assert.match(t.dms.at(-1).text, /ends on 25 October 2026/);
  t.tick(8); await t.sync.syncMember('100');
  assert.match(t.dms.at(-1).text, /Reminder: your Citizen membership ends/);
  t.tick(3); const g = await t.sync.syncMember('100'); // 1 day past the paid period
  assert.deepEqual([g.state, t.roles('100').includes('r-citizen')], ['grace', true]);
  assert.match(t.dms.at(-1).text, /visa is extended for 7 days/);
  t.tick(4); await t.sync.syncMember('100');
  assert.match(t.dms.at(-1).text, /visa runs out on 1 November 2026/);
  const before = t.dms.length;
  t.tick(0.5); await t.sync.syncMember('100');
  assert.equal(t.dms.length, before, 'no repeated reminders');
  t.tick(2); const end = await t.sync.syncMember('100');
  assert.deepEqual([end.state, t.roles('100')], ['none', []]);
  assert.match(t.dms.at(-1).text, /visa has run out/);
  assert.match(t.posts.find((p) => p.channel === 'modlog').text, /Visitor again/);
});

test('renewing during grace clears it with nothing removed', async () => {
  const t = setup();
  t.guildRoles.set('100', new Set());
  t.linkEmail('100', 'a@x.com');
  t.membership('s1', 'a@x.com', 'Citizen', 'ended', { ended_at: new Date(t.now()).toISOString() });
  t.store.db.prepare("UPDATE discord_members SET applied_tier = 'citizen', applied_state = 'active'").run();
  t.guildRoles.set('100', new Set(['r-citizen', 'a-alien', 'a-citizen']));
  assert.equal((await t.sync.syncMember('100')).state, 'grace');
  t.membership('s1', 'a@x.com', 'Citizen', 'active');
  const r = await t.sync.syncMember('100');
  assert.deepEqual([r.state, r.removed], ['active', []]);
});

test('leaving and rejoining the server reapplies roles', async () => {
  const t = setup();
  t.linkEmail('100', 'a@x.com');
  t.membership('s1', 'a@x.com', 'Citizen', 'active');
  assert.equal((await t.sync.syncMember('100')).inServer, false);
  t.guildRoles.set('100', new Set());
  await t.sync.syncMember('100', 'rejoined the server');
  assert.deepEqual(t.roles('100'), ['a-alien', 'a-citizen', 'r-citizen']);
});

test('commands: status, discreet, unlink grace, forget-me, founder-only grant and revoke', async () => {
  const t = setup();
  t.guildRoles.set('100', new Set());
  t.guildRoles.set('200', new Set());
  t.linkEmail('100', 'a@x.com');
  t.membership('s1', 'a@x.com', 'Upper middle class', 'active');
  await t.sync.syncMember('100');
  assert.match(await cmd(t, '100', 'membership', 'status'), /Upper Middle Class.*renews automatically/);

  await cmd(t, '100', 'discreet', null, { mode: 'on' });
  assert.ok(!t.roles('100').includes('r-upper-middle-class') && t.roles('100').includes('a-upper-middle-class'));
  await cmd(t, '100', 'discreet', null, { mode: 'off' });
  assert.ok(t.roles('100').includes('r-upper-middle-class'));

  assert.match(await cmd(t, '100', 'unlink'), /7-day grace/);
  assert.equal(t.store.member('100').email, null);
  assert.ok(t.roles('100').includes('r-upper-middle-class'), 'kept during grace');
  t.tick(8); await t.sync.syncMember('100');
  assert.deepEqual(t.roles('100'), []);

  assert.equal(await cmd(t, '200', 'membership', 'grant', { member: '100', tier: 'citizen', days: 30 }), 'Only Founders can do that.');
  assert.match(await cmd(t, '200', 'membership', 'grant', { member: '100', tier: 'citizen', days: 30 }, ['founder']), /Granted Citizen/);
  assert.ok(t.roles('100').includes('r-citizen'));
  await cmd(t, '200', 'membership', 'revoke', { member: '100' }, ['founder']);
  assert.deepEqual(t.roles('100'), []);

  t.guildRoles.get('100').add('r-alien');
  assert.match(await cmd(t, '100', 'forget-me'), /deleted/);
  assert.deepEqual([t.store.member('100'), t.store.grantsFor('100').length, t.roles('100')], [null, 0, []]);
});

test('closed DMs: messages wait for the next command', async () => {
  const t = setup();
  t.closeDms();
  t.guildRoles.set('100', new Set());
  t.linkEmail('100', 'a@x.com');
  t.membership('s1', 'a@x.com', 'Citizen', 'active');
  await t.sync.syncMember('100');
  const reply = withPendingNotices(t.store, '100', 'Your class: Citizen.');
  assert.match(reply, /Messages you missed[\s\S]*Welcome to the Citizen class/);
  assert.equal(withPendingNotices(t.store, '100', 'x'), 'x');
});

test('hourly Buy Me a Coffee check: renewals extend, missing ones lapse into grace, an empty answer changes nothing', async () => {
  const t = setup();
  t.guildRoles.set('100', new Set());
  t.guildRoles.set('200', new Set());
  t.linkEmail('100', 'keep@x.com');
  t.linkEmail('200', 'gone@x.com');
  const past = new Date(t.now() - DAY).toISOString();
  t.membership('s1', 'keep@x.com', 'Citizen', 'active', { paid_until: past });
  t.membership('s2', 'gone@x.com', 'Citizen', 'active', { paid_until: past });
  await t.sync.syncAll();
  const api = (data) => async () => ({ ok: true, json: async () => ({ data, next_page_url: null }) });

  const empty = await reconcileWithBmc({ env, store: t.store, sync: t.sync, fetchImpl: api([{ subscription_id: 9 }]), now: t.now });
  assert.equal(empty.skipped, 'no usable data');

  const r = await reconcileWithBmc({
    env, store: t.store, sync: t.sync, now: t.now,
    fetchImpl: api([{ subscription_id: 's1', payer_email: 'keep@x.com', subscription_current_period_end: Math.floor((t.now() + 20 * DAY) / 1000) }]),
  });
  assert.deepEqual(r, { checked: 2, renewed: 1, lapsed: 1 });
  assert.equal(t.store.member('200').applied_state, 'grace');
  assert.equal(t.store.member('100').applied_state, 'active');
});
