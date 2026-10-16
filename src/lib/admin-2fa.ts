import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';
import { safeEqual } from './admin-auth';
import { canSendMail, sendTransactional } from './transactional';

// Second step of the admin sign-in. After the admin token is accepted, a one-time alphanumeric code is
// emailed to ADMIN_2FA_EMAIL and the session cookie is issued only once that code is entered.
//  - 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), valid for 10 minutes.
//  - Only a salted HMAC of the code is stored, never the code itself.
//  - 5 wrong guesses burn the code. A code works once.

const EMAIL = (process.env.ADMIN_2FA_EMAIL || '').trim();
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 8;
const MINUTES = 10;
const MAX_ATTEMPTS = 5;

export const twoFactorEnabled = () => Boolean(EMAIL);
export const twoFactorReady = () => twoFactorEnabled() && canSendMail();
/** "a•••@example.com", shown on the code screen. */
export const maskedEmail = () => EMAIL.replace(/^(.).*(@.*)$/, '$1•••$2');

const hash = (salt: string, value: string) =>
  crypto.createHmac('sha256', process.env.ADMIN_TOKEN || '').update(`cr-admin-2fa:${salt}:${value}`).digest('hex');

const normalise = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Creates a challenge and emails the code. Returns its id, or null when the email could not be sent. */
export async function startChallenge() {
  const conn = db();
  conn.prepare('DELETE FROM admin_challenges WHERE expires_at < ?').run(new Date().toISOString());
  // One live challenge at a time, so a leaked token cannot be used to flood the inbox.
  const live = conn.prepare('SELECT COUNT(*) n FROM admin_challenges').get() as { n: number };
  if (live.n >= 3) conn.prepare('DELETE FROM admin_challenges').run();
  const code = Array.from(crypto.randomBytes(LENGTH), (b) => ALPHABET[b % ALPHABET.length]).join('');
  const id = crypto.randomBytes(16).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  conn
    .prepare('INSERT INTO admin_challenges (id, code_hash, salt, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, hash(salt, code), salt, new Date(Date.now() + MINUTES * 60_000).toISOString(), new Date().toISOString());
  const shown = `${code.slice(0, 4)}-${code.slice(4)}`;
  const text = `Your Closet Republic admin sign-in code is ${shown}\n\nIt works once and expires in ${MINUTES} minutes. If you did not just sign in to the admin page, someone has the admin token: change ADMIN_TOKEN on the server.`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111"><div style="max-width:480px;margin:0 auto;background:#fff;border:3px solid #000;border-radius:14px;padding:28px"><p style="margin:0 0 12px;font-weight:bold;font-size:18px">Closet Republic admin</p><p>Your sign-in code:</p><p style="font-size:30px;letter-spacing:4px;font-weight:bold;font-family:Consolas,Menlo,monospace;margin:8px 0">${shown}</p><p style="font-size:13px;color:#52525b">It works once and expires in ${MINUTES} minutes. If you did not just sign in to the admin page, someone has the admin token: change ADMIN_TOKEN on the server.</p></div></body></html>`;
  const sent = await sendTransactional({ to: EMAIL, subject: 'Closet Republic admin sign-in code', text, html, kind: 'admin-code' });
  if (!sent) {
    conn.prepare('DELETE FROM admin_challenges WHERE id = ?').run(id);
    return null;
  }
  return id;
}

/** True when the code matches the challenge. Counts the attempt, and the challenge is single use. */
export function verifyChallenge(id: string, code: string) {
  const conn = db();
  const row = conn.prepare('SELECT * FROM admin_challenges WHERE id = ?').get(id) as { code_hash: string; salt: string; attempts: number; expires_at: string } | undefined;
  if (!row || row.expires_at < new Date().toISOString() || row.attempts >= MAX_ATTEMPTS) return false;
  conn.prepare('UPDATE admin_challenges SET attempts = attempts + 1 WHERE id = ?').run(id);
  const ok = safeEqual(hash(row.salt, normalise(code)), row.code_hash);
  if (ok || row.attempts + 1 >= MAX_ATTEMPTS) conn.prepare('DELETE FROM admin_challenges WHERE id = ?').run(id);
  return ok;
}
