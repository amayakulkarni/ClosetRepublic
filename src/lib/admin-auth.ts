import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// The admin page and the write APIs are protected by one secret, ADMIN_TOKEN.
//  - Scripts send it as "Authorization: Bearer <ADMIN_TOKEN>".
//  - The admin page exchanges it for a signed, http-only session cookie (12 hours).
//  - With ADMIN_2FA_EMAIL set, the cookie is issued only after an emailed one-time code is entered
//    (src/lib/admin-2fa.ts), and the bearer token stops working for the API unless ADMIN_ALLOW_BEARER=true.

export const SESSION_COOKIE = 'cr_admin';
const SESSION_HOURS = 12;
const TOKEN = process.env.ADMIN_TOKEN || '';

export const adminConfigured = () => TOKEN.length >= 16;

/** Bearer-token access to the admin API. Off when two-step sign-in is on, because the token alone would skip the code. */
const bearerAllowed = () => !process.env.ADMIN_2FA_EMAIL || process.env.ADMIN_ALLOW_BEARER === 'true';

const sign = (value: string) => crypto.createHmac('sha256', TOKEN).update(`cr-admin:${value}`).digest('hex');

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function checkToken(candidate: string) {
  return adminConfigured() && safeEqual(candidate, TOKEN);
}

export function newSession() {
  const expires = Date.now() + SESSION_HOURS * 3600_000;
  return { value: `${expires}.${sign(String(expires))}`, expires: new Date(expires) };
}

function validSession(value: string | undefined) {
  if (!value || !adminConfigured()) return false;
  const [expires, mac] = value.split('.');
  return Boolean(mac) && Number(expires) > Date.now() && safeEqual(mac, sign(expires));
}

/** True when the request carries a valid bearer token or admin session cookie. */
export async function isAdmin(request?: Request) {
  const auth = request?.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return bearerAllowed() && checkToken(auth.slice(7).trim());
  return validSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export const unauthorized = () =>
  NextResponse.json(
    { error: adminConfigured() ? 'Not signed in' : 'ADMIN_TOKEN is not set (it must be at least 16 characters)' },
    { status: 401 },
  );
