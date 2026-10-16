import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/admin-api';
import { deleteSubscriber } from '@/lib/newsletter';

/** DELETE /api/admin/newsletter/subscribers/:id  removes an address for good. */
export const DELETE = adminRoute(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!deleteSubscriber(Number((await ctx.params).id))) return NextResponse.json({ error: 'No such subscriber' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
