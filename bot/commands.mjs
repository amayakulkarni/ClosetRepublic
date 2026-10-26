// Slash commands. Each handler gets a small context (who ran it, their roles, the options)
// and returns the private reply, so the rules can be tested without Discord.
import { elderProgress, entitlement, isTourist } from './core.mjs';

const date = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const COMMANDS = [
  { name: 'link', description: 'Link your Buy Me a Coffee membership to get your class' },
  {
    name: 'membership',
    description: 'Your Closet Republic membership',
    options: [
      { type: 1, name: 'status', description: 'Your class, paid-until date and grace period (only you see it)' },
      {
        type: 1, name: 'grant', description: 'Founders: give a complimentary class',
        options: [
          { type: 6, name: 'member', description: 'Who', required: true },
          { type: 3, name: 'tier', description: 'Class', required: true, choices: [] },
          { type: 4, name: 'days', description: 'For how many days', required: true, min_value: 1, max_value: 730 },
        ],
      },
      {
        type: 1, name: 'revoke', description: 'Founders: remove a class at once (refunds, chargebacks)',
        options: [{ type: 6, name: 'member', description: 'Who', required: true }],
      },
    ],
  },
  {
    name: 'discreet', description: 'Hide or show your class colour (your lounges stay)',
    options: [{ type: 3, name: 'mode', description: 'on hides it, off shows it', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }],
  },
  {
    name: 'thanks', description: 'Be welcomed by name on #thank-you-wall when you join a class',
    options: [{ type: 3, name: 'mode', description: 'on or off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }],
  },
  {
    name: 'unlink', description: 'Remove the link between your Discord and your Buy Me a Coffee email (mods: any account)',
    options: [
      { type: 6, name: 'member', description: 'Mods only: the member to unlink', required: false },
      { type: 3, name: 'user_id', description: 'Mods only: a Discord user ID, for someone who left the server', required: false },
      { type: 3, name: 'reason', description: 'Mods only: why (goes in #mod-log)', required: false },
    ],
  },
  {
    name: 'ticket', description: 'Support tickets in the Embassy (only you and the mods see a ticket)',
    options: [
      { type: 1, name: 'open', description: 'Open a private ticket' },
      { type: 1, name: 'close', description: 'Close this ticket', options: [{ type: 3, name: 'reason', description: 'Why', required: false }] },
      { type: 1, name: 'reopen', description: 'Mods: reopen this ticket' },
      { type: 1, name: 'archive', description: 'Mods: save the transcript and delete this closed ticket' },
      { type: 1, name: 'list', description: 'Mods: open and closed tickets' },
    ],
  },
  {
    name: 'room', description: 'Elders, Grand Elders, Founders, Representatives, Ministers: manage your private voice room',
    options: [
      { type: 1, name: 'invite', description: 'Let a member see and join your room', options: [{ type: 6, name: 'member', description: 'Who', required: true }] },
      { type: 1, name: 'remove', description: 'Take a member out of your room', options: [{ type: 6, name: 'member', description: 'Who', required: true }] },
      { type: 1, name: 'rename', description: 'Rename your room', options: [{ type: 3, name: 'name', description: 'New name', required: true, max_length: 60 }] },
      { type: 1, name: 'limit', description: 'Limit how many people fit (0 = no limit)', options: [{ type: 4, name: 'people', description: 'Number of people', required: true, min_value: 0, max_value: 99 }] },
      { type: 1, name: 'close', description: 'Close your room now' },
    ],
  },
  { name: 'intro', description: 'How to join as a free Tourist: the intro template (only you see it)' },
  { name: 'rank', description: 'Your class, its rank, and the days left until the Elder role (only you see it)' },
  { name: 'forget-me', description: 'Delete everything the Republic bot keeps about you' },
  { name: 'tiers', description: 'Founders: check which Buy Me a Coffee levels are not mapped to a class' },
];

/** Fills the grant command's class choices from the tier file. */
export function commandDefinitions(cfg) {
  const defs = structuredClone(COMMANDS);
  const grant = defs.find((c) => c.name === 'membership').options.find((o) => o.name === 'grant');
  grant.options.find((o) => o.name === 'tier').choices = cfg.tiers.map((t) => ({ name: t.name, value: t.slug }));
  return defs;
}

/**
 * ctx: { command, sub, userId, roleIds: Set<string>, option(name) → value }
 * deps: { cfg, store, sync, env, discord }
 */
export async function handleCommand(ctx, { cfg, store, sync, env, discord, intro }) {
  const founder = cfg.staffRoleIds[0] && ctx.roleIds.has(cfg.staffRoleIds[0]);
  const linkUrl = `${env.siteUrl}/discord/link`;
  const graceDays = cfg.grace.lapseDays ?? 7;

  switch (ctx.command) {
    case 'link':
      return `Open ${linkUrl}, sign in with Discord, and enter the email you use on Buy Me a Coffee. We'll email you a code; once you type it, your class appears here within a minute. We keep only your Discord ID and that email.`;

    case 'membership': {
      if (ctx.sub === 'status') {
        const m = store.member(ctx.userId);
        const ent = entitlement(cfg, { memberships: store.membershipsFor(m?.email), grants: store.grantsFor(ctx.userId), member: m });
        const linked = m?.email ? 'Your Buy Me a Coffee email is linked.' : `Your Buy Me a Coffee email is not linked yet: type /link.`;
        if (ent.state === 'none') return `You are a Visitor (no class). ${linked}`;
        const until =
          ent.state === 'grace'
            ? `You are in your grace period until ${date(ent.until)}.`
            : ent.until
              ? `Paid until ${date(ent.until)}, then a ${graceDays}-day grace period.`
              : 'Your membership renews automatically.';
        return `Your class: ${ent.tier.name}${m?.discreet ? ' (discreet)' : ''}. ${until} ${linked}`;
      }
      if (!founder) return 'Only Founders can do that.';
      const target = ctx.option('member');
      if (!target) return 'Choose a member.';
      if (ctx.sub === 'grant') {
        const tier = cfg.tiers.find((t) => t.slug === ctx.option('tier'));
        const days = Number(ctx.option('days'));
        if (!tier || !(days >= 1)) return 'Choose a class and a number of days.';
        const expires = store.grant(target, tier.slug, days, ctx.userId);
        await sync.syncMember(target, `granted by <@${ctx.userId}>`);
        discord.post(cfg.channels.modLog, `<@${ctx.userId}> granted <@${target}> ${tier.name} until ${date(Date.parse(expires))}.`).catch(() => {});
        return `Granted ${tier.name} to <@${target}> until ${date(Date.parse(expires))}. It then gets the normal ${graceDays}-day grace period.`;
      }
      if (ctx.sub === 'revoke') {
        store.revoke(target);
        await sync.syncMember(target, 'revoked');
        discord.post(cfg.channels.modLog, `<@${ctx.userId}> revoked <@${target}>'s membership.`).catch(() => {});
        return `Revoked <@${target}>'s class, with no grace period. Their Buy Me a Coffee membership itself is unchanged; cancel or refund it there.`;
      }
      return 'Unknown command.';
    }

    case 'discreet': {
      const on = ctx.option('mode') === 'on';
      store.setFlag(ctx.userId, 'discreet', on);
      await sync.syncMember(ctx.userId, on ? 'discreet on' : 'discreet off');
      return on ? 'Discreet mode is on: your class colour is hidden and your lounges stay open.' : 'Discreet mode is off: your class colour shows again.';
    }

    case 'thanks': {
      const on = ctx.option('mode') === 'on';
      store.setFlag(ctx.userId, 'thanks', on);
      return on ? 'We will welcome you by name on #thank-you-wall when you join a class.' : 'You will not be named on #thank-you-wall.';
    }

    case 'unlink': {
      if (!store.unlink(ctx.userId, graceDays)) return 'Your Discord is not linked to a Buy Me a Coffee email.';
      await sync.syncMember(ctx.userId, 'unlinked');
      return `Unlinked. You keep your current class for a ${graceDays}-day grace period, then it is removed. Link again any time with /link.`;
    }

    case 'intro':
      return intro ? intro.help() : 'The Tourist role is not open yet. Ask a mod.';

    case 'rank': {
      const m = store.member(ctx.userId);
      const ent = entitlement(cfg, { memberships: store.membershipsFor(m?.email), grants: store.grantsFor(ctx.userId), member: m });
      const ladder = cfg.tiers.map((t) => (t === ent.tier ? `**${t.name}**` : t.name)).join(' < ');
      const cls = ent.tier
        ? `Your class: ${ent.tier.name}, rank ${cfg.tiers.indexOf(ent.tier) + 1} of ${cfg.tiers.length} (${ladder}).${ent.state === 'grace' ? ` It is in its grace period until ${date(ent.until)}.` : ''}`
        : isTourist(cfg, m)
          ? `You are a Tourist (free): the public places are open to you. Classes, cheapest first: ${ladder}.`
          : `You are a Visitor (no class). Send your intro to Snitch in a DM (type /intro for the template) to become a Tourist for free, or pick a class: ${ladder}.`;
      const activity = cfg.elder.activeDaysRequired ? store.activitySummary(ctx.userId, cfg.elder.activityWindowDays) : undefined;
      const p = elderProgress(cfg, m, ent, Date.now(), activity);
      const need = cfg.elder.afterDays;
      const standing = ent.state !== 'none' || isTourist(cfg, m);
      let elder;
      if (!cfg.elder.roleId) elder = 'The Elder role is not set up yet.';
      else if (p.elder) elder = `You are an Elder (verified ${p.days} days ago).`;
      else if (!p.verified) elder = `Elder: the ${need}-day count starts when you get the Tourist role (DM Snitch your intro, type /intro) or verify an email on the link page (type /link).`;
      else if (p.needsEmail) elder = `Elder: the ${need}-day count is running from your intro (${p.days} day(s) so far), but the role also needs the second verification step: confirm an email on the link page (type /link). Any email you own works.`;
      else if (p.remaining > 0) elder = `Elder: verified ${p.days} day(s) ago, ${p.remaining} day(s) to go (around ${date(p.eligibleAt)}).${standing ? '' : ' The role also needs a class or the Tourist role at that point.'}`;
      else if (!standing) elder = `Elder: your ${need} days are done; the role arrives once you hold a class or the Tourist role again.`;
      else if (!p.activityOk) elder = `Elder: your ${need} days are done. The role also needs activity on ${cfg.elder.activeDaysRequired} of the last ${cfg.elder.activityWindowDays} days (you have ${activity.activeDays}${activity.moderated ? ', and a moderation action in that time counts against it' : ''}).`;
      else elder = 'Elder: your days are done; the role arrives within 15 minutes.';
      return `${cls}\n${elder}`;
    }

    case 'forget-me': {
      await intro?.withdraw(ctx.userId); // also deletes the mods' copy of a waiting intro
      store.forget(ctx.userId);
      // Nothing is left to look up, so take every class and lounge role off now.
      const gm = await discord.fetchMember(ctx.userId);
      if (gm) {
        const managed = new Set([...cfg.tiers.flatMap((t) => [t.roleId, t.accessRoleId]), cfg.tourist?.roleId, cfg.tourist?.accessRoleId].filter(Boolean));
        for (const r of gm.roles) if (managed.has(r)) await discord.removeRole(ctx.userId, r, 'forget-me');
      }
      return 'Done. Your link, settings, messages and to-do items are deleted and your class roles are removed. Buy Me a Coffee keeps its own records, and the treasury keeps the payment without your Discord ID. You can link again any time with /link.';
    }

    case 'tiers': {
      if (!founder) return 'Only Founders can do that.';
      const unmapped = store
        .levelsSeen()
        .filter((l) => !cfg.tiers.some((t) => (l.level_id && t.bmcLevelIds.includes(String(l.level_id))) || t.bmcLevels.includes(String(l.level_name || '').trim().toLowerCase())));
      const ids = cfg.tiers.filter((t) => !t.bmcLevelIds.length).map((t) => t.name);
      const lines = [
        unmapped.length
          ? `Levels with no class (they get ${cfg.unknownLevelTier || 'nothing'}): ${unmapped.map((l) => `${l.level_name || '?'} (id ${l.level_id || '?'})`).join(', ')}`
          : 'Every Buy Me a Coffee level seen so far maps to a class.',
        ids.length ? `Matched by name only (add bmcLevelIds to config/discord-tiers.json): ${ids.join(', ')}` : 'Every class has Buy Me a Coffee level ids.',
      ];
      return lines.join('\n');
    }
  }
  return 'Unknown command.';
}

/** Adds any messages a member's closed DMs kept from them to a command reply. */
export function withPendingNotices(store, userId, reply) {
  const pending = store.undelivered(userId);
  if (!pending.length) return reply;
  for (const n of pending) store.markDelivered(userId, n.notice_key);
  return `${reply}\n\n**Messages you missed** (your DMs are closed):\n${pending.map((n) => `• ${n.message}`).join('\n')}`.slice(0, 1990);
}
