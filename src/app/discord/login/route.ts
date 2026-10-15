import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { STATE_COOKIE, authorizeUrl, linkingConfigured } from '@/lib/discord-link';
import { SITE_URL } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

/** Starts "Continue with Discord". */
export function GET() {
  if (!linkingConfigured()) return NextResponse.redirect(`${SITE_URL}/discord/link?error=setup`);
  const state = crypto.randomBytes(18).toString('base64url');
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/discord', maxAge: 600 });
  return res;
}
