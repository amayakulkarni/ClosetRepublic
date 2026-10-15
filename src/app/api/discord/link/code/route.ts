import { NextResponse } from 'next/server';
import { discordSession, sendCode } from '@/lib/discord-link';
import { mailConfigured } from '@/lib/mail';
import { tooMany } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST { email }  emails a 6-digit code to the Buy Me a Coffee address the member typed. */
export async function POST(request: Request) {
  const session = await discordSession();
  if (!session) return NextResponse.json({ error: 'Your Discord sign-in expired. Continue with Discord again.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; website?: unknown };
  if (body.website) return NextResponse.json({ ok: true }); // bot trap
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return NextResponse.json({ error: 'Enter the email address you use on Buy Me a Coffee.' }, { status: 400 });
  if (!mailConfigured()) return NextResponse.json({ error: 'Email is not set up on this site yet, so codes cannot be sent.' }, { status: 503 });
  if (tooMany('discord-code', request, 5)) return NextResponse.json({ error: 'Too many codes. Try again in an hour.' }, { status: 429 });
  const sent = await sendCode(session.id, email);
  if (sent.status !== 'sent') return NextResponse.json({ error: 'We could not send the email. Try again later.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
