import 'server-only';
import crypto from 'node:crypto';
import { after } from 'next/server';
import { db } from './db';
import { CONTRIBUTIONS_EMAIL, MAIL_REPLY_TO, htmlFrom, sendMail } from './mail';
import { SITE_URL } from './site-url';

// The Lifeline: an email list kept for one job. If closetrepublic.com is ever taken down,
// everyone on it gets the new address, the GitHub repository and the payment link.
// Because the server may be gone by then, the admin page makes it easy to download the
// list and keep a copy somewhere else.

export type Subscriber = { id: number; email: string; name: string | null; token: string; status: 'subscribed' | 'unsubscribed'; createdAt: string; updatedAt: string };

const COLUMNS = 'id, email, name, token, status, created_at createdAt, updated_at updatedAt';

export const unsubscribeUrl = (token: string) => `${SITE_URL}/lifeline/unsubscribe?token=${token}`;

/** Adds someone, or re-subscribes them if they left before. isNew is false when they were already on the list. */
export function subscribe(email: string, name: string | null): { subscriber: Subscriber; isNew: boolean } {
  const at = new Date().toISOString();
  const existing = db().prepare(`SELECT ${COLUMNS} FROM subscribers WHERE email = ?`).get(email) as Subscriber | undefined;
  if (existing) {
    if (existing.status === 'subscribed') return { subscriber: existing, isNew: false };
    db().prepare("UPDATE subscribers SET status = 'subscribed', name = COALESCE(?, name), updated_at = ? WHERE id = ?").run(name, at, existing.id);
    return { subscriber: getSubscriber(existing.id)!, isNew: true };
  }
  const info = db()
    .prepare("INSERT INTO subscribers (email, name, token, status, created_at, updated_at) VALUES (?, ?, ?, 'subscribed', ?, ?)")
    .run(email, name, crypto.randomBytes(24).toString('base64url'), at, at);
  return { subscriber: getSubscriber(Number(info.lastInsertRowid))!, isNew: true };
}

export function getSubscriber(id: number) {
  return (db().prepare(`SELECT ${COLUMNS} FROM subscribers WHERE id = ?`).get(id) as Subscriber | undefined) ?? null;
}

export function bySubscriberToken(token: string) {
  if (!token || token.length > 64) return null;
  return (db().prepare(`SELECT ${COLUMNS} FROM subscribers WHERE token = ?`).get(token) as Subscriber | undefined) ?? null;
}

