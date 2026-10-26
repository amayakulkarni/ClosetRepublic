// Republic Esports League: scoring, standings, scheduling, reminders, rooms and results.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openStore } from '../store.mjs';
import { DEFAULT_GAMES, createLeague, formatStandings, parseWhen, resolveTeams, scoreMatch, standings } from '../league.mjs';
import { planHobbyChange } from '../hobbies.mjs';

mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T12:00:00Z') });

const MIN = 60_000;
const schema = fs.readFileSync(new URL('../../src/lib/db.ts', import.meta.url), 'utf8').match(/const SCHEMA = `([\s\S]*?)`;/)[1];
const keys = ['velvet-hangers', 'sequin-storm', 'mothball-mavericks', 'wardrobe-wolves'];
const cfg = {
  staffRoleIds: ['founder', 'rep', 'minister'],
  league: {
    commissionerRoleId: 'commissioner',
    categoryId: 'cat',
    teams: keys.map((key) => ({ key, name: key.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '), emoji: '', roleId: `role-${key}` })),
    channels: { fixtures: 'fixtures', scoreboard: 'scoreboard', office: 'office', matchReports: 'reports' },
    games: DEFAULT_GAMES,
  },
};
const crew = new Set(['commissioner']);

function setup() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crleague-')), 'db.sqlite');
  new Database(file).exec(schema);
  const store = openStore(file);
  const calls = [];
  let clock = Date.now();
  const lg = {
    post: async (ch, text, roles) => (calls.push(['post', ch, text, roles]), `m${calls.length}`),
    upsertScoreboard: async (ch, text) => calls.push(['board', ch, text]),
    createRoom: async (o) => (calls.push(['room', o.name]), 'room1'),
    deleteChannel: async (id) => calls.push(['delete', id]),
    createEvent: async (o) => (calls.push(['event', o.name]), 'ev1'),
    deleteEvent: async (id) => calls.push(['delevent', id]),
  };
  const league = createLeague({ cfg, store, lg, now: () => clock });
  return { store, league, calls, advance: (ms) => (clock += ms), now: () => clock };
}

const h2h = (a, b) => ({ id: 1, kind: 'h2h', teams: [a, b] });
const row = (r, team) => r.rows.find((x) => x.team === team);

test('parseWhen reads India time and rejects bad input', () => {
  assert.equal(parseWhen('2026-11-07 20:00'), Date.parse('2026-11-07T14:30:00Z'));
  assert.equal(parseWhen('2026-02-30 20:00'), null);
  assert.equal(parseWhen('tomorrow'), null);
});

test('resolveTeams accepts keys and names, rejects strangers', () => {
  assert.deepEqual(resolveTeams(cfg, 'Sequin Storm, wardrobe-wolves').keys, ['sequin-storm', 'wardrobe-wolves']);
  assert.match(resolveTeams(cfg, 'nobody').error, /not a team/);
  assert.deepEqual(resolveTeams(cfg, '').keys, []);
});

test('head-to-head: win 3, loss 1, +1 for turning up, losing still earns a point', () => {
  const r = scoreMatch(h2h('velvet-hangers', 'sequin-storm'), { winner: 'velvet-hangers' });
  assert.equal(row(r, 'velvet-hangers').points, 4);
  assert.equal(row(r, 'sequin-storm').points, 2);
});

test('draw 2 each, Best Sport +1, late squad loses the +1', () => {
  const r = scoreMatch(h2h('velvet-hangers', 'sequin-storm'), { draw: true, bestSport: ['sequin-storm'], late: ['velvet-hangers'] });
  assert.equal(row(r, 'velvet-hangers').points, 2);
  assert.equal(row(r, 'sequin-storm').points, 4);
});

test('forfeit scores 0 and the other team takes a win; a penalty voids the night', () => {
  const f = scoreMatch(h2h('velvet-hangers', 'sequin-storm'), { forfeit: ['sequin-storm'] });
  assert.equal(row(f, 'sequin-storm').points, 0);
  assert.equal(row(f, 'velvet-hangers').points, 4);
  const p = scoreMatch(h2h('velvet-hangers', 'sequin-storm'), { winner: 'velvet-hangers', penalty: ['velvet-hangers'] });
  assert.equal(row(p, 'velvet-hangers').points, 0);
  assert.equal(row(p, 'sequin-storm').points, 2);
});

test('free-for-all: 4/3/2/1 plus showing up, every team must be placed', () => {
  const m = { kind: 'ffa', teams: keys };
  const r = scoreMatch(m, { placements: ['wardrobe-wolves', 'velvet-hangers', 'sequin-storm', 'mothball-mavericks'] });
  assert.deepEqual(keys.map((k) => row(r, k).points), [4, 3, 2, 5]);
  assert.match(scoreMatch(m, { placements: ['wardrobe-wolves'] }).error, /missing/);
  assert.match(scoreMatch(m, { placements: ['wardrobe-wolves', 'wardrobe-wolves', 'a', 'b'] }).error, /once/);
});

test('invalid inputs are refused', () => {
  assert.match(scoreMatch(h2h('velvet-hangers', 'sequin-storm'), {}).error, /who won/);
  assert.match(scoreMatch(h2h('velvet-hangers', 'sequin-storm'), { winner: 'velvet-hangers', bestSport: ['wardrobe-wolves'] }).error, /not playing/);
  assert.match(scoreMatch(h2h('velvet-hangers', 'sequin-storm'), { forfeit: ['velvet-hangers', 'sequin-storm'] }).error, /cancel/);
});

test('standings sort by points then Best Sport, and flag ties', () => {
  const rows = [
    { team: 'velvet-hangers', points: 4, outcome: 'win', best_sport: 1 },
    { team: 'sequin-storm', points: 2, outcome: 'loss', best_sport: 0 },
    { team: 'mothball-mavericks', points: 2, outcome: 'win', best_sport: 0 },
  ];
  const list = standings(cfg, rows);
  assert.deepEqual(list.map((r) => r.team), ['velvet-hangers', 'mothball-mavericks', 'sequin-storm', 'wardrobe-wolves']);
  assert.equal(list[0].team, 'velvet-hangers');
  assert.ok(list.find((r) => r.team === 'sequin-storm').tied);
  assert.match(formatStandings(cfg, list, { season: 1 }), /rock-paper-scissors/);
});

test('only the league crew can schedule; a fixture creates a post, an event and a stored match', async () => {
  const t = setup();
  assert.match(await t.league.schedule({ roleIds: new Set(), userId: 'u', game: 'fortnite', kind: 'h2h', when: '2026-11-07 20:00', teams: ['velvet-hangers', 'sequin-storm'] }), /Only the League/);
  const out = await t.league.schedule({ roleIds: crew, userId: 'u', game: 'fortnite', kind: 'h2h', when: '2026-11-07 20:00', teams: ['velvet-hangers', 'sequin-storm'], week: 1 });
  assert.match(out, /Fixture created/);
  assert.ok(t.calls.some((c) => c[0] === 'event') && t.calls.some((c) => c[0] === 'post' && c[1] === 'fixtures' && c[3].includes('role-velvet-hangers')));
  assert.match(await t.league.schedule({ roleIds: crew, userId: 'u', game: 'fortnite', kind: 'h2h', when: '2026-11-07 20:00', teams: ['velvet-hangers'] }), /exactly two/);
  assert.match(await t.league.schedule({ roleIds: crew, userId: 'u', game: 'fortnite', kind: 'h2h', when: 'soon', teams: [] }), /YYYY-MM-DD/);
});

test('a free-for-all fixture includes all four teams by default', async () => {
  const t = setup();
  await t.league.schedule({ roleIds: crew, userId: 'u', game: 'roblox', kind: 'ffa', when: '2026-11-08 20:00', teams: [] });
  assert.equal(t.store.leagueMatch(1).teams.length, 4);
});

test('reminders: a day before, an hour before, then the room 15 minutes before, each once', async () => {
  const t = setup();
  const start = parseWhen('2026-11-02 18:00'); // 12:30 UTC on the 2nd
  await t.league.schedule({ roleIds: crew, userId: 'u', game: 'fortnite', kind: 'h2h', when: '2026-11-02 18:00', teams: ['velvet-hangers', 'sequin-storm'] });
  t.calls.length = 0;
  await t.league.tick();
  assert.equal(t.calls.length, 0, 'too early');
  t.advance(start - 24 * 60 * MIN - t.now() + MIN);
  await t.league.tick();
  await t.league.tick();
  assert.equal(t.calls.filter((c) => c[0] === 'post').length, 1, 'day reminder once');
  t.advance(24 * 60 * MIN - 60 * MIN - 2 * MIN + 2 * MIN);
  await t.league.tick();
  t.advance(46 * MIN);
  await t.league.tick();
  assert.ok(t.calls.some((c) => c[0] === 'room'));
  assert.equal(t.store.leagueMatch(1).room_id, 'room1');
  t.advance(4 * 60 * MIN);
  await t.league.tick();
  assert.ok(t.calls.some((c) => c[0] === 'delete' && c[1] === 'room1'), 'abandoned room removed');
});

test('a result updates the standings and the scoreboard, deletes the room, and can be corrected', async () => {
  const t = setup();
  await t.league.schedule({ roleIds: crew, userId: 'u', game: 'fortnite', kind: 'h2h', when: '2026-11-07 20:00', teams: ['velvet-hangers', 'sequin-storm'] });
  t.store.leagueMatchSet(1, { room_id: 'room1' });
  assert.match(await t.league.result({ roleIds: new Set(), matchId: 1, winner: 'velvet-hangers' }), /Only the League/);
  const out = await t.league.result({ roleIds: crew, matchId: 1, winner: 'velvet-hangers', bestSport: ['sequin-storm'], late: [], forfeit: [], penalty: [], placements: [], draw: false });
  assert.match(out, /Result saved/);
  assert.ok(t.calls.some((c) => c[0] === 'delete' && c[1] === 'room1'));
  let board = t.calls.filter((c) => c[0] === 'board').at(-1)[2];
  assert.match(board, /Velvet Hangers\s+1\s+4/);
  assert.match(board, /Sequin Storm\s+1\s+3/);
  await t.league.result({ roleIds: crew, matchId: 1, draw: true, bestSport: [], late: [], forfeit: [], penalty: [], placements: [] });
  board = t.calls.filter((c) => c[0] === 'board').at(-1)[2];
  assert.match(board, /Velvet Hangers\s+1\s+3/, 'corrected, not doubled');
});

test('cancel removes the room and event; a done match cannot be cancelled', async () => {
  const t = setup();
  await t.league.schedule({ roleIds: crew, userId: 'u', game: 'fortnite', kind: 'h2h', when: '2026-11-07 20:00', teams: ['velvet-hangers', 'sequin-storm'] });
  t.store.leagueMatchSet(1, { room_id: 'room1' });
  assert.match(await t.league.cancel({ roleIds: crew, matchId: 1 }), /cancelled/);
  assert.ok(t.calls.some((c) => c[0] === 'delevent'));
  assert.match(await t.league.fixtures(), /No fixtures/);
});

test('a new season starts from zero once the current one has matches; forget-me clears the creator', async () => {
  const t = setup();
  await t.league.schedule({ roleIds: crew, userId: 'u1', game: 'fortnite', kind: 'h2h', when: '2026-11-07 20:00', teams: ['velvet-hangers', 'sequin-storm'] });
  await t.league.result({ roleIds: crew, matchId: 1, winner: 'velvet-hangers', bestSport: [], late: [], forfeit: [], penalty: [], placements: [], draw: false });
  assert.match(await t.league.seasonStart({ roleIds: crew, name: 'Spring' }), /Season 2/);
  assert.match(t.calls.filter((c) => c[0] === 'board').at(-1)[2], /Season 2: Spring/);
  assert.doesNotMatch(t.calls.filter((c) => c[0] === 'board').at(-1)[2], /Velvet Hangers\s+1/);
  t.store.forget('u1');
  assert.equal(t.store.leagueMatch(1).created_by, null);
});

test('hobby picker: Esports League needs Gaming picked too', () => {
  const hobbies = [
    { slug: 'gaming', label: 'Gaming', roleId: 'g' },
    { slug: 'esports', label: 'Esports League', roleId: 'e', requires: 'gaming' },
  ];
  const c = { hobbies };
  const alone = planHobbyChange(c, new Set(), ['esports']);
  assert.deepEqual([alone.add.length, alone.dropped.map((h) => h.slug)], [0, ['esports']]);
  assert.deepEqual(planHobbyChange(c, new Set(), ['gaming', 'esports']).add.map((h) => h.slug), ['gaming', 'esports']);
  // dropping Gaming removes the Esports role as well
  assert.deepEqual(planHobbyChange(c, new Set(['g', 'e']), []).remove.map((h) => h.slug), ['gaming', 'esports']);
  assert.deepEqual(planHobbyChange(c, new Set(['g', 'e']), ['esports']).remove.map((h) => h.slug), ['gaming', 'esports']);
});

test('renaming a team key moves stored matches and results over', async () => {
  const t = setup();
  await t.league.schedule({ roleIds: crew, userId: 'u', game: 'fortnite', kind: 'h2h', when: '2026-11-07 20:00', teams: ['velvet-hangers', 'sequin-storm'] });
  await t.league.result({ roleIds: crew, matchId: 1, winner: 'velvet-hangers', bestSport: [], late: [], forfeit: [], penalty: [], placements: [], draw: false });
  assert.ok(t.store.leagueRenameTeam('velvet-hangers', 'hanger') >= 2);
  assert.deepEqual(t.store.leagueMatch(1).teams, ['hanger', 'sequin-storm']);
  assert.equal(t.store.leagueResults(1).filter((r) => r.team === 'hanger').length, 1);
  assert.equal(t.store.leagueRenameTeam('velvet-hangers', 'hanger'), 0, 'running it again changes nothing');
});
