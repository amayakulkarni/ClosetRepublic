import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { db } from './db';

// Outgoing email over plain SMTP, so any provider works (Zoho, Gmail, Brevo, Amazon SES,
// your host's mail server…). Email stays off until SMTP_HOST and MAIL_FROM are set.
// Every attempt is written to the email_log table, so the admin page can show what went out.

const PORT = Number(process.env.SMTP_PORT) || 587;
const SECURE = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : PORT === 465;

export const MAIL_FROM = process.env.MAIL_FROM || '';
/** Where new-contributor alerts go (Amaya's inbox). Alerts are skipped when empty. */
export const CONTRIBUTIONS_EMAIL = process.env.CONTRIBUTIONS_EMAIL || '';
/** Replies to emails sent to contributors go here; defaults to CONTRIBUTIONS_EMAIL. */
export const MAIL_REPLY_TO = process.env.MAIL_REPLY_TO || CONTRIBUTIONS_EMAIL || undefined;

export const mailConfigured = () => Boolean(process.env.SMTP_HOST && MAIL_FROM);

const globalForMail = globalThis as unknown as { crMail?: Transporter };

function transporter() {
  if (!globalForMail.crMail) {
    globalForMail.crMail = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: PORT,
      secure: SECURE,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    });
  }
  return globalForMail.crMail;
}

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  /** For the log: what this email is about. */
  kind: string;
  contributorId?: number | null;
};

export type MailResult = { status: 'sent' | 'failed' | 'skipped'; error?: string };

function log(m: Mail, r: MailResult) {
  db()
    .prepare(
      'INSERT INTO email_log (contributor_id, kind, to_address, subject, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(m.contributorId ?? null, m.kind, m.to, m.subject, r.status, r.error ?? null, new Date().toISOString());
}

/** Sends one email. Never throws: failures are logged and returned. */
export async function sendMail(m: Mail): Promise<MailResult> {
  // A subject is a single header line.
  const subject = m.subject.replace(/[\r\n]+/g, ' ').slice(0, 200);
  const mail = { ...m, subject };
  let result: MailResult;
  if (!mailConfigured()) {
    result = { status: 'skipped', error: 'Email is not set up (SMTP_HOST and MAIL_FROM)' };
  } else {
    try {
      await transporter().sendMail({ from: MAIL_FROM, to: m.to, replyTo: m.replyTo, subject, text: m.text, html: m.html, headers: m.headers });
      result = { status: 'sent' };
    } catch (err) {
      console.error(`mail: could not send "${subject}" to ${m.to}`, err);
      result = { status: 'failed', error: (err as Error).message.slice(0, 300) };
    }
  }
  log(mail, result);
  return result;
}

export type EmailLogEntry = { id: number; contributorId: number | null; kind: string; to: string; subject: string; status: MailResult['status']; error: string | null; createdAt: string };

export function emailLog(contributorId: number): EmailLogEntry[] {
  return db()
    .prepare(
      `SELECT id, contributor_id contributorId, kind, to_address "to", subject, status, error, created_at createdAt
       FROM email_log WHERE contributor_id = ? ORDER BY id DESC LIMIT 50`,
    )
    .all(contributorId) as EmailLogEntry[];
}

/** The newest email per contributor, for the admin list. */
export function lastEmails(): Map<number, EmailLogEntry> {
  const rows = db()
    .prepare(
      `SELECT id, contributor_id contributorId, kind, to_address "to", subject, status, error, created_at createdAt
       FROM email_log WHERE id IN (SELECT MAX(id) FROM email_log WHERE contributor_id IS NOT NULL AND kind != 'admin-alert' GROUP BY contributor_id)`,
    )
    .all() as EmailLogEntry[];
  return new Map(rows.map((r) => [r.contributorId!, r]));
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Wraps paragraphs of plain text in a simple, readable HTML email. Blank lines separate paragraphs; lines starting "- " become a list. */
export function htmlFrom(text: string) {
  const blocks = text.trim().split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => l.startsWith('- '))) return `<ul>${lines.map((l) => `<li>${linkify(escape(l.slice(2)))}</li>`).join('')}</ul>`;
    return `<p>${lines.map((l) => linkify(escape(l))).join('<br>')}</p>`;
  });
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;line-height:1.55">
<div style="max-width:560px;margin:0 auto;background:#fff;border:3px solid #000;border-radius:14px;padding:28px">
<p style="margin:0 0 18px;font-weight:800;font-size:18px">Closet Republic</p>
${blocks.join('\n')}
</div></body></html>`;
}

const linkify = (escaped: string) => escaped.replace(/https?:\/\/[^\s<]+[^\s<.,)]/g, (u) => `<a href="${u}" style="color:#000">${u}</a>`);
