import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db';
import { excerptOf, getAllPosts, isGazetteSlug, type GhostPost } from './ghost';
import { mailgunConfigured, mailgunSend } from './mailgun';
import { canSendMail, sendTransactional } from './transactional';
import { SITE_URL } from './site-url';

// The Closet Republic newsletter, run by the site itself:
//  - Sign-ups are stored in newsletter_subscribers and confirmed by link (double opt-in).
//  - Issues are built in /admin from Ghost posts (checkboxes), rendered into the static template in
//    content/newsletter/template.html and sent through Mailgun, one message per subscriber.
//  - Every email has its own unsubscribe link and a List-Unsubscribe header. No tracking.

export const newsletterEnabled = () => process.env.NEWSLETTER_DISABLED !== 'true';

/** Public settings read at request time, so changing the environment needs only a restart. */
export function newsletterSettings() {
  return {
    frequency: (process.env.NEWSLETTER_FREQUENCY || 'weekly').trim() || 'weekly',
    promoPrice: (process.env.DISCORD_PROMO_PRICE || 'INR 100 per year').trim() || 'INR 100 per year',
  };
}

const now = () => new Date().toISOString();
const code = () => crypto.randomBytes(16).toString('hex');
const confirmUrl = (c: string) => `${SITE_URL}/newsletter/confirm?c=${c}`;
export const unsubscribeUrl = (c: string) => `${SITE_URL}/newsletter/unsubscribe?c=${c}`;

// ---------- subscribers ----------

export type Subscriber = { id: number; email: string; status: 'pending' | 'subscribed' | 'unsubscribed'; confirmCode: string; unsubCode: string; createdAt: string; updatedAt: string; confirmedAt: string | null; lastMailAt: string | null };
type Row = { id: number; email: string; status: Subscriber['status']; confirm_code: string; unsub_code: string; created_at: string; updated_at: string; confirmed_at: string | null; last_mail_at: string | null };
const toSub = (r: Row): Subscriber => ({ id: r.id, email: r.email, status: r.status, confirmCode: r.confirm_code, unsubCode: r.unsub_code, createdAt: r.created_at, updatedAt: r.updated_at, confirmedAt: r.confirmed_at, lastMailAt: r.last_mail_at });

/**
 * Records a sign-up and returns the subscriber who needs a confirmation email, or null when none is needed
 * (already subscribed, or a confirmation went out in the last 2 minutes). The caller always answers the
 * same way, so the form never reveals who is on the list.
 */
export function startSignup(email: string): Subscriber | null {
  const conn = db();
  const row = conn.prepare('SELECT * FROM newsletter_subscribers WHERE email = ?').get(email) as Row | undefined;
  if (!row) {
    const info = conn
      .prepare("INSERT INTO newsletter_subscribers (email, status, confirm_code, unsub_code, created_at, updated_at, last_mail_at) VALUES (?, 'pending', ?, ?, ?, ?, ?)")
      .run(email, code(), code(), now(), now(), now());
    return toSub(conn.prepare('SELECT * FROM newsletter_subscribers WHERE id = ?').get(info.lastInsertRowid) as Row);
  }
  if (row.status === 'subscribed') return null;
  if (row.status === 'pending' && row.last_mail_at && Date.now() - Date.parse(row.last_mail_at) < 2 * 60_000) return null;
  // New pending sign-up, or a returning address: fresh codes so old links stop working.
  conn
    .prepare("UPDATE newsletter_subscribers SET status = 'pending', confirm_code = ?, unsub_code = ?, updated_at = ?, last_mail_at = ?, confirmed_at = NULL WHERE id = ?")
    .run(row.status === 'pending' ? row.confirm_code : code(), row.status === 'pending' ? row.unsub_code : code(), now(), now(), row.id);
  return toSub(conn.prepare('SELECT * FROM newsletter_subscribers WHERE id = ?').get(row.id) as Row);
}

