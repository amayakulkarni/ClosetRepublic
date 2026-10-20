// Embassy tickets and mod /unlink, against the real database schema and a fake Discord.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PermissionFlagsBits as P } from 'discord.js';
import { openStore } from '../store.mjs';
import { createSync } from '../sync.mjs';
import { createTickets, buildTranscript, isMod, ticketName } from '../tickets.mjs';
import { createUnlink, maskEmail, parseUserId } from '../unlink.mjs';
import { ticketOverwrites } from '../discord-tickets.mjs';
import Database from 'better-sqlite3';

const schema = fs.readFileSync(new URL('../../src/lib/db.ts', import.meta.url), 'utf8').match(/const SCHEMA = `([\s\S]*?)`;/)[1];
const slugs = ['alien', 'citizen', 'top-1', 'upper-middle-class', 'middle-class'];
const cfg = {
  guildId: '1',
  tiers: slugs.map((slug, i) => ({ slug, name: slug, rank: i + 1, roleId: `r-${slug}`, accessRoleId: `a-${slug}`, bmcLevelIds: [], bmcLevels: [slug] })),
  staffRoleIds: ['founder', 'rep', 'minister'],
  grace: { lapseDays: 7, remindDaysBeforeEnd: [3], remindDuringGrace: [0, 5] },
  channels: { modLog: 'modlog', botLog: 'botlog', ticketCategory: 'embassy', ticketDesk: 'desk', ticketTranscripts: 'transcripts' },
  unknownLevelTier: 'alien',
};
const FOUNDER = new Set(['founder']);
const MINISTER = new Set(['minister']);
const REP = new Set(['rep']);
const NOBODY = new Set();

function setup() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crtk-')), 'db.sqlite');
  new Database(file).exec(schema);
  const store = openStore(file);
  const calls = [];
  const channels = new Map();
  let next = 100;
  const tk = {
    contentAvailable: true,
    createChannel: async ({ number, openerId, name }) => {
      if (tk.failCreate) throw new Error('no permission');
      const id = `c${next++}`;
      channels.set(id, { name, openerId, canSend: true, messages: [] });
      calls.push(['create', name]);
      return id;
    },
    postFirstMessage: async (id, m) => {
      if (tk.failFirst) throw new Error('boom');
      channels.get(id).messages.push({ at: '2026-10-20T10:00:00Z', authorId: 'bot', author: 'Snitch', text: `${m.subject}\n${m.details}`, attachments: [] });
    },
    setOpenerCanSend: async (id, opener, ok) => { channels.get(id).canSend = ok; },
    rename: async (id, name) => { channels.get(id).name = name; },
    postClosedControls: async (id, text) => channels.get(id).messages.push({ at: '2026-10-20T11:00:00Z', authorId: 'bot', author: 'Snitch', text, attachments: [] }),
    postPlain: async () => {},
    fetchMessages: async (id) => channels.get(id).messages,
    sendTranscript: async (id, t) => {
      if (tk.failTranscript) throw new Error('upload failed');
      calls.push(['transcript', id, t.filename, t.content, t.summary]);
    },
    deleteChannel: async (id) => { channels.delete(id); calls.push(['delete', id]); },
    modLog: async (text) => calls.push(['modlog', text]),
  };
  const tickets = createTickets({ cfg, store, tk, now: () => Date.parse('2026-10-20T10:00:00Z') });
  return { store, tk, tickets, calls, channels };
}

test('opening a ticket makes a numbered channel; a second open ticket is refused', async () => {
  const t = setup();
  const r = await t.tickets.open({ userId: '111', subject: 'Harassment', details: 'Someone DMed me.' });
  assert.equal(r.ok, true);
  assert.equal(r.number, 1);
  assert.equal(t.channels.get(r.channelId).name, 'ticket-0001');
  const again = await t.tickets.open({ userId: '111', subject: 'x', details: 'y' });
  assert.equal(again.existing, true);
  assert.match(again.error, new RegExp(r.channelId));
  const other = await t.tickets.open({ userId: '222', subject: 'Q', details: 'q' });
  assert.equal(other.number, 2);
  assert.ok(t.calls.some((c) => c[0] === 'modlog' && /Ticket 0001 opened/.test(c[1])));
});

