import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/admin-api';
import { deleteEntry } from '@/lib/funds';

/** DELETE /api/admin/ledger/:id  removes a mistaken entry. */
export const DELETE = adminRoute(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  if (!deleteEntry(id)) return NextResponse.json({ error: 'No such entry' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
