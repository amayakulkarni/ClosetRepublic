// The membership rules, with no Discord or database in them (bot/test/core.test.mjs).
//
// A member's class comes from, in order of strength:
//   - an active Buy Me a Coffee membership for their linked email (no end date: Buy Me a
//     Coffee renews it; the hourly check ends it if it stops being active),
//   - a cancelled or paused membership, until the end of the period they paid for,
//   - a complimentary class from /membership grant, until it expires,
// and after any of those ends, a grace period (7 days) with the same class. /unlink also
// leaves a grace period. The highest class wins; a class in grace only counts when there is
// no current one. Revoked memberships count for nothing.
//
// No class is free: Alien is the $1 entry level (per month or per year) on Buy Me a Coffee and on crypto.
// Verification is two steps on the link page (Discord sign-in, then a code sent to the email).
// Elder: a verified member whose link is at least elder.afterDays old (90) also gets the Elder role.

const DAY = 86_400_000;
const ms = (iso) => (iso ? Date.parse(iso) : NaN);

export function tierForLevel(cfg, levelId, levelName) {
  const id = levelId == null ? '' : String(levelId);
  const name = String(levelName || '').trim().toLowerCase();
  const byId = id && cfg.tiers.findLast((t) => t.bmcLevelIds.includes(id));
  const byName = name && cfg.tiers.findLast((t) => t.bmcLevels.includes(name));
  const tier = byId || byName || cfg.tiers.find((t) => t.slug === cfg.unknownLevelTier) || null;
  return { tier, known: Boolean(byId || byName) };
}

/**
 * @returns {{ tier: object|null, state: 'active'|'grace'|'none', until: number|null, graceStart: number|null, endsAt: number|null }}
 *   until: when the current state ends (null = open-ended); endsAt: end of a paid period that
 *   is running out (cancelled or paused memberships), for the "ending soon" reminder.
 */
export function entitlement(cfg, { memberships = [], grants = [], member = null }, now = Date.now()) {
  const graceMs = (cfg.grace.lapseDays ?? 7) * DAY;
  const candidates = [];
  const add = (tier, end, open = false) => {
    if (!tier) return;
    if (open || end > now) candidates.push({ tier, state: 'active', until: open ? null : end, endsAt: open ? null : end });
    else if (end + graceMs > now) candidates.push({ tier, state: 'grace', until: end + graceMs, graceStart: end });
  };

  for (const m of memberships) {
    if (m.status === 'revoked') continue;
    const { tier } = tierForLevel(cfg, m.level_id, m.level_name);
    if (m.status === 'active') add(tier, null, true);
    else if (m.status === 'cancelling' || m.status === 'paused') add(tier, ms(m.paid_until) || ms(m.updated_at));
    else add(tier, ms(m.ended_at) || ms(m.paid_until) || ms(m.updated_at));
  }
  for (const g of grants) add(cfg.tiers.find((t) => t.slug === g.tier), ms(g.expires_at));
  if (member?.carry_tier && member.carry_until) {
    const until = ms(member.carry_until);
    const tier = cfg.tiers.find((t) => t.slug === member.carry_tier);
    if (tier && until > now) candidates.push({ tier, state: 'grace', until, graceStart: until - graceMs });
  }

  const best = (state) =>
    candidates
      .filter((c) => c.state === state)
      .sort((a, b) => b.tier.rank - a.tier.rank || (b.until ?? Infinity) - (a.until ?? Infinity))[0];
  const pick = best('active') || best('grace');
  if (!pick) return { tier: null, state: 'none', until: null, graceStart: null, endsAt: null };
  // An open-ended membership at the same class outranks one that is running out.
  const open = pick.state === 'active' && candidates.some((c) => c.state === 'active' && c.tier === pick.tier && c.until === null);
  return {
    tier: pick.tier,
    state: pick.state,
    until: open ? null : pick.until,
    graceStart: pick.graceStart ?? null,
    endsAt: open ? null : pick.endsAt ?? null,
  };
}

/** Every role id the bot is allowed to manage: class roles, lounge access roles and the Elder role. */
export const managedRoles = (cfg) => new Set([...cfg.tiers.flatMap((t) => [t.roleId, t.accessRoleId]), cfg.elder?.roleId].filter(Boolean));

/** Verified for long enough (default 90 days) and still in a class (active or grace). */
export function isElder(cfg, member, ent, now = Date.now()) {
  if (!cfg.elder?.roleId || !member?.email || !member.linked_at || ent.state === 'none') return false;
  const since = Date.parse(member.linked_at);
  return Number.isFinite(since) && now - since >= (cfg.elder.afterDays ?? 90) * DAY;
}

/**
 * Where a member stands on the way to Elder, for /rank. The count starts at the first verification
 * (linked_at) and needs elder.afterDays days; the role itself also needs a class (active or grace).
 * @returns {{ verified: boolean, days: number, remaining: number, eligibleAt: number|null, elder: boolean }}
 */
export function elderProgress(cfg, member, ent, now = Date.now()) {
  const need = cfg.elder?.afterDays ?? 90;
  const since = member?.email && member.linked_at ? Date.parse(member.linked_at) : NaN;
  if (!Number.isFinite(since)) return { verified: false, days: 0, remaining: need, eligibleAt: null, elder: false };
  const days = Math.max(0, Math.floor((now - since) / DAY));
  const eligibleAt = since + need * DAY;
  return { verified: true, days, remaining: Math.max(0, Math.ceil((eligibleAt - now) / DAY)), eligibleAt, elder: isElder(cfg, member, ent, now) };
}

/** The class role (unless discreet) plus the access role of that class and every cheaper one, plus Elder. */
export function wantedRoles(cfg, tier, { discreet = false, elder = false } = {}) {
  if (!tier) return new Set();
  const roles = cfg.tiers.filter((t) => t.rank <= tier.rank).map((t) => t.accessRoleId);
  if (!discreet) roles.push(tier.roleId);
  if (elder) roles.push(cfg.elder?.roleId);
  return new Set(roles.filter(Boolean));
}

/** What to add and remove, touching only managed roles. */
export function roleDiff(cfg, current, wanted) {
  const managed = managedRoles(cfg);
  return {
    add: [...wanted].filter((r) => !current.has(r)),
    remove: [...current].filter((r) => managed.has(r) && !wanted.has(r)),
  };
}