export function unsubscribe(token: string) {
  const s = bySubscriberToken(token);
  if (!s) return null;
  if (s.status !== 'unsubscribed') db().prepare("UPDATE subscribers SET status = 'unsubscribed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), s.id);
  return s;
}

export function listSubscribers(status?: Subscriber['status']): Subscriber[] {
  return (
    status
      ? db().prepare(`SELECT ${COLUMNS} FROM subscribers WHERE status = ? ORDER BY created_at DESC`).all(status)
      : db().prepare(`SELECT ${COLUMNS} FROM subscribers ORDER BY created_at DESC`).all()
  ) as Subscriber[];
}

export const deleteSubscriber = (id: number) => db().prepare('DELETE FROM subscribers WHERE id = ?').run(id).changes > 0;

export function subscriberCounts() {
  const rows = db().prepare('SELECT status, COUNT(*) n FROM subscribers GROUP BY status').all() as { status: string; n: number }[];
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return { subscribed: by.subscribed ?? 0, unsubscribed: by.unsubscribed ?? 0 };
}

/** When the list was last downloaded, so the admin page can nag about keeping an off-server copy. */
export function lastExportAt(): string | null {
  return (db().prepare("SELECT value FROM settings WHERE key = 'lifelineLastExport'").get() as { value: string } | undefined)?.value ?? null;
}
export function markExported() {
  db()
    .prepare("INSERT INTO settings (key, value) VALUES ('lifelineLastExport', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(new Date().toISOString());
}

const csvCell = (v: string | null) => {
  let s = v ?? '';
  // Stop spreadsheet apps from running a "name" like =HYPERLINK(...) as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The list as CSV, ready for any mail tool (Gmail, Proton, Mailchimp, Brevo…). */
export function subscribersCsv(includeUnsubscribed = false) {
  const rows = listSubscribers(includeUnsubscribed ? undefined : 'subscribed');
  const lines = [['email', 'name', 'status', 'subscribed_at'].join(',')];
  for (const s of rows) lines.push([s.email, s.name, s.status, s.createdAt].map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}

const SIGN_OFF = 'With love,\nCloset Republic';

function footer(token: string) {
  return `You are getting this because you joined the Closet Republic Lifeline. To leave, reply with "unsubscribe" or visit:\n${unsubscribeUrl(token)}`;
}

function listHeaders(token: string) {
  return { 'List-Unsubscribe': `<${unsubscribeUrl(token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

/** The one email people get when they join, so they know it worked and how to leave. */
export function sendWelcome(s: Subscriber) {
  const text = `Hi${s.name ? ` ${s.name}` : ''},

You are on the Closet Republic Lifeline.

We will only use this address for one thing: if closetrepublic.com is ever taken down, we will email you where to find us, with the new address, the GitHub repository and the payment link.

Tip: add this address to your contacts so that email does not end up in spam.

${SIGN_OFF}

${footer(s.token)}`;
  return sendMail({ to: s.email, subject: 'You are on the Closet Republic Lifeline', text, html: htmlFrom(text), replyTo: MAIL_REPLY_TO, headers: listHeaders(s.token), kind: 'lifeline-welcome' });
}

// ---------- emergency notice ----------

export type Notice = { subject: string; message: string; siteUrl: string | null; githubUrl: string | null; donateUrl: string | null; resources: string | null };

export function noticeText(n: Notice, s: Pick<Subscriber, 'name' | 'token'>) {
  const links = [
    n.siteUrl && `- New site: ${n.siteUrl}`,
    n.githubUrl && `- GitHub: ${n.githubUrl}`,
    n.donateUrl && `- Pay to keep it free: ${n.donateUrl}`,
    ...(n.resources || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `- ${l.replace(/^-\s*/, '')}`),
  ].filter(Boolean);
  return `Hi${s.name ? ` ${s.name}` : ''},

${n.message.trim()}
${links.length ? `\nWhere to find us now:\n${links.join('\n')}\n` : ''}
${SIGN_OFF}

${footer(s.token)}`;
}

export type Broadcast = { id: number; subject: string; total: number; sent: number; failed: number; status: 'sending' | 'done'; createdAt: string; finishedAt: string | null };

export function listBroadcasts(): Broadcast[] {
  return db()
    .prepare('SELECT id, subject, total, sent, failed, status, created_at createdAt, finished_at finishedAt FROM broadcasts ORDER BY id DESC LIMIT 20')
    .all() as Broadcast[];
}

/** Sends a test of the notice to the team inbox only. */
export function sendNoticeTest(n: Notice) {
  if (!CONTRIBUTIONS_EMAIL) return Promise.resolve({ status: 'skipped' as const, error: 'Set CONTRIBUTIONS_EMAIL to receive test emails' });
  const text = noticeText(n, { name: null, token: 'test' });
  return sendMail({ to: CONTRIBUTIONS_EMAIL, subject: `[Test] ${n.subject}`, text, html: htmlFrom(text), kind: 'lifeline-test' });
}

/** Starts sending the notice to every subscriber. Runs after the response; progress is stored in broadcasts. */
export function startBroadcast(n: Notice) {
  const people = listSubscribers('subscribed');
  const info = db()
    .prepare("INSERT INTO broadcasts (subject, body, total, status, created_at) VALUES (?, ?, ?, 'sending', ?)")
    .run(n.subject, JSON.stringify(n), people.length, new Date().toISOString());
  const id = Number(info.lastInsertRowid);
  const tick = db().prepare('UPDATE broadcasts SET sent = sent + ?, failed = failed + ? WHERE id = ?');
  after(async () => {
    // One at a time, gently: most SMTP providers throttle bursts.
    for (const s of people) {
      const text = noticeText(n, s);
      const r = await sendMail({ to: s.email, subject: n.subject, text, html: htmlFrom(text), replyTo: MAIL_REPLY_TO, headers: listHeaders(s.token), kind: 'lifeline-notice' });
      tick.run(r.status === 'sent' ? 1 : 0, r.status === 'sent' ? 0 : 1, id);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    db().prepare("UPDATE broadcasts SET status = 'done', finished_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  });
  return { id, total: people.length };
}
