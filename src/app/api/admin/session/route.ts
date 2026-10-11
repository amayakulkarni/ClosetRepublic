import { NextResponse } from 'next/server';
import { SESSION_COOKIE, adminConfigured, checkToken, newSession } from '@/lib/admin-auth';

/** Sign in to the admin page with ADMIN_TOKEN. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  if (!adminConfigured()) return NextResponse.json({ error: 'ADMIN_TOKEN is not set (it must be at least 16 characters)' }, { status: 503 });
  if (!body.token || !checkToken(body.token)) return NextResponse.json({ error: 'Wrong admin token' }, { status: 401 });
  const session = newSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: session.expires,
  });
  return res;
}

/** Sign out. */
export function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
