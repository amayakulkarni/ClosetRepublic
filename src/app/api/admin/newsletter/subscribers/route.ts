import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/admin-api';
import { listSubscribers } from '@/lib/newsletter';

export const dynamic = 'force-dynamic';

/** GET /api/admin/newsletter/subscribers?q=text&status=subscribed */
export const GET = adminRoute((request: Request) => {
  const q = new URL(request.url).searchParams;
  return NextResponse.json({ subscribers: listSubscribers({ q: q.get('q') || undefined, status: q.get('status') || undefined }) });
});
