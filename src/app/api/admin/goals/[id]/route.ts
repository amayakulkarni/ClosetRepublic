import { NextResponse } from 'next/server';
import { adminRoute, idFrom, readJson } from '@/lib/admin-api';
import { goalFields } from '@/lib/goal-input';
import { deleteGoal, updateGoal } from '@/lib/roadmap';

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/admin/goals/:id  any of { title, description, status, progress, targetDate, sortOrder } */
export const PUT = adminRoute(async (request: Request, ctx: Ctx) => {
  const id = await idFrom(ctx);
  const goal = updateGoal(id, goalFields(await readJson(request), false));
  if (!goal) return NextResponse.json({ error: 'No such goal' }, { status: 404 });
  return NextResponse.json({ goal });
});

/** DELETE /api/admin/goals/:id */
export const DELETE = adminRoute(async (_request: Request, ctx: Ctx) => {
  if (!deleteGoal(await idFrom(ctx))) return NextResponse.json({ error: 'No such goal' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