test('a failed channel creation leaves nothing behind, and numbers are never reused', async () => {
  const t = setup();
  t.tk.failCreate = true;
  const bad = await t.tickets.open({ userId: '111', subject: 'a', details: 'b' });
  assert.ok(bad.error);
  assert.equal(t.store.openTicketFor('111'), null);
  t.tk.failCreate = false;
  const good = await t.tickets.open({ userId: '111', subject: 'a', details: 'b' });
  assert.equal(good.number, 2, 'the failed attempt used number 1; AUTOINCREMENT never reuses it');
  t.tk.failFirst = true;
  const half = await t.tickets.open({ userId: '333', subject: 'a', details: 'b' });
  assert.ok(half.error);
  assert.equal(t.calls.filter((c) => c[0] === 'delete').length, 1, 'the half-made channel was deleted');
});

test('not set up: no category means a clear message', async () => {
  const t = setup();
  const noCat = createTickets({ cfg: { ...cfg, channels: {} }, store: t.store, tk: t.tk });
  assert.match((await noCat.open({ userId: '1', subject: 'a', details: 'b' })).error, /not set up/);
});

test('close: opener or mod only; opener loses Send Messages; rename; reopen is mods only', async () => {
  const t = setup();
  const { channelId } = await t.tickets.open({ userId: '111', subject: 'a', details: 'b' });
  assert.match(await t.tickets.close({ userId: '999', roleIds: NOBODY, channelId }), /Only the person who opened/);
  assert.match(await t.tickets.close({ userId: '999', roleIds: REP, channelId }), /Only the person who opened/, 'Representatives are not mods');
  assert.equal(await t.tickets.close({ userId: '111', roleIds: NOBODY, channelId, reason: 'sorted' }), 'Ticket closed.');
  assert.equal(t.channels.get(channelId).canSend, false);
  assert.equal(t.channels.get(channelId).name, 'closed-0001');
  assert.match(await t.tickets.close({ userId: '111', roleIds: NOBODY, channelId }), /already closed/);
  assert.match(await t.tickets.reopen({ userId: '111', roleIds: NOBODY, channelId }), /Only mods/);
  assert.equal(await t.tickets.reopen({ userId: 'm1', roleIds: MINISTER, channelId }), 'Ticket reopened.');
  assert.equal(t.channels.get(channelId).canSend, true);
  assert.equal(t.channels.get(channelId).name, 'ticket-0001');
  assert.match(await t.tickets.close({ userId: 'f1', roleIds: FOUNDER, channelId: 'nope' }), /inside a ticket channel/);
});

test('archive: mods only, closed only, transcript posted before the channel is deleted', async () => {
  const t = setup();
  const { channelId } = await t.tickets.open({ userId: '111', subject: 'Harassment', details: 'Someone DMed me.' });
  assert.match(await t.tickets.archive({ userId: 'f1', roleIds: FOUNDER, channelId }), /Close the ticket first/);
  await t.tickets.close({ userId: '111', roleIds: NOBODY, channelId });
  assert.match(await t.tickets.archive({ userId: '111', roleIds: NOBODY, channelId }), /Only mods/);
  t.tk.failTranscript = true;
  await assert.rejects(t.tickets.archive({ userId: 'f1', roleIds: FOUNDER, channelId }));
  assert.ok(t.channels.has(channelId), 'channel kept when the transcript could not be saved');
  assert.equal(t.store.ticketByChannel(channelId).status, 'closed');
  t.tk.failTranscript = false;
  assert.equal(await t.tickets.archive({ userId: 'f1', roleIds: FOUNDER, channelId, archivedByName: 'Amaya' }), 'Ticket 0001 archived.');
  const transcript = t.calls.find((c) => c[0] === 'transcript');
  assert.equal(transcript[1], 'transcripts');
  assert.equal(transcript[2], 'ticket-0001.txt');
  assert.match(transcript[3], /Opened by: .*\(111\)/);
  assert.match(transcript[3], /Harassment/);
  assert.match(transcript[3], /Archived: .* by Amaya/);
  assert.equal(t.channels.has(channelId), false);
  assert.equal(t.store.ticketByChannel(channelId).status, 'archived');
  assert.ok(t.calls.indexOf(transcript) < t.calls.findIndex((c) => c[0] === 'delete'), 'transcript first, delete after');
  assert.equal(t.store.openTicketFor('111'), null);
  const next = await t.tickets.open({ userId: '111', subject: 'again', details: 'x' });
  assert.equal(next.number, 2, 'a new ticket after archiving gets a fresh number');
});

test('list is for mods and shows open and closed tickets only', async () => {
  const t = setup();
  const a = await t.tickets.open({ userId: '1', subject: 'a', details: 'b' });
  const b = await t.tickets.open({ userId: '2', subject: 'a', details: 'b' });
  await t.tickets.close({ userId: '2', roleIds: NOBODY, channelId: b.channelId });
  assert.match(t.tickets.list({ roleIds: NOBODY }), /Only mods/);
  const out = t.tickets.list({ roleIds: MINISTER });
  assert.match(out, new RegExp(`<#${a.channelId}> \\(open\\)`));
  assert.match(out, new RegExp(`<#${b.channelId}> \\(closed\\)`));
});

