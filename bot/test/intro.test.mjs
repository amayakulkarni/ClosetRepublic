// Tourist role by intro verification: parsing, the age rule, the staff channel, approve and decline, cleanup.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openStore } from '../store.mjs';
import { createSync } from '../sync.mjs';
import { INTRO_TEMPLATE, checkIntro, createIntro, looksLikeIntro, parseIntro } from '../intro.mjs';

mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-26T10:00:00Z') });

const DAY = 86_400_000;
const schema = fs.readFileSync(new URL('../../src/lib/db.ts', import.meta.url), 'utf8').match(/const SCHEMA = `([\s\S]*?)`;/)[1];
const slugs = ['alien', 'citizen', 'top-1', 'upper-middle-class', 'middle-class'];
const cfg = {
  guildId: '1',
  tiers: slugs.map((slug, i) => ({ slug, name: slug, rank: i + 1, roleId: `r-${slug}`, accessRoleId: `a-${slug}`, bmcLevelIds: [], bmcLevels: [slug] })),
  tourist: { roleId: 'tourist', accessRoleId: 'a-tourist', free: true, introOptionalFields: [] },
  staffRoleIds: ['founder', 'rep', 'minister'],
  grace: { lapseDays: 7, remindDaysBeforeEnd: [3], remindDuringGrace: [0, 5] },
  channels: { botLog: 'botlog', modLog: 'modlog', ticketCategory: 'cat', ticketTranscripts: 'transcripts' },
  unknownLevelTier: 'alien',
  elder: { roleId: 'elder', afterDays: 90, activeDaysRequired: 0, activityWindowDays: 90 },
  hobbies: [],
};
const env = { siteUrl: 'https://closetrepublic.com', renewUrl: '', bmcApiToken: '', bmcApiUrl: '' };

function setup(overrides = {}) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crintro-')), 'db.sqlite');
  new Database(file).exec(schema);
  const store = openStore(file);
  const guildRoles = new Map([['u1', new Set()], ['u2', new Set()]]);
  const dms = [];
  const discord = {
    fetchMember: async (id) => (guildRoles.has(id) ? { roles: new Set(guildRoles.get(id)) } : null),
    addRole: async (id, r) => guildRoles.get(id).add(r),
    removeRole: async (id, r) => guildRoles.get(id).delete(r),
    dm: async (id, text) => (dms.push({ id, text }), true),
    post: async () => {},
  };
  const sync = createSync({ cfg, store, discord, env, now: () => Date.now() });
  const calls = [];
  const ix = {
    createChannel: async ({ name }) => (calls.push(['create', name]), `ch-${calls.length}`),
    postIntro: async (ch, o) => calls.push(['post', ch, o.fields.map((f) => f.label)]),
    deleteChannel: async (ch) => calls.push(['delete', ch]),
    archiveIntro: async (ch, o) => (calls.push(['archive', ch, o.applicantId]), { channelId: 'transcripts', messageId: `msg-${calls.length}` }),
    deleteMessage: async (ch, id) => calls.push(['delmsg', ch, id]),
    isMember: async (id) => guildRoles.has(id),
    dm: async (id, text) => (dms.push({ id, text }), true),
    modLog: async (text) => calls.push(['modlog', text]),
  };
  const intro = createIntro({ cfg: { ...cfg, ...overrides }, store, ix, sync });
  return { intro, store, calls, dms, guildRoles };
}
const mod = new Set(['founder']);
const text = (extra = '') => INTRO_TEMPLATE.replace('Age: 22', `Age: ${extra || 23}`);

test('parseIntro reads the template, starred and loose labels, and multi-line values', () => {
  const v = parseIntro(`Age: 23\nGender: male\nPronouns: he/his\nOrientation: bisexual\nLocation: Delhi\n*Education/career: Bca\nHobbies: music\nand books\n*Trivia: Love to eat ice cream`);
  assert.equal(v.age, '23');
  assert.equal(v.career, 'Bca');
  assert.equal(v.hobbies, 'music and books');
  assert.equal(v.trivia, 'Love to eat ice cream');
  assert.equal(looksLikeIntro('hello there'), false);
  assert.equal(looksLikeIntro('age: 30'), true);
});

test('checkIntro: 13+, every field needed, optional fields can be skipped', () => {
  assert.equal(checkIntro(parseIntro(text())).ok, true);
  assert.equal(checkIntro(parseIntro(text(12))).tooYoung, true);
  assert.match(checkIntro(parseIntro('Age: x')).error, /number/);
  assert.match(checkIntro(parseIntro('Age: 20\nGender: f')).error, /Missing: Pronouns, Orientation/);
  assert.equal(checkIntro(parseIntro('Age: 20\nPronouns: they\nLocation: Pune\nEducation: BA\nHobbies: art\nTrivia: tea'), ['gender', 'orientation']).ok, true);
});

test('a valid DM opens a staff channel with the fields; nothing but the request is stored', async () => {
  const t = setup();
  const r = await t.intro.dm({ userId: 'u1', text: text() });
  assert.match(r, /with the mods/);
  assert.deepEqual(t.calls[0], ['create', 'intro-0001']);
  assert.equal(t.calls[1][2].length, 8);
  const row = t.store.introByUser('u1');
  assert.deepEqual(Object.keys(row).sort(), ['channel_id', 'created_at', 'discord_id', 'id']);
  assert.match(await t.intro.dm({ userId: 'u1', text: text() }), /already with the mods/);
});

