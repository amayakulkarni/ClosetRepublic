import 'server-only';
import { mailConfigured, sendMail } from './mail';
import { mailgunConfigured, mailgunSend } from './mailgun';

/** True when at least one provider (plain SMTP, or Mailgun) can send. */
export const canSendMail = () => mailgunConfigured() || mailConfigured();

/** One-off emails (sign-up confirmations, admin codes): the site's own SMTP first, Mailgun only as a fallback. Never throws. */
export async function sendTransactional(m: { to: string; subject: string; text: string; html: string; headers?: Record<string, string>; kind: string }) {
  if (mailConfigured()) {
    const r = await sendMail({ to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers, kind: m.kind });
    if (r.status === 'sent') return true;
    console.error(`mail: SMTP could not send "${m.subject}" to ${m.to}: ${r.error ?? r.status}`);
  }
  if (mailgunConfigured()) {
    const r = await mailgunSend({ to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers });
    if (!r.ok) console.error(`mail: could not send "${m.subject}" to ${m.to}: ${r.error}`);
    return r.ok;
  }
  return false;
}
