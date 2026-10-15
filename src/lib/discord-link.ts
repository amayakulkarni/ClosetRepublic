import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
import { MAIL_REPLY_TO, htmlFrom, sendMail } from './mail';
import { SITE_URL } from './site-url';

// Linking a Discord account to the email used on Buy Me a Coffee, at /discord/link:
//  1. "Continue with Discord" (OAuth, scope identify only) proves which Discord account it is.
//  2. The member types their Buy Me a Coffee email and receives a 6-digit code there.
//  3. The right code proves they own the email; the link is stored and the bot is woken.
// Only the Discord ID and that email are stored. The Discord username is shown on the page
// from the sign-in cookie and never stored.

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const API = (process.env.DISCORD_API_URL || 'https://discord.com/api/v10').replace(/\/$/, '');
const AUTHORIZE_URL = process.env.DISCORD_AUTHORIZE_URL || 'https://discord.com/oauth2/authorize';

export const SESSION_COOKIE = 'cr_discord';
export const STATE_COOKIE = 'cr_discord_state';
const SESSION_MINUTES = 30;
const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;

export const linkingConfigured = () => Boolean(CLIENT_ID && CLIENT_SECRET);
export const redirectUri = () => `${SITE_URL}/discord/callback`;

export function authorizeUrl(state: string) {
  const q = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', scope: 'identify', redirect_uri: redirectUri(), state, prompt: 'none' });
  return `${AUTHORIZE_URL}?${q}`;
}

/** Exchanges the OAuth code for the Discord user's id and display name. */
export async function discordUserFromCode(code: string): Promise<{ id: string; name: string }> {
  const tokenRes = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: redirectUri() }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) throw new Error(`Discord sign-in failed (${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const userRes = await fetch(`${API}/users/@me`, { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10_000) });
  if (!userRes.ok) throw new Error(`Could not read your Discord account (${userRes.status})`);
  const user = (await userRes.json()) as { id: string; username: string; global_name?: string | null };
  // Discord access isn't needed after this, so the token is handed straight back.
  fetch(`${API}/oauth2/token/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, token: access_token }),
  }).catch(() => {});
  return { id: String(user.id), name: user.global_name || user.username };
}

// ---------- the signed sign-in cookie ----------

const sign = (value: string) => crypto.createHmac('sha256', `cr-discord:${CLIENT_SECRET}`).update(value).digest('base64url');

export function sessionValue(user: { id: string; name: string }) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, name: user.name, exp: Date.now() + SESSION_MINUTES * 60_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export const sessionMaxAge = SESSION_MINUTES * 60;

export async function discordSession(): Promise<{ id: string; name: string } | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw || !CLIENT_SECRET) return null;
  const [payload, mac] = raw.split('.');
  const expected = sign(payload || '');
  if (!mac || mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { id: string; name: string; exp: number };
    return s.exp > Date.now() && /^\d{5,25}$/.test(s.id) ? { id: s.id, name: String(s.name).slice(0, 64) } : null;
  } catch {
    return null;
  }
}

// ---------- email codes ----------

const hash = (discordId: string, email: string, code: string) => crypto.createHmac('sha256', `cr-code:${CLIENT_SECRET}`).update(`${discordId}:${email}:${code}`).digest('hex');

export async function sendCode(discordId: string, email: string) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db()
    .prepare(
      `INSERT INTO discord_link_codes (discord_id, email, code_hash, attempts, expires_at) VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(discord_id) DO UPDATE SET email = excluded.email, code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at`,
    )
    .run(discordId, email, hash(discordId, email, code), new Date(Date.now() + CODE_MINUTES * 60_000).toISOString());
  const text = `Your Closet Republic code is ${code}

Type it on ${SITE_URL}/discord/link to link this email to your Discord account. It works for ${CODE_MINUTES} minutes.

If you didn't ask for this, you can ignore this email: nothing is linked without the code.`;
  return sendMail({ to: email, subject: `${code} is your Closet Republic code`, text, html: htmlFrom(text), replyTo: MAIL_REPLY_TO, kind: 'discord-code' });
}