test('nothing but ids and dates is stored; /forget-me detaches an archived ticket', async () => {
  const t = setup();
  const { channelId } = await t.tickets.open({ userId: '111', subject: 'SECRET-SUBJECT', details: 'SECRET-DETAILS' });
  const cols = t.store.db.prepare('PRAGMA table_info(tickets)').all().map((c) => c.name);
  assert.deepEqual(cols, ['number', 'opener_id', 'channel_id', 'status', 'opened_at', 'closed_at', 'closed_by', 'archived_at', 'archived_by']);
  assert.equal(JSON.stringify(t.store.db.prepare('SELECT * FROM tickets').all()).includes('SECRET'), false);
  await t.tickets.close({ userId: '111', roleIds: NOBODY, channelId });
  await t.tickets.archive({ userId: 'f1', roleIds: FOUNDER, channelId });
  t.store.forget('111');
  assert.equal(t.store.db.prepare('SELECT opener_id FROM tickets').get().opener_id, 'deleted');
});

test('transcript text: header, indented lines, attachments, intent-off notice', () => {
  const out = buildTranscript(
    { number: 7, opener_id: '5', opened_at: '2026-10-20T10:00:00Z', closed_at: '2026-10-20T12:00:00Z', closed_by: '5' },
    { openerName: 'Sam', archivedBy: 'Amaya', messages: [
      { at: '2026-10-20T10:00:01Z', authorId: '5', author: 'Sam', text: 'line one\nline two', attachments: ['https://cdn.example/a.png'] },
      { at: '2026-10-20T10:05:00Z', authorId: '9', author: 'Mod', text: '', attachments: [] },
    ], contentAvailable: false },
  );
  assert.match(out, /^Closet Republic ticket 0007\nOpened by: Sam \(5\)/);
  assert.match(out, /\| Sam \(5\) \| line one\n    line two\n    attachment: https:\/\/cdn\.example\/a\.png/);
  assert.match(out, /Message Content Intent is off/);
  assert.equal(ticketName(12, true), 'closed-0012');
});

test('permission overwrites: only the opener, Founder, Minister of Order and the bot can see a ticket', () => {
  const ow = ticketOverwrites({ guildId: 'G', openerId: 'U', botId: 'B', mods: ['founder', 'minister'] });
  assert.deepEqual(ow.map((o) => o.id), ['G', 'U', 'founder', 'minister', 'B']);
  assert.deepEqual(ow[0].deny, [P.ViewChannel], '@everyone cannot view');
  for (const o of ow.slice(1)) assert.ok(o.allow.includes(P.ViewChannel));
  assert.ok(!ow.some((o) => o.id === 'rep'), 'no Representative or tier role overwrite');
  assert.ok(ow[1].allow.includes(P.SendMessages) && ow[1].allow.includes(P.AttachFiles));
  assert.ok(ow[2].allow.includes(P.ManageMessages));
  assert.ok(ow[4].allow.includes(P.ManageChannels));
  assert.equal(isMod(cfg, new Set(['rep'])), false);
  assert.equal(isMod(cfg, new Set(['minister'])), true);
});

// ---------- mod /unlink ----------