test('under 13 is refused unread: no channel, no row', async () => {
  const t = setup();
  assert.match(await t.intro.dm({ userId: 'u1', text: text(12) }), /aged 13 and over/);
  assert.equal(t.calls.length, 0);
  assert.equal(t.store.introByUser('u1'), null);
});

test('help for anything that is not an intro; missing fields are listed; outsiders are told to join', async () => {
  const t = setup();
  assert.match(await t.intro.dm({ userId: 'u1', text: 'hi' }), /free Tourist/);
  assert.match(await t.intro.dm({ userId: 'u1', text: 'Age: 20\nGender: f' }), /Missing/);
  assert.match(await t.intro.dm({ userId: 'stranger', text: text() }), /Join the Closet Republic server/);
});

test('only mods approve; approval keeps the intro in the transcripts channel, gives Tourist, deletes the staff channel and the row, and logs no text', async () => {
  const t = setup();
  await t.intro.dm({ userId: 'u1', text: text() });
  assert.match(await t.intro.approve({ userId: 'x', roleIds: new Set(), number: 1 }), /Only mods/);
  assert.match(await t.intro.approve({ userId: 'm1', roleIds: mod, number: 1 }), /is a Tourist/);
  assert.deepEqual([...t.guildRoles.get('u1')].sort(), ['a-tourist', 'tourist']);
  assert.ok(t.calls.some((c) => c[0] === 'archive' && c[2] === 'u1'));
  assert.ok(t.calls.some((c) => c[0] === 'delete'));
  assert.equal(t.store.introRecords('u1').length, 1);
  assert.equal(t.store.introByUser('u1'), null);
  assert.equal(t.store.member('u1').applied_state, 'tourist');
  assert.ok(t.calls.filter((c) => c[0] === 'modlog').every((c) => !/Bca|Delhi|bisexual/i.test(c[1])));
  assert.match(await t.intro.approve({ userId: 'm1', roleIds: mod, number: 1 }), /already decided/);
  assert.match(await t.intro.dm({ userId: 'u1', text: text() }), /already have the Tourist role/);
});

test('decline tells the person kindly, deletes everything and lets them resubmit', async () => {
  const t = setup();
  await t.intro.dm({ userId: 'u2', text: text() });
  assert.match(await t.intro.decline({ userId: 'm1', roleIds: mod, number: 1, reason: 'Please add real hobbies' }), /Declined/);
  assert.match(t.dms.at(-1).text, /not approved this time: Please add real hobbies/);
  assert.equal(t.store.introByUser('u2'), null);
  assert.equal(t.guildRoles.get('u2').size, 0);
  assert.match(await t.intro.dm({ userId: 'u2', text: text() }), /with the mods/);
});

test('cancel, /forget-me and expiry delete the intro and its channel', async () => {
  const t = setup();
  await t.intro.dm({ userId: 'u1', text: text() });
  assert.match(await t.intro.dm({ userId: 'u1', text: 'cancel' }), /withdrawn/);
  assert.equal(t.store.introByUser('u1'), null);
  await t.intro.dm({ userId: 'u2', text: text() });
  await t.intro.withdraw('u2');
  assert.equal(t.store.introByUser('u2'), null);
  await t.intro.dm({ userId: 'u1', text: text() });
  mock.timers.setTime(Date.now() + 15 * DAY);
  await t.intro.expire();
  assert.equal(t.store.introByUser('u1'), null);
  assert.match(t.dms.at(-1).text, /within two weeks/);
  assert.equal(t.calls.filter((c) => c[0] === 'delete').length, 3);
  mock.timers.setTime(Date.parse('2026-10-26T10:00:00Z'));
});

test('forget-me deletes a stored request row, unlink keeps an approved Tourist', async () => {
  const t = setup();
  t.store.touristSet('u1');
  t.store.db.prepare("UPDATE discord_members SET email = 'a@b.c', linked_at = ? WHERE discord_id = 'u1'").run(new Date().toISOString());
  t.store.unlink('u1', 7);
  assert.ok(t.store.member('u1').tourist_since, 'unlinking an email does not remove Tourist');
  t.store.introCreate('u2', new Date().toISOString());
  t.store.forget('u2');
  assert.equal(t.store.introByUser('u2'), null);
});

test('an approved intro stays until /forget-me, which deletes the kept copy and the record', async () => {
  const t = setup();
  await t.intro.dm({ userId: 'u1', text: text() });
  await t.intro.approve({ userId: 'm1', roleIds: mod, number: 1 });
  await t.intro.withdraw('u1');
  assert.ok(t.calls.some((c) => c[0] === 'delmsg' && c[1] === 'transcripts'));
  assert.equal(t.store.introRecords('u1').length, 0);
});

test('approval is refused, and nothing changes, when there is no #ticket-transcripts channel', async () => {
  const t = setup({ channels: { ...cfg.channels, ticketTranscripts: '' } });
  await t.intro.dm({ userId: 'u1', text: text() });
  assert.match(await t.intro.approve({ userId: 'm1', roleIds: mod, number: 1 }), /no #ticket-transcripts/);
  assert.ok(t.store.introByUser('u1'));
  assert.equal(t.guildRoles.get('u1').size, 0);
});
