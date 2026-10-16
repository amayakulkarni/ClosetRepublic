import { NextResponse } from 'next/server';
import { unsubscribeByCode } from '@/lib/newsletter';

export const dynamic = 'force-dynamic';

/**
 * POST /api/newsletter/unsubscribe?c=…
 * Used by the unsubscribe page and by mail apps' one-click unsubscribe (List-Unsubscribe-Post).
 */
export async function POST(request: Request) {
  if (!unsubscribeByCode(new URL(request.url).searchParams.get('c') || '')) return NextResponse.json({ error: 'That unsubscribe link is not valid' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
