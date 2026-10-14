import { NextResponse } from 'next/server';
import { unsubscribe } from '@/lib/lifeline';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lifeline/unsubscribe?token=…
 * Used by the unsubscribe page and by mail apps' one-click unsubscribe (List-Unsubscribe-Post).
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!unsubscribe(token)) return NextResponse.json({ error: 'That unsubscribe link is not valid' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