export async function sendConfirmation(s: Subscriber) {
  const link = confirmUrl(s.confirmCode);
  const text = `Confirm your subscription to the Closet Republic newsletter by opening this link:\n\n${link}\n\nIf you did not ask for this, ignore this email. Nothing happens unless the link is opened, and the address is deleted after a week.`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6"><div style="max-width:520px;margin:0 auto;background:#fff;border:3px solid #000;border-radius:14px;padding:28px"><p style="margin:0 0 16px;font-weight:bold;font-size:18px">Closet Republic</p><p>Confirm your subscription to the Closet Republic newsletter:</p><p><a href="${link}" style="display:inline-block;background:#000;color:#fff;padding:10px 22px;border-radius:999px;font-weight:bold;text-decoration:none">Confirm subscription</a></p><p style="font-size:13px;color:#52525b">If you did not ask for this, ignore this email. Nothing happens unless the link is opened, and the address is deleted after a week.</p></div></body></html>`;
  return sendTransactional({ to: s.email, subject: 'Confirm your Closet Republic newsletter subscription', text, html, kind: 'newsletter-confirm' });
}

const byCode = (column: 'confirm_code' | 'unsub_code', c: string) => {
  if (!/^[0-9a-f]{32}$/.test(c)) return null;
  const row = db().prepare(`SELECT * FROM newsletter_subscribers WHERE ${column} = ?`).get(c) as Row | undefined;
  return row ? toSub(row) : null;
};
export const byConfirmCode = (c: string) => byCode('confirm_code', c);
export const byUnsubCode = (c: string) => byCode('unsub_code', c);

