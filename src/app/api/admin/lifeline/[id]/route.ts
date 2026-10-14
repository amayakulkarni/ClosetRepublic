import { NextResponse } from 'next/server';
import { adminRoute, idFrom } from '@/lib/admin-api';
import { deleteSubscriber } from '@/lib/lifeline';

/** DELETE /api/admin/lifeline/:id  removes someone from the list for good. */
export const DELETE = adminRoute(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!deleteSubscriber(await idFrom(ctx))) return NextResponse.json({ error: 'No such subscriber' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
