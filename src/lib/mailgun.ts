import 'server-only';

// Newsletter delivery through the Mailgun HTTP API (https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages).
// One API call per recipient, so every email carries that person's own unsubscribe link and no
// recipient sees another address. Open and click tracking are switched off on every message.
// Needs MAILGUN_API_KEY, MAILGUN_DOMAIN and a sender (NEWSLETTER_FROM, or MAIL_FROM).

const KEY = process.env.MAILGUN_API_KEY || '';
const DOMAIN = process.env.MAILGUN_DOMAIN || '';
// "eu" for domains created in Mailgun's EU region. MAILGUN_BASE_URL overrides both (tests).
const BASE = (process.env.MAILGUN_BASE_URL || (process.env.MAILGUN_REGION?.toLowerCase() === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net')).replace(/\/$/, '');

export const NEWSLETTER_FROM = process.env.NEWSLETTER_FROM || process.env.MAIL_FROM || '';
export const mailgunConfigured = () => Boolean(KEY && DOMAIN && NEWSLETTER_FROM);

export type MailgunMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
};

/** Sends one message. Never throws. */
export async function mailgunSend(m: MailgunMessage): Promise<{ ok: boolean; error?: string }> {
  if (!mailgunConfigured()) return { ok: false, error: 'Mailgun is not set up (MAILGUN_API_KEY, MAILGUN_DOMAIN and NEWSLETTER_FROM)' };
  const form = new URLSearchParams({
    from: NEWSLETTER_FROM,
    to: m.to,
    subject: m.subject.replace(/[\r\n]+/g, ' ').slice(0, 200),
    html: m.html,
    text: m.text,
    'o:tracking': 'no',
    'o:tracking-opens': 'no',
    'o:tracking-clicks': 'no',
  });
  if (m.replyTo) form.set('h:Reply-To', m.replyTo);
  for (const [name, value] of Object.entries(m.headers ?? {})) form.set(`h:${name}`, value);
  try {
    const res = await fetch(`${BASE}/v3/${encodeURIComponent(DOMAIN)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`api:${KEY}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `Mailgun ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Mailgun unreachable: ${(err as Error).message}` };
  }
}