function unlinkSetup() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crul-')), 'db.sqlite');
  new Database(file).exec(schema);
  const store = openStore(file);
  const roles = new Map();
  const dms = [];
  const posts = [];
  const discord = {
    fetchMember: async (id) => (roles.has(id) ? { roles: new Set(roles.get(id)) } : null),
    addRole: async (id, r) => roles.get(id).add(r),
    removeRole: async (id, r) => roles.get(id).delete(r),
    dm: async (id, text) => (dms.push({ id, text }), true),
    post: async (channel, text) => posts.push({ channel, text }),
  };
  const env = { siteUrl: 'https://closetrepublic.com', renewUrl: '' };
  const sync = createSync({ cfg, store, discord, env });
  const unlink = createUnlink({ cfg, store, sync, discord });
  const at = new Date().toISOString();
  store.db.prepare('INSERT INTO memberships (subscription_id, email, level_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('s1', 'sam@example.com', 'citizen', 'active', at, at);
  store.db.prepare('INSERT INTO discord_members (discord_id, email, linked_at, applied_tier, applied_state, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('555555555555555555', 'sam@example.com', at, 'citizen', 'active', at);
  roles.set('555555555555555555', new Set(['r-citizen', 'a-citizen', 'pronoun-they']));
  return { store, sync, unlink, roles, dms, posts };
}

test('mod /unlink: mods only, confirm step, roles go at once, mod-log line, DM, BMC record stays', async () => {
  const t = unlinkSetup();
  assert.match(t.unlink.prepare({ actorId: 'x', roleIds: NOBODY, target: '555555555555555555' }).error, /Only mods/);
  assert.match(t.unlink.prepare({ actorId: 'x', roleIds: REP, target: '555555555555555555' }).error, /Only mods/);
  assert.match(t.unlink.prepare({ actorId: 'm', roleIds: MINISTER, target: 'abc' }).error, /Choose a member/);
  assert.match(t.unlink.prepare({ actorId: 'm', roleIds: MINISTER, target: '999999999999999999' }).error, /not linked/);

  const p = t.unlink.prepare({ actorId: 'm', roleIds: MINISTER, target: '<@555555555555555555>', reason: 'asked by user' });
  assert.ok(p.token);
  assert.match(p.text, /s•••@example\.com/);
  assert.match(p.text, /citizen \(active/);
  assert.equal(t.store.member('555555555555555555').email, 'sam@example.com', 'nothing changes before Confirm');

  assert.match(await t.unlink.confirm({ actorId: 'someone-else', roleIds: MINISTER, token: p.token }), /Only the mod who ran/);
  assert.match(await t.unlink.confirm({ actorId: 'm', roleIds: NOBODY, token: p.token }), /Only mods/);
  const done = await t.unlink.confirm({ actorId: 'm', roleIds: MINISTER, token: p.token });
  assert.match(done, /Unlinked <@555555555555555555>/);
  assert.equal(t.store.member('555555555555555555').email, null);
  assert.deepEqual([...t.roles.get('555555555555555555')], ['pronoun-they'], 'class and access roles removed at once, other roles untouched');
  assert.equal(t.store.membershipsFor('sam@example.com').length, 1, 'Buy Me a Coffee record stays');
  assert.ok(t.posts.some((x) => x.channel === 'modlog' && /<@m> unlinked <@555555555555555555>.* Reason: asked by user/.test(x.text)));
  assert.ok(t.dms.some((d) => d.id === '555555555555555555' && /\/link/.test(d.text)));
  assert.match(await t.unlink.confirm({ actorId: 'm', roleIds: MINISTER, token: p.token }), /expired/, 'a token works once');
});

test('mod /unlink works on a user ID for someone who left the server; a grant survives', async () => {
  const t = unlinkSetup();
  t.roles.delete('555555555555555555'); // left the server
  const p = t.unlink.prepare({ actorId: 'f', roleIds: FOUNDER, target: '555555555555555555' });
  assert.ok(p.token);
  await t.unlink.confirm({ actorId: 'f', roleIds: FOUNDER, token: p.token });
  assert.equal(t.store.member('555555555555555555').email, null);

  const t2 = unlinkSetup();
  t2.store.grant('555555555555555555', 'top-1', 30, 'founder');
  const p2 = t2.unlink.prepare({ actorId: 'f', roleIds: FOUNDER, target: '555555555555555555' });
  await t2.unlink.confirm({ actorId: 'f', roleIds: FOUNDER, token: p2.token });
  assert.ok(t2.roles.get('555555555555555555').has('r-top-1'), 'a complimentary grant is not part of the link and stays');
  assert.ok(!t2.roles.get('555555555555555555').has('r-citizen'));
});

test('helpers', () => {
  assert.equal(maskEmail('sam@example.com'), 's•••@example.com');
  assert.equal(parseUserId('<@!123456789012345678>'), '123456789012345678');
  assert.equal(parseUserId('  123456789012345678 '), '123456789012345678');
  assert.equal(parseUserId('hello'), null);
});

// ---------- interaction routing (fake interaction objects) ----------

import { handleTicketInteraction, IDS } from '../discord-tickets.mjs';

function fakeInteraction(kind, props) {
  const log = { modal: null, deferred: null, replies: [] };
  const i = {
    guildId: '1',
    user: { id: props.userId || '111', username: 'user' },
    member: { roles: props.roles || [], displayName: 'Name' },
    channelId: props.channelId || 'chan',
    isChatInputCommand: () => kind === 'command',
    isButton: () => kind === 'button',
    isModalSubmit: () => kind === 'modal',
    commandName: props.commandName,
    customId: props.customId,
    options: {
      getSubcommand: () => props.sub ?? null,
      getString: (n) => props.strings?.[n] ?? null,
      get: (n) => props.opts?.[n] ?? null,
    },
    fields: { getTextInputValue: (n) => props.fields?.[n] },
    showModal: async (m) => { log.modal = m; },
    deferReply: async () => { log.deferred = 'reply'; },
    deferUpdate: async () => { log.deferred = 'update'; },
    editReply: async (r) => { log.replies.push(r); },
  };
  return { i, log };
}

test('routing: desk button and /ticket open show the form; the form opens a ticket; buttons close and archive', async () => {
  const t = setup();
  const queue = (name, fn) => Promise.resolve().then(fn);
  const unl = { prepare: () => ({ error: 'x' }), confirm: async () => 'x' };
  const deps = { tickets: t.tickets, unlink: unl, queue, cfg };

  let { i, log } = fakeInteraction('button', { customId: IDS.open });
  assert.equal(await handleTicketInteraction(i, deps), true);
  assert.ok(log.modal, 'the form is shown');

  ({ i, log } = fakeInteraction('command', { commandName: 'ticket', sub: 'open' }));
  assert.equal(await handleTicketInteraction(i, deps), true);
  assert.ok(log.modal);

  ({ i, log } = fakeInteraction('modal', { customId: IDS.modal, userId: '111', fields: { subject: 'Hi', details: 'Help' } }));
  assert.equal(await handleTicketInteraction(i, deps), true);
  assert.match(log.replies[0].content, /Your ticket is open: <#c100>/);

  ({ i, log } = fakeInteraction('modal', { customId: IDS.modal, userId: '111', fields: { subject: 'Hi', details: 'Help' } }));
  await handleTicketInteraction(i, deps);
  assert.match(log.replies[0].content, /already have an open ticket/);

  ({ i, log } = fakeInteraction('button', { customId: IDS.close, userId: '111', channelId: 'c100' }));
  await handleTicketInteraction(i, deps);
  assert.equal(log.replies[0].content, 'Ticket closed.');

  ({ i, log } = fakeInteraction('button', { customId: IDS.archive, userId: '111', channelId: 'c100' }));
  await handleTicketInteraction(i, deps);
  assert.match(log.replies[0].content, /Only mods/);

  ({ i, log } = fakeInteraction('button', { customId: IDS.archive, userId: '9', roles: ['minister'], channelId: 'c100' }));
  await handleTicketInteraction(i, deps);
  assert.equal(log.replies[0].content, 'Ticket 0001 archived.');

  ({ i, log } = fakeInteraction('command', { commandName: 'ticket', sub: 'list', roles: [] }));
  await handleTicketInteraction(i, deps);
  assert.match(log.replies[0].content, /Only mods/);

  ({ i, log } = fakeInteraction('command', { commandName: 'membership', sub: 'status' }));
  assert.equal(await handleTicketInteraction(i, deps), false, 'other commands fall through to the existing handler');
});

test('routing: /unlink with a member goes to the mod path, plain /unlink falls through, Confirm needs the same mod', async () => {
  const t = unlinkSetup();
  const queue = (name, fn) => Promise.resolve().then(fn);
  const deps = { tickets: null, unlink: t.unlink, queue, cfg };

  let { i, log } = fakeInteraction('command', { commandName: 'unlink' });
  assert.equal(await handleTicketInteraction(i, deps), false, 'plain /unlink is the member\'s own');

  ({ i, log } = fakeInteraction('command', { commandName: 'unlink', roles: [], opts: { member: { user: { id: '555555555555555555' } } } }));
  assert.equal(await handleTicketInteraction(i, deps), true);
  assert.match(log.replies[0].content, /Only mods/);
  assert.equal(log.replies[0].components, undefined);

  ({ i, log } = fakeInteraction('command', { commandName: 'unlink', userId: 'm', roles: ['minister'], strings: { user_id: ' 555555555555555555 ', reason: 'asked' }, opts: { user_id: { value: '555555555555555555' } } }));
  await handleTicketInteraction(i, deps);
  const token = log.replies[0].components[0].components[0].data.custom_id.slice(IDS.unlinkConfirm.length);
  assert.match(log.replies[0].content, /Linked email: s•••@example\.com/);

  ({ i, log } = fakeInteraction('button', { customId: IDS.unlinkConfirm + token, userId: 'other', roles: ['minister'] }));
  await handleTicketInteraction(i, deps);
  assert.match(log.replies[0].content, /Only the mod who ran/);

  ({ i, log } = fakeInteraction('button', { customId: IDS.unlinkConfirm + token, userId: 'm', roles: ['minister'] }));
  await handleTicketInteraction(i, deps);
  assert.match(log.replies[0].content, /Unlinked <@555555555555555555>/);
  assert.deepEqual(log.replies[0].components, [], 'the button is removed after use');
  assert.equal(t.store.member('555555555555555555').email, null);
});
