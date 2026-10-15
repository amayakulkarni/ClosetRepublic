import 'server-only';
import { db } from './db';
import { MAIL_REPLY_TO, htmlFrom, sendMail } from './mail';
import { SITE_URL } from './site-url';

// Buy Me a Coffee memberships, for Discord tier roles. The webhook only records what Buy Me
// a Coffee says here; the Discord bot (bot/) compares every linked member's membership with
// their roles and fixes the difference, so a missed or repeated webhook never leaves a wrong
// role for long. Field names differ between Buy Me a Coffee event types, so several
// spellings are accepted (the forum bridge does the same).

export type MembershipStatus = 'active' | 'cancelling' | 'paused' | 'ended' | 'lapsed' | 'revoked';

const DAY = 24 * 60 * 60 * 1000;

type Data = Record<string, unknown>;
const pick = (obj: Data, keys: string[]) =>
  keys
    .map((k) => k.split('.').reduce<unknown>((o, part) => (o && typeof o === 'object' ? (o as Data)[part] : undefined), obj))
    .find((v) => v !== undefined && v !== null && v !== '');
const truthy = (v: unknown) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';

/** Seconds, milliseconds or a date string → Date. */
function toDate(v: unknown): Date | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : new Date(t);
}

export type MembershipEvent = {
  subscriptionId: string;
  email: string;
  levelId: string | null;
  levelName: string | null;
  status: MembershipStatus;
  paidUntil: string | null;
  endedAt: string | null;
};

/** Reads a membership.* event. Returns null for other events or when the supporter's email is missing. */
export function parseMembershipEvent(event: { type?: string; data?: Data }, now = new Date()): MembershipEvent | null {
  const type = String(event.type || '');
  if (!type.startsWith('membership.')) return null;
  const data = event.data || {};
  const email = String(pick(data, ['supporter_email', 'payer_email', 'email', 'supporter.email']) || '').trim().toLowerCase();
  if (!email) return null;
  const levelId = pick(data, ['membership_level_id', 'level_id', 'membership_level.id']);
  const levelName = pick(data, ['membership_level_name', 'level_name', 'membership_level.name', 'membership_name']);
  const periodEnd = toDate(pick(data, ['current_period_end', 'subscription_current_period_end', 'membership_end_at', 'ends_at', 'expires_at']));
  const subscriptionId = String(pick(data, ['subscription_id', 'membership_id', 'id']) ?? `${email}:${levelId ?? levelName ?? ''}`);
  const cancelAtPeriodEnd = truthy(pick(data, ['cancel_at_period_end', 'subscription_cancel_at_period_end']));
  const dataStatus = String(pick(data, ['status', 'subscription_status']) || '').toLowerCase();

  let status: MembershipStatus;
  let endedAt: string | null = null;
  if (/^membership\.paused$/.test(type) || dataStatus === 'paused') status = 'paused';
  else if (/^membership\.(cancell?ed|ended|expired)$/.test(type) || /cancel|ended|expired/.test(dataStatus)) {
    // Cancelled at the end of the paid period: nothing changes until then.
    if (cancelAtPeriodEnd && periodEnd && periodEnd > now) status = 'cancelling';
    else {
      status = 'ended';
      endedAt = (toDate(pick(data, ['canceled_at', 'cancelled_at', 'ended_at'])) ?? now).toISOString();
    }
  } else if (/^membership\.(started|updated|renewed|resumed|level_?updated)$/.test(type)) {
    status = cancelAtPeriodEnd && periodEnd ? 'cancelling' : 'active';
  } else return null;

  return {
    subscriptionId,
    email,
    levelId: levelId == null ? null : String(levelId),
    levelName: levelName == null ? null : String(levelName),
    status,
    // One extra day, so a renewal that arrives a few hours late never causes a flicker.
    paidUntil: periodEnd ? new Date(periodEnd.getTime() + DAY).toISOString() : null,
    endedAt,
  };
}

/** Stores a membership event. Returns whether the supporter still needs the "link your Discord" email. */
export function recordMembership(e: MembershipEvent) {
  const at = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO memberships (subscription_id, email, level_id, level_name, status, paid_until, ended_at, created_at, updated_at)
       VALUES (@subscriptionId, @email, @levelId, @levelName, @status, @paidUntil, @endedAt, @at, @at)
       ON CONFLICT(subscription_id) DO UPDATE SET
         email = excluded.email,
         level_id = COALESCE(excluded.level_id, memberships.level_id),
         level_name = COALESCE(excluded.level_name, memberships.level_name),
         status = CASE WHEN memberships.status = 'revoked' THEN 'revoked' ELSE excluded.status END,
         paid_until = COALESCE(excluded.paid_until, memberships.paid_until),
         ended_at = excluded.ended_at,
         updated_at = excluded.updated_at`,
    )
    .run({ ...e, at });
  const row = db().prepare('SELECT invited_at FROM memberships WHERE subscription_id = ?').get(e.subscriptionId) as { invited_at: string | null };
  const linked = db().prepare('SELECT 1 FROM discord_members WHERE email = ?').get(e.email);
  return { needsInvite: (e.status === 'active' || e.status === 'cancelling') && !linked && !row.invited_at };
}

/** One email to a new member who hasn't linked Discord yet. Sent once per subscription. */
export async function sendLinkInvite(e: MembershipEvent) {
  db().prepare('UPDATE memberships SET invited_at = ? WHERE subscription_id = ?').run(new Date().toISOString(), e.subscriptionId);
  const text = `Thank you for joining Closet Republic${e.levelName ? ` as ${e.levelName}` : ''}.

To get your class role and lounges in our Discord server, link your Discord account:

${SITE_URL}/discord/link

Sign in with Discord there, enter this email address, and type the code we send you. Your role appears within a minute. You can also type /link in the Discord server.

If you don't use Discord, you can ignore this email; we won't send another.

With love,
The Government of Closet Republic`;
  return sendMail({ to: e.email, subject: 'Link your Discord to get your Closet Republic class', text, html: htmlFrom(text), replyTo: MAIL_REPLY_TO, kind: 'discord-invite' });
}

/** Asks the Discord bot to update roles now (it also checks every 15 minutes anyway). */
export function pokeBot(body: { email?: string; discordId?: string } = {}) {
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!secret) return Promise.resolve();
  const url = (process.env.BOT_URL || 'http://127.0.0.1:40008').replace(/\/$/, '');
  return fetch(`${url}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cr-secret': secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  })
    .then(() => undefined)
    .catch((err) => console.warn('[discord-bot] not reached:', (err as Error).message));
}
