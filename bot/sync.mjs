// Compares what each member should have with what they have in Discord, and fixes the
// difference. Webhooks, /link, joins and the 15-minute sweep all end up here, so the same
// rules serve new members, renewals, expiries and manual fixes.
import { entitlement, roleDiff, wantedRoles } from './core.mjs';

const DAY = 86_400_000;
const date = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * discord: { fetchMember(id) → { roles: Set<string> } | null, addRole(id, roleId, reason), removeRole(id, roleId, reason),
 *            dm(id, text) → Promise<boolean>, post(channelId, text) }
 */
export function createSync({ cfg, store, discord, env, now = () => Date.now() }) {
  const renew = env.renewUrl ? ` Renew here: ${env.renewUrl}` : '';
  const log = (text) => cfg.channels.botLog && discord.post(cfg.channels.botLog, text).catch(() => {});
  const modLog = (text) => cfg.channels.modLog && discord.post(cfg.channels.modLog, text).catch(() => {});

  /** Sends a DM once per key; if DMs are closed it waits for their next command. */
  async function tell(id, key, text) {
    if (store.hasNotice(id, key)) return;
    const delivered = await discord.dm(id, text).catch(() => false);
    store.notice(id, key, text, delivered);
  }

  async function syncMember(id, reason = 'sync') {
    const member = store.member(id);
    const grants = store.grantsFor(id);
    if (!member && !grants.length) return { skipped: 'not managed' };
    const at = now();
    const ent = entitlement(cfg, { memberships: store.membershipsFor(member?.email), grants, member }, at);
    const tierSlug = ent.tier?.slug ?? null;
    const prevTier = member?.applied_tier ?? null;
    const prevState = member?.applied_state ?? 'none';

    const gm = await discord.fetchMember(id);
    let changed = { add: [], remove: [] };
    if (gm) {
      changed = roleDiff(cfg, gm.roles, wantedRoles(cfg, ent.tier, { discreet: Boolean(member?.discreet) }));
      const why = `Closet Republic membership: ${reason}`;
      for (const r of changed.add) await discord.addRole(id, r, why);
      for (const r of changed.remove) await discord.removeRole(id, r, why);
    }
    store.ensureMember(id);
    store.setApplied(id, tierSlug, ent.state);

    // Messages for what changed since last time.
    const name = ent.tier?.name;
    const tierChanged = tierSlug !== prevTier || ent.state !== prevState;
    if (tierChanged) {
      const from = prevTier ? `${cfg.tiers.find((t) => t.slug === prevTier)?.name ?? prevTier}${prevState === 'grace' ? ' (grace)' : ''}` : 'Visitor';
      const to = name ? `${name}${ent.state === 'grace' ? ' (grace)' : ''}` : 'Visitor';
      log(`<@${id}>: ${from} → ${to} (${reason})`);
    }
    if (ent.state === 'active' && (prevState === 'none' || !prevTier)) {
      await tell(id, `welcome:${tierSlug}:${new Date(at).toISOString().slice(0, 10)}`, `Welcome to the ${name} class of Closet Republic! Your lounges are open. Type /discreet on if you'd rather not show your class colour.`);
      if (member?.thanks && cfg.channels.thankYou) discord.post(cfg.channels.thankYou, `Please welcome our newest ${name}, <@${id}>! 💐`).catch(() => {});
    } else if (ent.state === 'active' && prevState === 'active' && prevTier && prevTier !== tierSlug) {
      await tell(id, `class:${tierSlug}:${at}`, `Your Closet Republic class is now ${name}.`);
    }
    if (ent.state === 'active' && ent.endsAt) {
      await tell(id, `ending:${ent.endsAt}`, `Your ${name} membership ends on ${date(ent.endsAt)}. You keep your class until then, plus a 7-day grace period.${renew}`);
      for (const days of cfg.grace.remindDaysBeforeEnd || []) {
        if (at >= ent.endsAt - days * DAY) await tell(id, `ending-${days}:${ent.endsAt}`, `Reminder: your ${name} membership ends on ${date(ent.endsAt)}.${renew}`);
      }
    }
    if (ent.state === 'grace') {
      for (const days of cfg.grace.remindDuringGrace || []) {
        if (at < ent.graceStart + days * DAY) continue;
        const text =
          days === 0
            ? `Your Closet Republic membership has ended, so your visa is extended for 7 days: you keep your ${name} class until ${date(ent.until)}.${renew}`
            : `Reminder: your ${name} visa runs out on ${date(ent.until)}. After that your class and lounges are removed until you renew.${renew}`;
        await tell(id, `grace-${days}:${ent.until}`, text);
      }
    }
    if (ent.state === 'none' && prevTier) {
      if (reason !== 'revoked' && reason !== 'forget-me') {
        await tell(id, `goodbye:${at}`, `Your Closet Republic visa has run out, so your class and lounges have been removed. You're always welcome back.${renew}`);
      }
      modLog(`<@${id}> is a Visitor again (${reason}).`);
    }
    return { tier: tierSlug, state: ent.state, added: changed.add, removed: changed.remove, inServer: Boolean(gm) };
  }

  async function syncEmail(email, reason) {
    const m = store.memberByEmail(email);
    return m ? syncMember(m.discord_id, reason) : { skipped: 'not linked' };
  }

  async function syncAll(reason = 'sweep') {
    const results = [];
    for (const id of store.managedIds()) {
      try {
        results.push(await syncMember(id, reason));
      } catch (err) {
        console.error(`[bot] sync ${id} failed:`, err.message);
      }
    }
    return results;
  }

  return { syncMember, syncEmail, syncAll };
}