export type VerifyResult = { ok: true; email: string } | { ok: false; error: string };

export function verifyCode(discordId: string, code: string): VerifyResult {
  const row = db().prepare('SELECT * FROM discord_link_codes WHERE discord_id = ?').get(discordId) as
    | { email: string; code_hash: string; attempts: number; expires_at: string }
    | undefined;
  if (!row || row.expires_at < new Date().toISOString()) return { ok: false, error: 'That code has expired. Send a new one.' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'Too many wrong codes. Send a new one.' };
  const given = hash(discordId, row.email, code.replace(/\D/g, ''));
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(row.code_hash))) {
    db().prepare('UPDATE discord_link_codes SET attempts = attempts + 1 WHERE discord_id = ?').run(discordId);
    return { ok: false, error: 'That code is not right. Check the email and try again.' };
  }
  db().prepare('DELETE FROM discord_link_codes WHERE discord_id = ?').run(discordId);
  return { ok: true, email: row.email };
}

// ---------- links ----------

const GRACE_DAYS = 7;

/**
 * Links an email to a Discord account. Whoever proves they own the email wins: if it was
 * linked to another Discord account, that account goes into the normal grace period.
 */
export function link(discordId: string, email: string) {
  const at = new Date().toISOString();
  const tx = db().transaction(() => {
    const previous = db().prepare('SELECT discord_id, applied_tier FROM discord_members WHERE email = ? AND discord_id != ?').get(email, discordId) as
      | { discord_id: string; applied_tier: string | null }
      | undefined;
    if (previous) unlinkRow(previous.discord_id, previous.applied_tier, at);
    db()
      .prepare(
        `INSERT INTO discord_members (discord_id, email, linked_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(discord_id) DO UPDATE SET email = excluded.email, linked_at = excluded.linked_at, carry_tier = NULL, carry_until = NULL, updated_at = excluded.updated_at`,
      )
      .run(discordId, email, at, at);
    return previous?.discord_id ?? null;
  });
  return { replaced: tx() };
}

function unlinkRow(discordId: string, appliedTier: string | null, at: string) {
  const until = new Date(Date.now() + GRACE_DAYS * 86_400_000).toISOString();
  db()
    .prepare('UPDATE discord_members SET email = NULL, linked_at = NULL, carry_tier = ?, carry_until = ?, updated_at = ? WHERE discord_id = ?')
    .run(appliedTier, appliedTier ? until : null, at, discordId);
}

/** Removes the email link; any class role then runs through the normal grace period. */
export function unlink(discordId: string) {
  const row = db().prepare('SELECT applied_tier FROM discord_members WHERE discord_id = ? AND email IS NOT NULL').get(discordId) as
    | { applied_tier: string | null }
    | undefined;
  if (!row) return false;
  unlinkRow(discordId, row.applied_tier, new Date().toISOString());
  return true;
}

export type LinkStatus = {
  email: string | null;
  membership: { level: string | null; status: string; paidUntil: string | null } | null;
  appliedTier: string | null;
  appliedState: string | null;
};

export function linkStatus(discordId: string): LinkStatus {
  const m = db().prepare('SELECT email, applied_tier, applied_state FROM discord_members WHERE discord_id = ?').get(discordId) as
    | { email: string | null; applied_tier: string | null; applied_state: string | null }
    | undefined;
  const membership = m?.email
    ? (db()
        .prepare(
          `SELECT level_name level, status, paid_until paidUntil FROM memberships WHERE email = ? AND status != 'revoked'
           ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'cancelling' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, updated_at DESC LIMIT 1`,
        )
        .get(m.email) as LinkStatus['membership'] | undefined) ?? null
    : null;
  return { email: m?.email ?? null, membership, appliedTier: m?.applied_tier ?? null, appliedState: m?.applied_state ?? null };
}

/** "a•••@example.com", so the page never shows a full address. */
export const maskEmail = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, (_, first, domain) => `${first}•••${domain}`);
