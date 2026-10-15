import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitlement, wantedRoles, roleDiff, tierForLevel } from '../core.mjs';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-15T12:00:00Z');
const iso = (offsetDays) => new Date(NOW + offsetDays * DAY).toISOString();
const slugs = ['alien', 'citizen', 'top-1', 'upper-middle-class', 'middle-class'];
const cfg = {
  tiers: slugs.map((slug, i) => ({
    slug, name: slug, rank: i + 1, roleId: `role-${slug}`, accessRoleId: `access-${slug}`,
    bmcLevelIds: slug === 'citizen' ? ['222'] : [],
    bmcLevels: { alien: ['alien'], citizen: ['citizen'], 'top-1': ["in dictator's bed"], 'upper-middle-class': ['upper middle class'], 'middle-class': ['middle class'] }[slug],
  })),
  grace: { lapseDays: 7 },
  unknownLevelTier: 'alien',
};
const m = (status, level, extra = {}) => ({ status, level_name: level, level_id: null, updated_at: iso(-30), ...extra });

test('level ids win over names, names are case-insensitive, unknown levels fall back to Alien', () => {
  assert.equal(tierForLevel(cfg, '222', 'Middle class').tier.slug, 'citizen');
  assert.equal(tierForLevel(cfg, null, "In Dictator's Bed").tier.slug, 'top-1');
  assert.deepEqual([tierForLevel(cfg, '999', 'Mystery').tier.slug, tierForLevel(cfg, '999', 'Mystery').known], ['alien', false]);
});

test('an active membership is open-ended', () => {
  const e = entitlement(cfg, { memberships: [m('active', 'Citizen', { paid_until: iso(-3) })] }, NOW);
  assert.deepEqual([e.tier.slug, e.state, e.until], ['citizen', 'active', null]);
});

test('a cancelled membership keeps its class until the paid period ends, then 7 days of grace, then nothing', () => {
  const rows = [m('cancelling', 'Middle class', { paid_until: iso(2) })];
  assert.equal(entitlement(cfg, { memberships: rows }, NOW).state, 'active');
  assert.equal(entitlement(cfg, { memberships: rows }, NOW).endsAt, NOW + 2 * DAY);
  const inGrace = entitlement(cfg, { memberships: rows }, NOW + 5 * DAY);
  assert.deepEqual([inGrace.tier.slug, inGrace.state, inGrace.until], ['middle-class', 'grace', NOW + 9 * DAY]);
  assert.equal(entitlement(cfg, { memberships: rows }, NOW + 10 * DAY).state, 'none');
});

test('an immediately ended membership starts its grace period at once', () => {
  const e = entitlement(cfg, { memberships: [m('ended', 'Citizen', { ended_at: iso(-1) })] }, NOW);
  assert.deepEqual([e.state, e.graceStart], ['grace', NOW - DAY]);
});

test('revoked memberships count for nothing, with no grace', () => {
  assert.equal(entitlement(cfg, { memberships: [m('revoked', 'Middle class')] }, NOW).state, 'none');
});

test('the highest current class wins over a pricier class in grace', () => {
  const e = entitlement(cfg, { memberships: [m('active', 'Alien'), m('ended', 'Middle class', { ended_at: iso(-1) })] }, NOW);
  assert.deepEqual([e.tier.slug, e.state], ['alien', 'active']);
});

test('upgrading picks the higher class straight away', () => {
  const e = entitlement(cfg, { memberships: [m('active', 'Citizen'), m('active', 'Upper middle class')] }, NOW);
  assert.equal(e.tier.slug, 'upper-middle-class');
});

test('grants expire like paid memberships; unlinking leaves a grace period', () => {
  const g = entitlement(cfg, { grants: [{ tier: 'top-1', expires_at: iso(-2) }] }, NOW);
  assert.deepEqual([g.tier.slug, g.state], ['top-1', 'grace']);
  const u = entitlement(cfg, { member: { carry_tier: 'citizen', carry_until: iso(3) } }, NOW);
  assert.deepEqual([u.tier.slug, u.state], ['citizen', 'grace']);
});

test('roles stack: class role plus every cheaper lounge; discreet hides only the class role', () => {
  const top = cfg.tiers[2];
  assert.deepEqual([...wantedRoles(cfg, top)].sort(), ['access-alien', 'access-citizen', 'access-top-1', 'role-top-1']);
  assert.deepEqual([...wantedRoles(cfg, top, { discreet: true })].sort(), ['access-alien', 'access-citizen', 'access-top-1']);
});

test('the diff never touches roles the bot does not manage', () => {
  const d = roleDiff(cfg, new Set(['founder', 'she-her', 'role-citizen', 'access-alien']), wantedRoles(cfg, cfg.tiers[0]));
  assert.deepEqual(d, { add: ['role-alien'], remove: ['role-citizen'] });
});
