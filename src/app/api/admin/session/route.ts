import { NextResponse } from 'next/server';
import { SESSION_COOKIE, adminConfigured, checkToken, newSession } from '@/lib/admin-auth';
import { maskedEmail, startChallenge, twoFactorEnabled, twoFactorReady, verifyChallenge } from '@/lib/admin-2fa';
import { tooMany } from '@/lib/rate-limit';

function signedIn() {
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

/**
 * Sign in to the admin page.
 *  Step 1: { token }  checks ADMIN_TOKEN. Without ADMIN_2FA_EMAIL that signs in; with it, an emailed code is sent
 *          and { step: 'code', challenge } is returned.
 *  Step 2: { challenge, code }  checks the emailed code and signs in.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string; challenge?: string; code?: string };
  if (!adminConfigured()) return NextResponse.json({ error: 'ADMIN_TOKEN is not set (it must be at least 16 characters)' }, { status: 503 });
  if (tooMany('admin-login', request, 20)) return NextResponse.json({ error: 'Too many attempts. Try again in an hour.' }, { status: 429 });

  if (body.challenge) {
    if (!twoFactorEnabled() || !body.code || !verifyChallenge(String(body.challenge), String(body.code))) {
      return NextResponse.json({ error: 'That code is wrong or has expired. Start again.' }, { status: 401 });
    }
    return signedIn();
  }

  if (!body.token || !checkToken(body.token)) return NextResponse.json({ error: 'Wrong admin token' }, { status: 401 });
  if (!twoFactorEnabled()) return signedIn();
  if (!twoFactorReady()) return NextResponse.json({ error: 'Two-step sign-in is on but email is not set up, so the code cannot be sent. Set MAILGUN_* or SMTP_*.' }, { status: 503 });
  const challenge = await startChallenge();
  if (!challenge) return NextResponse.json({ error: 'The sign-in code could not be emailed. Check the mail settings and the server log.' }, { status: 502 });
  return NextResponse.json({ step: 'code', challenge, sentTo: maskedEmail() });
}

/** Sign out. */
export function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
