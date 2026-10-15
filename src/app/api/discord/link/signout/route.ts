import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/discord-link';

export const dynamic = 'force-dynamic';

export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
