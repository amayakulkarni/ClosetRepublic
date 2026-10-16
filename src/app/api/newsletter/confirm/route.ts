import { NextResponse } from 'next/server';
import { confirmSignup } from '@/lib/newsletter';

export const dynamic = 'force-dynamic';

/** POST /api/newsletter/confirm?c=…  completes a sign-up (the confirm page's button). */
export async function POST(request: Request) {
  if (!confirmSignup(new URL(request.url).searchParams.get('c') || '')) return NextResponse.json({ error: 'That confirmation link is not valid or has expired' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
