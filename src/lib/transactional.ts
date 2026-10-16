import 'server-only';
import { mailConfigured, sendMail } from './mail';
import { mailgunConfigured, mailgunSend } from './mailgun';

/** True when at least one provider (Mailgun, or plain SMTP) can send. */
export const canSendMail = () => mailgunConfigured() || mailConfigured();

/** One-off emails (sign-up confirmations, admin codes): Mailgun when set up, otherwise SMTP. Never throws. */
export async function sendTransactional(m: { to: string; subject: string; text: string; html: string; headers?: Record<string, string>; kind: string }) {
  if (mailgunConfigured()) {
    const r = await mailgunSend({ to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers });
    if (!r.ok) console.error(`mail: could not send "${m.subject}" to ${m.to}: ${r.error}`);
    return r.ok;
  }
  return (await sendMail({ to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers, kind: m.kind })).status === 'sent';
}