/** Turns a pending sign-up into a subscription. Returns the subscriber, or null for an unknown or stale code. */
export function confirmSignup(c: string) {
  const s = byConfirmCode(c);
  if (!s || s.status === 'unsubscribed') return null;
  if (s.status === 'pending') db().prepare("UPDATE newsletter_subscribers SET status = 'subscribed', confirmed_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), s.id);
  return { ...s, status: 'subscribed' as const };
}

export function unsubscribeByCode(c: string) {
  const s = byUnsubCode(c);
  if (!s) return null;
  if (s.status !== 'unsubscribed') db().prepare("UPDATE newsletter_subscribers SET status = 'unsubscribed', updated_at = ? WHERE id = ?").run(now(), s.id);
  return s;
}

export function subscriberCounts() {
  const rows = db().prepare('SELECT status, COUNT(*) n FROM newsletter_subscribers GROUP BY status').all() as { status: Subscriber['status']; n: number }[];
  const counts = { subscribed: 0, pending: 0, unsubscribed: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

export function listSubscribers(opts: { q?: string; status?: string } = {}) {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.status && ['pending', 'subscribed', 'unsubscribed'].includes(opts.status)) {
    where.push('status = @status');
    params.status = opts.status;
  }
  if (opts.q) {
    where.push("email LIKE @q ESCAPE '\\'");
    params.q = `%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  const sql = `SELECT * FROM newsletter_subscribers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 1000`;
  return (db().prepare(sql).all(params) as Row[]).map(toSub).map(({ confirmCode: _c, unsubCode: _u, ...s }) => s);
}

export const deleteSubscriber = (id: number) => db().prepare('DELETE FROM newsletter_subscribers WHERE id = ?').run(id).changes > 0;

// ---------- issues ----------

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type IssuePost = { slug: string; title: string; excerpt: string; image: string | null; publishedAt: string | null };
export const UNSUB_MARK = '@@UNSUBSCRIBE_URL@@';

export const postUrl = (slug: string) => `${SITE_URL}/gazette/${slug}`;

/** Only real pictures an email client can show: absolute https JPEG, PNG, GIF or WebP. Never SVG. */
export function emailImage(url: string | null | undefined) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  const clean = url.split(/[?#]/)[0].toLowerCase();
  return /\.(jpe?g|png|gif|webp)$/.test(clean) ? url : null;
}

export const toIssuePost = (p: GhostPost): IssuePost => ({
  slug: p.slug,
  title: p.title,
  excerpt: excerptOf(p).trim().slice(0, 240),
  image: emailImage(p.feature_image),
  publishedAt: p.published_at ?? null,
});

/** The gazette posts the admin can pick from, newest first. */
export async function listPostsForIssue(opts: { days?: number; q?: string } = {}) {
  const since = opts.days ? Date.now() - opts.days * 86_400_000 : 0;
  const q = opts.q?.trim().toLowerCase();
  return (await getAllPosts())
    .filter((p) => isGazetteSlug(p.slug))
    .filter((p) => !since || (p.published_at && Date.parse(p.published_at) >= since))
    .filter((p) => !q || p.title.toLowerCase().includes(q))
    .map(toIssuePost);
}

/** Looks up chosen posts by slug, so the admin page can never inject its own content. */
export async function postsBySlug(slugs: string[]) {
  const all = new Map((await getAllPosts()).filter((p) => isGazetteSlug(p.slug)).map((p) => [p.slug, toIssuePost(p)]));
  return slugs.map((s) => all.get(s)).filter((p): p is IssuePost => Boolean(p));
}

const TEMPLATE_FILE = path.join(process.cwd(), 'content', 'newsletter', 'template.html');

function loadTemplate() {
  let src = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  const items: Record<string, string> = {};
  src = src.replace(/<!--(featured|recommended)-item-->([\s\S]*?)<!--\/\1-item-->/g, (_m, name: string, body: string) => {
    items[name] = body.trim();
    return '';
  });
  // Everything after </html> was only item definitions.
  src = src.slice(0, src.lastIndexOf('</html>') + 7);
  return { page: src, items };
}

const fill = (tpl: string, values: Record<string, string>) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in values ? values[k] : m));

const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'long', timeZone: 'UTC' }) : '');

function paragraphs(text: string) {
  return text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px 0;">${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export type IssueInput = { subject: string; intro: string; featured: IssuePost[]; recommended: IssuePost[] };

/** Builds the HTML (with an unsubscribe placeholder) and the plain-text version of an issue. */
export function renderIssue(input: IssueInput) {
  const { page, items } = loadTemplate();
  const block = (name: 'featured' | 'recommended', posts: IssuePost[]) =>
    posts
      .map((p) =>
        fill(items[name] ?? '', {
          title: escape(p.title),
          url: escape(postUrl(p.slug)),
          excerpt: escape(p.excerpt),
          date: escape(dateOf(p.publishedAt)),
          image_html: p.image ? `<a href="${escape(postUrl(p.slug))}"><img src="${escape(p.image)}" width="544" alt="" style="display:block;border:0;width:100%;max-width:544px;height:auto;border-radius:10px;"></a>` : '',
        }),
      )
      .join('\n');
  const section = (html: string, name: string, posts: IssuePost[]) =>
    html.replace(new RegExp(`<!--section:${name}-->([\\s\\S]*?)<!--/section:${name}-->`), (_m, inner: string) => (posts.length ? inner.replace(`{{${name}}}`, () => block(name as 'featured' | 'recommended', posts)) : ''));
  let html = section(page, 'featured', input.featured);
  html = section(html, 'recommended', input.recommended);
  const address = process.env.LEGAL_POSTAL_ADDRESS?.trim();
  const preheader = (input.intro.trim().split(/\n{2,}/)[0] || input.featured[0]?.title || '').slice(0, 140);
  html = fill(html, {
    subject: escape(input.subject),
    preheader: escape(preheader),
    intro: paragraphs(input.intro),
    site_url: SITE_URL,
    logo_url: `${SITE_URL}/brand/logo-dark.png`,
    privacy_url: `${SITE_URL}/privacy`,
    unsubscribe_url: UNSUB_MARK,
    address_html: address ? `<br>${escape(address)}` : '',
  });
  const lines = [input.subject, '', input.intro.trim(), ''];
  if (input.featured.length) lines.push('IN THIS ISSUE', ...input.featured.flatMap((p) => ['', p.title, p.excerpt, postUrl(p.slug)]), '');
  if (input.recommended.length) lines.push('ALSO WORTH READING', ...input.recommended.flatMap((p) => ['', p.title, postUrl(p.slug)]), '');
  lines.push('--', `Unsubscribe: ${UNSUB_MARK}`, `Privacy Policy: ${SITE_URL}/privacy`);
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  return { html, text: lines.join('\n').replace(/\n{3,}/g, '\n\n') };
}

const personalise = (s: string, unsubUrl: string) => s.split(UNSUB_MARK).join(unsubUrl);

const listHeaders = (unsubUrl: string) => ({ 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });

/** Sends a copy to one address (the admin's own) with a sample unsubscribe link. */
export async function sendTestIssue(to: string, subject: string, html: string, text: string) {
  const url = unsubscribeUrl('0'.repeat(32));
  return mailgunSend({ to, subject: `[Test] ${subject}`, html: personalise(html, url), text: personalise(text, url), headers: listHeaders(url) });
}

export type IssueRecord = { id: number; subject: string; total: number; sent: number; failed: number; status: 'sending' | 'done'; createdAt: string; finishedAt: string | null };

export function listIssues(): IssueRecord[] {
  return db().prepare('SELECT id, subject, total, sent, failed, status, created_at createdAt, finished_at finishedAt FROM newsletter_issues ORDER BY id DESC LIMIT 50').all() as IssueRecord[];
}

/** An issue still marked "sending" an hour later was cut short (for example by a restart). */
const STALE_MS = 60 * 60_000;
const activeIssue = () => listIssues().find((i) => i.status === 'sending' && Date.now() - Date.parse(i.createdAt) < STALE_MS);

export class SendBlocked extends Error {}

/** Records the issue and returns it with its recipients; call runIssue() to deliver. */
export function startIssue(subject: string, html: string, text: string, expectedCount: number) {
  if (!mailgunConfigured()) throw new SendBlocked('Mailgun is not set up yet (MAILGUN_API_KEY, MAILGUN_DOMAIN, NEWSLETTER_FROM).');
  if (activeIssue()) throw new SendBlocked('An issue is still being sent. Wait for it to finish.');
  const recipients = db().prepare("SELECT email, unsub_code FROM newsletter_subscribers WHERE status = 'subscribed' ORDER BY id").all() as { email: string; unsub_code: string }[];
  if (recipients.length === 0) throw new SendBlocked('There are no confirmed subscribers yet.');
  if (recipients.length !== expectedCount) throw new SendBlocked(`The subscriber count changed to ${recipients.length}. Reload and check again before sending.`);
  const info = db().prepare("INSERT INTO newsletter_issues (subject, html, total, status, created_at) VALUES (?, ?, ?, 'sending', ?)").run(subject, html, recipients.length, now());
  return { id: Number(info.lastInsertRowid), recipients, text };
}

/** Delivers an issue, a few messages at a time, and keeps its counters up to date. */
export async function runIssue(issue: { id: number; recipients: { email: string; unsub_code: string }[]; text: string }, subject: string, html: string) {
  const conn = db();
  let sent = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < issue.recipients.length) {
      const r = issue.recipients[next++];
      const url = unsubscribeUrl(r.unsub_code);
      const res = await mailgunSend({ to: r.email, subject, html: personalise(html, url), text: personalise(issue.text, url), headers: listHeaders(url) });
      if (res.ok) sent++;
      else {
        failed++;
        console.error(`[newsletter] could not send issue ${issue.id} to a subscriber: ${res.error}`);
      }
      if ((sent + failed) % 20 === 0) conn.prepare('UPDATE newsletter_issues SET sent = ?, failed = ? WHERE id = ?').run(sent, failed, issue.id);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  conn.prepare("UPDATE newsletter_issues SET sent = ?, failed = ?, status = 'done', finished_at = ? WHERE id = ?").run(sent, failed, now(), issue.id);
}

export { canSendMail };
