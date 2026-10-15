import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { safeEqual } from '@/lib/admin-auth';
import { SESSION_COOKIE, STATE_COOKIE, discordUserFromCode, sessionMaxAge, sessionValue } from '@/lib/discord-link';
import { SITE_URL } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

/** Discord sends people back here after "Continue with Discord". */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (error?: string) => NextResponse.redirect(`${SITE_URL}/discord/link${error ? `?error=${error}` : ''}`);
  const state = (await cookies()).get(STATE_COOKIE)?.value;
  const given = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error')) return back('cancelled');
  if (!state || !code || !safeEqual(state, given)) return back('expired');

  try {
    const user = await discordUserFromCode(code);
    const res = back();
    res.cookies.delete({ name: STATE_COOKIE, path: '/discord' });
    res.cookies.set(SESSION_COOKIE, sessionValue(user), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: sessionMaxAge });
    return res;
  } catch (err) {
    console.error('[discord] sign-in failed:', (err as Error).message);
    return back('discord');
  }
}
